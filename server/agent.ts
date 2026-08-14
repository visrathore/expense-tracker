import "dotenv/config";
import {
  MemorySaver,
  MessagesAnnotation,
  StateGraph,
  type LangGraphRunnableConfig,
} from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { initDB } from "./db.ts";
import { initTools } from "./tools.ts";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import type { AIMessage, ToolMessage } from "langchain";
import type { StreamMessage } from "./types.ts";

/*
 * Initialise Database
 */
const database = initDB("./expenses.db");
const tools = initTools(database);

/*
 * Initialise the LLM
 */
const llm = new ChatOpenAI({
  model: "gpt-5-mini",
});

/*
 * Tool Node
 */

const toolNode = new ToolNode(tools);

/*
 * Call Model Node
 */
async function callModel(state: typeof MessagesAnnotation.State) {
  const llmWithTools = llm.bindTools(tools);
  const response = await llmWithTools.invoke([
    {
      role: "system",
      content: `You are a helpful expense tracking assistant. Current datetime: ${new Date().toISOString()}.
            Call add_expense tool to add the expense to database.
            Call get_expenses tool to get the list of expenses for given date range.
            Call generate_expense_chart tool only when user needs to visualize the expenses.
            `,
    },
    ...state.messages,
  ]);
  return { messages: [response] };
}

/*
 * Conditional Edge
 */

function shouldContinue(
  state: typeof MessagesAnnotation.State,
  config: LangGraphRunnableConfig,
) {
  const messages = state.messages;
  const lastMessage = messages.at(-1) as AIMessage;

  if (lastMessage.tool_calls?.length) {
    const customMessage: StreamMessage = {
      type: "toolCall:start",
      payload: {
        name: lastMessage.tool_calls[0]!.name,
        args: lastMessage.tool_calls[0]!.args,
      },
    };

    config.writer!(customMessage);

    return "tools";
  }

  return "__end__";
}

function shouldCallModel(state: typeof MessagesAnnotation.State) {
  //todo: change this when chart tool will be implemented

  const messages = state.messages;
  const lastMessage = messages.at(-1) as ToolMessage;

  const message = JSON.parse(lastMessage.content as string);

  if (message.type === "chart") return "__end__";

  return "callModel";
}

/*
 * Graph
 */
const graph = new StateGraph(MessagesAnnotation)
  .addNode("callModel", callModel)
  .addNode("tools", toolNode)
  .addEdge("__start__", "callModel")
  .addConditionalEdges("callModel", shouldContinue, {
    __end__: "__end__",
    tools: "tools",
  })
  .addConditionalEdges("tools", shouldCallModel, {
    callModel: "callModel",
    __end__: "__end__",
  });

export const agent = graph.compile({
  checkpointer: new MemorySaver(),
});

// async function main() {
//   const response = await agent.stream(
//     {
//       messages: [
//         {
//           role: "user",
//           content:
//             "Can you visualise how much i have spent this year group by months?",
//         },
//       ],
//     },
//     {
//       streamMode: "updates",
//       configurable: { thread_id: "1" },
//     },
//   );

//   for await (const chunk of response) {
//     console.log("Chunk", chunk);
//   }

//   //console.log(JSON.stringify(response, null, 2));
// }

// main();
