import { ChatOpenAI } from "@langchain/openai";
import { AgentState } from "./state";
import {
  AIMessage,
  ToolMessage,
  SystemMessage,
  HumanMessage,
  BaseMessage,
} from "@langchain/core/messages";
import { toolRegistry } from "../skills/tool";
import { logger } from "../utils";
import { Environment } from "../environment";

// 创建环境实例
const environment = new Environment();

/**
 * 格式化消息列表为可读的字符串
 */
function formatMessagesForLog(messages: BaseMessage[]): string {
  return messages
    .map((msg, index) => {
      let role = "unknown";

      // 优先使用 getType 方法（LangChain 标准方法）
      if (typeof (msg as any).getType === "function") {
        const msgType = (msg as any).getType();
        if (msgType === "system") role = "system";
        else if (msgType === "human") role = "user";
        else if (msgType === "ai") role = "assistant";
        else if (msgType === "tool") role = "tool";
      }
      // 如果没有 getType 方法，尝试使用 _getType
      else if (typeof (msg as any)._getType === "function") {
        const msgType = (msg as any)._getType();
        if (msgType === "system") role = "system";
        else if (msgType === "human") role = "user";
        else if (msgType === "ai") role = "assistant";
        else if (msgType === "tool") role = "tool";
      }
      // 最后尝试检查 _type 属性
      else if ((msg as any)._type) {
        const msgType = (msg as any)._type;
        if (msgType === "system") role = "system";
        else if (msgType === "human") role = "user";
        else if (msgType === "ai") role = "assistant";
        else if (msgType === "tool") role = "tool";
      }
      // 如果以上都失败，使用 instanceof 作为后备方案
      else {
        if (msg instanceof SystemMessage) role = "system";
        else if (msg instanceof HumanMessage) role = "user";
        else if (msg instanceof AIMessage) role = "assistant";
        else if (msg instanceof ToolMessage) role = "tool";
      }

      let content = "";
      if (typeof msg.content === "string") {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        content = msg.content
          .map((item) => {
            if (typeof item === "string") return item;
            if (item && typeof item === "object" && "text" in item)
              return (item as any).text;
            return JSON.stringify(item);
          })
          .join("");
      } else {
        content = JSON.stringify(msg.content);
      }

      const toolCalls =
        msg instanceof AIMessage && msg.tool_calls
          ? ` [工具调用: ${msg.tool_calls.map((tc: any) => tc.name).join(", ")}]`
          : "";

      return `[${index + 1}] ${role}: ${content}${toolCalls}`;
    })
    .join("\n");
}

/**
 * 主 Agent 节点 - 负责协调和决策
 */
export function createMainAgentNode(llm: ChatOpenAI) {
  return async function mainAgent(
    state: typeof AgentState.State
  ): Promise<Partial<typeof AgentState.State>> {
    const messages = state.messages;

    // 构建消息列表，确保第一条消息是 system message
    const allMessages: any[] = [];

    // 检查是否已有 system message
    const hasSystemMessage = messages.some(
      (msg) => msg instanceof SystemMessage
    );

    // 如果没有 system message，添加一个来提示 LLM 使用工具
    if (!hasSystemMessage) {
      const systemPrompt = environment.getMainAgentPrompt();
      if (systemPrompt) {
        allMessages.push(new SystemMessage(systemPrompt));
      }
    }

    // 先处理 toolResults，创建 ToolMessage
    // 这样在后续处理消息历史时，可以确保所有 tool_calls 都有对应的 ToolMessage
    const newToolMessages: ToolMessage[] = [];
    if (state.toolResults && state.toolResults.length > 0) {
      // 找到最后一个包含工具调用的 AI 消息
      let lastAIMessageWithTools: AIMessage | undefined;
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (
          msg instanceof AIMessage &&
          msg.tool_calls &&
          msg.tool_calls.length > 0
        ) {
          lastAIMessageWithTools = msg;
          break;
        }
      }

      if (lastAIMessageWithTools && lastAIMessageWithTools.tool_calls) {
        // 为每个工具结果创建 ToolMessage，确保 tool_call_id 匹配
        state.toolResults.forEach((toolResult, index) => {
          const toolCall = lastAIMessageWithTools!.tool_calls?.[index];
          if (!toolCall || !toolCall.id) {
            logger.warn("工具结果没有对应的 tool_call_id", {
              index,
              toolResultName: toolResult.name,
            });
            return;
          }

          const resultContent =
            typeof toolResult.result === "string"
              ? toolResult.result
              : JSON.stringify(toolResult.result, null, 2);

          const toolMessage = new ToolMessage({
            content: resultContent,
            tool_call_id: toolCall.id,
          });

          newToolMessages.push(toolMessage);
        });
      }
    }

    // 添加历史消息，验证每个带有 tool_calls 的 AIMessage 都有对应的 ToolMessage
    // 工作流应该确保所有工具调用都完成，不应该出现未完成的工具调用
    const processedMessages: any[] = [];
    const pendingToolCallMap = new Map<
      string,
      { message: AIMessage; toolCall: any }
    >();
    const toolMessageMap = new Map<string, ToolMessage>();

    // 第一遍：收集所有 ToolMessage（包括新创建的）
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg instanceof ToolMessage && msg.tool_call_id) {
        toolMessageMap.set(msg.tool_call_id, msg);
      }
    }
    // 添加新创建的 ToolMessage 到映射中
    newToolMessages.forEach((toolMsg) => {
      if (toolMsg.tool_call_id) {
        toolMessageMap.set(toolMsg.tool_call_id, toolMsg);
      }
    });

    // 第二遍：处理所有消息，确保 tool_calls 都有对应的 ToolMessage
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      // 如果是 AIMessage 且包含 tool_calls，检查是否有对应的 ToolMessage
      if (
        msg instanceof AIMessage &&
        msg.tool_calls &&
        msg.tool_calls.length > 0
      ) {
        // 检查所有 tool_calls 是否都有对应的 ToolMessage
        const allToolCallsHaveResponses = msg.tool_calls.every((tc: any) => {
          if (!tc.id) return false;
          return toolMessageMap.has(tc.id);
        });

        if (allToolCallsHaveResponses) {
          // 所有 tool_calls 都有对应的 ToolMessage，可以添加
          processedMessages.push(msg);
          // 添加对应的 ToolMessage（按顺序）
          msg.tool_calls.forEach((tc: any) => {
            if (tc.id && toolMessageMap.has(tc.id)) {
              const toolMsg = toolMessageMap.get(tc.id)!;
              // 检查是否已经添加过这个 ToolMessage
              if (!processedMessages.includes(toolMsg)) {
                processedMessages.push(toolMsg);
              }
            }
          });
        } else {
          // 有未完成的 tool_calls
          // 检查是否有待处理的 toolResults（说明工具正在执行中）
          const hasToolResults =
            state.toolResults && state.toolResults.length > 0;
          const hasPendingToolCalls =
            state.toolCalls && state.toolCalls.length > 0;

          if (hasToolResults || hasPendingToolCalls) {
            // 有待处理的 toolResults 或 toolCalls，说明工具正在执行中
            // 这种情况下，不应该将这个 AIMessage 添加到消息列表
            // 因为它的 tool_calls 还没有对应的 ToolMessage
            logger.warn("跳过包含未完成 tool_calls 的 AIMessage", {
              messageIndex: i,
              missingToolCallIds: msg.tool_calls
                .map((tc: any) => tc.id)
                .filter((id: string) => !toolMessageMap.has(id)),
            });
            // 不添加这个消息，等待工具执行完成
            msg.tool_calls.forEach((tc: any) => {
              if (tc.id && !toolMessageMap.has(tc.id)) {
                pendingToolCallMap.set(tc.id, { message: msg, toolCall: tc });
              }
            });
          } else {
            // 没有待处理的 toolResults 或 toolCalls，但仍有未完成的 tool_calls
            // 这是工作流状态不一致的问题
            const missingIds = msg.tool_calls
              .map((tc: any) => tc.id)
              .filter((id: string) => id && !toolMessageMap.has(id));
            logger.error("发现未完成的 tool_calls，且没有待处理的工具结果", {
              messageIndex: i,
              missingToolCallIds: missingIds,
            });
          }
        }
        continue;
      }

      // 如果是 ToolMessage，检查是否已经被添加（通过上面的逻辑）
      if (msg instanceof ToolMessage && msg.tool_call_id) {
        // 如果还没有被添加，说明它对应的 AIMessage 还没有被处理，先跳过
        // 它会在对应的 AIMessage 被处理时被添加
        if (!processedMessages.includes(msg)) {
          // 这个 ToolMessage 可能是孤立的，或者对应的 AIMessage 在后面
          // 为了安全，我们仍然添加它
          processedMessages.push(msg);
        }
        continue;
      }

      // 其他类型的消息直接添加
      processedMessages.push(msg);
    }

    // 如果有未完成的 tool_calls，检查是否有待处理的 toolResults
    // 如果有 toolResults，说明工具正在执行中，这是正常的
    // 如果没有 toolResults 且没有待处理的 toolCalls，说明工作流异常
    if (pendingToolCallMap.size > 0) {
      const hasToolResults = state.toolResults && state.toolResults.length > 0;
      const hasPendingToolCalls = state.toolCalls && state.toolCalls.length > 0;

      // 如果有待处理的 toolResults 或 toolCalls，说明工具正在执行中，这是正常的
      if (!hasToolResults && !hasPendingToolCalls) {
        // 这种情况不应该发生，说明工作流没有正确完成
        const pendingIds = Array.from(pendingToolCallMap.keys());
        logger.error("发现未完成的工具调用，但工作流已结束", {
          pendingToolCallIds: pendingIds,
          toolCallNames: Array.from(pendingToolCallMap.values()).map(
            (v) => v.toolCall.name
          ),
        });
      }
      // 如果有待处理的 toolResults 或 toolCalls，继续正常流程
    }

    // 将处理后的消息添加到 allMessages
    // 同时，如果有新创建的 ToolMessage，需要将它们插入到对应的 AIMessage 之后
    for (let i = 0; i < processedMessages.length; i++) {
      const msg = processedMessages[i];
      allMessages.push(msg);

      // 如果这是一个包含 tool_calls 的 AIMessage，检查是否有新创建的 ToolMessage 需要插入
      if (
        msg instanceof AIMessage &&
        msg.tool_calls &&
        msg.tool_calls.length > 0
      ) {
        // 找到对应的新创建的 ToolMessage
        const correspondingToolMessages = newToolMessages.filter((toolMsg) => {
          if (!toolMsg.tool_call_id) return false;
          const toolCalls = msg.tool_calls || [];
          return toolCalls.some((tc: any) => tc.id === toolMsg.tool_call_id);
        });

        // 按 tool_calls 的顺序插入 ToolMessage
        if (correspondingToolMessages.length > 0) {
          // 按照 tool_calls 的顺序排序 ToolMessage
          const sortedToolMessages = msg.tool_calls
            .map((tc: any) => {
              return correspondingToolMessages.find(
                (tm) => tm.tool_call_id === tc.id
              );
            })
            .filter((tm) => tm !== undefined) as ToolMessage[];

          // 插入 ToolMessage
          allMessages.push(...sortedToolMessages);

          // 从 newToolMessages 中移除已插入的 ToolMessage
          sortedToolMessages.forEach((tm) => {
            const index = newToolMessages.indexOf(tm);
            if (index > -1) {
              newToolMessages.splice(index, 1);
            }
          });
        }
      }
    }

    // 如果还有剩余的 ToolMessage（理论上不应该有），添加到末尾
    if (newToolMessages.length > 0) {
      logger.warn("发现未匹配的 ToolMessage，添加到消息列表末尾", {
        count: newToolMessages.length,
      });
      allMessages.push(...newToolMessages);
    }

    // 在发送给 LLM 之前，验证所有包含 tool_calls 的 AIMessage 都有对应的 ToolMessage
    // 这是 LLM API 的要求
    const toolCallIdsInMessages = new Set<string>();
    const toolMessageIds = new Set<string>();

    for (const msg of allMessages) {
      if (msg instanceof AIMessage && msg.tool_calls) {
        msg.tool_calls.forEach((tc: any) => {
          if (tc.id) {
            toolCallIdsInMessages.add(tc.id);
          }
        });
      }
      if (msg instanceof ToolMessage && msg.tool_call_id) {
        toolMessageIds.add(msg.tool_call_id);
      }
    }

    // 检查是否有未完成的 tool_calls
    const missingToolMessages: string[] = [];
    for (const toolCallId of toolCallIdsInMessages) {
      if (!toolMessageIds.has(toolCallId)) {
        missingToolMessages.push(toolCallId);
      }
    }

    // 如果有未完成的 tool_calls，不应该发送给 LLM
    // LLM API 严格要求：每个 tool_calls 都必须有对应的 ToolMessage
    if (missingToolMessages.length > 0) {
      const hasToolResults = state.toolResults && state.toolResults.length > 0;
      const hasPendingToolCalls = state.toolCalls && state.toolCalls.length > 0;

      // 如果有待处理的 toolResults，说明工具正在执行中，应该先处理 toolResults
      // 但如果没有 toolResults，说明工作流状态不一致
      if (!hasToolResults) {
        logger.error("发现未完成的工具调用，无法发送给 LLM", {
          missingToolCallIds: missingToolMessages,
          hasPendingToolCalls,
        });
      }

      // 如果有 toolResults，但仍有未完成的 tool_calls，说明 toolResults 和 tool_calls 不匹配
      // 这可能是工作流状态不一致的问题
      logger.error("发现未完成的工具调用，即使有 toolResults", {
        missingToolCallIds: missingToolMessages,
        toolResultsCount: state.toolResults?.length || 0,
        toolCallsCount: state.toolCalls?.length || 0,
      });
    }

    // 绑定工具到 LLM（使用 Tool 注册器）
    const tools = toolRegistry.getToolDefinitions();
    logger.info("可用工具列表", {
      toolCount: tools.length,
      tools: tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
      })),
    });
    const llmWithTools = llm.bindTools(tools);

    // 记录发送给 LLM 的完整 prompt（仅写入日志文件，不在终端显示）
    const formattedPrompt = formatMessagesForLog(allMessages);
    logger.info(
      `发送给 LLM 的完整 Prompt (共 ${allMessages.length} 条消息):\n${formattedPrompt}`
    );

    const response = await llmWithTools.invoke(allMessages);

    // 检查是否有工具调用
    const toolCalls = response.tool_calls || [];
    logger.debug("LLM 响应", {
      hasToolCalls: toolCalls.length > 0,
      toolCallCount: toolCalls.length,
      responseContent:
        typeof response.content === "string"
          ? response.content.substring(0, 100)
          : "non-string content",
    });

    if (toolCalls.length > 0) {
      logger.info("主 Agent 决定调用工具", {
        toolCount: toolCalls.length,
        tools: toolCalls.map((tc: any) => tc.name),
      });

      return {
        messages: [response],
        toolCalls: toolCalls.map((tc: any) => ({
          name: tc.name,
          args: typeof tc.args === "string" ? JSON.parse(tc.args) : tc.args,
        })),
        toolResults: [], // 清空之前的工具结果
        agentType: "sub", // 切换到子 Agent
      };
    }

    // 没有工具调用，返回最终响应
    // 如果有新创建的 ToolMessage，需要一起返回，确保它们被保存到 state 中
    const messagesToReturn =
      newToolMessages.length > 0 ? [...newToolMessages, response] : [response];

    return {
      messages: messagesToReturn,
      toolResults: [], // 清空工具结果
      agentType: "main",
    };
  };
}

/**
 * 子 Agent 节点 - 负责执行工具/Skill
 */
export function createSubAgentNode() {
  return async function subAgent(
    state: typeof AgentState.State
  ): Promise<Partial<typeof AgentState.State>> {
    const toolCalls = state.toolCalls || [];
    const toolResults: Array<{ name: string; result: any }> = [];

    logger.info("子 Agent 执行工具", { toolCount: toolCalls.length });

    // 执行所有工具调用
    for (const toolCall of toolCalls) {
      try {
        const tool = toolRegistry.get(toolCall.name);
        if (!tool) {
          logger.error(`未找到 Tool: ${toolCall.name}`);
        }

        // logger.error 会抛出错误，所以 tool 不会是 undefined
        logger.info(`执行 Tool: ${toolCall.name}`, { args: toolCall.args });
        const result = await tool!.execute(toolCall.args);

        toolResults.push({
          name: toolCall.name,
          result,
        });
      } catch (error) {
        logger.error(`执行 Tool 失败: ${toolCall.name}`, { error });
        toolResults.push({
          name: toolCall.name,
          result: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }

    // 返回工具执行结果，切换回主 Agent
    return {
      toolResults,
      toolCalls: [], // 清空待执行的工具调用
      agentType: "main", // 切换回主 Agent
    };
  };
}

/**
 * 路由函数 - 决定下一个节点
 */
export function shouldContinue(state: typeof AgentState.State): string {
  // 如果有待执行的工具调用，转到子 Agent
  if (state.toolCalls && state.toolCalls.length > 0) {
    return "subAgent";
  }
  // 没有工具调用，说明已经得到最终响应，结束工作流
  return "END";
}
