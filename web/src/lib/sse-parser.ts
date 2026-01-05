/**
 * SSE (Server-Sent Events) 解析工具
 */

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
export function parseSSEChunk(chunk: any): ParsedSSEChunk | null {
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
export function extractContentFromChunk(parsed: ParsedSSEChunk): string | null {
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
