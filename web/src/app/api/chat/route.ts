import { NextRequest } from "next/server";
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  BaseMessage,
} from "@langchain/core/messages";
import { AgentWorkflow } from "@viscum/server/planning";
import { AgentState } from "@viscum/server/memory";
import { createLLMClient, initLogger } from "@viscum/server/utils";
import { Environment } from "@viscum/server/environment";

let agentWorkflow: AgentWorkflow | null = null;
let systemPrompt: string | undefined = undefined;

const CHAT_CONFIG = {
  baseUrl: process.env.BASE_URL!,
  apiKey: process.env.API_KEY!,
  model: process.env.MODEL!,
};

function initializeAgent() {
  if (!agentWorkflow) {
    try {
      initLogger();

      if (!CHAT_CONFIG.apiKey || !CHAT_CONFIG.model || !CHAT_CONFIG.baseUrl) {
        throw new Error(
          `配置不完整: apiKey=${!!CHAT_CONFIG.apiKey}, model=${!!CHAT_CONFIG.model}, baseUrl=${!!CHAT_CONFIG.baseUrl}`
        );
      }

      const llm = createLLMClient({
        apiKey: CHAT_CONFIG.apiKey,
        modelName: CHAT_CONFIG.model,
        baseURL: CHAT_CONFIG.baseUrl,
        temperature: 0.7,
        streaming: false,
      });
      agentWorkflow = new AgentWorkflow(llm);
    } catch (error) {
      throw error;
    }
  }
  return agentWorkflow;
}

/**
 * 从状态中提取 AI 响应内容
 */
function extractAIResponse(state: typeof AgentState.State): string | null {
  if (!state || !state.messages || state.messages.length === 0) {
    return null;
  }

  // 从后往前查找最后一个 AI 消息
  // 优先查找没有工具调用的 AI 消息，如果没有则返回最后一个 AI 消息的内容
  let lastAIMessage: AIMessage | null = null;

  for (let i = state.messages.length - 1; i >= 0; i--) {
    const msg = state.messages[i];

    if (msg instanceof AIMessage) {
      // 如果还没有找到任何 AI 消息，先记录
      if (!lastAIMessage) {
        lastAIMessage = msg;
      }

      // 检查是否有工具调用
      const hasToolCalls = msg.tool_calls && msg.tool_calls.length > 0;

      // 如果没有工具调用，直接返回这个消息的内容
      if (!hasToolCalls) {
        const content = msg.content;
        if (content) {
          return typeof content === "string" ? content : String(content);
        }
      }
    }
  }

  // 如果所有 AI 消息都有工具调用，返回最后一个 AI 消息的内容（即使有工具调用）
  if (lastAIMessage) {
    const content = lastAIMessage.content;
    if (content) {
      return typeof content === "string" ? content : String(content);
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const workflow = initializeAgent();
    const langchainMessages: BaseMessage[] = [];
    const { messages } = body;

    if (systemPrompt === undefined) {
      systemPrompt = Environment.getInstance().getAgentPrompt()!;
    }

    langchainMessages.push(new SystemMessage(systemPrompt));

    for (const msg of messages) {
      if (msg.role === "system") {
        continue;
      } else if (msg.role === "user") {
        langchainMessages.push(new HumanMessage(msg.content));
      } else if (msg.role === "assistant") {
        langchainMessages.push(new AIMessage(msg.content));
      }
    }

    const hasUserMessage = langchainMessages.some(
      (msg) => msg instanceof HumanMessage
    );

    if (!hasUserMessage && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role !== "system") {
        langchainMessages.push(new HumanMessage(lastMessage.content));
      }
    }

    const newState: typeof AgentState.State = {
      messages: langchainMessages,
      toolCalls: [],
      toolResults: [],
    };

    // 创建流式响应
    const encoder = new TextEncoder();
    let lastContent = "";
    // 累积的状态
    let accumulatedState: typeof AgentState.State = { ...newState };

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // 使用 stream 方法获取状态流
          // 注意：LangGraph 的 stream 方法应该直接返回异步迭代器
          // 但 AgentWorkflow.stream 是 async 方法，所以需要 await
          const stateStreamResult = await workflow.stream(newState);
          // 如果返回的是迭代器，直接使用；如果是其他格式，尝试转换
          const stateStream = stateStreamResult as AsyncIterable<any>;

          // 遍历状态流
          // LangGraph 的 stream 返回格式: { nodeName: partialStateUpdate }
          for await (const stateUpdate of stateStream) {
            if (stateUpdate && typeof stateUpdate === "object") {
              // 提取部分状态更新（LangGraph 返回 { nodeName: partialState }）
              const nodeName = Object.keys(stateUpdate)[0];
              const partialState = stateUpdate[nodeName] as Partial<
                typeof AgentState.State
              >;

              if (partialState) {
                // 累积状态更新
                if (partialState.messages) {
                  accumulatedState.messages = [
                    ...accumulatedState.messages,
                    ...(Array.isArray(partialState.messages)
                      ? partialState.messages
                      : [partialState.messages]),
                  ];
                }
                if (partialState.toolCalls !== undefined) {
                  accumulatedState.toolCalls = partialState.toolCalls;
                }
                if (partialState.toolResults !== undefined) {
                  accumulatedState.toolResults = partialState.toolResults;
                }

                // 提取当前累积状态的 AI 响应
                const currentResponse = extractAIResponse(accumulatedState);

                if (currentResponse && currentResponse !== lastContent) {
                  // 计算新增的内容（增量）
                  const delta = currentResponse.slice(lastContent.length);

                  if (delta) {
                    // 发送 SSE 格式的数据
                    const sseData = JSON.stringify({
                      choices: [
                        {
                          delta: {
                            content: delta,
                          },
                        },
                      ],
                    });

                    controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
                    lastContent = currentResponse;
                  }
                }
              }
            }
          }

          // 发送最终消息（完整内容）
          const finalResponse = extractAIResponse(accumulatedState);
          if (finalResponse) {
            const finalData = JSON.stringify({
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: finalResponse,
                  },
                },
              ],
            });
            controller.enqueue(encoder.encode(`data: ${finalData}\n\n`));
          }

          // 发送结束信号
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          const errorData = JSON.stringify({
            error: {
              message: error instanceof Error ? error.message : String(error),
            },
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    // 如果初始化阶段出错，返回错误响应
    const encoder = new TextEncoder();
    const errorData = JSON.stringify({
      error: {
        message: error instanceof Error ? error.message : String(error),
      },
    });

    return new Response(`data: ${errorData}\n\ndata: [DONE]\n\n`, {
      status: 500,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }
}
