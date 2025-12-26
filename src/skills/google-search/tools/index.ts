import { Tool } from "../../tool";
import { logger } from "../../../utils";
import * as cheerio from "cheerio";

/**
 * 清理文本中的多余换行和空格
 * 保留单个换行，但清理多余的空白字符
 */
function cleanText(text: string): string {
  if (!text) return text;
  return text
    .replace(/[ \t]+/g, " ") // 将多个连续空格和制表符替换为单个空格
    .replace(/\n[ \t]+/g, "\n") // 清理换行后的空格
    .replace(/[ \t]+\n/g, "\n") // 清理换行前的空格
    .replace(/\n{3,}/g, "\n\n") // 将3个或更多连续换行替换为2个换行
    .trim(); // 去除首尾空白
}

/**
 * Google 搜索 Tool（使用 DuckDuckGo 作为搜索引擎）
 * 原子能力：执行网络搜索并返回结果
 */
export class GoogleSearchTool implements Tool {
  name = "google_search";
  description =
    "执行网络搜索（使用 DuckDuckGo 搜索引擎）。当用户询问需要实时信息、当前事件、天气、新闻、最新数据或任何需要搜索的问题时使用。";

  parameters = {
    type: "object" as const,
    properties: {
      query: {
        type: "string" as const,
        description: "要搜索的关键词或问题",
      },
    },
    required: ["query"],
  };

  async execute(params: Record<string, any>): Promise<any> {
    const { query } = params;

    if (!query || typeof query !== "string") {
      logger.error("搜索关键词不能为空");
    }

    logger.info("执行搜索", { query, engine: "DuckDuckGo" });

    try {
      // 构建 DuckDuckGo 搜索 URL
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

      // 使用 fetch 获取页面内容，设置 User-Agent
      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
      });

      if (!response.ok) {
        logger.error(`HTTP 错误: ${response.status} ${response.statusText}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // 调试：记录 HTML 片段
      const bodyText = $("body").text().substring(0, 500);
      logger.debug("DuckDuckGo 搜索页面内容预览", {
        htmlLength: html.length,
        bodyPreview: bodyText,
      });

      // 解析搜索结果
      const results: Array<{
        title: string;
        link: string;
        snippet: string;
      }> = [];

      // DuckDuckGo 的搜索结果通常在 .result 或 .web-result 类中
      $(".result, .web-result").each((_, element) => {
        const $element = $(element);

        // 提取标题和链接
        const titleElement = $element
          .find(".result__title, .result__a")
          .first();
        const linkElement = $element.find("a.result__a, a.result__url").first();

        if (titleElement.length) {
          const title = titleElement.text().trim();
          let link =
            linkElement.attr("href") || titleElement.attr("href") || "";

          // DuckDuckGo 的链接可能是相对路径，需要处理
          if (link && !link.startsWith("http")) {
            // 如果是 /l/?kh=-1&uddg= 格式，提取实际 URL
            if (link.includes("uddg=")) {
              const match = link.match(/uddg=([^&]+)/);
              if (match) {
                link = decodeURIComponent(match[1]);
              }
            } else if (link.startsWith("/")) {
              link = `https://duckduckgo.com${link}`;
            }
          }

          // 提取摘要
          const snippet =
            $element
              .find(".result__snippet, .result__body")
              .first()
              .text()
              .trim() ||
            $element.find("a.result__snippet").first().text().trim();

          if (title && link && link.startsWith("http")) {
            results.push({
              title: cleanText(title),
              link,
              snippet: cleanText(snippet) || "无摘要",
            });
          }
        }
      });

      // 如果上面的选择器没有找到结果，尝试其他选择器
      if (results.length === 0) {
        // 尝试查找所有包含标题的链接
        $("a.result__a, a.result__url").each((_, element) => {
          const $element = $(element);
          const title = $element.text().trim();
          let link = $element.attr("href") || "";

          if (link && !link.startsWith("http")) {
            if (link.includes("uddg=")) {
              const match = link.match(/uddg=([^&]+)/);
              if (match) {
                link = decodeURIComponent(match[1]);
              }
            }
          }

          if (title && link && link.startsWith("http")) {
            // 尝试找到摘要（在父元素或兄弟元素中）
            const parent = $element.closest(".result, .web-result");
            const snippet = parent
              .find(".result__snippet, .result__body")
              .first()
              .text()
              .trim();

            // 避免重复
            if (!results.some((r) => r.link === link)) {
              results.push({
                title: cleanText(title),
                link,
                snippet: cleanText(snippet) || "无摘要",
              });
            }
          }
        });
      }

      // 尝试提取即时答案（Instant Answer）
      let instantAnswer = "";
      const instantAnswerElement = $(".zci-result, .instant-answer").first();
      if (instantAnswerElement.length) {
        instantAnswer = cleanText(instantAnswerElement.text().trim());
        logger.debug("找到即时答案", {
          content: instantAnswer.substring(0, 200),
        });
      }

      // 去重
      const uniqueResults = results.filter(
        (result, index, self) =>
          index === self.findIndex((r) => r.link === result.link)
      );

      // 限制返回结果数量
      const topResults = uniqueResults.slice(0, 5);

      logger.info("搜索完成", {
        query,
        resultCount: topResults.length,
        totalFound: uniqueResults.length,
      });

      // 如果仍然没有结果，记录更多调试信息
      if (topResults.length === 0) {
        const resultCount = $(".result, .web-result").length;
        const linkCount = $("a[href]").length;
        logger.warn("未能解析搜索结果", {
          query,
          resultCount,
          linkCount,
          htmlSnippet: html.substring(0, 1000),
        });
      }

      // 构建返回消息
      let message = `已为您搜索"${query}"`;
      if (instantAnswer) {
        message += `。找到相关信息：${instantAnswer}`;
      }
      if (topResults.length > 0) {
        message += `，共找到 ${topResults.length} 条相关结果。`;
      } else if (!instantAnswer) {
        message += "，但未能解析到搜索结果。";
      }

      if (topResults.length === 0 && !instantAnswer) {
        return {
          success: false,
          query,
          searchUrl,
          message: `已搜索"${query}"，但未能解析到搜索结果。`,
          results: [],
          note: "可能是 DuckDuckGo 页面结构变化。您可以访问搜索链接查看结果。",
        };
      }

      const summaryParts: string[] = [];
      if (instantAnswer) {
        summaryParts.push(`信息摘要：${instantAnswer}`);
      }
      if (topResults.length > 0) {
        summaryParts.push(
          ...topResults.map((r, i) => `${i + 1}. ${r.title}: ${r.snippet}`)
        );
      }

      const summary = cleanText(summaryParts.join("\n\n"));

      return {
        success: true,
        query,
        searchUrl,
        message,
        instantAnswer: instantAnswer || undefined,
        results: topResults.map((r, index) => ({
          index: index + 1,
          title: r.title,
          link: r.link,
          snippet: r.snippet,
        })),
        summary,
      };
    } catch (error) {
      logger.error("Google 搜索失败", { error, query });
    }
  }
}

export const googleSearchTool = new GoogleSearchTool();
export default [googleSearchTool];
