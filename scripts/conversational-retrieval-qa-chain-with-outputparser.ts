import { PromptTemplate } from 'langchain/prompts';
import { BaseLanguageModel } from 'langchain/base_language';
import { SerializedChatVectorDBQAChain } from 'langchain/chains';
import { Validator } from './@cfworker/json-schema/';
import {
  ChainValues,
  BaseMessage,
  HumanMessage,
  AIMessage,
  Generation,
} from 'langchain/schema'; 
import { BaseRetriever } from 'langchain/schema/retriever.js'; 
import { BaseChain, ChainInputs } from 'langchain/chains'; 
import { LLMChain } from 'langchain/chains'; 
import { loadQAChain, QAChainParams } from 'langchain/chains'; 
import { CallbackManagerForChainRun } from 'langchain/callbacks'; 


import {
  BaseLLMOutputParser,
  OutputParserException,
  BaseOutputParser,
} from 'langchain/schema/output_parser';

export class NoOpOutputParser extends BaseOutputParser<string> {
  lc_namespace = ['langchain', 'output_parsers', 'default'];
  lc_serializable = true;
  parse(text: string): Promise<string> {
    return Promise.resolve(text);
  }
  getFormatInstructions(): string {
    return '';
  }
}

export type LoadValues = Record<string, any>;

const question_generator_template = `Given the following conversation and a follow up question, rephrase the follow up question to be a standalone question.

Chat History:
{chat_history}
Follow Up Input: {question}
Standalone question:`;

export interface ConversationalRetrievalQAWithOutputParserChainInput<
  T extends string | object = string,
> extends ChainInputs {
  retriever: BaseRetriever;
  combineDocumentsChain: BaseChain;
  questionGeneratorChain: LLMChain;
  returnSourceDocuments?: boolean;
  inputKey?: string;

  /** OutputParser to use */
  outputParser?: BaseLLMOutputParser<T>;
}

export class ConversationalRetrievalQAWithOutputParserChain<
    T extends string | object = string,
  >
  extends BaseChain
  implements ConversationalRetrievalQAWithOutputParserChainInput<T>
{
  inputKey = 'question';

  chatHistoryKey = 'chat_history';

  formatInstructionsKey = 'format_instructions';
  get inputKeys() {
    return [this.inputKey, this.chatHistoryKey];
  }

  get outputKeys() {
    return this.combineDocumentsChain.outputKeys.concat(
      this.returnSourceDocuments ? ['sourceDocuments'] : [],
    );
  }

  retriever: BaseRetriever;

  combineDocumentsChain: BaseChain;

  questionGeneratorChain: LLMChain;

  returnSourceDocuments = false;

  outputParser: BaseLLMOutputParser<T>;

  protected jsonSchemaValidator: Validator = new Validator({ schema: {} });

  constructor(fields: ConversationalRetrievalQAWithOutputParserChainInput<T>) {
    super(fields);
    this.retriever = fields.retriever;
    this.combineDocumentsChain = fields.combineDocumentsChain;
    this.questionGeneratorChain = fields.questionGeneratorChain;
    this.inputKey = fields.inputKey ?? this.inputKey;
    this.returnSourceDocuments =
      fields.returnSourceDocuments ?? this.returnSourceDocuments;

    this.outputParser =
      fields.outputParser ?? (new NoOpOutputParser() as BaseOutputParser<T>);
  }

  static getChatHistoryString(
    chatHistory: string | BaseMessage[] | string[][],
  ) {
    let historyMessages: BaseMessage[];
    if (Array.isArray(chatHistory)) {
      // TODO: Deprecate on a breaking release
      if (
        Array.isArray(chatHistory[0]) &&
        typeof chatHistory[0][0] === 'string'
      ) {
        console.warn(
          'Passing chat history as an array of strings is deprecated.\nPlease see https://js.langchain.com/docs/modules/chains/popular/chat_vector_db#externally-managed-memory for more information.',
        );
        historyMessages = chatHistory.flat().map((stringMessage, i) => {
          if (i % 2 === 0) {
            return new HumanMessage(stringMessage);
          } else {
            return new AIMessage(stringMessage);
          }
        });
      } else {
        historyMessages = chatHistory as BaseMessage[];
      }
      return historyMessages
        .map((chatMessage) => {
          if (chatMessage._getType() === 'human') {
            return `Human: ${chatMessage.content}`;
          } else if (chatMessage._getType() === 'ai') {
            return `Assistant: ${chatMessage.content}`;
          } else {
            return `${chatMessage.content}`;
          }
        })
        .join('\n');
    }
    return chatHistory;
  }

  /** @ignore */
  async _call(
    values: ChainValues,
    runManager?: CallbackManagerForChainRun,
  ): Promise<ChainValues> {
    if (!(this.inputKey in values)) {
      throw new Error(`Question key ${this.inputKey} not found.`);
    }
    if (!(this.chatHistoryKey in values)) {
      throw new Error(`Chat history key ${this.chatHistoryKey} not found.`);
    }

    if (!(this.formatInstructionsKey in values)) {
      // throw new Error(
      //   `format instructions key ${this.formatInstructionsKey} not found.`,
      // );
    }

    const question: string = values[this.inputKey];
    const chatHistory: string =
      ConversationalRetrievalQAWithOutputParserChain.getChatHistoryString(
        values[this.chatHistoryKey],
      );
    let newQuestion = question;
    if (chatHistory.length > 0) {
      const result = await this.questionGeneratorChain.call(
        {
          question,
          chat_history: chatHistory,
        },
        runManager?.getChild('question_generator'),
      );
      const keys = Object.keys(result);
      if (keys.length === 1) {
        newQuestion = result[keys[0]];
      } else {
        throw new Error(
          'Return from llm chain has multiple values, only single values supported.',
        );
      }
    }

    let docs = await this.retriever.getRelevantDocuments(
      newQuestion,
      runManager?.getChild('retriever'),
    );

    if (!newQuestion) {
      docs = [];
    }
    let format_instructions;
    let inputs;
    if (!(this.formatInstructionsKey in values)) {
      format_instructions = '';
      inputs = {
        question: newQuestion,
        input_documents: docs,
        chat_history: chatHistory,
      };
    } else {
      format_instructions = values[this.formatInstructionsKey];
      inputs = {
        question: newQuestion,
        format_instructions: format_instructions,
        input_documents: docs,
        chat_history: chatHistory,
      };
    }

    const result = await this.combineDocumentsChain.call(
      inputs,
      runManager?.getChild('combine_documents'),
    );

    if (this.returnSourceDocuments) {
      return {
        ...result,
        sourceDocuments: docs,
      };
    }
    return {
      ...result,
    };
  }

  _chainType(): string {
    return 'conversational_retrieval_chain';
  }

  static async deserialize(
    _data: SerializedChatVectorDBQAChain,
    _values: LoadValues,
  ): Promise<ConversationalRetrievalQAWithOutputParserChain> {
    throw new Error('Not implemented.');
  }

  serialize(): SerializedChatVectorDBQAChain {
    throw new Error('Not implemented.');
  }

  static fromLLM(
    llm: BaseLanguageModel,
    retriever: BaseRetriever,
    options: {
      outputKey?: string; // not used
      returnSourceDocuments?: boolean;
      /** @deprecated Pass in questionGeneratorChainOptions.template instead */
      questionGeneratorTemplate?: string;
      /** @deprecated Pass in qaChainOptions.prompt instead */
      qaTemplate?: string;
      qaChainOptions?: QAChainParams;
      questionGeneratorChainOptions?: {
        llm?: BaseLanguageModel;
        template?: string;
      };
    } & Omit<
      ConversationalRetrievalQAWithOutputParserChainInput,
      'retriever' | 'combineDocumentsChain' | 'questionGeneratorChain'
    > = {},
  ): ConversationalRetrievalQAWithOutputParserChain {
    const {
      questionGeneratorTemplate,
      qaTemplate,

      qaChainOptions = {
        //default qaChainOptions here is from qaTemplate or undefined
        type: 'stuff',
        prompt: qaTemplate
          ? PromptTemplate.fromTemplate(qaTemplate)
          : undefined,
      },
      questionGeneratorChainOptions,
      verbose,
      ...rest
    } = options;

    const qaChain = loadQAChain(llm, qaChainOptions);

    const questionGeneratorChainPrompt = PromptTemplate.fromTemplate(
      questionGeneratorChainOptions?.template ??
        questionGeneratorTemplate ??
        question_generator_template,
      //question_generator_template is default template for generating
      //rephrased question using LLMChain
    );

    const questionGeneratorChain = new LLMChain({
      prompt: questionGeneratorChainPrompt,
      llm: questionGeneratorChainOptions?.llm ?? llm,
      verbose,
    });
    const instance = new this({
      retriever,
      combineDocumentsChain: qaChain,
      questionGeneratorChain,
      verbose,
      ...rest,
    });
    return instance;
  }
}
