import { readFileSync } from "fs";
import { join } from "path";
import { logger } from "../utils";

/**
 * 环境配置类
 * 负责管理环境变量、系统提示词和其他共享上下文
 */
export class Environment {
  private static instance: Environment | null = null;

  private promptCache: Map<string, string> = new Map();
  private contextData: Map<string, any> = new Map();
  private promptDir: string;

  private constructor(promptDir?: string) {
    // 默认使用当前目录作为 prompt 文件目录
    this.promptDir = promptDir || __dirname;
  }

  /**
   * 初始化环境实例
   * @param promptDir prompt 文件目录（可选）
   */
  static init(promptDir?: string): void {
    Environment.instance = new Environment(promptDir);
  }

  /**
   * 获取环境实例
   */
  static getInstance(): Environment {
    if (!Environment.instance) {
      Environment.instance = new Environment();
    }
    return Environment.instance;
  }

  /**
   * 加载 prompt 文件内容
   * @param filename prompt 文件名（不含扩展名）
   * @returns prompt 内容
   */
  loadPrompt(filename: string): string | undefined {
    // 检查缓存
    if (this.promptCache.has(filename)) {
      return this.promptCache.get(filename);
    }

    const promptPath = join(this.promptDir, `${filename}.md`);
    try {
      const content = readFileSync(promptPath, "utf-8");
      const trimmedContent = content.trim();
      this.promptCache.set(filename, trimmedContent);
      return trimmedContent;
    } catch (error) {
      logger.error(`无法读取 prompt 文件: ${filename}.md`, { error });
    }
  }

  /**
   * 获取主 Agent 的系统提示词
   */
  getMainAgentPrompt(): string | undefined {
    return this.loadPrompt("system");
  }

  /**
   * 设置共享上下文数据
   * @param key 上下文键名
   * @param value 上下文值
   */
  setContext(key: string, value: any): void {
    this.contextData.set(key, value);
  }

  /**
   * 获取共享上下文数据
   * @param key 上下文键名
   * @returns 上下文值
   */
  getContext<T = any>(key: string): T | undefined {
    return this.contextData.get(key) as T | undefined;
  }

  /**
   * 检查是否存在指定的上下文数据
   * @param key 上下文键名
   */
  hasContext(key: string): boolean {
    return this.contextData.has(key);
  }

  /**
   * 删除指定的上下文数据
   * @param key 上下文键名
   */
  deleteContext(key: string): boolean {
    return this.contextData.delete(key);
  }

  /**
   * 清除所有上下文数据
   */
  clearContext(): void {
    this.contextData.clear();
  }

  /**
   * 清除 prompt 缓存
   */
  clearPromptCache(): void {
    this.promptCache.clear();
  }

  /**
   * 清除所有缓存和上下文
   */
  reset(): void {
    this.clearPromptCache();
    this.clearContext();
  }

  /**
   * 获取所有上下文键名
   */
  getContextKeys(): string[] {
    return Array.from(this.contextData.keys());
  }
}

/**
 * 初始化环境配置
 * @param promptDir prompt 文件目录（可选）
 */
export function initEnvironment(promptDir?: string): void {
  Environment.init(promptDir);
}
