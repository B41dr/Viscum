import { AIMessage, BaseMessage, ToolMessage } from "@langchain/core/messages";
import { logger } from "./logger";

/**
 * LLM 适配器
 * 将 web 的 API 调用方式适配为类似 LangChain ChatOpenAI 的接口
 */
export class LLMAdapter {
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private temperature: number;
  private boundTools?: Array<{
    type: string;
    function: {
      name: string;
      description: string;
      parameters: any;
    };
  }>;

  constructor(config: {
    baseUrl: string;
    apiKey: string;
    model: string;
    temperature?: number;
  }) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.temperature = config.temperature || 0.7;
  }

  /**
   * 绑定工具定义
   * 返回一个新的适配器实例，包含绑定的工具
   */
  bindTools(
    toolDefinitions: Array<{
      type: string;
      function: {
        name: string;
        description: string;
        parameters: any;
      };
    }>
  ): LLMAdapter {
    const adapter = new LLMAdapter({
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      model: this.model,
      temperature: this.temperature,
    });
    adapter.boundTools = toolDefinitions;
    return adapter;
  }

  /**
   * 调用 LLM
   * 将 LangChain 的 BaseMessage[] 转换为 API 请求格式，然后调用
   */
  async invoke(messages: BaseMessage[]): Promise<AIMessage> {
    // 转换消息格式
    const chatMessages = this.convertMessages(messages);

    // 构建请求参数
    const requestParams: any = {
      model: this.model,
      messages: chatMessages,
      stream: false,
      temperature: this.temperature,
    };

    // 如果有绑定的工具，添加到请求中
    if (this.boundTools && this.boundTools.length > 0) {
      requestParams.tools = this.boundTools;
      requestParams.tool_choice = "auto";
    }

    try {
      // 调用 API（非流式）
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestParams),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `HTTP error! Status: ${response.status}, Body: ${errorText}`
        );
      }

      const jsonData = await response.json();

      // 解析响应，提取内容和工具调用
      const aiMessage = this.parseAPIResponse(jsonData);

      return aiMessage;
    } catch (error) {
      logger.error("LLM 调用失败", { error });
      throw error;
    }
  }

  /**
   * 转换 LangChain 消息为 API 消息格式
   */
  private convertMessages(messages: BaseMessage[]): Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> {
    return messages.map((msg) => {
      let role: "system" | "user" | "assistant";
      let content = "";

      const msgType = msg._getType();
      if (msgType === "system") {
        role = "system";
      } else if (msgType === "human") {
        role = "user";
      } else if (msgType === "ai") {
        role = "assistant";
      } else if (msg instanceof ToolMessage) {
        // ToolMessage 转换为 user 消息，包含工具结果
        role = "user";
      } else {
        // 默认作为 user 消息
        role = "user";
      }

      // 提取内容
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

      return { role, content };
    });
  }

  /**
   * 解析 API 响应
   * 根据 OpenAI 兼容的 API 响应格式来解析工具调用
   */
  private parseAPIResponse(jsonData: any): AIMessage {
    // 提取工具调用（如果 API 支持）
    let toolCalls: Array<{
      id: string;
      name: string;
      args: any;
    }> = [];

    // 检查响应中是否有工具调用
    // OpenAI 兼容格式：choices[0].message.tool_calls
    const message = jsonData.choices?.[0]?.message;
    if (message?.tool_calls && Array.isArray(message.tool_calls)) {
      toolCalls = message.tool_calls.map((tc: any) => {
        let args: any;
        try {
          // 尝试解析 arguments（可能是字符串或对象）
          if (typeof tc.function?.arguments === "string") {
            args = JSON.parse(tc.function.arguments);
          } else {
            args = tc.function?.arguments || tc.args || {};
          }
        } catch (e) {
          logger.warn("解析工具调用参数失败", {
            toolCall: tc,
            error: e,
          });
          args = {};
        }

        return {
          id:
            tc.id ||
            `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: tc.function?.name || tc.name,
          args,
        };
      });
    }

    // 提取内容
    const messageContent = message?.content || jsonData.content || "";

    // 创建 AIMessage
    const aiMessage = new AIMessage({
      content: messageContent,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    });

    return aiMessage;
  }
}
