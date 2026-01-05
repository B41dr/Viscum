import { readFileSync } from "fs";
import { logger } from "../utils";
import path from "path";

/**
 * 环境配置类
 * 负责管理环境变量、系统提示词和其他共享上下文
 */
export class Environment {
  private static instance: Environment | null = null;

  private contextData: Map<string, any> = new Map();
  private promptDir: string | null = null;

  /**
   * 获取环境实例
   */
  static getInstance(): Environment {
    return (Environment.instance ??= new Environment());
  }

  /**
   * 加载 prompt 文件内容
   * @param filename prompt 文件名（不含扩展名）
   * @returns prompt 内容
   */
  loadPrompt(filename: string): string | undefined {
    const promptPath = path.join(
      path.join(path.dirname(process.cwd()), "server", "environment"),
      `${filename}.md`
    );
    try {
      const content = readFileSync(promptPath, "utf-8");
      return content.trim();
    } catch (error) {
      logger.error(`无法读取 prompt 文件: ${filename}.md`, error);
    }
  }

  /**
   * 获取 Agent 的系统提示词
   */
  getAgentPrompt(): string | undefined {
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
   * 清除所有缓存和上下文
   */
  reset(): void {
    this.clearContext();
  }

  /**
   * 获取所有上下文键名
   */
  getContextKeys(): string[] {
    return Array.from(this.contextData.keys());
  }
}
