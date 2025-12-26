import { AIMessage, ToolMessage, BaseMessage } from "@langchain/core/messages";
import { logger } from "../../utils";
import { ToolResult } from "./types";

/**
 * 工具调用处理器
 * 负责处理工具调用相关的逻辑，包括消息验证和 ToolMessage 创建
 */
export class ToolCallProcessor {
  /**
   * 创建 ToolMessage 列表
   */
  createToolMessages(
    toolResults: ToolResult[],
    lastAIMessageWithTools?: AIMessage
  ): ToolMessage[] {
    const toolMessages: ToolMessage[] = [];

    if (!lastAIMessageWithTools || !lastAIMessageWithTools.tool_calls) {
      return toolMessages;
    }

    toolResults.forEach((toolResult, index) => {
      const toolCall = lastAIMessageWithTools.tool_calls?.[index];
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

      toolMessages.push(toolMessage);
    });

    return toolMessages;
  }

  /**
   * 查找最后一个包含工具调用的 AI 消息
   */
  findLastAIMessageWithTools(messages: BaseMessage[]): AIMessage | undefined {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (
        msg instanceof AIMessage &&
        msg.tool_calls &&
        msg.tool_calls.length > 0
      ) {
        return msg;
      }
    }
    return undefined;
  }

  /**
   * 处理消息列表，确保所有 tool_calls 都有对应的 ToolMessage
   */
  processMessages(
    messages: BaseMessage[],
    newToolMessages: ToolMessage[],
    hasToolResults: boolean,
    hasPendingToolCalls: boolean
  ): BaseMessage[] {
    const processedMessages: BaseMessage[] = [];
    const toolMessageMap = new Map<string, ToolMessage>();

    // 第一遍：收集所有 ToolMessage（包括新创建的）
    for (const msg of messages) {
      if (msg instanceof ToolMessage && msg.tool_call_id) {
        toolMessageMap.set(msg.tool_call_id, msg);
      }
    }
    newToolMessages.forEach((toolMsg) => {
      if (toolMsg.tool_call_id) {
        toolMessageMap.set(toolMsg.tool_call_id, toolMsg);
      }
    });

    // 第二遍：处理所有消息，确保 tool_calls 都有对应的 ToolMessage
    for (const msg of messages) {
      if (
        msg instanceof AIMessage &&
        msg.tool_calls &&
        msg.tool_calls.length > 0
      ) {
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
              if (!processedMessages.includes(toolMsg)) {
                processedMessages.push(toolMsg);
              }
            }
          });
        } else {
          // 有未完成的 tool_calls
          if (hasToolResults || hasPendingToolCalls) {
            logger.warn("跳过包含未完成 tool_calls 的 AIMessage", {
              missingToolCallIds: msg.tool_calls
                .map((tc: any) => tc.id)
                .filter((id: string) => id && !toolMessageMap.has(id)),
            });
          } else {
            const missingIds = msg.tool_calls
              .map((tc: any) => tc.id)
              .filter((id: string) => id && !toolMessageMap.has(id));
            logger.error("发现未完成的 tool_calls，且没有待处理的工具结果", {
              missingToolCallIds: missingIds,
            });
          }
        }
        continue;
      }

      // 如果是 ToolMessage，检查是否已经被添加
      if (msg instanceof ToolMessage && msg.tool_call_id) {
        if (!processedMessages.includes(msg)) {
          processedMessages.push(msg);
        }
        continue;
      }

      // 其他类型的消息直接添加
      processedMessages.push(msg);
    }

    return processedMessages;
  }

  /**
   * 验证所有 tool_calls 都有对应的 ToolMessage
   */
  validateToolCalls(messages: BaseMessage[]): {
    isValid: boolean;
    missingToolCallIds: string[];
  } {
    const toolCallIds = new Set<string>();
    const toolMessageIds = new Set<string>();

    for (const msg of messages) {
      if (msg instanceof AIMessage && msg.tool_calls) {
        msg.tool_calls.forEach((tc: any) => {
          if (tc.id) {
            toolCallIds.add(tc.id);
          }
        });
      }
      if (msg instanceof ToolMessage && msg.tool_call_id) {
        toolMessageIds.add(msg.tool_call_id);
      }
    }

    const missingToolCallIds: string[] = [];
    for (const toolCallId of toolCallIds) {
      if (!toolMessageIds.has(toolCallId)) {
        missingToolCallIds.push(toolCallId);
      }
    }

    return {
      isValid: missingToolCallIds.length === 0,
      missingToolCallIds,
    };
  }
}
