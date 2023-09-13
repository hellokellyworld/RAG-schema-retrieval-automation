# RAG-schema-retrieval-automation

Fix Hallucination in Retrieval Augmented Generation AI Applications Using Schema and Output Parser

Tech stack used includes LangChain, Pinecone, Typescript, Openai, and Next.js. LangChain is a framework that makes it easier to build scalable AI/LLM apps and chatbots. Pinecone is a vectorstore for storing embeddings and your PDF in text to later retrieve similar docs.

## Development

1. Clone the repo or download the ZIP

```
git clone https://github.com/hellokellyworld/RAG-schema-retrieval-automation.git
```


2. Install packages

First run `npm install yarn -g` to install yarn globally (if you haven't already).

Then run:

```
yarn install
```
After installation, you should now see a `node_modules` folder.

3. Set up your `.env` file

- Copy `.env.example` into `.env`
  Your `.env` file should look like this:

```
OPENAI_API_KEY=

PINECONE_API_KEY=
PINECONE_ENVIRONMENT=

PINECONE_INDEX_NAME=

```

- Visit [openai](https://help.openai.com/en/articles/4936850-where-do-i-find-my-secret-api-key) to retrieve API keys and insert into your `.env` file.
- Visit [pinecone](https://pinecone.io/) to create and retrieve your API keys, and also retrieve your environment and index name from the dashboard.

Make sure you set the dimension size to be 1536 and use cosine similarity when creating index in Pinecone.

4. In the `config` folder, replace the `PINECONE_NAME_SPACE` with a `namespace` where you'd like to store your embeddings on Pinecone when you run `yarn run ingest`. This namespace will later be used for queries and retrieval.

5. In `utils/makechain.ts` chain change the `QA_PROMPT` for your own usecase. Change `modelName` in `new OpenAI` to `gpt-4`, if you have access to `gpt-4` api. Please verify outside this repo that you have access to `gpt-4` api, otherwise the application will not work. For `gpt-4`, you will need to prepay OpenAI before you can activiate it. https://help.openai.com/en/articles/7102672-how-can-i-access-gpt-4

## Convert your PDF files to embeddings

**This repo can load multiple PDF files**

1. Inside `docs` folder, add your pdf files or folders that contain pdf files.

2. Run the script `yarn run ingest` to 'ingest' and embed your docs. If you run into errors troubleshoot below.

3. Check Pinecone dashboard to verify your namespace and vectors have been added.

## Run the app

Once you've verified that the embeddings and content have been successfully added to your Pinecone, you can run the app `yarn start` to launch the local dev environment at http://localhost:8081 in browser, and then define fields to extract.

## Credit

The source code was inspired by this project here [gpt4-pdf-chatbot-langchain](https://github.com/mayooear/gpt4-pdf-chatbot-langchain).

Frontend of this repo is inspired by [langchain-chat-nextjs](https://github.com/zahidkhawaja/langchain-chat-nextjs)

## Publication
The article about this project can be read here [Fix Hallucination in Retrieval Augmented Generation AI Applications Using Schema and Output Parser](https://kelly-kang.medium.com/fix-hallucination-in-retrieval-augmented-generation-ai-applications-using-schema-and-output-parser-d58325daf1da).
