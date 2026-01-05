import { createLLMClient, initLogger, logger } from "./utils";
import { AgentWorkflow } from "./planning";
import { AgentState } from "./memory";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

const PORT = parseInt(process.env.PORT || "3001");

let agentWorkflow: AgentWorkflow | null = null;

function initializeAgent() {
  if (!agentWorkflow) {
    initLogger();
    const llm = createLLMClient();
    agentWorkflow = new AgentWorkflow(llm);
    logger.info("Agent 工作流已初始化");
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
 * 创建 CORS 响应头
 */
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

/**
 * JSON 响应辅助函数
 */
function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

/**
 * 处理健康检查请求
 */
function handleHealth() {
  return jsonResponse({ status: "ok" });
}

/**
 * 处理聊天请求
 */
async function handleChat(req: Request) {
  try {
    const body = (await req.json()) as { message?: string };
    const { message } = body;

    if (!message || typeof message !== "string") {
      return jsonResponse({ error: "消息内容不能为空" }, 400);
    }

    const workflow = initializeAgent();

    // 添加新的用户消息（暂时不保留历史，每次都是新对话）
    const newState: typeof AgentState.State = {
      messages: [new HumanMessage(message)],
      toolCalls: [],
      toolResults: [],
    };

    // 调用 Agent 工作流
    const finalState = await workflow.invoke(newState);

    // 提取 AI 响应
    const response = extractAIResponse(finalState);

    if (!response) {
      return jsonResponse({ error: "未能获取 AI 响应" }, 500);
    }

    return jsonResponse({
      response,
      messages: finalState.messages.map((msg) => ({
        role: msg instanceof HumanMessage ? "user" : "assistant",
        content:
          typeof msg.content === "string" ? msg.content : String(msg.content),
      })),
    });
  } catch (error: unknown) {
    logger.error("处理聊天请求时出错", { error });
    return jsonResponse(
      {
        error: "处理请求时出错",
        message: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
}

// 启动服务器
const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);

    // 处理 OPTIONS 预检请求（CORS）
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    // 路由处理
    if (url.pathname === "/health" && req.method === "GET") {
      return handleHealth();
    }

    if (url.pathname === "/api/chat" && req.method === "POST") {
      return handleChat(req);
    }

    // 404
    return jsonResponse({ error: "Not Found" }, 404);
  },
});

console.log(`服务运行: http://localhost:${server.port}`);
console.log(`健康检查: http://localhost:${server.port}/health`);
console.log(`聊天端点: http://localhost:${server.port}/api/chat`);
