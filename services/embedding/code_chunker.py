"""
代码仓库分片工具
支持多种分片策略：按函数/类、按行数、按字符数
"""
import ast
from pathlib import Path
from typing import List, Dict, Optional
from dataclasses import dataclass
from enum import Enum


class ChunkStrategy(Enum):
    """分片策略"""
    FUNCTION = "function"  # 按函数/方法分片
    CLASS = "class"  # 按类分片
    LINE = "line"  # 按行数分片
    CHAR = "char"  # 按字符数分片
    MIXED = "mixed"  # 混合策略（优先按函数/类，过大则按行数）


@dataclass
class CodeChunk:
    """代码分片"""
    content: str  # 分片内容
    file_path: str  # 文件路径
    start_line: int  # 起始行号
    end_line: int  # 结束行号
    chunk_type: str  # 分片类型（function, class, line, char等）
    metadata: Dict = None  # 额外元数据（函数名、类名等）

    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}


class CodeChunker:
    """代码分片器"""

    # 支持的代码文件扩展名
    CODE_EXTENSIONS = {
        '.py', '.ts', '.js', '.tsx', '.jsx',
        '.java', '.cpp', '.c', '.h', '.hpp',
        '.go', '.rs', '.rb', '.php', '.swift',
        '.kt', '.scala', '.cs', '.m', '.mm',
        '.md', '.vue'
    }

    # 排除的目录和文件
    EXCLUDE_PATTERNS = {
        '__pycache__', '.git', '.svn', 'node_modules',
        '.venv', 'venv', 'env', '.env',
        'dist', 'build', '.next', '.nuxt',
        '*.pyc', '*.pyo', '*.pyd', '*.so',
        '*.dll', '*.exe', '.DS_Store'
    }

    def __init__(
        self,
        chunk_strategy: ChunkStrategy = ChunkStrategy.MIXED,
        max_chunk_size: int = 500,  # 最大分片大小（行数或字符数）
        overlap: int = 0,  # 分片重叠行数
        min_chunk_size: int = 10  # 最小分片大小
    ):
        """
        初始化代码分片器

        Args:
            chunk_strategy: 分片策略
            max_chunk_size: 最大分片大小（行数或字符数，取决于策略）
            overlap: 分片重叠行数
            min_chunk_size: 最小分片大小（行数）
        """
        self.chunk_strategy = chunk_strategy
        self.max_chunk_size = max_chunk_size
        self.overlap = overlap
        self.min_chunk_size = min_chunk_size

    def chunk_repository(
        self,
        repo_path: str,
        include_patterns: Optional[List[str]] = None,
        exclude_patterns: Optional[List[str]] = None
    ) -> List[CodeChunk]:
        """
        对代码仓库进行分片

        Args:
            repo_path: 代码仓库路径
            include_patterns: 包含的文件模式（如 ['*.py', '*.ts']）
            exclude_patterns: 排除的文件模式

        Returns:
            代码分片列表
        """
        repo_path = Path(repo_path).resolve()
        if not repo_path.exists():
            raise ValueError(f"仓库路径不存在: {repo_path}")

        all_chunks = []
        exclude_set = set(self.EXCLUDE_PATTERNS)
        if exclude_patterns:
            exclude_set.update(exclude_patterns)

        # 遍历所有代码文件
        for file_path in self._find_code_files(repo_path, include_patterns, exclude_set):
            try:
                chunks = self.chunk_file(str(file_path))
                all_chunks.extend(chunks)
            except Exception as e:
                print(f"⚠️  处理文件失败 {file_path}: {e}")
                continue

        return all_chunks

    def _find_code_files(
        self,
        root: Path,
        include_patterns: Optional[List[str]],
        exclude_patterns: set
    ):
        """查找代码文件"""
        for item in root.rglob('*'):
            # 跳过排除的目录和文件
            item_parts = item.parts
            should_exclude = False

            for exclude in exclude_patterns:
                # 对于通配符模式（如 *.pyc），使用文件名匹配
                if '*' in exclude:
                    if item.is_file() and item.match(exclude):
                        should_exclude = True
                        break
                else:
                    # 对于目录/文件名，检查路径部分是否完全匹配
                    if exclude in item_parts:
                        should_exclude = True
                        break

            if should_exclude:
                continue

            if item.is_file():
                ext = item.suffix.lower()
                if ext in self.CODE_EXTENSIONS:
                    if include_patterns:
                        # 检查是否匹配包含模式
                        if not any(item.match(pattern) for pattern in include_patterns):
                            continue
                    yield item

    def chunk_file(self, file_path: str) -> List[CodeChunk]:
        """
        对单个文件进行分片

        Args:
            file_path: 文件路径

        Returns:
            代码分片列表
        """
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                lines = content.split('\n')
        except UnicodeDecodeError:
            # 尝试其他编码
            try:
                with open(file_path, 'r', encoding='latin-1') as f:
                    content = f.read()
                    lines = content.split('\n')
            except Exception as e:
                print(f"⚠️  无法读取文件 {file_path}: {e}")
                return []

        ext = Path(file_path).suffix.lower()

        # 根据策略选择分片方法
        if self.chunk_strategy == ChunkStrategy.FUNCTION:
            chunks = self._chunk_by_functions(content, lines, file_path, ext)
        elif self.chunk_strategy == ChunkStrategy.CLASS:
            chunks = self._chunk_by_classes(content, lines, file_path, ext)
        elif self.chunk_strategy == ChunkStrategy.LINE:
            chunks = self._chunk_by_lines(content, lines, file_path)
        elif self.chunk_strategy == ChunkStrategy.CHAR:
            chunks = self._chunk_by_chars(content, lines, file_path)
        elif self.chunk_strategy == ChunkStrategy.MIXED:
            chunks = self._chunk_mixed(content, lines, file_path, ext)
        else:
            chunks = self._chunk_by_lines(content, lines, file_path)

        return chunks

    def _chunk_by_lines(self, content: str, lines: List[str], file_path: str) -> List[CodeChunk]:
        """按行数分片"""
        chunks = []
        total_lines = len(lines)

        start = 0
        while start < total_lines:
            end = min(start + self.max_chunk_size, total_lines)
            chunk_lines = lines[start:end]
            chunk_content = '\n'.join(chunk_lines)

            # 对于小文件（总行数较少），即使分片小于 min_chunk_size 也保留
            # 避免小文件被完全过滤（如只有几行的配置文件或文档）
            if len(chunk_lines) >= self.min_chunk_size or total_lines <= self.min_chunk_size * 2:
                chunks.append(CodeChunk(
                    content=chunk_content,
                    file_path=file_path,
                    start_line=start + 1,
                    end_line=end,
                    chunk_type='line',
                    metadata={'total_lines': total_lines}
                ))

            # 处理重叠
            start = end - self.overlap

        return chunks

    def _chunk_by_chars(self, content: str, lines: List[str], file_path: str) -> List[CodeChunk]:
        """按字符数分片"""
        chunks = []
        total_chars = len(content)

        start = 0
        line_start = 0
        while start < total_chars:
            end = min(start + self.max_chunk_size, total_chars)
            chunk_content = content[start:end]

            # 计算对应的行号
            char_count = 0
            chunk_start_line = line_start + 1
            chunk_end_line = chunk_start_line

            for i, line in enumerate(lines[line_start:], start=line_start):
                if char_count >= end - start:
                    chunk_end_line = i
                    break
                char_count += len(line) + 1  # +1 for newline
                chunk_end_line = i + 1

            if len(chunk_content) >= self.min_chunk_size * 20:  # 粗略估计
                chunks.append(CodeChunk(
                    content=chunk_content,
                    file_path=file_path,
                    start_line=chunk_start_line,
                    end_line=chunk_end_line,
                    chunk_type='char',
                    metadata={'total_chars': total_chars}
                ))

            start = end - (self.overlap * 50)  # 粗略的字符重叠
            # 更新行起始位置
            char_count = 0
            for i, line in enumerate(lines[line_start:], start=line_start):
                if char_count >= start:
                    line_start = i
                    break
                char_count += len(line) + 1

        return chunks

    def _chunk_by_functions(self, content: str, lines: List[str], file_path: str, ext: str) -> List[CodeChunk]:
        """按函数/方法分片（语法感知）"""
        ext = ext.lower()
        chunks = []

        if ext == '.py':
            chunks = self._chunk_python_functions(content, lines, file_path)
        elif ext in ['.ts', '.js', '.tsx', '.jsx']:
            chunks = self._chunk_js_functions(content, lines, file_path)
        elif ext == '.vue':
            chunks = self._chunk_vue_components(content, lines, file_path)
        elif ext == '.md':
            chunks = self._chunk_markdown(content, lines, file_path)
        else:
            # 对于不支持的语言，回退到行数分片
            chunks = self._chunk_by_lines(content, lines, file_path)

        return chunks

    def _chunk_python_functions(self, content: str, lines: List[str], file_path: str) -> List[CodeChunk]:
        """Python 函数分片（使用 AST）"""
        chunks = []
        try:
            tree = ast.parse(content)
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    # 获取函数源代码
                    func_lines = content.split('\n')
                    start_line = node.lineno - 1  # AST 行号从1开始
                    end_line = node.end_lineno if hasattr(node, 'end_lineno') else start_line + 10

                    func_content = '\n'.join(func_lines[start_line:end_line])
                    func_name = node.name

                    # 如果函数太大，内部再分片
                    if len(func_lines[start_line:end_line]) > self.max_chunk_size:
                        sub_chunks = self._chunk_by_lines(
                            func_content, func_lines[start_line:end_line], file_path
                        )
                        for chunk in sub_chunks:
                            chunk.chunk_type = 'function'
                            chunk.metadata['function_name'] = func_name
                            chunk.metadata['is_large_function'] = True
                        chunks.extend(sub_chunks)
                    else:
                        chunks.append(CodeChunk(
                            content=func_content,
                            file_path=file_path,
                            start_line=start_line + 1,
                            end_line=end_line,
                            chunk_type='function',
                            metadata={'function_name': func_name}
                        ))

                elif isinstance(node, ast.ClassDef):
                    # 处理类（包含所有方法）
                    class_lines = content.split('\n')
                    start_line = node.lineno - 1
                    end_line = node.end_lineno if hasattr(node, 'end_lineno') else start_line + 50

                    class_content = '\n'.join(class_lines[start_line:end_line])
                    class_name = node.name

                    if len(class_lines[start_line:end_line]) > self.max_chunk_size:
                        sub_chunks = self._chunk_by_lines(
                            class_content, class_lines[start_line:end_line], file_path
                        )
                        for chunk in sub_chunks:
                            chunk.chunk_type = 'class'
                            chunk.metadata['class_name'] = class_name
                            chunk.metadata['is_large_class'] = True
                        chunks.extend(sub_chunks)
                    else:
                        chunks.append(CodeChunk(
                            content=class_content,
                            file_path=file_path,
                            start_line=start_line + 1,
                            end_line=end_line,
                            chunk_type='class',
                            metadata={'class_name': class_name}
                        ))

        except SyntaxError:
            # 如果解析失败，回退到行数分片
            return self._chunk_by_lines(content, lines, file_path)

        # 如果没有找到函数/类，使用行数分片处理剩余代码
        if not chunks:
            chunks = self._chunk_by_lines(content, lines, file_path)

        return chunks

    def _chunk_js_functions(self, content: str, lines: List[str], file_path: str) -> List[CodeChunk]:
        """JavaScript/TypeScript 函数分片（使用正则表达式）"""
        # TODO: 完整的 JavaScript/TypeScript AST 解析需要额外依赖（如 @babel/parser）
        # 目前使用简单的行数分片策略
        # 可以后续使用以下模式实现：
        # - 函数声明: (?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(
        # - 箭头函数: (?:export\s+)?const\s+(\w+)\s*[:=]\s*(?:async\s*)?\([^)]*\)\s*=>
        # - 类方法: \s+(\w+)\s*\([^)]*\)\s*\{
        # - 类定义: (?:export\s+)?class\s+(\w+)
        return self._chunk_by_lines(content, lines, file_path)

    def _chunk_by_classes(self, content: str, lines: List[str], file_path: str, ext: str) -> List[CodeChunk]:
        """按类分片"""
        if ext == '.py':
            return self._chunk_python_classes(content, lines, file_path)
        elif ext == '.vue':
            # Vue 文件按块分片（template, script, style）
            return self._chunk_vue_components(content, lines, file_path)
        else:
            return self._chunk_by_lines(content, lines, file_path)

    def _chunk_python_classes(self, content: str, lines: List[str], file_path: str) -> List[CodeChunk]:
        """Python 类分片"""
        chunks = []
        try:
            tree = ast.parse(content)
            for node in ast.walk(tree):
                if isinstance(node, ast.ClassDef):
                    class_lines = content.split('\n')
                    start_line = node.lineno - 1
                    end_line = node.end_lineno if hasattr(node, 'end_lineno') else start_line + 100

                    class_content = '\n'.join(class_lines[start_line:end_line])
                    class_name = node.name

                    if len(class_lines[start_line:end_line]) > self.max_chunk_size:
                        sub_chunks = self._chunk_by_lines(
                            class_content, class_lines[start_line:end_line], file_path
                        )
                        for chunk in sub_chunks:
                            chunk.chunk_type = 'class'
                            chunk.metadata['class_name'] = class_name
                            chunk.metadata['is_large_class'] = True
                        chunks.extend(sub_chunks)
                    else:
                        chunks.append(CodeChunk(
                            content=class_content,
                            file_path=file_path,
                            start_line=start_line + 1,
                            end_line=end_line,
                            chunk_type='class',
                            metadata={'class_name': class_name}
                        ))
        except SyntaxError:
            return self._chunk_by_lines(content, lines, file_path)

        if not chunks:
            chunks = self._chunk_by_lines(content, lines, file_path)

        return chunks

    def _chunk_mixed(self, content: str, lines: List[str], file_path: str, ext: str) -> List[CodeChunk]:
        """混合策略：优先按函数/类，过大则按行数分片"""
        # 先尝试按函数/类分片
        func_chunks = self._chunk_by_functions(content, lines, file_path, ext)

        # 如果分片结果太大，对每个分片再次按行数分片
        final_chunks = []
        for chunk in func_chunks:
            chunk_lines = chunk.content.split('\n')
            if len(chunk_lines) > self.max_chunk_size:
                # 对大的分片进行二次分片
                sub_chunks = self._chunk_by_lines(chunk.content, chunk_lines, file_path)
                for sub_chunk in sub_chunks:
                    # 保留原始元数据
                    sub_chunk.metadata.update(chunk.metadata)
                    sub_chunk.chunk_type = chunk.chunk_type
                final_chunks.extend(sub_chunks)
            else:
                final_chunks.append(chunk)

        return final_chunks if final_chunks else self._chunk_by_lines(content, lines, file_path)

    def _chunk_markdown(self, content: str, lines: List[str], file_path: str) -> List[CodeChunk]:
        """Markdown 文件分片（按标题和代码块）"""
        import re
        chunks = []

        # 查找所有标题（# 开头）和代码块的位置
        heading_pattern = re.compile(r'^(#{1,6})\s+(.+)$')
        code_block_pattern = re.compile(r'^```')

        sections = []
        current_section = {
            'start_line': 0,
            'title': None,
            'level': 0,
            'content': []
        }

        in_code_block = False
        code_block_lang = None

        for i, line in enumerate(lines):
            # 检查代码块开始/结束
            if code_block_pattern.match(line.strip()):
                in_code_block = not in_code_block
                if in_code_block:
                    # 提取语言标识符（用于元数据）
                    lang_match = re.match(r'^```(\w+)?', line.strip())
                    code_block_lang = lang_match.group(1) if lang_match else None
                    # 将代码块语言信息添加到当前章节的元数据中
                    if 'code_blocks' not in current_section:
                        current_section['code_blocks'] = []
                    current_section['code_blocks'].append(code_block_lang)
                current_section['content'].append(line)
                continue

            # 检查标题
            heading_match = heading_pattern.match(line)
            if heading_match and not in_code_block:
                # 保存当前章节（对于 markdown，降低最小分片要求，避免小章节被完全过滤）
                # 即使章节很小，也应该保留，因为可能包含重要信息
                if current_section['content']:
                    sections.append(current_section.copy())

                # 开始新章节
                level = len(heading_match.group(1))
                title = heading_match.group(2).strip()
                current_section = {
                    'start_line': i,
                    'title': title,
                    'level': level,
                    'content': [line]
                }
            else:
                current_section['content'].append(line)

        # 保存最后一个章节（同样，即使很小也保留）
        if current_section['content']:
            sections.append(current_section)

        # 如果没有找到标题，按段落分片
        if not sections:
            return self._chunk_by_lines(content, lines, file_path)

        # 创建分片
        for section in sections:
            section_content = '\n'.join(section['content'])
            section_lines = section['content']
            start_line = section['start_line'] + 1
            end_line = section['start_line'] + len(section_lines)

            # 构建元数据
            metadata = {
                'section_title': section['title'],
                'section_level': section['level']
            }
            if 'code_blocks' in section:
                metadata['code_blocks'] = section['code_blocks']

            # 如果章节太大，进一步分片
            if len(section_lines) > self.max_chunk_size:
                sub_chunks = self._chunk_by_lines(section_content, section_lines, file_path)
                for chunk in sub_chunks:
                    chunk.chunk_type = 'markdown_section'
                    chunk.metadata.update(metadata)
                chunks.extend(sub_chunks)
            else:
                chunks.append(CodeChunk(
                    content=section_content,
                    file_path=file_path,
                    start_line=start_line,
                    end_line=end_line,
                    chunk_type='markdown_section',
                    metadata=metadata
                ))

        return chunks if chunks else self._chunk_by_lines(content, lines, file_path)

    def _chunk_vue_components(self, content: str, lines: List[str], file_path: str) -> List[CodeChunk]:
        """Vue 文件分片（按 template、script、style 块）"""
        import re
        chunks = []

        # 匹配 Vue 单文件组件的三个主要块
        template_pattern = re.compile(r'<template[^>]*>', re.IGNORECASE)
        script_pattern = re.compile(r'<script[^>]*>', re.IGNORECASE)
        style_pattern = re.compile(r'<style[^>]*>', re.IGNORECASE)
        closing_tag_pattern = re.compile(r'</(template|script|style)>', re.IGNORECASE)

        # 查找所有块的开始和结束位置
        blocks = []
        current_block = None
        block_start = None

        for i, line in enumerate(lines):
            # 检查 template 开始
            if template_pattern.search(line):
                if current_block:
                    blocks.append({
                        'type': current_block,
                        'start_line': block_start,
                        'end_line': i - 1,
                        'content': '\n'.join(lines[block_start:i])
                    })
                current_block = 'template'
                block_start = i
                continue

            # 检查 script 开始
            if script_pattern.search(line):
                if current_block:
                    # 找到当前块的结束标签
                    end_line = self._find_closing_tag(lines, i - 1, current_block)
                    blocks.append({
                        'type': current_block,
                        'start_line': block_start,
                        'end_line': end_line,
                        'content': '\n'.join(lines[block_start:end_line + 1])
                    })
                current_block = 'script'
                block_start = i
                continue

            # 检查 style 开始
            if style_pattern.search(line):
                if current_block:
                    end_line = self._find_closing_tag(lines, i - 1, current_block)
                    blocks.append({
                        'type': current_block,
                        'start_line': block_start,
                        'end_line': end_line,
                        'content': '\n'.join(lines[block_start:end_line + 1])
                    })
                current_block = 'style'
                block_start = i
                continue

            # 检查结束标签
            if current_block and closing_tag_pattern.search(line):
                if closing_tag_pattern.search(line).group(1).lower() == current_block:
                    blocks.append({
                        'type': current_block,
                        'start_line': block_start,
                        'end_line': i,
                        'content': '\n'.join(lines[block_start:i + 1])
                    })
                    current_block = None
                    block_start = None

        # 如果没有找到块，使用行数分片
        if not blocks:
            return self._chunk_by_lines(content, lines, file_path)

        # 为每个块创建分片
        for block in blocks:
            block_lines = lines[block['start_line']:block['end_line'] + 1]
            start_line = block['start_line'] + 1
            end_line = block['end_line'] + 1

            # 提取块属性（如 lang, setup 等）
            block_attrs = self._extract_vue_block_attrs(block['content'])

            # 如果块太大，进一步分片
            if len(block_lines) > self.max_chunk_size:
                sub_chunks = self._chunk_by_lines(block['content'], block_lines, file_path)
                for chunk in sub_chunks:
                    chunk.chunk_type = f'vue_{block["type"]}'
                    chunk.metadata.update(block_attrs)
                    chunk.metadata['block_type'] = block['type']
                chunks.extend(sub_chunks)
            else:
                chunks.append(CodeChunk(
                    content=block['content'],
                    file_path=file_path,
                    start_line=start_line,
                    end_line=end_line,
                    chunk_type=f'vue_{block["type"]}',
                    metadata={
                        'block_type': block['type'],
                        **block_attrs
                    }
                ))

        return chunks if chunks else self._chunk_by_lines(content, lines, file_path)

    def _find_closing_tag(self, lines: List[str], start_line: int, block_type: str) -> int:
        """查找 Vue 块的结束标签行号"""
        import re
        closing_pattern = re.compile(rf'</{block_type}>', re.IGNORECASE)

        for i in range(start_line, len(lines)):
            if closing_pattern.search(lines[i]):
                return i

        # 如果没找到，返回最后一行
        return len(lines) - 1

    def _extract_vue_block_attrs(self, block_content: str) -> Dict:
        """提取 Vue 块的属性（如 lang, setup 等）"""
        import re
        attrs = {}

        # 提取开始标签的属性
        tag_match = re.search(r'<(template|script|style)([^>]*)>', block_content, re.IGNORECASE)
        if tag_match:
            attrs_str = tag_match.group(2)
            # 提取 lang 属性
            lang_match = re.search(r'lang=["\']?(\w+)["\']?', attrs_str, re.IGNORECASE)
            if lang_match:
                attrs['lang'] = lang_match.group(1)

            # 检查是否有 setup
            if 'setup' in attrs_str.lower():
                attrs['setup'] = True

            # 检查是否有 scoped
            if 'scoped' in attrs_str.lower():
                attrs['scoped'] = True

        return attrs
