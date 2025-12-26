import { readdirSync, readFileSync, existsSync } from "fs";
import { join, extname, resolve } from "path";
import { logger } from "../utils";
import { Tool, toolRegistry } from "./tool";

export interface Skill {
  /** Skill 名称 */
  name: string;
  /** Skill 描述 */
  description: string;
  /** Skill 目录路径 */
  skillDir: string;
  /** Skill 文档内容（skill.md） */
  documentation: string;
  /** Skill 使用的 Tools */
  tools: Tool[];
  /** 脚本文件列表 */
  scripts: Array<{
    name: string;
    path: string;
    type: "sh" | "py" | "js" | "ts";
  }>;
  /** 上下文文件列表 */
  contextFiles: Array<{
    name: string;
    path: string;
    content: string;
  }>;
}

export interface SkillMetadata {
  name: string;
  description: string;
  [key: string]: string | undefined;
}

function skillParser(content: string): {
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

function loadSkillFromDirectory(skillDir: string): Skill {
  console.log("loadSkillFromDirectory", skillDir);
  const skillMdPath = join(skillDir, "skill.md");

  if (!existsSync(skillMdPath)) {
    logger.error(`缺少 skill.md: ${skillDir}`);
  }

  try {
    // 读取 skill.md 文件
    const skillMdContent = readFileSync(skillMdPath, "utf-8");
    const { metadata, content: documentation } = skillParser(skillMdContent);

    // 脚本文件
    const scripts: Skill["scripts"] = [];
    const scriptExtensions = [".sh", ".py", ".js", ".ts"];

    // 上下文文件
    const contextFiles: Skill["contextFiles"] = [];
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
    const toolsDir = join(skillDir, "tools");
    const tools: Tool[] = [];

    if (existsSync(toolsDir)) {
      const toolsIndexPath = join(toolsDir, "index.ts");
      if (existsSync(toolsIndexPath)) {
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
          } else if (
            toolsModule.tools &&
            typeof toolsModule.tools === "object"
          ) {
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
      }
    }

    const skill: Skill = {
      name: metadata.name,
      description: metadata.description,
      skillDir,
      documentation,
      tools,
      scripts,
      contextFiles,
    };

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
 * Skill 注册器
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

    // 构建完整的文档内容（包括上下文文件）
    const parts: string[] = [skill.documentation];

    if (skill.contextFiles.length > 0) {
      parts.push("\n## 上下文文件\n");
      for (const file of skill.contextFiles) {
        parts.push(`### ${file.name}\n`);
        parts.push(file.content);
        parts.push("\n");
      }
    }

    if (skill.scripts.length > 0) {
      parts.push("\n## 可用脚本\n");
      for (const script of skill.scripts) {
        parts.push(`- ${script.name} (${script.type})`);
      }
    }

    return parts.join("\n");
  }
}

/**
 * 全局 Skill 注册器实例
 */
export const skillRegistry = new SkillRegistry();

/**
 * 从技能目录自动发现并加载所有技能
 * @param skillsRootDir 技能根目录路径
 */
export function loadSkillsFromDirectory(skillsRootDir: string): Skill[] {
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
      const skill = loadSkillFromDirectory(skillDir);

      if (skill) {
        skills.push(skill);
      }
    }
  } catch (error) {
    logger.error(`读取技能目录失败: ${skillsRootDir}`, { error });
  }

  return skills;
}
