import {
  loadConfig,
  validateConfig,
  createLLMClient,
  formatError,
  initLogger,
  logger,
} from "./utils";
import { createAgentWorkflow } from "./agent";
import { ChatManager } from "./cli";
import { SkillLoader, skillRegistry } from "./skills";
import { join } from "path";

async function main() {
  try {
    // 加载并验证配置
    const config = loadConfig();
    validateConfig(config);

    // 初始化日志系统
    initLogger(config.logLevel);
    logger.info("应用启动", { logLevel: config.logLevel });

    // 初始化 Skills（从 src/skills 目录加载）
    const skillsDir = join(__dirname, "skills");
    const skills = SkillLoader.load(skillsDir, true);
    for (const skill of skills) {
      skillRegistry.register(skill);
    }
    logger.info(`共加载 ${skills.length} 个技能`);

    // 创建 LLM 客户端
    const llm = createLLMClient(config);
    logger.debug("LLM 客户端已创建", { model: config.modelName });

    // 创建 Agent 工作流
    const app = createAgentWorkflow(llm);
    logger.debug("Agent 工作流已创建");

    const chatManager = new ChatManager(app);
    await chatManager.run();
  } catch (error) {
    logger.error("启动失败", { error: formatError(error) });
    process.exit(1);
  }
}

main();
