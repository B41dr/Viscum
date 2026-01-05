import { toolRegistry } from "../tools";
import { logger } from "../utils";
import { ToolCall, ToolResult } from "../memory";

/**
 * 工具执行器
 * 负责执行工具调用并收集结果
 */
export class ToolExecutor {
  /**
   * 执行工具调用列表
   */
  async executeTools(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    const toolResults: ToolResult[] = [];

    logger.info("执行工具调用", { toolCount: toolCalls.length });

    // 执行所有工具调用
    for (const toolCall of toolCalls) {
      try {
        const tool = toolRegistry.get(toolCall.name);
        if (!tool) {
          logger.error(`未找到 Tool: ${toolCall.name}`);
          continue;
        }

        logger.info(`执行 Tool: ${toolCall.name}`, { args: toolCall.args });
        const result = await tool.execute(toolCall.args);

        toolResults.push({
          name: toolCall.name,
          result,
        });
      } catch (error) {
        logger.error(`执行 Tool 失败: ${toolCall.name}`, { error });
        toolResults.push({
          name: toolCall.name,
          result: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }

    return toolResults;
  }
}
