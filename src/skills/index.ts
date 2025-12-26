import { join } from "path";
import { skillRegistry, loadSkillsFromDirectory } from "./skill";
import { logger } from "../utils";

export { ToolRegistry, toolRegistry } from "./tool";
export { skillRegistry, loadSkillsFromDirectory } from "./skill";

export function initializeSkills(): void {
  try {
    const skillsDir = join(__dirname);

    const skills = loadSkillsFromDirectory(skillsDir);

    for (const skill of skills) {
      skillRegistry.register(skill);
    }

    if (skills.length === 0) {
      logger.warn("未发现任何技能");
    } else {
      logger.info(`共加载 ${skills.length} 个技能`);
    }
  } catch (error) {
    logger.error("初始化技能失败", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}
