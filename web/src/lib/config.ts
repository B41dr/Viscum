export const CHAT_CONFIG = {
  baseUrl: process.env.BASE_URL!,
  apiKey: process.env.API_KEY!,
  model: process.env.MODEL!,
};

// 验证必需的环境变量
if (typeof window === "undefined") {
  // 仅在服务端验证
  const requiredEnvVars = ["BASE_URL", "API_KEY", "MODEL"] as const;

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(
        `缺少必需的环境变量: ${envVar}。请在 .env.local 文件中设置。`
      );
    }
  }
}

export const DEFAULT_TIMEOUT = 30000;

export const SYSTEM_MESSAGE = "你是 viscum";
