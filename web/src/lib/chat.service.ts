/**
 * 聊天服务层
 * 统一处理聊天相关的 API 调用和流式响应
 */

import { CHAT_CONFIG, DEFAULT_TIMEOUT } from "./config";

/**
 * 聊天消息类型
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * 聊天请求参数
 */
export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  stream?: boolean;
}

/**
 * 流式请求选项
 */
export interface StreamOptions {
  url: string;
  params: any;
  headers?: Record<string, string>;
  timeout?: number;
  onChunk?: (content: string) => void;
  onComplete?: (fullContent: string) => void;
  onError?: (error: Error) => void;
}

/**
 * 构建聊天请求参数
 */
export function buildChatRequest(
  messages: ChatMessage[],
  model?: string,
  stream: boolean = true
): ChatRequest {
  return {
    model: model || CHAT_CONFIG.model,
    stream,
    messages,
  };
}

/**
 * 流式获取数据（适用于浏览器环境）
 */
export async function fetchStream(options: StreamOptions): Promise<string> {
  const {
    url,
    params,
    headers = {},
    timeout = DEFAULT_TIMEOUT,
    onChunk,
    onComplete,
    onError,
  } = options;

  // 创建超时控制器
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(params || {}),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `HTTP error! Status: ${response.status}, Body: ${errorText}`
      );
    }

    // 检查 Content-Type 判断是否为流式响应
    const contentType = response.headers.get("content-type") || "";
    const isStreaming =
      contentType.includes("text/event-stream") ||
      contentType.includes("stream");

    if (!response.body) {
      throw new Error("响应体为空");
    }

    // 如果不是流式响应，直接解析 JSON
    if (!isStreaming) {
      const jsonData = await response.json();
      const content = jsonData.choices?.[0]?.message?.content || "";
      if (content && onChunk) {
        onChunk(content);
      }
      if (onComplete) {
        onComplete(content);
      }
      return content;
    }

    // 处理流式响应
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let allValue = "";

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // SSE 格式：每个事件以 \n\n 分隔
        while (buffer.includes("\n\n")) {
          const eventEndIndex = buffer.indexOf("\n\n");
          const event = buffer.substring(0, eventEndIndex);
          buffer = buffer.substring(eventEndIndex + 2);

          if (!event.trim()) continue;

          // 提取 data: 后面的内容（格式：data:{...}）
          if (!event.startsWith("data:")) continue;

          const data = event.substring(5).trim();

          if (data === "[DONE]") {
            if (onComplete) {
              onComplete(allValue);
            }
            return allValue;
          }

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || "";

            if (content) {
              allValue += content;
              if (onChunk) {
                onChunk(content);
              }
            }
          } catch (e) {
            console.warn("解析 JSON 失败:", e, "数据:", data.substring(0, 200));
          }
        }
      }

      // 处理剩余的 buffer
      if (buffer.trim() && buffer.startsWith("data:")) {
        const data = buffer.substring(5).trim();
        if (data && data !== "[DONE]") {
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || "";
            if (content) {
              allValue += content;
              if (onChunk) {
                onChunk(content);
              }
            }
          } catch (e) {
            // 剩余 buffer 可能是不完整的 JSON，忽略
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (onComplete) {
      onComplete(allValue);
    }
    return allValue;
  } catch (error: any) {
    clearTimeout(timeoutId);
    const err =
      error.name === "AbortError"
        ? new Error(`请求超时 (${timeout}ms)，请检查网络连接或服务器状态`)
        : error.code === "ConnectionRefused" || error.errno === 0
          ? new Error(
              `无法连接到服务器: ${url}\n请检查：\n1. 服务器是否运行\n2. 网络连接是否正常\n3. 是否需要 VPN 或内网访问`
            )
          : error;

    if (onError) {
      onError(err);
    }
    throw err;
  }
}
