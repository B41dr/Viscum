export type { Tool } from "./tool";
export { toolRegistry } from "./tool";
export { googleSearchTool } from "./search";

// 注册默认工具（延迟执行以避免循环依赖）
import { toolRegistry as registry } from "./tool";
import { googleSearchTool as searchTool } from "./search";
registry.register(searchTool);
