import { ChatOpenAI, type ChatOpenAIFields } from "@langchain/openai";
import { logger } from "./logger";

export interface AppConfig {
  apiKey: string;
  modelName: string;
  /**
   * 基础 URL
   * 默认值：undefined
   */
  baseURL: string;
  /**
   * 是否启用流式输出
   * 默认值：false
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
   * 默认值：0.7
   */
  temperature: number;
}

export function loadConfig(): AppConfig {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.error("OPENAI_API_KEY 环境变量未设置");
  }

  const modelName = process.env.MODEL_NAME;
  if (!modelName) {
    logger.error("MODEL_NAME 环境变量未设置");
  }

  const baseURL = process.env.OPENAI_BASE_URL;
  if (!baseURL) {
    logger.error("OPENAI_BASE_URL 环境变量未设置");
  }

  return {
    apiKey: apiKey!,
    modelName: modelName!,
    baseURL: baseURL!,
    temperature: parseFloat(process.env.TEMPERATURE || "0.7"),
    streaming: process.env.STREAMING === "true",
  };
}

export function createLLMClient(config?: AppConfig): ChatOpenAI {
  const appConfig = config || loadConfig();

  const llmConfig: ChatOpenAIFields = {
    modelName: appConfig.modelName,
    temperature: appConfig.temperature,
    openAIApiKey: appConfig.apiKey,
    streaming: appConfig.streaming,
    configuration: {
      baseURL: appConfig.baseURL,
    },
  };

  return new ChatOpenAI(llmConfig);
}
