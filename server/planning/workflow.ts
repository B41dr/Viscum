import { StateGraph, END, START } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { AgentState } from "../memory";
import { Node } from "./node";
import { initEnvironment } from "../environment";

/**
 * Agent 工作流
 * 负责管理和协调 Agent 的工作流程
 */
export class AgentWorkflow {
  private agentNode: Node;
  private compiledWorkflow: {
    invoke: (
      state: typeof AgentState.State
    ) => Promise<typeof AgentState.State>;
    stream: (state: typeof AgentState.State) => any;
  };

  constructor(llm: ChatOpenAI) {
    initEnvironment();
    this.agentNode = new Node(llm);
    this.compiledWorkflow = this.buildWorkflow();
  }

  /**
   * 构建工作流图
   * 简化后的工作流：Agent 循环执行，直到没有工具调用
   */
  private buildWorkflow() {
    const workflow = new StateGraph(AgentState)
      .addNode("agent", this.agentNode.getNodeFunction())
      .addEdge(START, "agent" as any)
      .addConditionalEdges(
        "agent" as any,
        (state: typeof AgentState.State) => {
          // 如果有工具结果需要处理，继续循环让 LLM 处理结果；否则结束
          if (state.toolResults && state.toolResults.length > 0) {
            return "continue";
          }
          return "end";
        },
        {
          continue: "agent" as any,
          end: END,
        }
      );

    return workflow.compile() as any;
  }

  /**
   * 调用工作流
   */
  async invoke(
    state: typeof AgentState.State
  ): Promise<typeof AgentState.State> {
    return await this.compiledWorkflow.invoke(state);
  }

  /**
   * 流式调用工作流
   */
  async stream(state: typeof AgentState.State) {
    return await this.compiledWorkflow.stream(state);
  }
}
