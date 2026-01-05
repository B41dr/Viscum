import { AgentState } from "../memory";

/**
 * 反馈循环层
 * 负责处理工具执行结果，更新记忆，并决定是否需要继续执行
 *
 * 注意：当前反馈逻辑主要在 workflow 的条件边中处理
 * 这里预留接口，未来可以扩展更复杂的反馈机制
 */

/**
 * 反馈处理器接口
 */
export interface FeedbackProcessor {
  /**
   * 处理工具执行结果
   * @param state 当前状态
   * @returns 是否应该继续执行
   */
  processFeedback(state: typeof AgentState.State): boolean;

  /**
   * 更新记忆层
   * @param state 当前状态
   */
  updateMemory?(state: typeof AgentState.State): void;
}

/**
 * 默认反馈处理器
 * 根据工具结果决定是否继续执行
 */
export class DefaultFeedbackProcessor implements FeedbackProcessor {
  processFeedback(state: typeof AgentState.State): boolean {
    // 如果有工具结果，继续执行让 LLM 处理结果
    return !!(state.toolResults && state.toolResults.length > 0);
  }
}

export const feedbackProcessor: FeedbackProcessor =
  new DefaultFeedbackProcessor();
