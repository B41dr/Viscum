import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { CompiledGraph } from "@langchain/langgraph";
import { AgentState } from "../agent";
import { createChatInterface, askQuestion, isExitCommand } from "./interface";
import { logger } from "../utils";
import { loadConfig } from "../utils/config";

export class ChatManager {
  private app: CompiledGraph<any>;
  private rl: ReturnType<typeof createChatInterface>;
  private conversationState: typeof AgentState.State;
  private streaming: boolean;

  constructor(app: CompiledGraph<any>) {
    this.app = app;
    this.rl = createChatInterface();
    this.conversationState = {
      messages: [],
      agentType: "main",
      toolCalls: [],
      toolResults: [],
    };
    // 获取流式输出配置
    const config = loadConfig();
    this.streaming = config.streaming;
  }

  /**
   * 处理用户输入并获取 AI 响应（支持流式输出）
   */
  async processUserInput(userInput: string): Promise<string | null> {
    if (!userInput) {
      return null;
    }

    if (isExitCommand(userInput)) {
      return "EXIT";
    }

    try {
      // 添加用户消息到对话历史
      const newState: typeof AgentState.State = {
        messages: [
          ...this.conversationState.messages,
          new HumanMessage(userInput),
        ],
        agentType: this.conversationState.agentType || "main",
        toolCalls: [],
        toolResults: [],
      };

      let finalState: typeof AgentState.State | null = null;
      let accumulatedContent = "";
      let isFirstOutput = true;
      let lastMessageCount = this.conversationState.messages.length;

      if (this.streaming) {
        // 使用 stream 方法获取完整状态值
        const stream = await this.app.stream(newState, {
          streamMode: "values",
        });

        // 处理流式状态更新
        for await (const chunk of stream) {
          // chunk 是完整的状态对象
          const state = chunk as typeof AgentState.State;

          // 调试：记录状态更新
          logger.debug("收到状态更新", {
            messageCount: state.messages?.length || 0,
            lastMessageCount,
            hasNewMessages:
              state.messages && state.messages.length > lastMessageCount,
          });

          // 检查是否有新的消息
          if (state.messages && state.messages.length > lastMessageCount) {
            const newMessages = state.messages.slice(lastMessageCount);

            for (const msg of newMessages) {
              // 使用更可靠的消息类型检查
              const msgType =
                typeof (msg as any).getType === "function"
                  ? (msg as any).getType()
                  : (msg as any)._type ||
                    (msg instanceof AIMessage ? "ai" : "unknown");

              logger.debug("处理新消息", {
                type: msgType,
                isAIMessage: msg instanceof AIMessage,
                hasContent: !!msg.content,
              });

              // 检查是否是 AI 消息（包括工具调用后的最终响应）
              if (msgType === "ai" || msg instanceof AIMessage) {
                const content = msg.content;
                let textContent = "";

                // 提取文本内容
                if (typeof content === "string") {
                  textContent = content;
                } else if (Array.isArray(content)) {
                  textContent = content
                    .map((item) => {
                      if (typeof item === "string") {
                        return item;
                      }
                      if (item && typeof item === "object" && "text" in item) {
                        return (item as any).text || "";
                      }
                      return "";
                    })
                    .join("");
                }

                // 如果有工具调用，不显示内容（等待工具执行完成）
                const hasToolCalls =
                  (msg as any).tool_calls && (msg as any).tool_calls.length > 0;
                if (hasToolCalls) {
                  logger.debug("消息包含工具调用，跳过显示", {
                    toolCalls: (msg as any).tool_calls.map(
                      (tc: any) => tc.name
                    ),
                  });
                  continue;
                }

                // 显示新增的内容
                if (
                  textContent &&
                  textContent.length > accumulatedContent.length
                ) {
                  const newContent = textContent.slice(
                    accumulatedContent.length
                  );
                  if (newContent) {
                    if (isFirstOutput) {
                      process.stdout.write(`🤖 Agent: ${newContent}`);
                      isFirstOutput = false;
                    } else {
                      process.stdout.write(newContent);
                    }
                    accumulatedContent = textContent;
                  }
                } else if (textContent && !accumulatedContent) {
                  // 如果这是第一条内容，直接显示
                  if (isFirstOutput) {
                    process.stdout.write(`🤖 Agent: ${textContent}`);
                    isFirstOutput = false;
                  } else {
                    process.stdout.write(textContent);
                  }
                  accumulatedContent = textContent;
                }
              }
            }

            lastMessageCount = state.messages.length;
          }

          // 保存最新状态
          finalState = state;
        }

        // 流式输出完成后换行
        if (accumulatedContent) {
          process.stdout.write("\n");
        }

        // 如果流结束后没有内容，检查最终状态
        if (!accumulatedContent && finalState) {
          // 从后往前查找最后一个非工具调用的 AI 消息
          for (let i = finalState.messages.length - 1; i >= 0; i--) {
            const msg = finalState.messages[i];
            const msgType =
              typeof (msg as any).getType === "function"
                ? (msg as any).getType()
                : (msg as any)._type ||
                  (msg instanceof AIMessage ? "ai" : "unknown");

            if (msgType === "ai" || msg instanceof AIMessage) {
              const hasToolCalls =
                (msg as any).tool_calls && (msg as any).tool_calls.length > 0;
              if (!hasToolCalls) {
                const content = msg.content;
                let textContent = "";
                if (typeof content === "string") {
                  textContent = content;
                } else if (Array.isArray(content)) {
                  textContent = content
                    .map((item) => {
                      if (typeof item === "string") {
                        return item;
                      }
                      if (item && typeof item === "object" && "text" in item) {
                        return (item as any).text || "";
                      }
                      return "";
                    })
                    .join("");
                }
                if (textContent) {
                  // 直接输出到终端，而不是日志
                  console.log(`🤖 Agent: ${textContent}`);
                  accumulatedContent = textContent;
                  break;
                }
              }
            }
          }
        }

        // 如果还是没有内容，可能是流式模式的问题，回退到非流式模式获取结果
        if (!accumulatedContent) {
          logger.warn("流式模式未获取到内容，回退到非流式模式");
          finalState = await this.app.invoke(newState);

          if (finalState) {
            const lastMessage =
              finalState.messages[finalState.messages.length - 1];
            if (lastMessage instanceof AIMessage) {
              const content = lastMessage.content;
              let textContent = "";
              if (typeof content === "string") {
                textContent = content;
              } else if (Array.isArray(content)) {
                textContent = content
                  .map((item) => {
                    if (typeof item === "string") {
                      return item;
                    }
                    if (item && typeof item === "object" && "text" in item) {
                      return (item as any).text || "";
                    }
                    return "";
                  })
                  .join("");
              }
              if (textContent) {
                console.log(`🤖 Agent: ${textContent}`);
                accumulatedContent = textContent;
              }
            }
          }
        }
      } else {
        // 非流式模式，直接调用
        finalState = await this.app.invoke(newState);

        // 获取 AI 响应
        if (finalState) {
          const lastMessage =
            finalState.messages[finalState.messages.length - 1];
          if (lastMessage instanceof AIMessage) {
            const content = lastMessage.content;
            if (typeof content === "string") {
              accumulatedContent = content;
            } else if (Array.isArray(content)) {
              accumulatedContent = content
                .map((item) => {
                  if (typeof item === "string") {
                    return item;
                  }
                  if (item && typeof item === "object" && "text" in item) {
                    return (item as any).text || "";
                  }
                  return "";
                })
                .join("");
            }
            logger.info(`🤖 Agent: ${accumulatedContent}`);
          }
        }
      }

      // 保存最终状态
      if (finalState) {
        this.conversationState = finalState;
      }

      // 返回完整的响应内容
      return accumulatedContent || null;
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
    }
  }

  /**
   * 运行对话循环
   */
  async run(): Promise<void> {
    while (true) {
      try {
        const userInput = await askQuestion(this.rl);

        const response = await this.processUserInput(userInput);

        if (response === "EXIT") {
          logger.info("👋 再见！");
          this.rl.close();
          break;
        }

        // 流式输出已经在 processUserInput 中处理，这里不需要再次输出
        // 但如果没有响应内容，记录一下
        if (!response) {
          logger.debug("未收到响应内容");
        }
      } catch (error) {
        logger.error("对话循环错误", { error });
      }
    }
  }

  /**
   * 关闭对话界面
   */
  close(): void {
    this.rl.close();
  }
}
