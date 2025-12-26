# Skills 架构说明

本目录实现了 **Tool（工具）** 和 **Skill（技能）** 两层架构。

## 架构概念

### 1. Tool（工具）- 原子能力

**特征：**
- 最底层的可调用函数
- 单一、明确的功能
- 直接通过 Function Calling 调用

**示例：**
```typescript
// tools/index.ts
export class GoogleSearchTool implements Tool {
  name = "google_search";
  description = "执行网络搜索（使用 DuckDuckGo 搜索引擎）";

  parameters = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "要搜索的关键词或问题",
      },
    },
    required: ["query"],
  };

  async execute(params: Record<string, any>): Promise<any> {
    // 实现搜索逻辑
  }
}

// 导出 Tool 实例
export const googleSearchTool = new GoogleSearchTool();
export default [googleSearchTool];
```

### 2. Skill（技能）- 能力包

**特征：**
- 基于 Tool 实现的复合能力
- 包含：指令（skill.md）+ 脚本（.sh/.py）+ 上下文文件（.txt）
- 通过渐进式披露按需加载
- 共享主 Agent 的上下文

**文件结构：**
```
skills/
└── google-search/             # 一个 Skill
  ├── skill.md                 # 技能描述和使用指引（必需）
  ├── tools/                   # Tools 目录（必需）
  │   └── index.ts            # 导出该 Skill 使用的所有 Tools
  ├── analyze_query.sh        # 分析查询的脚本（可选）
  ├── optimization_rules.txt  # 优化规则文档（可选）
  └── common_patterns.txt     # 常见模式（可选）
```

## skill.md 格式

每个 Skill 必须包含 `skill.md` 文件，格式如下：

```markdown
---
name: skill_name
description: 技能的简短描述
---

# Skill 名称

详细的技能描述和使用说明。

## 工具说明

本技能包含以下 Tool：
- **tool_name**: Tool 的描述

## 使用场景

- 场景1
- 场景2

## 参数

- `param1` (type, 必需/可选): 参数说明

## 使用示例

- 示例1
- 示例2

## 注意事项

- 注意事项1
- 注意事项2
```

## 创建新的 Skill

1. **创建 Skill 目录**
   ```bash
   mkdir -p src/skills/my-skill/tools
   ```

2. **创建 skill.md**
   ```bash
   touch src/skills/my-skill/skill.md
   ```

3. **创建 Tools**
   ```typescript
   // src/skills/my-skill/tools/index.ts
   import { Tool } from "../../tool";

   export class MyTool implements Tool {
     name = "my_tool";
     description = "Tool 描述";
     // ... 实现
   }

   export const myTool = new MyTool();
   export default [myTool];
   ```

4. **添加脚本和上下文文件（可选）**
   - 脚本文件：`.sh`, `.py`, `.js`, `.ts`
   - 上下文文件：`.txt`

5. **自动加载**
   Skill 会在应用启动时自动发现并加载，无需手动注册。

## 加载机制

1. **自动发现**：扫描 `src/skills/` 目录下的所有子目录
2. **加载 Skill**：读取 `skill.md` 和 `tools/index.ts`
3. **注册 Tools**：将 Skill 中的 Tools 注册到全局 Tool 注册器
4. **渐进式披露**：Skill 文档和上下文文件可通过 `skillRegistry.getDocumentation()` 获取

## 使用示例

```typescript
import { toolRegistry, skillRegistry } from "./skills";

// 获取所有可用的 Tools（用于 Function Calling）
const tools = toolRegistry.getToolDefinitions();

// 获取 Skill 的完整文档（包括上下文文件）
const docs = skillRegistry.getDocumentation("google_search");

// 执行 Tool
const tool = toolRegistry.get("google_search");
const result = await tool.execute({ query: "天气" });
```
