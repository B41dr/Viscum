/**
 * 聊天消息列表组件
 */

import { Bubble } from "@ant-design/x";
import { useEffect, useRef, useCallback } from "react";
import type { XModelMessage } from "@ant-design/x-sdk";
import { createStyles } from "antd-style";
import { BubbleContent } from "./bubble-content";
import { BubbleFooter } from "./bubble-footer";

type MessageStatus =
  | "local"
  | "loading"
  | "updating"
  | "success"
  | "error"
  | "abort";

interface ChatMessage {
  id: string;
  message: XModelMessage;
  status?: MessageStatus;
}

interface ChatMessagesProps {
  messages: ChatMessage[] | undefined;
  className?: string;
  onReload?: (id: string) => void;
}

const useStyle = createStyles(({ token, css }) => ({
  messageContainer: css`
    width: 100%;
    max-width: 840px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding-block: 12px;
  `,
  assistantMessage: css`
    width: 100%;
    padding-block: 12px;
  `,
  userMessage: css`
    display: flex;
    justify-content: flex-end;
    width: 100%;
  `,
}));

export function ChatMessages({
  messages,
  className = "light",
  onReload,
}: ChatMessagesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const isUserScrollingRef = useRef(false);
  const wasAtBottomRef = useRef(true);
  const { styles } = useStyle();

  // 检查是否接近底部（阈值 100px）
  const isNearBottom = useCallback((scrollContainer: HTMLElement) => {
    const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
    const threshold = 100;
    return scrollHeight - scrollTop - clientHeight < threshold;
  }, []);

  // 滚动到底部
  const scrollToBottom = useCallback((scrollContainer: HTMLElement) => {
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
  }, []);

  // 监听滚动事件
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scrollContainer = container.parentElement;
    if (!scrollContainer) return;

    scrollContainerRef.current = scrollContainer;

    const handleScroll = () => {
      if (!scrollContainer) return;

      const nearBottom = isNearBottom(scrollContainer);

      // 如果接近底部，允许自动滚动
      if (nearBottom) {
        wasAtBottomRef.current = true;
        isUserScrollingRef.current = false;
      } else {
        // 如果不在底部，标记为用户手动滚动
        wasAtBottomRef.current = false;
        isUserScrollingRef.current = true;
      }
    };

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      scrollContainer.removeEventListener("scroll", handleScroll);
    };
  }, [isNearBottom]);

  // 自动滚动到底部（仅在用户未滚动或接近底部时）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scrollContainer =
      scrollContainerRef.current || container.parentElement;
    if (!scrollContainer) return;

    // 如果 scrollContainerRef 还没有设置，设置它
    if (!scrollContainerRef.current) {
      scrollContainerRef.current = scrollContainer;
    }

    // 如果用户正在手动滚动且不在底部，则不自动滚动
    if (isUserScrollingRef.current && !wasAtBottomRef.current) {
      return;
    }

    // 使用 requestAnimationFrame 来优化，避免闪烁
    requestAnimationFrame(() => {
      if (scrollContainer && scrollContainerRef.current) {
        scrollToBottom(scrollContainer);
        wasAtBottomRef.current = true;
      }
    });
  }, [messages, scrollToBottom]);

  if (!messages || messages.length === 0) {
    return null;
  }

  return (
    <div ref={containerRef} className={styles.messageContainer}>
      {messages.map((msg) => {
        const { id, message, status } = msg;
        // 将 content 转换为字符串
        const content =
          typeof message.content === "string"
            ? message.content
            : typeof message.content === "object" && message.content?.text
              ? message.content.text
              : String(message.content || "");

        if (message.role === "user") {
          // 用户消息：使用气泡包裹
          return (
            <div key={id} className={styles.userMessage}>
              <Bubble
                placement="end"
                content={content}
                style={{ maxWidth: 840 }}
              />
            </div>
          );
        } else {
          // 模型消息：直接展示 markdown，不使用气泡
          return (
            <div key={id} className={styles.assistantMessage}>
              <BubbleContent
                content={content}
                status={status}
                className={className}
              />
              <BubbleFooter
                content={content}
                status={status}
                id={id}
                onReload={onReload}
              />
            </div>
          );
        }
      })}
    </div>
  );
}
