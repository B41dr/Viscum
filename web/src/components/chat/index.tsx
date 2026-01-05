/**
 * 聊天主组件
 */

"use client";

import { useState } from "react";
import { XProvider } from "@ant-design/x";
import { useXChat } from "@ant-design/x-sdk";
import { createStyles } from "antd-style";
import { clsx } from "clsx";
import "@ant-design/x-markdown/themes/light.css";
import "@ant-design/x-markdown/themes/dark.css";
import { CustomChatProvider } from "@/lib/provider";
import { ChatMessages } from "./chat-messages";
import { ChatInput } from "./chat-input";

const useStyle = createStyles(({ token, css }) => ({
  layout: css`
    width: 100%;
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: ${token.colorBgContainer};
    overflow: hidden;
  `,
  chat: css`
    height: 100%;
    width: 100%;
    overflow: hidden;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    padding-block: ${token.paddingLG}px;
    padding-inline: ${token.paddingLG}px;
    .ant-bubble-content-updating {
      background-image: linear-gradient(
        90deg,
        #ff6b23 0%,
        #af3cb8 31%,
        #53b6ff 89%
      );
      background-size: 100% 2px;
      background-repeat: no-repeat;
      background-position: bottom;
    }
  `,
  chatList: css`
    display: flex;
    width: 100%;
    height: 100%;
    flex-direction: column;
    justify-content: flex-start;
    gap: 16px;
  `,
  messagesWrapper: css`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    width: 100%;
    display: flex;
    flex-direction: column;
  `,
  inputWrapper: css`
    flex-shrink: 0;
    width: 100%;
    max-width: 840px;
    margin: 0 auto;
  `,
  startPage: css`
    display: flex;
    width: 100%;
    max-width: 840px;
    margin: 0 auto;
    flex-direction: column;
    align-items: center;
    height: 100%;
    justify-content: center;
  `,
}));

const provider = new CustomChatProvider();

export function Chat() {
  const { styles } = useStyle();
  const [className] = useState("light");

  const { onRequest, messages, isRequesting, abort, onReload } = useXChat({
    provider,
    requestPlaceholder: () => {
      return {
        content: "正在思考...",
        role: "assistant",
      };
    },
    requestFallback: (_, { error, errorInfo }) => {
      console.error("请求失败:", error, errorInfo);
      const errorMessage =
        errorInfo?.error?.message ||
        error?.message ||
        error?.toString() ||
        "请求失败，请稍后重试";
      return {
        content: `错误: ${errorMessage}`,
        role: "assistant",
      };
    },
  });

  const handleSubmit = (value: string) => {
    if (!value) return;

    // 构建包含历史消息的完整消息列表
    const historyMessages = (messages || []).map((msg) => ({
      role: msg.message.role,
      content: msg.message.content,
    }));

    onRequest({
      messages: [...historyMessages, { role: "user", content: value }],
    });
  };

  const handleReload = (id: string) => {
    if (!messages || messages.length === 0) return;

    // 找到要重试的消息索引
    const reloadIndex = messages.findIndex((msg) => msg.id === id);
    if (reloadIndex === -1) return;

    // 找到该消息之前的用户消息
    let userMessageIndex = -1;
    for (let i = reloadIndex - 1; i >= 0; i--) {
      if (messages[i].message.role === "user") {
        userMessageIndex = i;
        break;
      }
    }

    if (userMessageIndex === -1) return;

    // 构建到该用户消息之前的所有历史消息
    const historyMessages = messages.slice(0, userMessageIndex).map((msg) => ({
      role: msg.message.role,
      content: msg.message.content,
    }));

    // 获取要重试的用户消息
    const userMessage = messages[userMessageIndex].message;

    // 重新发送请求
    onRequest({
      messages: [...historyMessages, userMessage],
    });
  };

  const isEmpty = !messages || messages.length === 0;

  return (
    <XProvider>
      <div className={styles.layout}>
        <div className={styles.chat}>
          <div className={styles.chatList}>
            <div className={styles.messagesWrapper}>
              {isEmpty ? (
                <div className={styles.startPage}>
                  <div style={{ flex: 1 }} />
                </div>
              ) : (
                <ChatMessages
                  messages={messages?.map((msg) => ({
                    id: String(msg.id),
                    message: msg.message,
                    status: msg.status,
                  }))}
                  className={className}
                  onReload={handleReload}
                />
              )}
            </div>
            <div className={styles.inputWrapper}>
              <ChatInput
                loading={isRequesting}
                messageCount={messages?.length || 0}
                onSubmit={handleSubmit}
                onCancel={abort}
              />
            </div>
          </div>
        </div>
      </div>
    </XProvider>
  );
}
