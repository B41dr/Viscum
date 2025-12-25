#!/bin/bash

# 性能统计脚本
# 展示项目体积、文件数量、代码行数等相关信息

echo "=========================================="
echo "📊 项目性能统计报告"
echo "=========================================="
echo ""

# 获取项目根目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# 1. 统计 src 目录信息
echo "📁 src 目录统计"
echo "----------------------------------------"

# 文件数量
FILE_COUNT=$(find src -type f | wc -l | tr -d ' ')
echo "  文件数量: $FILE_COUNT"

# 字符数（字节数）
CHAR_COUNT=$(find src -type f -exec wc -c {} + 2>/dev/null | tail -1 | awk '{print $1}')
if [ -z "$CHAR_COUNT" ]; then
  CHAR_COUNT=0
fi
CHAR_KB=$(echo "scale=2; $CHAR_COUNT / 1024" | bc)
CHAR_MB=$(echo "scale=4; $CHAR_COUNT / 1024 / 1024" | bc)
echo "  字符数: $CHAR_COUNT 字节 (${CHAR_KB} KB / ${CHAR_MB} MB)"

# 磁盘占用
DISK_USAGE=$(du -sh src 2>/dev/null | awk '{print $1}')
echo "  磁盘占用: $DISK_USAGE"

# 代码行数
LINE_COUNT=$(find src -type f -exec wc -l {} + 2>/dev/null | tail -1 | awk '{print $1}')
if [ -z "$LINE_COUNT" ]; then
  LINE_COUNT=0
fi
echo "  代码行数: $LINE_COUNT"
echo ""

# 2. 按文件类型统计
echo "📄 按文件类型统计"
echo "----------------------------------------"

# TypeScript 文件
TS_FILES=$(find src -type f -name "*.ts" | wc -l | tr -d ' ')
TS_SIZE=$(find src -type f -name "*.ts" -exec wc -c {} + 2>/dev/null | tail -1 | awk '{print $1}')
if [ -z "$TS_SIZE" ]; then
  TS_SIZE=0
fi
TS_KB=$(echo "scale=2; $TS_SIZE / 1024" | bc)
echo "  TypeScript (.ts): $TS_FILES 个文件, ${TS_KB} KB"

# Markdown 文件
MD_FILES=$(find src -type f -name "*.md" | wc -l | tr -d ' ')
MD_SIZE=$(find src -type f -name "*.md" -exec wc -c {} + 2>/dev/null | tail -1 | awk '{print $1}')
if [ -z "$MD_SIZE" ]; then
  MD_SIZE=0
fi
MD_KB=$(echo "scale=2; $MD_SIZE / 1024" | bc)
echo "  Markdown (.md): $MD_FILES 个文件, ${MD_KB} KB"
echo ""

# 3. 按目录统计
echo "📂 按目录统计"
echo "----------------------------------------"
for dir in $(find src -type d | sort); do
  if [ "$dir" != "src" ]; then
    DIR_FILES=$(find "$dir" -maxdepth 1 -type f | wc -l | tr -d ' ')
    if [ "$DIR_FILES" -gt 0 ]; then
      DIR_SIZE=$(find "$dir" -maxdepth 1 -type f -exec wc -c {} + 2>/dev/null | tail -1 | awk '{print $1}')
      if [ -z "$DIR_SIZE" ]; then
        DIR_SIZE=0
      fi
      DIR_KB=$(echo "scale=2; $DIR_SIZE / 1024" | bc)
      REL_DIR=${dir#src/}
      echo "  $REL_DIR: $DIR_FILES 个文件, ${DIR_KB} KB"
    fi
  fi
done
echo ""

# 4. 最大文件 Top 5
echo "🔝 最大的 5 个文件"
echo "----------------------------------------"
find src -type f -exec ls -lh {} \; | sort -k5 -hr | head -5 | awk '{printf "  %-50s %8s\n", $9, $5}'
echo ""

# 5. 项目总体信息
echo "📦 项目总体信息"
echo "----------------------------------------"
# 计算项目总大小（排除 node_modules 和 logs）
# 使用 find 找到所有一级目录和文件，排除 node_modules、logs 和当前目录本身
TOTAL_BYTES=$(find . -maxdepth 1 ! -name . ! -name node_modules ! -name logs -exec du -sk {} + 2>/dev/null | awk '{sum+=$1} END {print sum*1024}')
if [ -n "$TOTAL_BYTES" ] && [ "$TOTAL_BYTES" -gt 0 ]; then
  # 转换为人类可读格式
  TOTAL_SIZE=$(echo "$TOTAL_BYTES" | awk '{
    if ($1 >= 1073741824) printf "%.2fG", $1/1073741824
    else if ($1 >= 1048576) printf "%.2fM", $1/1048576
    else if ($1 >= 1024) printf "%.2fK", $1/1024
    else printf "%dB", $1
  }')
  echo "  项目总大小（排除 node_modules 和 logs）: $TOTAL_SIZE"

  # 显示主要组成部分
  SRC_SIZE=$(du -sh src 2>/dev/null | awk '{print $1}')
  echo "  - src 目录: $SRC_SIZE"

  # 检查锁定文件
  if [ -f bun.lock ]; then
    LOCK_SIZE=$(du -sh bun.lock 2>/dev/null | awk '{print $1}')
    echo "  - bun.lock: $LOCK_SIZE"
  elif [ -f package-lock.json ]; then
    LOCK_SIZE=$(du -sh package-lock.json 2>/dev/null | awk '{print $1}')
    echo "  - package-lock.json: $LOCK_SIZE"
  elif [ -f yarn.lock ]; then
    LOCK_SIZE=$(du -sh yarn.lock 2>/dev/null | awk '{print $1}')
    echo "  - yarn.lock: $LOCK_SIZE"
  elif [ -f pnpm-lock.yaml ]; then
    LOCK_SIZE=$(du -sh pnpm-lock.yaml 2>/dev/null | awk '{print $1}')
    echo "  - pnpm-lock.yaml: $LOCK_SIZE"
  fi
else
  # 备用方法：显示包含 node_modules 的总大小
  TOTAL_SIZE=$(du -sh . 2>/dev/null | awk '{print $1}')
  echo "  项目总大小: $TOTAL_SIZE"
fi
echo ""

echo "=========================================="
echo "✅ 统计完成"
echo "=========================================="
