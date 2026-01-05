import { StateGraph, END, START } from "@langchain/langgraph";
import { AgentState } from "../memory";
import { Node } from "./node";
import { LLMAdapter } from "../utils/llm-adapter";

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

  constructor(llm: LLMAdapter) {
    this.agentNode = new Node(llm);
    this.compiledWorkflow = this.buildWorkflow();
  }

  /**
   * 构建工作流图
   */
  private buildWorkflow() {
    const workflow = new StateGraph(AgentState)
      .addNode("agent", this.agentNode.getNodeFunction())
      .addEdge(START, "agent" as any)
      .addConditionalEdges(
        "agent" as any,
        (state: typeof AgentState.State) => {
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
