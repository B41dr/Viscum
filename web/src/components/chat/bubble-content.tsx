/**
 * 消息气泡内容渲染
 */

import XMarkdown from "@ant-design/x-markdown";
import { CodeHighlighter } from "@ant-design/x";
import { createStyles } from "antd-style";

interface BubbleContentProps {
  content: any;
  status?: string;
  className?: string;
}

const useStyle = createStyles(({ token, css }) => ({
  markdownWrapper: css`
    width: 100%;
    word-break: break-word;
    overflow-wrap: break-word;

    /* 确保 markdown 内容正确显示 */
    :global(.x-markdown) {
      width: 100%;
    }

    /* 代码块样式 - 使用更具体的选择器 */
    :global(.x-markdown pre),
    :global(pre) {
      background: ${token.colorFillTertiary} !important;
      padding: 12px !important;
      border-radius: 6px !important;
      overflow-x: auto !important;
      margin: 12px 0 !important;
      border: 1px solid ${token.colorBorder} !important;
    }

    :global(.x-markdown code:not(pre code)),
    :global(code:not(pre code)) {
      background: ${token.colorFillTertiary} !important;
      padding: 2px 6px !important;
      border-radius: 4px !important;
      font-family: ${token.fontFamilyCode} !important;
      font-size: 0.9em !important;
      color: ${token.colorText} !important;
    }

    :global(.x-markdown pre code),
    :global(pre code) {
      background: transparent !important;
      padding: 0 !important;
      color: inherit !important;
      font-size: inherit !important;
      border-radius: 0 !important;
    }

    /* 确保代码块内的代码正确显示 */
    :global(.x-markdown pre > code),
    :global(pre > code) {
      display: block !important;
      width: 100% !important;
      overflow-x: auto !important;
      white-space: pre !important;
      word-wrap: normal !important;
      word-break: normal !important;
    }

    /* 代码块容器 - 直接选择器 */
    :global(.x-markdown pre) {
      position: relative;
      background: ${token.colorFillTertiary} !important;
    }

    /* 列表样式 */
    :global(ul),
    :global(ol) {
      padding-left: 24px;
      margin: 8px 0;
    }

    :global(li) {
      margin: 4px 0;
    }

    /* 标题样式 */
    :global(h1),
    :global(h2),
    :global(h3),
    :global(h4),
    :global(h5),
    :global(h6) {
      margin: 16px 0 8px 0;
      font-weight: 600;
      line-height: 1.4;
    }

    :global(h1) {
      font-size: 2em;
    }

    :global(h2) {
      font-size: 1.5em;
    }

    :global(h3) {
      font-size: 1.25em;
    }

    /* 段落样式 */
    :global(p) {
      margin: 8px 0;
      line-height: 1.6;
    }

    /* 引用样式 */
    :global(blockquote) {
      border-left: 4px solid ${token.colorBorder};
      padding-left: 16px;
      margin: 8px 0;
      color: ${token.colorTextSecondary};
    }

    /* 表格样式 */
    :global(table) {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
    }

    :global(th),
    :global(td) {
      border: 1px solid ${token.colorBorder};
      padding: 8px 12px;
      text-align: left;
    }

    :global(th) {
      background: ${token.colorFillTertiary};
      font-weight: 600;
    }

    /* 链接样式 */
    :global(a) {
      color: ${token.colorPrimary};
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }

    /* 水平线样式 */
    :global(hr) {
      border: none;
      border-top: 1px solid ${token.colorBorder};
      margin: 16px 0;
    }

    /* 强调样式 */
    :global(strong) {
      font-weight: 600;
    }

    :global(em) {
      font-style: italic;
    }
  `,
}));

export function BubbleContent({
  content,
  status,
  className = "light",
}: BubbleContentProps) {
  const { styles } = useStyle();

  // 确保 content 是字符串
  const contentString =
    typeof content === "string"
      ? content
      : typeof content === "object" && content?.text
        ? content.text
        : String(content || "");

  return (
    <div className={styles.markdownWrapper}>
      <XMarkdown
        paragraphTag="div"
        className={className}
        components={{
          code: (props: any) => {
            const { className, children } = props;

            // 如果是代码块（有 className，通常是 language-xxx 格式）
            if (className) {
              // 从 className 中提取语言，例如 "language-python" -> "python"
              const lang = className.match(/language-(\w+)/)?.[1] || "";

              // 确保 children 是字符串
              if (typeof children !== "string") {
                return null;
              }

              return <CodeHighlighter lang={lang}>{children}</CodeHighlighter>;
            }

            // 行内代码使用普通的 code 标签
            // 过滤掉不应该传递到 DOM 的 props
            const { domNode, streamStatus, block, ...domProps } = props;
            return <code {...domProps} />;
          },
        }}
        streaming={{
          hasNextChunk: status === "updating",
          enableAnimation: true,
        }}
      >
        {contentString}
      </XMarkdown>
    </div>
  );
}
