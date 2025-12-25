import { createInterface, Interface } from "readline";

/**
 * 创建交互式对话界面
 */
export function createChatInterface(): Interface {
  return createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * 询问用户输入
 */
export function askQuestion(
  rl: Interface,
  prompt: string = "你: "
): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * 检查是否为退出命令
 */
export function isExitCommand(input: string): boolean {
  const normalized = input.toLowerCase();
  return normalized === "exit" || normalized === "quit" || normalized === "q";
}
