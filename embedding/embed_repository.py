"""
代码仓库嵌入示例脚本
演示如何使用 EmbeddingGemma 模型对代码仓库进行分片和嵌入
"""
import os
import sys
import json
from pathlib import Path
from main import EmbeddingGemmaModel
from code_chunker import ChunkStrategy


def main():
    # 获取 token（从环境变量）
    token = os.getenv("HF_TOKEN") or os.getenv("HUGGING_FACE_HUB_TOKEN")

    if token:
        print("\n✓ 已配置 Hugging Face token")

    # 初始化模型
    print("\n正在加载模型...")
    model = EmbeddingGemmaModel(token=token)
    print("\n模型加载完成")

    # 获取仓库路径（默认使用当前目录的上级目录，即项目根目录）
    repo_path = str(Path(__file__).parent.parent.resolve())

    # 获取查询内容（可选，从命令行参数获取）
    query = None
    if len(sys.argv) >= 2:
        first_arg = sys.argv[1]
        # 检查第一个参数是否是路径
        is_path = False
        try:
            path_obj = Path(first_arg)
            if path_obj.exists() and path_obj.is_dir():
                is_path = True
            elif first_arg.startswith('/') or first_arg.startswith('./') or first_arg.startswith('../'):
                # 尝试解析路径
                if path_obj.exists():
                    is_path = True
        except (ValueError, OSError):
            pass

        if is_path:
            # 第一个参数是路径
            repo_path = first_arg
            # 剩余参数作为查询内容
            if len(sys.argv) > 2:
                query = ' '.join(sys.argv[2:])
        else:
            # 第一个参数不是路径，所有参数都作为查询内容（支持带空格的查询）
            query = ' '.join(sys.argv[1:])

    print(f"\n代码仓库路径: {repo_path}")

    # 对仓库进行嵌入
    result = model.embed_repository(
        repo_path=repo_path,
        chunk_strategy=ChunkStrategy.MIXED,  # 混合策略
        max_chunk_size=300,  # 最大300行
        batch_size=16,  # 批处理大小
        normalize=True,
        include_patterns=['*.py', '*.ts', '*.md', '*.vue'],  # 处理 Python、TypeScript、Markdown 和 Vue 文件
        exclude_patterns=['node_modules', '__pycache__', '.git'],
        save_path='repository_embeddings.json'  # 保存结果
    )

    print("\n✓ 嵌入完成！")
    print(f"代码分片数量: {result['metadata']['chunk_count']}")
    print(f"嵌入向量维度: {result['metadata']['embedding_dim']}")
    print(f"分片策略: {result['metadata']['chunk_strategy']}")
    print("结果已保存到: repository_embeddings.json")

    # 如果提供了查询内容，执行搜索
    if query:
        print(f"\n正在搜索: {query}")
        search_results = model.search_code(
            query=query,
            repository_embeddings=result,
            top_k=5,
            threshold=0.5
        )

        # 格式化结果为 JSON
        json_results = []
        for res in search_results:
            chunk = res['chunk']
            # 获取预览（前3行或前200个字符）
            preview_lines = chunk['content'].split('\n')[:3]
            preview = '\n'.join(preview_lines)
            if len(preview) > 200:
                preview = preview[:200] + '...'

            json_results.append({
                'rating': round(res['similarity'], 4),
                'file': chunk['file_path'],
                'range': f"{chunk['start_line']}-{chunk['end_line']}",
                'type': chunk['chunk_type'],
                'preview': preview
            })

        # 输出 JSON 结果
        print("\n搜索结果:")
        print(json.dumps(json_results, ensure_ascii=False, indent=2))
    else:
        print("\n提示: 如需搜索，请运行: python embed_repository.py <查询内容> [仓库路径]")


if __name__ == "__main__":
    main()
