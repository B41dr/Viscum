import { createLLMClient, initLogger, logger } from "./utils";
import { AgentWorkflow } from "./agent";
import { ChatManager } from "./cli";

function main() {
  try {
    // 初始化日志
    initLogger();

    // 创建 LLM 客户端
    const llm = createLLMClient();

    // 创建 Agent 工作流
    const app = new AgentWorkflow(llm);

    // 创建 GUI 界面
    const chatManager = new ChatManager(app);
    chatManager.run();
  } catch (error) {
    logger.error("启动失败", { error });
    process.exit(1);
  }
}

main();
