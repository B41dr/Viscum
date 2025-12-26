import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { AgentState, AgentWorkflow } from "../agent";
import { CLIInterface } from "./interface";
import { logger } from "../utils";

/**
 * 聊天管理器类
 * 负责管理对话流程和展示 AI 响应
 */
export class ChatManager {
  private app: AgentWorkflow;
  private cli: CLIInterface;
  private conversationState: typeof AgentState.State;

  constructor(app: AgentWorkflow) {
    this.app = app;
    this.cli = new CLIInterface();
    this.conversationState = {
      messages: [],
      toolCalls: [],
      toolResults: [],
    };
  }

  /**
   * 处理用户输入并获取 AI 响应
   */
  async processUserInput(userInput: string): Promise<string | null> {
    if (!userInput) {
      return null;
    }

    if (this.cli.isExitCommand(userInput)) {
      return "EXIT";
    }

    try {
      // 添加用户消息到对话历史
      const newState: typeof AgentState.State = {
        messages: [
          ...this.conversationState.messages,
          new HumanMessage(userInput),
        ],
        toolCalls: [],
        toolResults: [],
      };

      // 调用 Agent 工作流
      const finalState = await this.app.invoke(newState);

      // 提取并显示 AI 响应
      const response = this.extractAIResponse(finalState);

      if (response) {
        this.cli.displayMessage(`🤖 Agent: ${response}`);
      }

      // 保存最终状态
      if (finalState) {
        this.conversationState = finalState;
      }

      return response;
    } catch (error) {
      const errorDetails =
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
          : { error: String(error) };
      logger.error("处理用户输入时出错", errorDetails);
      return null;
    }
  }

  /**
   * 从状态中提取 AI 响应内容
   */
  private extractAIResponse(state: typeof AgentState.State): string | null {
    if (!state || !state.messages || state.messages.length === 0) {
      return null;
    }

    // 从后往前查找最后一个非工具调用的 AI 消息
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const msg = state.messages[i];

      if (msg instanceof AIMessage) {
        // 检查是否有工具调用
        const hasToolCalls = msg.tool_calls && msg.tool_calls.length > 0;

        if (!hasToolCalls) {
          return typeof msg.content === "string" ? msg.content : "";
        }
      }
    }

    return null;
  }

  /**
   * 运行对话循环
   */
  async run(): Promise<void> {
    this.cli.displayMessage("💬 聊天已启动，输入 'exit' 或 'quit' 退出\n");

    while (true) {
      try {
        const userInput = await this.cli.askQuestion();
        const response = await this.processUserInput(userInput);

        if (response === "EXIT") {
          this.cli.displayMessage("👋 再见！");
          this.cli.close();
          break;
        }
      } catch (error) {
        logger.error("对话循环错误", { error });
      }
    }
  }
}
