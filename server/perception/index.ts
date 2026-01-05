/**
 * 感知层 - Embedding层
 * 负责将原始数据（文本/图像/音频等）转换为向量表示
 *
 * 注意：当前 embedding 功能由 Python 服务提供（services/embedding/ 目录）
 * 这里预留接口，未来可以集成 embedding API 调用
 */

/**
 * Embedding 服务接口
 * 用于调用 embedding 服务进行向量化
 */
export interface EmbeddingService {
  /**
   * 对文本进行向量化
   */
  embed(text: string | string[]): Promise<number[][]>;

  /**
   * 对代码仓库进行嵌入
   */
  embedRepository?(options: {
    repoPath: string;
    chunkStrategy?: string;
    maxChunkSize?: number;
  }): Promise<any>;

  /**
   * 在代码仓库中搜索相似代码
   */
  searchCode?(
    query: string,
    repositoryEmbeddings: any,
    topK?: number
  ): Promise<any[]>;
}

/**
 * 默认 Embedding 服务实现（占位符）
 * 未来可以集成 embedding API
 */
export class DefaultEmbeddingService implements EmbeddingService {
  async embed(text: string | string[]): Promise<number[][]> {
    // TODO: 实现 embedding API 调用
    throw new Error("Embedding 服务未实现");
  }
}

export const embeddingService: EmbeddingService = new DefaultEmbeddingService();
