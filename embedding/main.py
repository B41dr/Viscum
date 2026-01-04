"""
使用 Hugging Face 下载并本地部署 google/embeddinggemma-300m 模型
"""
import os
import torch
from transformers import AutoModel, AutoTokenizer
from typing import List, Union, Optional, Dict, Any
from huggingface_hub import HfApi
import time
import json
from code_chunker import CodeChunker, ChunkStrategy


class EmbeddingGemmaModel:
    """EmbeddingGemma 模型封装类"""

    def __init__(
        self,
        model_name: str = "google/embeddinggemma-300m",
        device: str = None,
        token: Optional[str] = None,
        use_auth_token: bool = True
    ):
        """
        初始化模型

        Args:
            model_name: Hugging Face 模型名称
            device: 设备类型 ('cuda', 'cpu', 'mps')，如果为 None 则自动选择
            token: Hugging Face token（如果为 None，则从环境变量 HF_TOKEN 或缓存中获取）
            use_auth_token: 是否使用认证 token
        """
        self.model_name = model_name
        self.device = device or self._get_device()

        # 获取 token
        if token is None and use_auth_token:
            token = os.getenv("HF_TOKEN") or os.getenv("HUGGING_FACE_HUB_TOKEN")

        # 检查模型访问权限
        if use_auth_token:
            self._check_model_access(token)

        from huggingface_hub.constants import default_cache_path
        cache_dir = default_cache_path

        print(f"\n正在从 Hugging Face 下载模型: {model_name}")
        print(f"缓存路径: {cache_dir}")
        print(f"使用设备: {self.device}\n")

        try:
            start_time = time.time()

            # 下载并加载 tokenizer（使用默认缓存目录）
            tokenizer_kwargs = {
                'local_files_only': False
            }
            if token:
                tokenizer_kwargs['token'] = token

            print("正在下载 tokenizer...")
            self.tokenizer = AutoTokenizer.from_pretrained(
                model_name,
                **tokenizer_kwargs
            )
            print("✓ Tokenizer 下载完成\n")

            # 下载并加载模型（使用默认缓存目录）
            model_kwargs = {
                'local_files_only': False
            }
            if token:
                model_kwargs['token'] = token

            print("正在下载模型文件...")

            self.model = AutoModel.from_pretrained(
                model_name,
                **model_kwargs
            )

            elapsed_time = time.time() - start_time
            print(f"✓ 模型文件下载完成（耗时: {elapsed_time:.1f} 秒）")

            self.model.to(self.device)
            self.model.eval()

        except Exception as e:
            error_msg = str(e)
            if "gated" in error_msg.lower() or "401" in error_msg or "unauthorized" in error_msg.lower():
                print("\n" + "=" * 60)
                print("❌ 错误：无法访问受限制的模型")
                print("=" * 60)
                print("\n此模型需要 Hugging Face 认证和访问权限。")
                print("\n请按以下步骤操作：")
                print("1. 访问 https://huggingface.co/google/embeddinggemma-300m")
                print("   点击 'Agree and access repository' 申请访问权限")
                print("2. 获取 Hugging Face token：")
                print("   - 访问 https://huggingface.co/settings/tokens")
                print("   - 创建新的 token（需要 read 权限）")
                print("3. 设置认证（选择以下方式之一）：")
                print("   方式1 - 环境变量：")
                print("     export HF_TOKEN=your_token_here")
                print("   方式2 - 命令行登录：")
                print("     huggingface-cli login")
                print("   方式3 - 在代码中传入 token：")
                print("     model = EmbeddingGemmaModel(token='your_token_here')")
                print("=" * 60)
            raise

    def _get_device(self) -> str:
        """自动选择最佳设备"""
        if torch.cuda.is_available():
            return "cuda"
        elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            return "mps"  # Apple Silicon
        else:
            return "cpu"

    def _check_model_access(self, token: Optional[str] = None):
        """检查模型访问权限"""
        try:
            api = HfApi(token=token)
            api.model_info(self.model_name, token=token)
        except Exception as e:
            if "gated" in str(e).lower() or "401" in str(e):
                print("\n 警告：模型访问权限检查失败")
                print("请确保：")
                print("1. 已在 Hugging Face 申请模型访问权限")
                print("2. 已正确设置认证 token")
                print("\n继续尝试加载模型...")

    def embed(self, texts: Union[str, List[str]], normalize: bool = True) -> torch.Tensor:
        """
        生成文本嵌入向量

        Args:
            texts: 单个文本字符串或文本列表
            normalize: 是否对嵌入向量进行 L2 归一化

        Returns:
            嵌入向量张量，形状为 (batch_size, embedding_dim)
        """
        # 确保 texts 是列表
        if isinstance(texts, str):
            texts = [texts]

        # 对文本进行编码
        inputs = self.tokenizer(
            texts,
            padding=True,
            truncation=True,
            return_tensors="pt",
            max_length=512  # 根据模型限制调整
        )

        # 将输入移到设备上
        inputs = {k: v.to(self.device) for k, v in inputs.items()}

        # 获取模型输出
        with torch.no_grad():
            outputs = self.model(**inputs)

        # 提取嵌入向量（使用 mean pooling）
        # 对于 embedding 模型，通常使用 last_hidden_state 的平均值
        embeddings = outputs.last_hidden_state.mean(dim=1)

        # L2 归一化（可选，通常用于相似度计算）
        if normalize:
            embeddings = torch.nn.functional.normalize(embeddings, p=2, dim=1)

        return embeddings

    def embed_batch(self, texts: List[str], batch_size: int = 32, normalize: bool = True) -> torch.Tensor:
        """
        批量处理文本嵌入

        Args:
            texts: 文本列表
            batch_size: 批处理大小
            normalize: 是否对嵌入向量进行 L2 归一化

        Returns:
            所有文本的嵌入向量张量
        """
        all_embeddings = []

        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            batch_embeddings = self.embed(batch, normalize=normalize)
            all_embeddings.append(batch_embeddings)

        return torch.cat(all_embeddings, dim=0)

    def compute_similarity(self, text1: Union[str, List[str]], text2: Union[str, List[str]]) -> torch.Tensor:
        """
        计算两个文本之间的余弦相似度

        Args:
            text1: 第一个文本或文本列表
            text2: 第二个文本或文本列表

        Returns:
            相似度分数（0-1之间）
        """
        emb1 = self.embed(text1, normalize=True)
        emb2 = self.embed(text2, normalize=True)

        # 计算余弦相似度
        similarity = torch.nn.functional.cosine_similarity(emb1, emb2, dim=1)

        return similarity

    def embed_repository(
        self,
        repo_path: str,
        chunk_strategy: ChunkStrategy = ChunkStrategy.MIXED,
        max_chunk_size: int = 500,
        batch_size: int = 32,
        normalize: bool = True,
        include_patterns: Optional[List[str]] = None,
        exclude_patterns: Optional[List[str]] = None,
        save_path: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        对代码仓库进行分片并生成嵌入向量

        Args:
            repo_path: 代码仓库路径
            chunk_strategy: 分片策略（FUNCTION, CLASS, LINE, CHAR, MIXED）
            max_chunk_size: 最大分片大小（行数或字符数）
            batch_size: 批处理大小
            normalize: 是否对嵌入向量进行 L2 归一化
            include_patterns: 包含的文件模式（如 ['*.py', '*.ts']）
            exclude_patterns: 排除的文件模式
            save_path: 保存结果的路径（JSON格式）

        Returns:
            包含分片信息、嵌入向量和元数据的字典
        """
        print(f"分片策略: {chunk_strategy.value}")
        print(f"最大分片大小: {max_chunk_size}\n")

        # 创建代码分片器
        chunker = CodeChunker(
            chunk_strategy=chunk_strategy,
            max_chunk_size=max_chunk_size
        )

        # 对仓库进行分片
        print("正在扫描代码文件...")
        chunks = chunker.chunk_repository(
            repo_path,
            include_patterns=include_patterns,
            exclude_patterns=exclude_patterns
        )

        print(f"✓ 共找到 {len(chunks)} 个代码分片")

        if not chunks:
            print(" 未找到代码分片")
            return {
                'chunks': [],
                'embeddings': None,
                'metadata': {
                    'repo_path': repo_path,
                    'chunk_count': 0
                }
            }

        # 提取分片内容
        chunk_texts = [chunk.content for chunk in chunks]

        # 批量生成嵌入向量
        print(f"\n正在生成嵌入向量（批处理大小: {batch_size}）...")
        embeddings = self.embed_batch(chunk_texts, batch_size=batch_size, normalize=normalize)

        print(f"✓ 嵌入向量生成完成，形状: {embeddings.shape}")

        # 构建结果
        result = {
            'chunks': [
                {
                    'content': chunk.content,
                    'file_path': chunk.file_path,
                    'start_line': chunk.start_line,
                    'end_line': chunk.end_line,
                    'chunk_type': chunk.chunk_type,
                    'metadata': chunk.metadata
                }
                for chunk in chunks
            ],
            'embeddings': embeddings.cpu().tolist(),
            'metadata': {
                'repo_path': repo_path,
                'chunk_count': len(chunks),
                'embedding_dim': embeddings.shape[1],
                'chunk_strategy': chunk_strategy.value,
                'max_chunk_size': max_chunk_size
            }
        }

        # 保存结果
        if save_path:
            print(f"\n正在保存结果到: {save_path}")
            with open(save_path, 'w', encoding='utf-8') as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            print("✓ 保存完成\n")

        return result

    def search_code(
        self,
        query: str,
        repository_embeddings: Dict[str, Any],
        top_k: int = 5,
        threshold: float = 0.7
    ) -> List[Dict[str, Any]]:
        """
        在代码仓库嵌入向量中搜索相似的代码片段

        Args:
            query: 查询文本
            repository_embeddings: embed_repository 返回的结果
            top_k: 返回前 k 个最相似的结果
            threshold: 相似度阈值（低于此值的结果将被过滤）

        Returns:
            相似代码片段列表，按相似度排序
        """
        if not repository_embeddings.get('embeddings'):
            return []

        # 生成查询文本的嵌入向量
        query_embedding = self.embed(query, normalize=True)

        # 加载仓库嵌入向量并移动到相同设备
        repo_embeddings = torch.tensor(repository_embeddings['embeddings']).to(self.device)

        # 计算余弦相似度
        similarities = torch.nn.functional.cosine_similarity(
            query_embedding,
            repo_embeddings,
            dim=1
        )

        # 先过滤阈值，再取 top_k，确保不会因为先取 top_k 而遗漏符合条件的 markdown 文件
        # 获取所有超过阈值的结果
        valid_mask = similarities >= threshold
        valid_indices = torch.where(valid_mask)[0]
        valid_similarities = similarities[valid_indices]

        if len(valid_indices) == 0:
            return []

        # 对有效结果按相似度排序，取 top_k
        top_k_to_take = min(top_k, len(valid_indices))
        top_k_result = torch.topk(valid_similarities, top_k_to_take)
        top_k_local_indices = top_k_result.indices
        top_k_similarities = top_k_result.values
        top_k_global_indices = valid_indices[top_k_local_indices]

        # 构建结果
        results = []
        for idx, sim in zip(top_k_global_indices, top_k_similarities):
            sim_value = sim.item()
            chunk = repository_embeddings['chunks'][idx]
            results.append({
                'similarity': sim_value,
                'chunk': chunk,
                'rank': len(results) + 1
            })

        return results


def main():
    """主函数：演示模型的使用"""
    print("=" * 60)
    print("EmbeddingGemma-300m 模型本地部署示例")
    print("=" * 60)

    # 获取 token（从环境变量）
    token = os.getenv("HF_TOKEN") or os.getenv("HUGGING_FACE_HUB_TOKEN")

    if token:
        print("\n✓ 已配置 Hugging Face token")

    model = EmbeddingGemmaModel(token=token)

    # 示例文本
    texts = [
        "人工智能是计算机科学的一个分支",
        "机器学习是人工智能的核心技术",
        "今天天气真好，适合出去散步"
    ]

    print("\n正在生成文本嵌入...")
    embeddings = model.embed(texts)

    print(f"\n嵌入向量形状: {embeddings.shape}")
    print(f"嵌入向量维度: {embeddings.shape[1]}")

    # 计算相似度示例
    print("\n计算文本相似度...")
    similarity = model.compute_similarity(texts[0], texts[1])
    print(f"文本1 和文本2 的相似度: {similarity.item():.4f}")

    similarity = model.compute_similarity(texts[0], texts[2])
    print(f"文本1 和文本3 的相似度: {similarity.item():.4f}")

    # 单个文本嵌入示例
    print("\n单个文本嵌入示例...")
    single_embedding = model.embed("这是一个测试文本")
    print(f"单个文本嵌入向量形状: {single_embedding.shape}")

    print("\n" + "=" * 60)
    print("模型部署完成！")
    print("=" * 60)


if __name__ == "__main__":
    main()
