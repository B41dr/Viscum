import { createInterface, Interface } from "readline";

/**
 * CLI 终端交互接口类
 * 负责管理终端输入输出和用户交互
 */
export class CLIInterface {
  private rl: Interface;

  constructor() {
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  /**
   * 询问用户输入
   */
  async askQuestion(prompt: string = "你: "): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(prompt, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  /**
   * 显示消息到终端
   */
  displayMessage(message: string): void {
    console.log(message);
  }

  /**
   * 检查是否为退出命令
   */
  isExitCommand(input: string): boolean {
    const normalized = input.toLowerCase();
    return normalized === "exit" || normalized === "quit" || normalized === "q";
  }

  /**
   * 关闭接口
   */
  close(): void {
    this.rl.close();
  }
}
