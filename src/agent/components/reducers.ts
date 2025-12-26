import { BaseMessage } from "@langchain/core/messages";

/**
 * Agent 状态相关的 reducer 函数
 */

/** 替换式 reducer：如果新值存在则替换，否则保持原值 */
export const replaceReducer = <T>(x: T, y: T | undefined): T =>
  y !== undefined ? y : x;

/** 消息合并 reducer：将新消息追加到现有消息列表 */
export const messagesReducer = (
  x: BaseMessage[],
  y: BaseMessage | BaseMessage[]
): BaseMessage[] => {
  return Array.isArray(y) ? x.concat(y) : x.concat([y]);
};
