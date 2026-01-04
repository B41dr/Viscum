"""
FastAPI 服务：将 EmbeddingGemma 模型部署为 REST API
运行方式: uvicorn api:app --host 0.0.0.0 --port 8000
"""
import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from main import EmbeddingGemmaModel
from code_chunker import ChunkStrategy

app = FastAPI(title="EmbeddingGemma API", version="1.0.0")

# 全局模型实例（延迟加载）
_model: Optional[EmbeddingGemmaModel] = None


def get_model() -> EmbeddingGemmaModel:
    """获取或初始化模型实例（单例模式）"""
    global _model
    if _model is None:
        # 获取 token（从环境变量）
        token = os.getenv("HF_TOKEN") or os.getenv("HUGGING_FACE_HUB_TOKEN")
        _model = EmbeddingGemmaModel(token=token)
    return _model


class TextInput(BaseModel):
    """单个文本输入"""
    text: str
    normalize: Optional[bool] = True


class TextsInput(BaseModel):
    """多个文本输入"""
    texts: List[str]
    normalize: Optional[bool] = True


class SimilarityInput(BaseModel):
    """相似度计算输入"""
    text1: str
    text2: str


class RepositoryEmbedInput(BaseModel):
    """代码仓库嵌入输入"""
    repo_path: str
    chunk_strategy: Optional[str] = "mixed"  # function, class, line, char, mixed
    max_chunk_size: Optional[int] = 500
    batch_size: Optional[int] = 32
    normalize: Optional[bool] = True
    include_patterns: Optional[List[str]] = None
    exclude_patterns: Optional[List[str]] = None


class CodeSearchInput(BaseModel):
    """代码搜索输入"""
    query: str
    repository_embeddings: dict  # embed_repository 返回的结果
    top_k: Optional[int] = 5
    threshold: Optional[float] = 0.7


@app.get("/")
async def root():
    """根路径"""
    return {
        "message": "EmbeddingGemma API 服务",
        "model": "google/embeddinggemma-300m",
        "endpoints": {
            "/embed": "POST - 生成单个文本的嵌入向量",
            "/embed/batch": "POST - 批量生成文本嵌入向量",
            "/similarity": "POST - 计算两个文本的相似度",
            "/embed/repository": "POST - 对代码仓库进行分片并生成嵌入向量",
            "/code/search": "POST - 在代码仓库嵌入向量中搜索相似的代码片段",
            "/health": "GET - 健康检查"
        }
    }


@app.get("/health")
async def health():
    """健康检查"""
    try:
        model = get_model()
        return {
            "status": "healthy",
            "model": model.model_name,
            "device": model.device
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"模型未初始化: {str(e)}")


@app.post("/embed")
async def embed_text(input: TextInput):
    """
    生成单个文本的嵌入向量

    请求体示例:
    {
        "text": "这是一个测试文本",
        "normalize": true
    }
    """
    try:
        model = get_model()
        embedding = model.embed(input.text, normalize=input.normalize)

        return {
            "text": input.text,
            "embedding": embedding.squeeze().cpu().tolist(),
            "dimension": embedding.shape[1]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/embed/batch")
async def embed_batch(input: TextsInput):
    """
    批量生成文本嵌入向量

    请求体示例:
    {
        "texts": ["文本1", "文本2", "文本3"],
        "normalize": true
    }
    """
    try:
        model = get_model()
        embeddings = model.embed(input.texts, normalize=input.normalize)

        return {
            "count": len(input.texts),
            "embeddings": embeddings.cpu().tolist(),
            "dimension": embeddings.shape[1]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/similarity")
async def compute_similarity(input: SimilarityInput):
    """
    计算两个文本之间的余弦相似度

    请求体示例:
    {
        "text1": "人工智能是计算机科学的一个分支",
        "text2": "机器学习是人工智能的核心技术"
    }
    """
    try:
        model = get_model()
        similarity = model.compute_similarity(input.text1, input.text2)

        return {
            "text1": input.text1,
            "text2": input.text2,
            "similarity": similarity.item()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/embed/repository")
async def embed_repository(input: RepositoryEmbedInput):
    """
    对代码仓库进行分片并生成嵌入向量

    请求体示例:
    {
        "repo_path": "/path/to/repository",
        "chunk_strategy": "mixed",
        "max_chunk_size": 500,
        "batch_size": 32,
        "normalize": true,
        "include_patterns": ["*.py", "*.ts"],
        "exclude_patterns": ["node_modules", "__pycache__"]
    }
    """
    try:
        model = get_model()

        # 转换分片策略
        strategy_map = {
            "function": ChunkStrategy.FUNCTION,
            "class": ChunkStrategy.CLASS,
            "line": ChunkStrategy.LINE,
            "char": ChunkStrategy.CHAR,
            "mixed": ChunkStrategy.MIXED
        }
        chunk_strategy = strategy_map.get(input.chunk_strategy, ChunkStrategy.MIXED)

        result = model.embed_repository(
            repo_path=input.repo_path,
            chunk_strategy=chunk_strategy,
            max_chunk_size=input.max_chunk_size,
            batch_size=input.batch_size,
            normalize=input.normalize,
            include_patterns=input.include_patterns,
            exclude_patterns=input.exclude_patterns
        )

        return {
            "chunk_count": result["metadata"]["chunk_count"],
            "embedding_dim": result["metadata"]["embedding_dim"],
            "chunks": result["chunks"],
            "embeddings": result["embeddings"],
            "metadata": result["metadata"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/code/search")
async def search_code(input: CodeSearchInput):
    """
    在代码仓库嵌入向量中搜索相似的代码片段

    请求体示例:
    {
        "query": "如何初始化模型",
        "repository_embeddings": {
            "chunks": [...],
            "embeddings": [...],
            "metadata": {...}
        },
        "top_k": 5,
        "threshold": 0.7
    }
    """
    try:
        model = get_model()
        results = model.search_code(
            query=input.query,
            repository_embeddings=input.repository_embeddings,
            top_k=input.top_k,
            threshold=input.threshold
        )

        return {
            "query": input.query,
            "result_count": len(results),
            "results": [
                {
                    "similarity": res["similarity"],
                    "rank": res["rank"],
                    "chunk": res["chunk"]
                }
                for res in results
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
