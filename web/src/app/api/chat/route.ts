import { NextRequest } from "next/server";
import { fetchStream, buildChatRequest } from "@/lib/chat.service";
import { CHAT_CONFIG } from "@/lib/config";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages } = body;

    console.log("收到请求:", { messages });

    // 支持两种格式：单个 message 或 messages 数组
    let chatMessages: any[] = [];

    if (messages && Array.isArray(messages)) {
      chatMessages = messages;
    }

    // 构建请求参数
    const requestParams = buildChatRequest(chatMessages);

    console.log("发送请求到:", CHAT_CONFIG.baseUrl);
    console.log("请求参数:", JSON.stringify(requestParams, null, 2));

    // 创建流式响应
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          console.log("开始流式请求...");
          await fetchStream({
            url: CHAT_CONFIG.baseUrl,
            params: requestParams,
            headers: {
              Authorization: `Bearer ${CHAT_CONFIG.apiKey}`,
            },
            onChunk: (content) => {
              const data = JSON.stringify({
                choices: [
                  {
                    delta: { content },
                  },
                ],
              });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            },
            onComplete: (fullContent) => {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            },
            onError: (error) => {
              const errorData = JSON.stringify({
                error: {
                  message: error.message,
                },
              });
              controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
              controller.close();
            },
          });
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
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "处理请求时出错",
        message: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
