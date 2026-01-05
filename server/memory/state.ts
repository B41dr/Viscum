import { StateGraph, Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";
import { replaceReducer, messagesReducer } from "./reducers";
import { ToolCall, ToolResult } from "./types";

/**
 * Agent 状态定义
 * 使用 LangGraph 的 Annotation API 定义状态结构和 reducer
 */
export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesReducer,
    default: () => [],
  }),
  /** 需要执行的工具调用 */
  toolCalls: Annotation<ToolCall[]>({
    reducer: replaceReducer,
    default: () => [],
  }),
  /** 工具执行结果 */
  toolResults: Annotation<ToolResult[]>({
    reducer: replaceReducer,
    default: () => [],
  }),
});
