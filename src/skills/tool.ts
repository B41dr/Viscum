import { logger } from "../utils";

/**
 * Tool（工具）- 原子能力
 * 最底层的可调用函数，单一、明确的功能，直接通过 Function Calling 调用
 */
export interface Tool {
  /** Tool 名称 */
  name: string;
  /** Tool 描述 */
  description: string;
  /** Tool 执行函数 */
  execute: (params: Record<string, any>) => Promise<any>;
  /** 参数定义 */
  parameters?: {
    type: "object";
    properties: Record<
      string,
      {
        type: string;
        description: string;
        required?: boolean;
      }
    >;
    required?: string[];
  };
}

/**
 * Tool 注册器
 */
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  /**
   * 注册一个 Tool
   */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      logger.warn(`Tool "${tool.name}" 已存在，将被覆盖`);
    }
    this.tools.set(tool.name, tool);
    logger.debug(`已注册 Tool: ${tool.name}`);
  }

  /**
   * 获取一个 Tool
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * 获取所有 Tool
   */
  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * 获取所有 Tool 的工具定义（用于 Function Calling）
   */
  getToolDefinitions(): Array<{
    type: string;
    function: {
      name: string;
      description: string;
      parameters: any;
    };
  }> {
    return this.getAll().map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters || {
          type: "object",
          properties: {},
        },
      },
    }));
  }
}

/**
 * 全局 Tool 注册器实例
 */
export const toolRegistry = new ToolRegistry();
