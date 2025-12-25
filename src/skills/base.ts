import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { logger } from "../utils";

/**
 * Skill 基础接口
 */
export interface Skill {
  /** Skill 名称 */
  name: string;
  /** Skill 描述 */
  description: string;
  /** Skill 执行函数 */
  execute: (params: Record<string, any>) => Promise<any>;
  /** 参数定义 */
  parameters?: {
    type: "object";
    properties: Record<
      string,
      {
        type: string;
        description: string;
        required?: boolean;
      }
    >;
    required?: string[];
  };
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
   * 获取所有 Skill 的工具定义
   */
  getToolDefinitions(): Array<{
    type: string;
    function: {
      name: string;
      description: string;
      parameters: any;
    };
  }> {
    return this.getAll().map((skill) => ({
      type: "function",
      function: {
        name: skill.name,
        description: skill.description,
        parameters: skill.parameters || {
          type: "object",
          properties: {},
        },
      },
    }));
  }
}

/**
 * 全局 Skill 注册器实例
 */
export const skillRegistry = new SkillRegistry();

/**
 * Skill 元数据
 */
export interface SkillMetadata {
  name: string;
  description: string;
}

/**
 * 解析 SKILL.md 文件的 frontmatter
 */
function parseSkillMarkdown(content: string): {
  metadata: SkillMetadata;
  content: string;
} {
  // 匹配 YAML frontmatter (--- 开头和结尾)
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    throw new Error("SKILL.md 文件格式错误：缺少 YAML frontmatter");
  }

  const frontmatter = match[1];
  const markdownContent = match[2];

  // 解析 YAML frontmatter (简单解析，只支持 name 和 description)
  const metadata: Partial<SkillMetadata> = {};
  const lines = frontmatter.split("\n");

  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.substring(0, colonIndex).trim();
    let value = line.substring(colonIndex + 1).trim();

    // 移除可能的引号
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key === "name" || key === "description") {
      metadata[key] = value;
    }
  }

  if (!metadata.name || !metadata.description) {
    throw new Error(
      "SKILL.md 文件格式错误：缺少必需的字段 (name, description)"
    );
  }

  return {
    metadata: metadata as SkillMetadata,
    content: markdownContent.trim(),
  };
}

/**
 * 从技能文件夹加载技能
 */
function loadSkillFromDirectory(skillDir: string): Skill | null {
  const skillMdPath = join(skillDir, "SKILL.md");
  const skillIndexPath = join(skillDir, "index.ts");

  // 检查必需文件是否存在
  if (!existsSync(skillMdPath)) {
    logger.warn(`技能文件夹缺少 SKILL.md: ${skillDir}`);
    return null;
  }

  if (!existsSync(skillIndexPath)) {
    logger.warn(`技能文件夹缺少 index.ts: ${skillDir}`);
    return null;
  }

  try {
    // 读取 SKILL.md 文件
    const skillMdContent = readFileSync(skillMdPath, "utf-8");
    const { metadata } = parseSkillMarkdown(skillMdContent);

    // 动态导入技能实现
    // 使用 require 以便在运行时同步加载（Bun/Node.js 都支持）
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const skillModule = require(skillIndexPath);

    // 查找 Skill 类（可能是默认导出或命名导出）
    const SkillClass =
      skillModule.default ||
      skillModule[Object.keys(skillModule)[0]] ||
      Object.values(skillModule).find(
        (exported: any) =>
          exported &&
          typeof exported === "function" &&
          exported.prototype &&
          (exported.prototype.execute !== undefined ||
            exported.prototype.name !== undefined)
      );

    if (!SkillClass || typeof SkillClass !== "function") {
      logger.warn(`技能文件夹中未找到有效的 Skill 类: ${skillDir}`);
      return null;
    }

    // 创建技能实例
    const skillInstance = new SkillClass();

    // 验证技能实例的必需属性
    if (!skillInstance.name || !skillInstance.execute) {
      logger.warn(`技能实例缺少必需属性: ${skillDir}`);
      return null;
    }

    // 使用 SKILL.md 中的元数据覆盖实例的属性（如果不同，以 SKILL.md 为准）
    if (metadata.name !== skillInstance.name) {
      logger.warn(
        `技能名称不匹配: SKILL.md 中为 "${metadata.name}", 实现类中为 "${skillInstance.name}"。使用实现类中的名称。`
      );
    }

    // 使用 SKILL.md 中的描述（因为它可能更详细）
    skillInstance.description = metadata.description;

    logger.debug(`已加载技能: ${skillInstance.name}`, {
      skillDir,
      description: metadata.description.substring(0, 50) + "...",
    });

    return skillInstance;
  } catch (error) {
    logger.error(`加载技能失败: ${skillDir}`, { error });
    return null;
  }
}

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

/**
 * 读取技能文档内容
 */
export function getSkillDocumentation(skillDir: string): string | null {
  const skillMdPath = join(skillDir, "SKILL.md");

  if (!existsSync(skillMdPath)) {
    return null;
  }

  try {
    const content = readFileSync(skillMdPath, "utf-8");
    const { content: markdownContent } = parseSkillMarkdown(content);
    return markdownContent;
  } catch (error) {
    logger.error(`读取技能文档失败: ${skillDir}`, { error });
    return null;
  }
}
