import { join } from "path";
import {
  SkillRegistry,
  skillRegistry,
  loadSkillsFromDirectory,
  getSkillDocumentation,
} from "./base";
import { logger } from "../utils";

export type { Skill, SkillMetadata } from "./base";
export {
  SkillRegistry,
  skillRegistry,
  loadSkillsFromDirectory,
  getSkillDocumentation,
} from "./base";
export { GoogleSearchSkill } from "./google-search";

/**
 * 初始化所有 Skills
 */
export function initializeSkills(): void {
  try {
    // 获取技能目录路径（相对于当前文件）
    const skillsDir = join(__dirname);

    // 自动发现并加载所有技能
    const skills = loadSkillsFromDirectory(skillsDir);

    // 注册所有加载的技能
    for (const skill of skills) {
      skillRegistry.register(skill);
      logger.info(`已注册技能: ${skill.name}`);
    }

    if (skills.length === 0) {
      logger.warn("未发现任何技能");
    } else {
      logger.info(`共加载 ${skills.length} 个技能`);
    }
  } catch (error) {
    logger.error("初始化技能失败", { error });
    throw error;
  }
}
