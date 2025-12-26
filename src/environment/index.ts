import { readFileSync } from "fs";
import { join } from "path";
import { logger } from "../utils";

/**
 * 读取 prompt 文件内容
 * @param filename prompt 文件名（不含扩展名）
 * @returns prompt 内容
 */
export function loadPrompt(filename: string): string {
  const promptPath = join(__dirname, `${filename}.md`);
  try {
    const content = readFileSync(promptPath, "utf-8");
    return content.trim();
  } catch (error) {
    logger.error(`无法读取 prompt 文件: ${filename}.md`, { error });
  }
}

export function getMainAgentPrompt(): string {
  return loadPrompt("system");
}
