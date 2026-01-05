# Workspace 配置说明

本项目使用 **Bun** + **Turborepo** 管理 monorepo workspaces。

## 项目结构

```
.
├── server/              # @viscum/server - AI Agent 服务器
├── web/                 # @viscum/web - Next.js 前端应用
├── services/            # 需要单独部署的服务
│   └── embedding/       # Embedding 服务（Python FastAPI）
└── package.json         # 根 workspace 配置
```

## 安装依赖

```bash
# 在根目录安装所有 workspace 的依赖
bun install
```

## 开发命令

### 运行所有 workspace

```bash
# 并行运行所有 workspace 的 dev 命令
bun run dev

# 运行所有 workspace 的 build 命令
bun run build

# 运行所有 workspace 的 lint 命令
bun run lint

# 运行所有 workspace 的 format 命令
bun run format
```

### 运行特定 workspace

```bash
# 运行 server
bun run server
# 或
bun run --filter @viscum/server dev

# 运行 web
bun run web
# 或
bun run --filter @viscum/web dev
```

### 其他命令

```bash
# 清理所有构建产物
bun run clean

# 在特定 workspace 中运行命令
bun run --filter @viscum/server <command>
bun run --filter @viscum/web <command>
```

## Turborepo 特性

- **并行执行**: 自动并行运行独立的任务
- **智能缓存**: 只重新构建变更的部分
- **依赖感知**: 自动处理 workspace 之间的依赖关系

## Workspace 说明

### @viscum/server

AI Agent 服务器，使用 Bun 运行时。

- 入口: `server/index.ts`
- 开发: `bun run server` 或 `bun run --filter @viscum/server dev`

### @viscum/web

Next.js 前端应用。

- 入口: `web/src/app/page.tsx`
- 开发: `bun run web` 或 `bun run --filter @viscum/web dev`

## 服务说明

### services/embedding

Embedding 服务，使用 Python FastAPI 提供文本和代码嵌入向量生成功能。

- 技术栈: Python + FastAPI + PyTorch
- 模型: google/embeddinggemma-300m
- 入口: `services/embedding/api.py`
- 运行: `cd services/embedding && uvicorn api:app --host 0.0.0.0 --port 8000`
- 依赖安装: `cd services/embedding && pip install -r requirements.txt`

**注意**: 此服务需要单独部署，不在 Turborepo workspaces 管理范围内。

## 配置说明

- `turbo.json`: Turborepo 配置，定义任务管道和缓存策略
- `tsconfig.base.json`: 共享的 TypeScript 配置
- `package.json`: 根 workspace 配置，定义 workspaces 和全局脚本
