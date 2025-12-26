import { AIMessage, BaseMessage } from "@langchain/core/messages";
import { logger } from "../../utils";

/**
 * 消息格式化器
 * 负责格式化消息列表为可读的字符串
 */
export class MessageFormatter {
  /**
   * 格式化消息列表为可读的字符串
   */
  formatMessages(messages: BaseMessage[]): string {
    return messages
      .map((msg, index) => {
        const role = msg.type;
        const content = this.getMessageContent(msg);
        const toolCalls = this.getToolCallsInfo(msg);

        return `[${index + 1}] ${role}: ${content}${toolCalls}`;
      })
      .join("\n");
  }

  /**
   * 获取消息内容
   */
  private getMessageContent(msg: BaseMessage): string {
    if (typeof msg.content === "string") {
      return msg.content;
    }
    if (Array.isArray(msg.content)) {
      return msg.content
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object" && "text" in item)
            return (item as any).text;
          return JSON.stringify(item);
        })
        .join("");
    }
    return JSON.stringify(msg.content);
  }

  /**
   * 获取工具调用信息
   */
  private getToolCallsInfo(msg: BaseMessage): string {
    if (msg instanceof AIMessage && msg.tool_calls) {
      const toolNames = msg.tool_calls.map((tc: any) => tc.name).join(", ");
      return ` [工具调用: ${toolNames}]`;
    }
    return "";
  }

  /**
   * 记录发送给 LLM 的完整 prompt
   */
  logPrompt(messages: BaseMessage[]): void {
    const formattedPrompt = this.formatMessages(messages);
    logger.info(
      `发送给 LLM 的完整 Prompt (共 ${messages.length} 条消息):\n${formattedPrompt}`
    );
  }
}
