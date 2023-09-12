import type { NextApiRequest, NextApiResponse } from 'next';
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import { PineconeStore } from 'langchain/vectorstores/pinecone';
import { pinecone } from '@/utils/pinecone-client';
import { PINECONE_INDEX_NAME, PINECONE_NAME_SPACE } from '@/config/pinecone';
import { OpenAI } from 'langchain/llms/openai';
import { z } from 'zod';
import { PromptTemplate } from 'langchain/prompts';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  StructuredOutputParser,
  OutputFixingParser,
} from 'langchain/output_parsers';

import { ConversationalRetrievalQAWithOutputParserChain } from '../../scripts/conversational-retrieval-qa-chain-with-outputparser';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    const { dataFields, dataFieldsDescription } = req.body;
    const extractAllResult = await run(dataFields, dataFieldsDescription);
    res.status(200).json(extractAllResult);
  } catch (error: any) {
    console.log('error', error);
    res.status(500).json({
      error: error.message || 'Something went wrong',
    });
  }
}

async function run(dataFields: string[], dataFieldsDescription: string[]) {
  return new Promise(async (resolve, reject) => {
    try {
      var extractAllResult: any = {};

      var obj: any = {};
      dataFields.map((item, index) => {
        obj[item] = z
          .string()
          .describe(dataFieldsDescription[index])
          .optional();
      });
      const schema = z.object(obj);
      //define output praser from schema
      const outputParser: any = StructuredOutputParser.fromZodSchema(schema);

      const chatModel = new OpenAI({
        modelName: 'gpt-3.5-turbo', //'gpt-4', // Or gpt-3.5-turbo
        temperature: 0, // For best results with the output fixing parser
      });

      const outputFixingParser = OutputFixingParser.fromLLM(
        chatModel,
        outputParser,
      );

      const index = pinecone.Index(PINECONE_INDEX_NAME);
      const vectorStore: any = await PineconeStore.fromExistingIndex(
        new OpenAIEmbeddings({}),
        {
          pineconeIndex: index,
          textKey: 'text',
          namespace: PINECONE_NAME_SPACE, //namespace comes from your config folder
        },
      );

      const QUESTION_GENERATION_PROMPT = `Given the following conversation and a follow up question, rephrase the follow up question to be a standalone question.

  Chat History:
  {chat_history}
  Follow Up Input: {question}
  Standalone question:`;

      const QA_PROMPT = `You are a helpful AI assistant. Use the following pieces of context to answer the question at the end.
If you don't know the answer, just say you don't know. DO NOT try to make up an answer.
If the question is not related to the context, politely respond that you are tuned to only answer questions that are related to the context.

\nContext: \n{context}

\nQuestion: \n{question}

\nAlso use the format instructions provided here
\nFormat Instructions: \n{format_instructions}      

\nHelpful answer:`;

      const COMPLEX_QA_PROMPT_TEMPLATE = new PromptTemplate({
        template: QA_PROMPT,
        inputVariables: ['question', 'context', 'format_instructions'],
        // partialVariables: {
        //   format_instructions: format_instructions, //outputFixingParser.getFormatInstructions(),
        // },
        outputParser: outputFixingParser,
      });

      //get a question schema field matching prompt

      const SCHEMA_MATCHING_PROMPT = `You are a helpful AI assisnant that can match JSON data schema fields with a question. Here is a json schema, please let me know which field in the following schema matches the best with the questions asked. 
  \n\n JSON data schema:\n
  \`\`\` \n\n
  {schematext}
  \n\n
  \`\`\`
  \n\nPlease provide the accurate and exact field name as answer. Also use the format instructions provided here for the answer. 
  \n\n Format Instructions: \n\nYou must format your output as a JSON value that adheres to a given \"JSON schema\" instance.\"JSON Schema\" is a declarative language that allows you to annotate and validate JSON documents.\n\nFor example, the example \"JSON Schema\" instance {{\"properties\": {{\"foo\": {{\"description\": \"a list of test words\", \"type\": \"array\", \"items\": {{\"type\": \"string\"}}}}}}, \"required\": [\"foo\"]}}}}\nwould match an object with one required property, \"foo\". The \"type\" property specifies \"foo\" must be an \"array\", and the \"description\" property semantically describes it as \"a list of test words\". The items within \"foo\" must be strings.\nThus, the object {{\"foo\": [\"bar\", \"baz\"]}} is a well-formatted instance of this example \"JSON Schema\". 
  The object {{\"properties\": {{\"foo\": [\"bar\", \"baz\"]}}}} is not well-formatted.\n\nYour output will be parsed and type-checked according to the provided schema instance, so make sure all fields in your output match the schema exactly and there are no trailing commas!
  
  \n\nHere is the JSON Schema instance your output must adhere to. Include the enclosing markdown codeblock:\n
  \`\`\` \n\n
  {outputschematext}
  \n\n
  \`\`\` 
 
  \nQuestion: {question}
  \n   
  \nAnswer:`;

      //get a chain that can be used to get the schema field
      const prompt = new PromptTemplate({
        template: SCHEMA_MATCHING_PROMPT,
        inputVariables: ['question', 'schematext', 'outputschematext'],
      });
      let schemaObj: any = zodToJsonSchema(schema);
      const requiredFields: string[] = schemaObj.required
        ? schemaObj.required
        : [];
      //set the required field to empty
      schemaObj.required = [];

      const stringifiedSchema = JSON.stringify(schemaObj);
      //next lets try to format the prompt and see if there is a final one

      const schematext = 'json\n' + stringifiedSchema + '\n';

      const outputschematext = `json\n{\"field_name\":"name of the field"}\n`;

      //get the chain that has the template ready
      const qaFMChain = ConversationalRetrievalQAWithOutputParserChain.fromLLM(
        chatModel,
        vectorStore.asRetriever(),
        {
          outputKey: 'records',
          qaChainOptions: {
            type: 'stuff',
            prompt: COMPLEX_QA_PROMPT_TEMPLATE, //more complex tempate that uses
          },
          questionGeneratorChainOptions: {
            //used for rephrasing the question based on chat history
            llm: chatModel,
            template: QUESTION_GENERATION_PROMPT,
          },
          verbose: true,
          outputParser: outputParser,
          returnSourceDocuments: true, //The number of source documents returned is 4 by default
        },
      );

      await Promise.all(
        dataFields.map(async (field) => {
          const question = `what is ${field},\n`;
          const sanitizedQuestion = question.trim().replaceAll('\n', ' ');
          const finalPrompt = await prompt.format({
            question: sanitizedQuestion,
            schematext: schematext,
            outputschematext: outputschematext,
          });
          //next we test usage of the final prompt by calling the model
          const response = await chatModel.generate([finalPrompt]);
          //retrieve the filed name in a JSON object
          const fieldNameObj: {
            field_name: string;
          } = JSON.parse(response.generations[0][0].text);
          const fieldName: string = fieldNameObj.field_name;
          const format_instructions =
            getFormatInstructionsWithoutRequiredField(schema);
          const final_format_instructions = format_instructions.replaceAll(
            'PLACE_HOLDER_FOR_EQUIRED_FIELDS',
            fieldName,
          );

          //then we go call the langchain to get the results
          const result = await qaFMChain.call({
            question: sanitizedQuestion,
            chat_history: [],
            format_instructions: final_format_instructions,
          }); //this should already have the answer formatted by the output parser
          const obj1 = result.text;
          for (var key in obj1) {
            extractAllResult[key] = obj1[key];
          }
        }),
      );
      resolve(extractAllResult);
    } catch (error) {
      console.log('error', error);
      reject(error);
      throw new Error('Failed to test the parser');
    }
  });
}

const getFormatInstructionsWithoutRequiredField = (schema: any) => {
  let schemaJSONObject: any = zodToJsonSchema(schema); //convert the schema to a JSON object

  //set the required part to empty first
  const mystr = '{"required":"[{required_field}]"}';
  const strJSON = JSON.parse(mystr);

  schemaJSONObject.required = ['PLACE_HOLDER_FOR_EQUIRED_FIELDS'];
  return `You must format your output as a JSON value that adheres to a given "JSON Schema" instance.

"JSON Schema" is a declarative language that allows you to annotate and validate JSON documents.

For example, the example "JSON Schema" instance {{"properties": {{"foo": {{"description": "a list of test words", "type": "array", "items": {{"type": "string"}}}}}}, "required": ["foo"]}}}}
would match an object with one required property, "foo". The "type" property specifies "foo" must be an "array", and the "description" property semantically describes it as "a list of test words". The items within "foo" must be strings.
Thus, the object {{"foo": ["bar", "baz"]}} is a well-formatted instance of this example "JSON Schema". The object {{"properties": {{"foo": ["bar", "baz"]}}}} is not well-formatted.

Your output will be parsed and type-checked according to the provided schema instance, so make sure all fields in your output match the schema exactly and there are no trailing commas!

Here is the JSON Schema instance your output must adhere to. Include the enclosing markdown codeblock:
\`\`\`json
${JSON.stringify(schemaJSONObject)}
\`\`\`\n

Just provide the required info here and not all fields defined in the schema above. \"required\":[\"PLACE_HOLDER_FOR_EQUIRED_FIELDS\"]

`;
};
