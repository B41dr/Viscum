/** 工具调用类型 */
export type ToolCall = {
  name: string;
  args: Record<string, any>;
};

/** 工具执行结果类型 */
export type ToolResult = {
  name: string;
  result: any;
};
