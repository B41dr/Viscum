import winston from "winston";
import path from "path";
import { mkdirSync } from "fs";
import { Writable } from "stream";

type LogLevel = "error" | "warn" | "info" | "debug";

class Logger {
  private static readonly LOG_DIR = path.join(process.cwd(), "logs");
  private static readonly ERROR_LOG_FILE = "error.log";
  private static readonly COMBINED_LOG_FILE = "combined.log";
  private static readonly MAX_FILE_SIZE = 5242880; // 5MB
  private static readonly MAX_FILES = 5;
  private static readonly SERVICE_NAME = "viscum";
  private static readonly TIMESTAMP_FORMAT = "HH:mm:ss";
  private static readonly CONSOLE_MIN_LEVEL: LogLevel = "info";

  private static instance: Logger | null = null;

  private winstonLogger: winston.Logger;

  private constructor(level: LogLevel = "info") {
    this.winstonLogger = winston.createLogger({
      level,
      defaultMeta: { service: Logger.SERVICE_NAME },
      transports: Logger.createFileTransports(),
    });

    this.winstonLogger.add(Logger.createConsoleTransport());
  }

  static create(level: LogLevel = "info"): winston.Logger {
    return new Logger(level).winstonLogger;
  }

  static init(level: LogLevel = "info"): void {
    Logger.instance = new Logger(level);
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private static formatMeta(meta: any): string {
    const filteredMeta = { ...meta };
    delete filteredMeta.service;
    delete filteredMeta.rawLevel;

    const metaParts: string[] = [];

    for (const [key, value] of Object.entries(filteredMeta)) {
      if (value === null || value === undefined) continue;

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

    return metaParts.length > 0 ? ` ${metaParts.join(", ")}` : "";
  }

  private static removeServiceField(info: any): any {
    if (info.service) {
      delete info.service;
    }
    return info;
  }

  private static createFileFormat() {
    return winston.format.combine(
      winston.format.timestamp({ format: Logger.TIMESTAMP_FORMAT }),
      winston.format(Logger.removeServiceField)(),
      winston.format.printf(({ timestamp, level, message, ...meta }: any) => {
        const metaStr = Logger.formatMeta(meta);
        return `[${level.toUpperCase()}] [${timestamp}] ${message}${metaStr}`;
      })
    );
  }

  private static createConsoleFormat() {
    return winston.format.combine(
      winston.format.timestamp({ format: Logger.TIMESTAMP_FORMAT }),
      winston.format((info: any) => {
        info.rawLevel = info.level;
        return Logger.removeServiceField(info);
      })(),
      winston.format.colorize({ level: true }),
      winston.format.printf(({ timestamp, level, message, ...meta }: any) => {
        if (message.includes("发送给 LLM 的完整 Prompt")) {
          return "";
        }
        const metaStr = Logger.formatMeta(meta);
        return `[${level}] [${timestamp}] ${message}${metaStr}`;
      })
    );
  }

  private static ensureLogDir(): void {
    try {
      mkdirSync(Logger.LOG_DIR, { recursive: true });
    } catch (error) {
      if (error instanceof Error && !error.message.includes("EEXIST")) {
        console.error("创建日志目录失败:", error);
      }
    }
  }

  private static createFileTransports() {
    Logger.ensureLogDir();

    const errorLogPath = path.join(Logger.LOG_DIR, Logger.ERROR_LOG_FILE);
    const combinedLogPath = path.join(Logger.LOG_DIR, Logger.COMBINED_LOG_FILE);
    const fileFormat = Logger.createFileFormat();

    return [
      new winston.transports.File({
        filename: errorLogPath,
        level: "error",
        format: fileFormat,
        maxsize: Logger.MAX_FILE_SIZE,
        maxFiles: Logger.MAX_FILES,
      }),
      new winston.transports.File({
        filename: combinedLogPath,
        format: fileFormat,
        maxsize: Logger.MAX_FILE_SIZE,
        maxFiles: Logger.MAX_FILES,
      }),
    ];
  }

  private static createConsoleTransport() {
    const stderrStream = new Writable({
      write(chunk, encoding, callback) {
        process.stderr.write(chunk, encoding, callback);
      },
    });

    return new winston.transports.Stream({
      stream: stderrStream,
      format: Logger.createConsoleFormat(),
      level: Logger.CONSOLE_MIN_LEVEL,
    });
  }

  private static buildErrorMessage(message: string, ...meta: any[]): string {
    const metaObj: any = {};

    for (const item of meta) {
      if (item instanceof Error) {
        metaObj.error = item.message;
        if (item.stack) {
          metaObj.stack = item.stack;
        }
      } else if (item && typeof item === "object") {
        Object.assign(metaObj, item);
      } else if (item !== null && item !== undefined) {
        metaObj.extra = item;
      }
    }

    const metaStr = Logger.formatMeta(metaObj);
    return `${message}${metaStr}`;
  }

  error(message: string, ...meta: any[]): never {
    this.winstonLogger.error(message, ...meta);
    const errorMessage = Logger.buildErrorMessage(message, ...meta);
    throw new Error(errorMessage);
  }

  warn(message: string, ...meta: any[]): void {
    this.winstonLogger.warn(message, ...meta);
  }

  info(message: string, ...meta: any[]): void {
    this.winstonLogger.info(message, ...meta);
  }

  debug(message: string, ...meta: any[]): void {
    this.winstonLogger.debug(message, ...meta);
  }

  getWinstonLogger(): winston.Logger {
    return this.winstonLogger;
  }
}

export function initLogger(level: LogLevel = "info"): void {
  Logger.init(level);
}

export const logger = {
  error: (message: string, ...meta: any[]): never => {
    return Logger.getInstance().error(message, ...meta);
  },
  warn: (message: string, ...meta: any[]): void => {
    Logger.getInstance().warn(message, ...meta);
  },
  info: (message: string, ...meta: any[]): void => {
    Logger.getInstance().info(message, ...meta);
  },
  debug: (message: string, ...meta: any[]): void => {
    Logger.getInstance().debug(message, ...meta);
  },
};
