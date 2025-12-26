import { ChatOpenAI } from "@langchain/openai";
import { LogLevel, logger } from "./logger";

export interface AppConfig {
  apiKey: string;
  modelName: string;
  baseURL?: string;
  /**
   * 是否启用流式输出
   * 启用后，AI 响应会实时流式显示，而不是等待完整响应后一次性显示
   * 默认值：true（通过环境变量 STREAMING 设置，未设置时使用此默认值）
   */
  streaming: boolean;
  /**
   * Temperature（温度）参数：控制模型输出的随机性和创造性
   *
   * 取值范围：0.0 - 2.0（通常）
   *
   * 工作原理：
   * - Temperature 影响模型在生成下一个 token 时的概率分布
   * - 低值（接近 0）：模型更倾向于选择概率最高的 token，输出更确定、保守
   * - 高值（接近 2）：模型会从更广泛的候选中选择，输出更随机、更有创造性
   *
   * 适用场景：
   * - 0.0 - 0.3：适合需要准确、一致答案的场景
   *   * 代码生成、数学计算、事实性问答
   *   * 需要可重复结果的场景
   *
   * - 0.4 - 0.7：适合大多数对话和通用场景（默认 0.7）
   *   * 日常对话、客服聊天
   *   * 内容创作、文章写作
   *   * 需要平衡准确性和创造性的场景
   *
   * - 0.8 - 1.2：适合需要创造性和多样性的场景
   *   * 创意写作、故事生成
   *   * 头脑风暴、创意想法
   *   * 需要多种不同回答的场景
   *
   * - 1.3 - 2.0：适合需要高度随机性和探索性的场景
   *   * 实验性创作
   *   * 生成多样化样本
   *   * 注意：可能产生不连贯或不符合预期的输出
   *
   * 默认值：0.7（通过环境变量 TEMPERATURE 设置，未设置时使用此默认值）
   */
  temperature: number;
  /**
   * 日志级别
   * - error: 只记录错误
   * - warn: 记录警告和错误
   * - info: 记录信息、警告和错误（默认）
   * - debug: 记录所有级别的日志
   *
   * 默认值：info（通过环境变量 LOG_LEVEL 设置，未设置时使用此默认值）
   */
  logLevel: LogLevel;
}

export function loadConfig(): AppConfig {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.error("OPENAI_API_KEY 环境变量未设置");
  }

  const logLevel = (process.env.LOG_LEVEL || "info") as LogLevel;
  const validLogLevels: LogLevel[] = ["error", "warn", "info", "debug"];
  if (!validLogLevels.includes(logLevel)) {
    logger.error(
      `无效的日志级别: ${logLevel}，有效值: ${validLogLevels.join(", ")}`
    );
  }

  // 解析流式输出配置，默认为 true
  const streamingEnv = process.env.STREAMING;
  const streaming =
    streamingEnv === undefined
      ? true
      : streamingEnv.toLowerCase() === "true" || streamingEnv === "1";

  return {
    // logger.error 会抛出错误，所以 apiKey 不会是 undefined
    apiKey: apiKey!,
    modelName: process.env.MODEL_NAME || "qwen-flash",
    baseURL: process.env.OPENAI_BASE_URL,
    temperature: parseFloat(process.env.TEMPERATURE || "0.7"),
    streaming,
    logLevel,
  };
}

/**
 * 验证配置
 */
export function validateConfig(config: AppConfig): void {
  if (!config.apiKey) {
    logger.error("API Key 不能为空");
  }
  if (!config.modelName) {
    logger.error("模型名称不能为空");
  }
}

/**
 * 创建 LLM 客户端
 */
export function createLLMClient(config: AppConfig): ChatOpenAI {
  const llmConfig: any = {
    modelName: config.modelName,
    temperature: config.temperature,
    openAIApiKey: config.apiKey,
    streaming: config.streaming,
  };

  if (config.baseURL) {
    llmConfig.configuration = {
      baseURL: config.baseURL,
    };
  }

  return new ChatOpenAI(llmConfig);
}

/**
 * 格式化错误信息
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * 判断是否为配置错误
 */
export function isConfigError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes("API Key") || error.message.includes("环境变量")
    );
  }
  return false;
}
