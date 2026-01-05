/**
 * 消息气泡内容渲染
 */

import XMarkdown from "@ant-design/x-markdown";
import { CodeHighlighter, Mermaid } from "@ant-design/x";
import { createStyles } from "antd-style";
import { useState, useRef, useEffect } from "react";
import { FullscreenOutlined, FullscreenExitOutlined } from "@ant-design/icons";
import { Infographic } from "@antv/infographic";

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
  mermaidContainer: css`
    position: relative;
    margin: 12px 0;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid ${token.colorBorder};
    background: ${token.colorBgContainer};

    &:hover .mermaid-fullscreen-btn {
      opacity: 1;
    }
  `,
  mermaidFullscreenBtn: css`
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 10;
    padding: 6px 8px;
    background: ${token.colorBgContainer};
    border: 1px solid ${token.colorBorder};
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition:
      opacity 0.2s,
      background 0.2s;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);

    &:hover {
      background: ${token.colorFillTertiary};
      border-color: ${token.colorPrimary};
    }

    &:active {
      transform: scale(0.95);
    }
  `,
  mermaidFullscreenContainer: css`
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 9999;
    background: ${token.colorBgContainer};
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px;
    overflow: auto;
  `,
  mermaidFullscreenContent: css`
    width: 100%;
    max-width: 90vw;
    height: 100%;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  `,
  mermaidFullscreenHeader: css`
    width: 100%;
    display: flex;
    justify-content: flex-end;
    padding: 12px;
    margin-bottom: 20px;
  `,
  mermaidFullscreenBody: css`
    flex: 1;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: auto;
  `,
  infographicContainer: css`
    margin: 12px 0;
    width: 100%;
    min-height: 200px;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid ${token.colorBorder};
    background: ${token.colorBgContainer};
  `,
}));

/**
 * Infographic 组件
 */
function ReactInfographic({ children }: { children: string }) {
  const { styles } = useStyle();
  const containerRef = useRef<HTMLDivElement>(null);
  const infographicInstance = useRef<Infographic | null>(null);

  useEffect(() => {
    if (containerRef.current) {
      infographicInstance.current = new Infographic({
        container: containerRef.current,
      });
    }

    return () => {
      infographicInstance.current?.destroy();
    };
  }, []);

  useEffect(() => {
    if (infographicInstance.current && children) {
      infographicInstance.current.render(children);
    }
  }, [children]);

  return <div ref={containerRef} className={styles.infographicContainer} />;
}

/**
 * Mermaid 全屏组件
 */
function MermaidWithFullscreen({ children }: { children: string }) {
  const { styles } = useStyle();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);

  const enterFullscreen = () => {
    if (fullscreenRef.current) {
      if (fullscreenRef.current.requestFullscreen) {
        fullscreenRef.current.requestFullscreen();
      } else if ((fullscreenRef.current as any).webkitRequestFullscreen) {
        (fullscreenRef.current as any).webkitRequestFullscreen();
      } else if ((fullscreenRef.current as any).mozRequestFullScreen) {
        (fullscreenRef.current as any).mozRequestFullScreen();
      } else if ((fullscreenRef.current as any).msRequestFullscreen) {
        (fullscreenRef.current as any).msRequestFullscreen();
      }
      setIsFullscreen(true);
    }
  };

  const exitFullscreen = () => {
    if (document.fullscreenElement) {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      } else if ((document as any).mozCancelFullScreen) {
        (document as any).mozCancelFullScreen();
      } else if ((document as any).msExitFullscreen) {
        (document as any).msExitFullscreen();
      }
    }
    setIsFullscreen(false);
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange
      );
      document.removeEventListener(
        "mozfullscreenchange",
        handleFullscreenChange
      );
      document.removeEventListener(
        "MSFullscreenChange",
        handleFullscreenChange
      );
    };
  }, []);

  if (isFullscreen) {
    return (
      <div ref={fullscreenRef} className={styles.mermaidFullscreenContainer}>
        <div className={styles.mermaidFullscreenContent}>
          <div className={styles.mermaidFullscreenHeader}>
            <button
              onClick={exitFullscreen}
              className={styles.mermaidFullscreenBtn}
              style={{ position: "relative", opacity: 1 }}
            >
              <FullscreenExitOutlined />
            </button>
          </div>
          <div className={styles.mermaidFullscreenBody}>
            <Mermaid>{children}</Mermaid>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={styles.mermaidContainer}>
      <button
        onClick={enterFullscreen}
        className={`${styles.mermaidFullscreenBtn} mermaid-fullscreen-btn`}
        title="全屏查看"
      >
        <FullscreenOutlined />
      </button>
      <Mermaid>{children}</Mermaid>
    </div>
  );
}

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

              // 如果是 mermaid 图表，使用带全屏功能的 Mermaid 组件渲染
              if (lang === "mermaid") {
                return (
                  <MermaidWithFullscreen>{children}</MermaidWithFullscreen>
                );
              }

              // 如果是 infographic 图表，使用 Infographic 组件渲染
              if (lang === "infographic") {
                return <ReactInfographic>{children}</ReactInfographic>;
              }

              // 其他代码块使用 CodeHighlighter
              return <CodeHighlighter lang={lang}>{children}</CodeHighlighter>;
            }

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
