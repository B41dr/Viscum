import { StateGraph, END, START } from "@langchain/langgraph";
import { AgentState } from "./state";
import {
  createMainAgentNode,
  createSubAgentNode,
  shouldContinue,
} from "./nodes";
import { ChatOpenAI } from "@langchain/openai";

/**
 * 创建 Agent 工作流（主子 Agent 架构）
 */
export function createAgentWorkflow(llm: ChatOpenAI) {
  // 创建主 Agent 节点（协调和决策）
  const mainAgentNode = createMainAgentNode(llm);

  // 创建子 Agent 节点（执行工具/Skill）
  const subAgentNode = createSubAgentNode();

  // 创建工作流图
  const workflow = new StateGraph(AgentState)
    .addNode("mainAgent", mainAgentNode)
    .addNode("subAgent", subAgentNode)
    .addEdge(START, "mainAgent" as any)
    .addConditionalEdges("mainAgent" as any, shouldContinue, {
      subAgent: "subAgent" as any,
      END: END,
    })
    .addEdge("subAgent" as any, "mainAgent" as any);

  // 编译工作流
  return workflow.compile();
}
