import {
  AIMessage,
  ToolMessage,
  SystemMessage,
  BaseMessage,
} from "@langchain/core/messages";
import { AgentState } from "../memory";
import { toolRegistry } from "../tools";
import { logger } from "../utils";
import { Environment } from "../environment";
import { MessageFormatter, ToolCallProcessor } from "../action";
import { ToolExecutor } from "../exec";
import { LLMAdapter } from "../utils/llm-adapter";

/**
 * Agent 节点
 * 负责协调和决策，决定是否需要调用工具，并执行工具调用
 */
export class Node {
  private llm: LLMAdapter;
  private environment: Environment;
  private messageFormatter: MessageFormatter;
  private toolCallProcessor: ToolCallProcessor;
  private toolExecutor: ToolExecutor;
  private systemPrompt: string | undefined;

  constructor(llm: LLMAdapter) {
    this.llm = llm;
    this.environment = Environment.getInstance();
    this.messageFormatter = new MessageFormatter();
    this.toolCallProcessor = new ToolCallProcessor();
    this.toolExecutor = new ToolExecutor();
    this.systemPrompt = this.environment.getAgentPrompt();
  }

  /**
   * 执行 Agent 节点逻辑
   */
  async execute(
    state: typeof AgentState.State
  ): Promise<Partial<typeof AgentState.State>> {
    const allMessages = this.getMessageList(state.messages, state);

    const llmWithTools = this.getLLMWithTools(allMessages, state);

    const response = await llmWithTools.invoke(allMessages);

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
      logger.info("Agent 决定调用工具", {
        toolCount: toolCalls.length,
        tools: toolCalls.map((tc: any) => tc.name),
      });

      // 执行工具调用
      const toolCallsToExecute = toolCalls.map((tc: any) => ({
        name: tc.name,
        args: typeof tc.args === "string" ? JSON.parse(tc.args) : tc.args,
      }));

      const toolResults =
        await this.toolExecutor.executeTools(toolCallsToExecute);

      // 返回工具执行结果，继续循环处理
      return {
        messages: [response],
        toolCalls: [],
        toolResults,
      };
    }

    return this.handleFinalResponse(response, state);
  }

  /**
   * 构建消息列表
   */
  private getMessageList(
    messages: BaseMessage[],
    state: typeof AgentState.State
  ): BaseMessage[] {
    const allMessages: BaseMessage[] = [];

    const hasSystemMessage = messages.some(
      (msg) => msg instanceof SystemMessage
    );

    if (!hasSystemMessage && this.systemPrompt) {
      allMessages.push(new SystemMessage(this.systemPrompt));
    }

    const lastAIMessageWithTools =
      this.toolCallProcessor.findLastAIMessageWithTools(messages);
    const newToolMessages = this.toolCallProcessor.createToolMessages(
      state.toolResults || [],
      lastAIMessageWithTools
    );

    const hasToolResults = state.toolResults && state.toolResults.length > 0;
    const hasPendingToolCalls = state.toolCalls && state.toolCalls.length > 0;

    const finalMessages = this.toolCallProcessor.processMessages(
      messages,
      newToolMessages,
      hasToolResults,
      hasPendingToolCalls
    );

    const resultMessages =
      !hasSystemMessage && allMessages.length > 0
        ? [...allMessages, ...finalMessages]
        : finalMessages;

    this.messageFormatter.logPrompt(resultMessages);

    return resultMessages;
  }

  /**
   * 获取绑定工具的 LLM
   */
  private getLLMWithTools(
    messages: BaseMessage[],
    state: typeof AgentState.State
  ) {
    // 验证工具调用
    const validation = this.toolCallProcessor.validateToolCalls(messages);

    if (!validation.isValid) {
      const hasToolResults = state.toolResults && state.toolResults.length > 0;
      const hasPendingToolCalls = state.toolCalls && state.toolCalls.length > 0;

      if (!hasToolResults) {
        logger.error("发现未完成的工具调用，无法发送给 LLM", {
          missingToolCallIds: validation.missingToolCallIds,
          hasPendingToolCalls,
        });
      } else {
        logger.error("发现未完成的工具调用，即使有 toolResults", {
          missingToolCallIds: validation.missingToolCallIds,
          toolResultsCount: state.toolResults?.length || 0,
          toolCallsCount: state.toolCalls?.length || 0,
        });
      }
    }

    // 获取工具定义并绑定到 LLM
    const toolDefinitions = toolRegistry.getToolDefinitions();

    logger.info("可用工具列表", {
      toolCount: toolDefinitions.length,
      tools: toolDefinitions.map((t) => ({
        name: t.function.name,
        description: t.function.description,
      })),
    });

    return this.llm.bindTools(toolDefinitions);
  }

  /**
   * 处理最终响应（无工具调用）
   */
  private handleFinalResponse(
    response: AIMessage,
    state: typeof AgentState.State
  ): Partial<typeof AgentState.State> {
    const finalResponseContent =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);
    logger.debug("Agent 返回最终响应", {
      responseLength: finalResponseContent.length,
      responsePreview:
        finalResponseContent.length > 100
          ? finalResponseContent.substring(0, 100) + "..."
          : finalResponseContent,
    });

    const newToolMessages = this.createToolMessagesFromResults(state);
    const messagesToReturn =
      newToolMessages.length > 0 ? [...newToolMessages, response] : [response];

    return {
      messages: messagesToReturn,
      toolResults: [],
    };
  }

  /**
   * 从工具结果创建 ToolMessage
   */
  private createToolMessagesFromResults(
    state: typeof AgentState.State
  ): ToolMessage[] {
    if (!state.toolResults || state.toolResults.length === 0) {
      return [];
    }

    const lastAIMessageWithTools =
      this.toolCallProcessor.findLastAIMessageWithTools(state.messages);

    return this.toolCallProcessor.createToolMessages(
      state.toolResults,
      lastAIMessageWithTools
    );
  }

  /**
   * 获取节点函数
   */
  getNodeFunction() {
    return (state: typeof AgentState.State) => this.execute(state);
  }
}
