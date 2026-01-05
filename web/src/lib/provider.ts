/**
 * 聊天 Provider
 * 基于 @ant-design/x-sdk 的聊天提供者实现
 */

import {
  XModelMessage,
  XModelParams,
  XModelResponse,
  AbstractChatProvider,
  XRequest,
  type TransformMessage,
  type XRequestOptions,
} from "@ant-design/x-sdk";
import { parseSSEChunk, extractContentFromChunk } from "./sse-parser";
import { SYSTEM_MESSAGE } from "./config";

export class CustomChatProvider extends AbstractChatProvider<
  XModelMessage,
  XModelParams,
  XModelResponse
> {
  private systemMessage: string;

  constructor(systemMessage?: string) {
    super({
      request: XRequest<XModelParams, XModelResponse>("/api/chat", {
        manual: true,
        // 流式响应由 SDK 自动处理 SSE 格式
      }),
    });
    // 优先使用传入的系统提示词，否则使用环境变量或默认值
    this.systemMessage =
      systemMessage || (typeof window !== "undefined" ? SYSTEM_MESSAGE : "");
  }

  transformParams(
    requestParams: Partial<XModelParams>,
    options: XRequestOptions<XModelParams, XModelResponse>
  ): XModelParams {
    if (!requestParams.messages || requestParams.messages.length === 0) {
      throw new Error("消息不能为空");
    }

    // 构建消息列表
    const messages = requestParams.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // 如果有系统提示词，且第一条消息不是 system 消息，则在开头添加
    if (this.systemMessage) {
      const hasSystemMessage = messages.some((m) => m.role === "system");
      if (!hasSystemMessage) {
        messages.unshift({
          role: "system",
          content: this.systemMessage,
        });
      }
    }

    // 合并默认参数和请求参数
    return {
      ...(options?.params || {}),
      ...requestParams,
      messages,
    };
  }

  transformLocalMessage(
    requestParams: Partial<XModelParams>
  ): XModelMessage | XModelMessage[] {
    if (!requestParams || !requestParams.messages || requestParams.messages.length === 0) {
      throw new Error("消息不能为空");
    }

    // 返回用户消息（最后一条）
    const lastMessage =
      requestParams.messages[requestParams.messages.length - 1];
    return {
      role: lastMessage.role,
      content: lastMessage.content,
    };
  }

  transformMessage(
    info: TransformMessage<XModelMessage, XModelResponse>
  ): XModelMessage {
    const { chunk, chunks, originMessage } = info;

    // 处理流式响应：累积所有 chunks 的内容
    if (Array.isArray(chunks) && chunks.length > 0) {
      let accumulatedContent = "";
      for (const c of chunks) {
        if (!c) continue;

        const parsed = parseSSEChunk(c);
        if (!parsed) continue;

        const content = extractContentFromChunk(parsed);
        if (content) {
          // 如果是完整消息，替换；如果是增量，追加
          if (parsed.choices?.[0]?.message?.content) {
            accumulatedContent = content;
          } else {
            accumulatedContent += content;
          }
        }
      }
      return {
        role: "assistant",
        content: accumulatedContent || "",
      };
    }

    // 如果有单个 chunk
    if (chunk) {
      const parsed = parseSSEChunk(chunk);
      if (!parsed) {
        // 如果是 [DONE] 信号，返回原始消息或空消息
        return originMessage || { role: "assistant", content: "" };
      }

      const content = extractContentFromChunk(parsed);
      if (content) {
        // 如果是完整消息，直接返回
        if (parsed.choices?.[0]?.message?.content) {
          return {
            role: parsed.choices[0].message.role || "assistant",
            content,
          };
        }

        // 如果是增量内容，与原始消息合并
        const baseContent = originMessage?.content || "";
        const mergedContent =
          typeof baseContent === "string" ? baseContent + content : content;
        return {
          role: originMessage?.role || "assistant",
          content: mergedContent,
        };
      }
    }

    // 如果有原始消息，返回原始消息
    if (originMessage) {
      return originMessage;
    }

    // 默认返回空消息
    return {
      role: "assistant",
      content: "",
    };
  }
}
