import { join } from "path";
import { SkillLoader, skillRegistry } from "../skills";
import { logger } from "./logger";

/**
 * 初始化并注册所有技能
 * @param skillsDir 技能目录路径，默认为相对于 __dirname 的 "skills" 目录
 * @returns 加载的技能数量
 */
export function initSkills(skillsDir?: string): number {
  const dir = skillsDir || join(__dirname, "..", "skills");
  const skills = SkillLoader.load(dir, true);

  for (const skill of skills) {
    skillRegistry.register(skill);
  }

  logger.info(`共加载 ${skills.length} 个技能`);
  return skills.length;
}
