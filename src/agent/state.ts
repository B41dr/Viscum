import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x: BaseMessage[], y: BaseMessage | BaseMessage[]) => {
      if (Array.isArray(y)) {
        return x.concat(y);
      }
      return x.concat([y]);
    },
    default: () => [],
  }),
  /** 当前 Agent 类型：'main' 或 'sub' */
  agentType: Annotation<string>({
    reducer: (x: string, y: string) => y ?? x,
    default: () => "main",
  }),
  /** 需要执行的工具调用 */
  toolCalls: Annotation<
    Array<{
      name: string;
      args: Record<string, any>;
    }>
  >({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => [],
  }),
  /** 工具执行结果 */
  toolResults: Annotation<
    Array<{
      name: string;
      result: any;
    }>
  >({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => [],
  }),
});
