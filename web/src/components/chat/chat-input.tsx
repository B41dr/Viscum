/**
 * 聊天输入组件
 */

import { Sender } from "@ant-design/x";
import { useRef, useEffect } from "react";
import type { ComponentRef } from "react";
import { clsx } from "clsx";
import { createStyles } from "antd-style";

const useStyle = createStyles(({ token, css }) => ({
  inputWrapper: css`
    min-height: 120px;
    margin: 0 0 0 20px;
  `,
  centerInput: css`
    background: ${token.colorBgContainer};
    border-radius: 16px;
    padding: 24px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  `,
}));

interface ChatInputProps {
  loading: boolean;
  messageCount: number;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export function ChatInput({
  loading,
  messageCount,
  onSubmit,
  onCancel,
}: ChatInputProps) {
  const { styles } = useStyle();
  const senderRef = useRef<ComponentRef<typeof Sender>>(null);

  useEffect(() => {
    senderRef.current?.focus({
      cursor: "end",
    });
  }, []);

  const isEmpty = messageCount === 0;

  return (
    <div
      className={clsx(styles.inputWrapper, {
        [styles.centerInput]: isEmpty,
      })}
    >
      <Sender
        ref={senderRef}
        loading={loading}
        onSubmit={(val) => {
          if (!val) return;
          onSubmit(val);
          senderRef.current?.clear?.();
        }}
        onCancel={onCancel}
        placeholder="输入消息..."
        autoSize={{
          minRows: isEmpty ? 3 : 2,
          maxRows: 6,
        }}
        style={{
          fontSize: "16px",
          lineHeight: "1.6",
        }}
      />
    </div>
  );
}
