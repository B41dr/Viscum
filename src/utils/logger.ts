import winston from "winston";
import path from "path";
import { mkdirSync } from "fs";
import { Writable } from "stream";

export type LogLevel = "error" | "warn" | "info" | "debug";

function formatMeta(meta: any): string {
  const filteredMeta = { ...meta };
  delete filteredMeta.service;
  delete filteredMeta.rawLevel;

  let metaStr = "";
  const metaKeys = Object.keys(filteredMeta);
  if (metaKeys.length > 0) {
    const metaParts: string[] = [];
    for (const [key, value] of Object.entries(filteredMeta)) {
      if (value !== null && value !== undefined) {
        if (
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        ) {
          metaParts.push(`${key}=${value}`);
        } else if (Array.isArray(value)) {
          metaParts.push(`${key}=[${value.length}项]`);
        } else if (typeof value === "object") {
          const keys = Object.keys(value);
          if (keys.length <= 3) {
            metaParts.push(`${key}=${JSON.stringify(value)}`);
          } else {
            metaParts.push(`${key}={${keys.length}个字段}`);
          }
        }
      }
    }
    if (metaParts.length > 0) {
      metaStr = ` ${metaParts.join(", ")}`;
    }
  }
  return metaStr;
}

export function createLogger(level: LogLevel = "info"): winston.Logger {
  const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: "HH:mm:ss" }),
    winston.format((info: any) => {
      if (info.service) {
        delete info.service;
      }
      return info;
    })(),
    winston.format.printf(({ timestamp, level, message, ...meta }: any) => {
      const metaStr = formatMeta(meta);
      return `[${level.toUpperCase()}] [${timestamp}] ${message}${metaStr}`;
    })
  );

  const devConsoleFormat = winston.format.combine(
    winston.format.timestamp({ format: "HH:mm:ss" }),
    winston.format((info: any) => {
      info.rawLevel = info.level;
      if (info.service) {
        delete info.service;
      }
      return info;
    })(),
    winston.format.colorize({ level: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }: any) => {
      if (message.includes("发送给 LLM 的完整 Prompt")) {
        return "";
      }
      const metaStr = formatMeta(meta);

      return `[${level}] [${timestamp}] ${message}${metaStr}`;
    })
  );

  const logDir = path.join(process.cwd(), "logs");
  try {
    mkdirSync(logDir, { recursive: true });
  } catch (error) {
    if (error instanceof Error && !error.message.includes("EEXIST")) {
      console.error("创建日志目录失败:", error);
    }
  }
  const errorLogPath = path.join(logDir, "error.log");
  const combinedLogPath = path.join(logDir, "combined.log");

  const logger = winston.createLogger({
    level,
    defaultMeta: { service: "viscum" },
    transports: [
      new winston.transports.File({
        filename: errorLogPath,
        level: "error",
        format: fileFormat,
        maxsize: 5242880,
        maxFiles: 5,
      }),
      new winston.transports.File({
        filename: combinedLogPath,
        format: fileFormat,
        maxsize: 5242880,
        maxFiles: 5,
      }),
    ],
  });

  const stderrStream = new Writable({
    write(chunk, encoding, callback) {
      process.stderr.write(chunk, encoding, callback);
    },
  });

  logger.add(
    new winston.transports.Stream({
      stream: stderrStream,
      format: devConsoleFormat,
      level: "info", // 控制台只显示 info 及以上级别，debug 不输出到控制台
    })
  );

  return logger;
}

let defaultLogger: winston.Logger | null = null;

export function initLogger(level: LogLevel = "info"): void {
  defaultLogger = createLogger(level);
}

export function getLogger(): winston.Logger {
  if (!defaultLogger) {
    defaultLogger = createLogger();
  }
  return defaultLogger;
}

function buildErrorMessage(message: string, ...meta: any[]): string {
  // 合并所有 meta 参数到一个对象中
  const metaObj: any = {};

  for (const item of meta) {
    if (item instanceof Error) {
      // 如果是 Error 对象，提取其 message 和 stack
      metaObj.error = item.message;
      if (item.stack) {
        metaObj.stack = item.stack;
      }
    } else if (item && typeof item === "object") {
      // 如果是普通对象，合并到 metaObj
      Object.assign(metaObj, item);
    } else if (item !== null && item !== undefined) {
      // 其他类型的值，作为额外信息
      metaObj.extra = item;
    }
  }

  const metaStr = formatMeta(metaObj);
  return `${message}${metaStr}`;
}

export const logger = {
  error: (message: string, ...meta: any[]): never => {
    getLogger().error(message, ...meta);
    const errorMessage = buildErrorMessage(message, ...meta);
    throw new Error(errorMessage);
  },
  warn: (message: string, ...meta: any[]) => getLogger().warn(message, ...meta),
  info: (message: string, ...meta: any[]) => getLogger().info(message, ...meta),
  debug: (message: string, ...meta: any[]) =>
    getLogger().debug(message, ...meta),
};
