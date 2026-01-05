import {
  XModelMessage,
  XModelParams,
  XModelResponse,
  AbstractChatProvider,
  XRequest,
  type TransformMessage,
  type XRequestOptions,
} from "@ant-design/x-sdk";

export interface SSEChunk {
  data?: string;
  [key: string]: any;
}

export interface ParsedSSEChunk {
  choices?: Array<{
    delta?: { content?: string };
    message?: { role?: string; content?: string };
  }>;
  error?: { message?: string };
}

/**
 * 解析 SSE 数据块
 */
function parseSSEChunk(chunk: any): ParsedSSEChunk | null {
  // 如果 chunk 是 SSEOutput 格式（包含 data 字段），需要解析 data 字段中的 JSON
  if (
    typeof chunk === "object" &&
    "data" in chunk &&
    typeof chunk.data === "string"
  ) {
    // 跳过 [DONE] 信号
    if (chunk.data === "[DONE]") {
      return null;
    }

    try {
      return JSON.parse(chunk.data);
    } catch (e) {
      return null;
    }
  }

  // 如果已经是对象，直接返回
  if (chunk && typeof chunk === "object") {
    return chunk;
  }

  return null;
}

/**
 * 从解析后的 SSE chunk 中提取内容
 */
function extractContentFromChunk(parsed: ParsedSSEChunk): string | null {
  if (!parsed || !parsed.choices || !Array.isArray(parsed.choices)) {
    return null;
  }

  const choice = parsed.choices[0];
  if (!choice) {
    return null;
  }

  // 优先使用 message.content（完整消息）
  if (choice.message?.content) {
    return choice.message.content;
  }

  // 否则使用 delta.content（增量内容）
  if (choice.delta?.content) {
    return choice.delta.content;
  }

  return null;
}

export class CustomChatProvider extends AbstractChatProvider<
  XModelMessage,
  XModelParams,
  XModelResponse
> {
  constructor() {
    super({
      request: XRequest<XModelParams, XModelResponse>("/api/chat", {
        manual: true,
      }),
    });
  }

  transformParams(
    requestParams: Partial<XModelParams>,
    options: XRequestOptions<XModelParams, XModelResponse>
  ): XModelParams {
    if (!requestParams.messages || requestParams.messages.length === 0) {
      throw new Error("消息不能为空");
    }

    const messages = requestParams.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    return {
      ...(options?.params || {}),
      ...requestParams,
      messages,
    };
  }

  transformLocalMessage(
    requestParams: Partial<XModelParams>
  ): XModelMessage | XModelMessage[] {
    if (
      !requestParams ||
      !requestParams.messages ||
      requestParams.messages.length === 0
    ) {
      throw new Error("消息不能为空");
    }

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

    if (Array.isArray(chunks) && chunks.length > 0) {
      let accumulatedContent = "";
      for (const c of chunks) {
        if (!c) continue;

        const parsed = parseSSEChunk(c);
        if (!parsed) continue;

        const content = extractContentFromChunk(parsed);
        if (content) {
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
