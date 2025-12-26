import { readdirSync, readFileSync, existsSync } from "fs";
import { join, extname, resolve } from "path";
import { logger } from "../utils";
import { Tool, toolRegistry } from "./tool";

export interface SkillMetadata {
  name: string;
  description: string;
  [key: string]: string | undefined;
}

export interface ScriptFile {
  name: string;
  path: string;
  type: "sh" | "py" | "js" | "ts";
}

export interface ContextFile {
  name: string;
  path: string;
  content: string;
}

/**
 * Skill 解析器 - 负责解析 skill.md 文件
 */
export class SkillParser {
  /**
   * 解析 skill.md 文件内容
   */
  static parse(content: string): {
    metadata: SkillMetadata;
    content: string;
  } {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      logger.error(
        "skill.md 文件格式错误：缺少 skill 描述。格式必须是：\n---\nname: xxx\ndescription: xxx\n---\n\nmarkdown content"
      );
    }

    // logger.error 会抛出错误，所以 match 不会是 null
    const frontmatter = match![1];
    const markdownContent = match![2].trim();
    const metadata: Partial<SkillMetadata> = {};
    const lines = frontmatter.split("\n");

    for (const line of lines) {
      const colonIndex = line.indexOf(":");
      if (colonIndex === -1) continue;

      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();

      metadata[key] = value;
    }

    if (!metadata.name || !metadata.description) {
      logger.error("skill.md 文件格式错误：缺少必需的字段 (name, description)");
    }

    return {
      metadata: metadata as SkillMetadata,
      content: markdownContent.trim(),
    };
  }
}

/**
 * Skill 类 - 表示一个技能
 */
export class Skill {
  /** Skill 名称 */
  readonly name: string;
  /** Skill 描述 */
  readonly description: string;
  /** Skill 目录路径 */
  readonly skillDir: string;
  /** Skill 文档内容（skill.md） */
  readonly documentation: string;
  /** Skill 使用的 Tools */
  readonly tools: Tool[];
  /** 脚本文件列表 */
  readonly scripts: ScriptFile[];
  /** 上下文文件列表 */
  readonly contextFiles: ContextFile[];

  constructor(
    name: string,
    description: string,
    skillDir: string,
    documentation: string,
    tools: Tool[] = [],
    scripts: ScriptFile[] = [],
    contextFiles: ContextFile[] = []
  ) {
    this.name = name;
    this.description = description;
    this.skillDir = skillDir;
    this.documentation = documentation;
    this.tools = tools;
    this.scripts = scripts;
    this.contextFiles = contextFiles;
  }

  /**
   * 获取完整的文档内容（包括上下文文件）
   */
  getFullDocumentation(): string {
    const parts: string[] = [this.documentation];

    if (this.contextFiles.length > 0) {
      parts.push("\n## 上下文文件\n");
      for (const file of this.contextFiles) {
        parts.push(`### ${file.name}\n`);
        parts.push(file.content);
        parts.push("\n");
      }
    }

    if (this.scripts.length > 0) {
      parts.push("\n## 可用脚本\n");
      for (const script of this.scripts) {
        parts.push(`- ${script.name} (${script.type})`);
      }
    }

    return parts.join("\n");
  }
}

/**
 * Skill 加载器 - 负责从目录加载 Skill
 */
export class SkillLoader {
  /**
   * 从目录加载 Skill
   * @param path 技能目录路径或技能根目录路径
   * @param all 如果为 true，加载所有技能（从根目录）；如果为 false，加载单个技能（从指定目录）
   * @returns 根据 all 参数返回 Skill 或 Skill[]
   */
  static load(path: string, all: true): Skill[];
  static load(path: string, all?: false): Skill;
  static load(path: string, all: boolean = false): Skill | Skill[] {
    if (all) {
      return SkillLoader.loadAll(path);
    } else {
      return SkillLoader.loadSingle(path);
    }
  }

  /**
   * 从目录加载一个 Skill
   */
  private static loadSingle(skillDir: string): Skill {
    const skillMdPath = join(skillDir, "skill.md");

    if (!existsSync(skillMdPath)) {
      logger.error(`缺少 skill.md: ${skillDir}`);
    }

    try {
      // 读取 skill.md 文件
      const skillMdContent = readFileSync(skillMdPath, "utf-8");
      const { metadata, content: documentation } =
        SkillParser.parse(skillMdContent);

      // 脚本文件
      const scripts: ScriptFile[] = [];
      const scriptExtensions = [".sh", ".py", ".js", ".ts"];

      // 上下文文件
      const contextFiles: ContextFile[] = [];
      const contextExtensions = [".txt"];

      // 递归扫描目录
      function scanDirectory(dir: string, baseDir: string = skillDir): void {
        const entries = readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          // 跳过隐藏文件和特殊目录
          if (entry.name.startsWith(".") || entry.name.startsWith("_")) {
            continue;
          }

          const fullPath = join(dir, entry.name);
          const relativePath = fullPath.replace(baseDir + "/", "");

          // 跳过 tools 目录（Tools 单独加载）
          if (entry.name === "tools" && entry.isDirectory()) {
            continue;
          }

          if (entry.isDirectory()) {
            scanDirectory(fullPath, baseDir);
          } else {
            const ext = extname(entry.name).toLowerCase();

            // 检查是否是脚本文件
            if (scriptExtensions.includes(ext)) {
              const type = ext.slice(1) as "sh" | "py" | "js" | "ts";
              scripts.push({
                name: entry.name,
                path: relativePath,
                type,
              });
            }

            // 检查是否是上下文文件（排除 skill.md）
            if (entry.name !== "skill.md" && contextExtensions.includes(ext)) {
              try {
                const fileContent = readFileSync(fullPath, "utf-8");
                contextFiles.push({
                  name: entry.name,
                  path: relativePath,
                  content: fileContent,
                });
              } catch (error) {
                logger.warn(`读取上下文文件失败: ${fullPath}`, { error });
              }
            }
          }
        }
      }

      scanDirectory(skillDir);

      // 加载该 Skill 使用的 Tools
      const tools = SkillLoader.loadToolsFromDirectory(skillDir);

      const skill = new Skill(
        metadata.name,
        metadata.description,
        skillDir,
        documentation,
        tools,
        scripts,
        contextFiles
      );

      logger.debug(`已加载技能: ${skill.name}`, {
        skillDir,
        toolCount: tools.length,
        scriptCount: scripts.length,
        contextFileCount: contextFiles.length,
      });

      return skill;
    } catch (error) {
      logger.error(`加载技能失败: ${skillDir}`, error);
      // logger.error 会抛出错误，永远不会执行到这里
      return undefined as never;
    }
  }

  /**
   * 从目录加载 Tools
   */
  private static loadToolsFromDirectory(skillDir: string): Tool[] {
    const toolsDir = join(skillDir, "tools");
    const tools: Tool[] = [];

    if (!existsSync(toolsDir)) {
      return tools;
    }

    const toolsIndexPath = join(toolsDir, "index.ts");
    if (!existsSync(toolsIndexPath)) {
      return tools;
    }

    try {
      // 动态导入 Tools（Bun 支持直接 require TypeScript 文件）
      // 使用绝对路径以确保正确解析（resolve 会自动处理相对/绝对路径）
      const absoluteToolsPath = resolve(toolsIndexPath);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const toolsModule = require(absoluteToolsPath);

      // 查找导出的 Tools（可能是数组、对象或单个 Tool）
      let exportedTools: Tool[] = [];

      if (Array.isArray(toolsModule.default)) {
        exportedTools = toolsModule.default;
      } else if (
        toolsModule.default &&
        typeof toolsModule.default === "object"
      ) {
        exportedTools = Object.values(toolsModule.default) as Tool[];
      } else if (
        toolsModule.default &&
        typeof toolsModule.default.execute === "function"
      ) {
        exportedTools = [toolsModule.default];
      } else if (Array.isArray(toolsModule.tools)) {
        exportedTools = toolsModule.tools;
      } else if (toolsModule.tools && typeof toolsModule.tools === "object") {
        exportedTools = Object.values(toolsModule.tools) as Tool[];
      } else {
        // 尝试查找所有符合 Tool 接口的导出
        for (const key of Object.keys(toolsModule)) {
          const exported = toolsModule[key];
          if (
            exported &&
            typeof exported === "object" &&
            typeof exported.execute === "function" &&
            exported.name &&
            exported.description
          ) {
            exportedTools.push(exported);
          }
        }
      }

      tools.push(...exportedTools);
      logger.debug(`从 ${skillDir} 加载了 ${tools.length} 个 Tools`);
    } catch (error) {
      logger.error(`加载 Tools 失败: ${toolsDir}`, { error });
    }

    return tools;
  }

  /**
   * 从目录加载所有 Skills
   */
  private static loadAll(skillsRootDir: string): Skill[] {
    const skills: Skill[] = [];

    try {
      const entries = readdirSync(skillsRootDir, { withFileTypes: true });

      for (const entry of entries) {
        // 跳过隐藏文件和特殊文件
        if (entry.name.startsWith(".") || entry.name.startsWith("_")) {
          continue;
        }

        // 跳过非目录项
        if (!entry.isDirectory()) {
          continue;
        }

        // 跳过特殊目录
        if (entry.name === "node_modules" || entry.name === ".git") {
          continue;
        }

        const skillDir = join(skillsRootDir, entry.name);
        const skill = SkillLoader.loadSingle(skillDir);

        if (skill) {
          skills.push(skill);
        }
      }
    } catch (error) {
      logger.error(`读取技能目录失败: ${skillsRootDir}`, { error });
    }

    return skills;
  }
}

/**
 * Skill 注册器 - 管理所有已注册的 Skills
 */
export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();

  /**
   * 注册一个 Skill
   */
  register(skill: Skill): void {
    this.skills.set(skill.name, skill);

    // 注册该 Skill 使用的所有 Tools
    for (const tool of skill.tools) {
      toolRegistry.register(tool);
    }

    logger.info(
      `已注册技能: ${skill.name} (包含 ${skill.tools.length} 个 Tools)`
    );
  }

  /**
   * 获取一个 Skill
   */
  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  /**
   * 获取所有 Skill
   */
  getAll(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * 获取 Skill 的文档内容（用于渐进式披露）
   */
  getDocumentation(skillName: string): string | null {
    const skill = this.get(skillName);
    if (!skill) return null;

    return skill.getFullDocumentation();
  }
}

export const skillRegistry = new SkillRegistry();

/**
 * 初始化并注册所有技能
 * @param skillsDir 技能目录路径，默认为相对于 __dirname 的 "skills" 目录
 * @returns 加载的技能数量
 */
export function initSkills(skillsDir?: string): number {
  const dir = skillsDir || join(__dirname, "..", "skills");
  const skills = SkillLoader.load(dir, true);

  for (const skill of skills) {
    skillRegistry.register(skill);
  }

  logger.info(`共加载 ${skills.length} 个技能`);
  return skills.length;
}
