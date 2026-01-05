import * as readline from "readline";

/**
 * CLI 界面类
 * 负责处理命令行交互
 */
export class CLIInterface {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  /**
   * 显示消息
   */
  displayMessage(message: string): void {
    console.log(message);
  }

  /**
   * 询问问题并等待用户输入
   */
  askQuestion(): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question("你: ", (answer) => {
        resolve(answer.trim());
      });
    });
  }

  /**
   * 检查是否是退出命令
   */
  isExitCommand(input: string): boolean {
    const normalized = input.toLowerCase().trim();
    return normalized === "exit" || normalized === "quit" || normalized === "q";
  }

  /**
   * 关闭 CLI 界面
   */
  close(): void {
    this.rl.close();
  }
}
