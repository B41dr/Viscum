#!/bin/bash

# 性能统计脚本
# 展示项目体积、文件数量、代码行数等相关信息

# 获取项目根目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# 颜色定义（如果终端支持）
if [ -t 1 ]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  CYAN='\033[0;36m'
  BOLD='\033[1m'
  NC='\033[0m' # No Color
else
  RED=''
  GREEN=''
  YELLOW=''
  BLUE=''
  CYAN=''
  BOLD=''
  NC=''
fi

# ============================================================================
# 工具函数
# ============================================================================

# 打印分隔线
print_separator() {
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# 打印标题
print_title() {
  echo ""
  echo -e "${BOLD}${CYAN}$1${NC}"
  print_separator
}

# 打印键值对
print_kv() {
  printf "  ${BOLD}%-25s${NC} %s\n" "$1:" "$2"
}

# 打印小节标题
print_section() {
  echo ""
  echo -e "  ${YELLOW}▶${NC} $1"
}

# 转换为人类可读格式
format_size() {
  local bytes=$1
  if [ "$bytes" -ge 1073741824 ]; then
    echo "$(echo "scale=2; $bytes/1073741824" | bc)G"
  elif [ "$bytes" -ge 1048576 ]; then
    echo "$(echo "scale=2; $bytes/1048576" | bc)M"
  elif [ "$bytes" -ge 1024 ]; then
    echo "$(echo "scale=2; $bytes/1024" | bc)K"
  else
    echo "${bytes}B"
  fi
}

# 计算目录大小（排除指定目录）
calculate_dir_size() {
  local dir=$1
  local exclude_dirs=("${@:2}")

  if [ ! -d "$dir" ]; then
    echo "0"
    return
  fi

  local total_kb=$(du -sk "$dir" 2>/dev/null | awk '{print $1}')
  [ -z "$total_kb" ] && total_kb=0

  for exclude in "${exclude_dirs[@]}"; do
    if [ -d "$dir/$exclude" ]; then
      local exclude_kb=$(du -sk "$dir/$exclude" 2>/dev/null | awk '{print $1}')
      [ -n "$exclude_kb" ] && total_kb=$((total_kb - exclude_kb))
    fi
  done

  echo "$total_kb"
}

# 统计代码目录
stat_code_dir() {
  local dir=$1
  local name=$2

  if [ ! -d "$dir" ]; then
    return
  fi

  local file_count=$(find "$dir" -type f ! -path "*/node_modules/*" ! -path "*/.next/*" ! -path "*/logs/*" 2>/dev/null | wc -l | tr -d ' ')
  local line_count=$(find "$dir" -type f ! -path "*/node_modules/*" ! -path "*/.next/*" ! -path "*/logs/*" -exec wc -l {} + 2>/dev/null | tail -1 | awk '{print $1}')
  [ -z "$line_count" ] && line_count=0
  local dir_size=$(du -sh "$dir" 2>/dev/null | awk '{print $1}')

  if [ "$file_count" -gt 0 ]; then
    print_kv "  $name" "$dir_size | ${file_count} 个文件 | ${line_count} 行代码"
  fi
}

# 统计 TypeScript 项目
stat_ts_project() {
  local dir=$1
  local name=$2

  if [ ! -d "$dir" ]; then
    return
  fi

  print_title "$name"

  # 文件统计
  local file_count=$(find "$dir" -type f -name "*.ts" -o -name "*.tsx" 2>/dev/null | grep -v node_modules | wc -l | tr -d ' ')
  local line_count=$(find "$dir" -type f \( -name "*.ts" -o -name "*.tsx" \) ! -path "*/node_modules/*" ! -path "*/logs/*" -exec wc -l {} + 2>/dev/null | tail -1 | awk '{print $1}')
  [ -z "$line_count" ] && line_count=0
  local dir_size=$(du -sh "$dir" 2>/dev/null | awk '{print $1}')

  print_section "文件统计"
  print_kv "总文件数" "$file_count"
  print_kv "代码行数" "$line_count"
  print_kv "磁盘占用" "$dir_size"

  # 文件类型统计
  local ts_files=$(find "$dir" -type f -name "*.ts" ! -path "*/node_modules/*" ! -path "*/logs/*" 2>/dev/null | wc -l | tr -d ' ')
  local tsx_files=$(find "$dir" -type f -name "*.tsx" ! -path "*/node_modules/*" ! -path "*/logs/*" 2>/dev/null | wc -l | tr -d ' ')

  if [ "$ts_files" -gt 0 ] || [ "$tsx_files" -gt 0 ]; then
    print_section "文件类型"
    [ "$ts_files" -gt 0 ] && print_kv "TypeScript (.ts)" "$ts_files 个文件"
    [ "$tsx_files" -gt 0 ] && print_kv "TSX (.tsx)" "$tsx_files 个文件"
  fi

  # 最大文件 Top 5
  print_section "最大文件 (Top 5)"
  local large_files=$(find "$dir" -type f \( -name "*.ts" -o -name "*.tsx" \) ! -path "*/node_modules/*" ! -path "*/logs/*" -exec ls -lh {} \; 2>/dev/null | sort -k5 -hr | head -5)
  if [ -n "$large_files" ]; then
    echo "$large_files" | awk -v cyan="${CYAN}" -v green="${GREEN}" -v nc="${NC}" '{printf "    %s%-45s%s %s%8s%s\n", cyan, $9, nc, green, $5, nc}'
  else
    echo "    (无文件)"
  fi
}

# 统计 Python 项目
stat_python_project() {
  local dir=$1
  local name=$2

  if [ ! -d "$dir" ]; then
    return
  fi

  print_title "$name"

  # 文件统计
  local file_count=$(find "$dir" -type f -name "*.py" 2>/dev/null | wc -l | tr -d ' ')
  local line_count=$(find "$dir" -type f -name "*.py" -exec wc -l {} + 2>/dev/null | tail -1 | awk '{print $1}')
  [ -z "$line_count" ] && line_count=0
  local dir_size=$(du -sh "$dir" 2>/dev/null | awk '{print $1}')

  print_section "文件统计"
  print_kv "总文件数" "$file_count"
  print_kv "代码行数" "$line_count"
  print_kv "磁盘占用" "$dir_size"

  if [ "$file_count" -gt 0 ]; then
    # 文件类型统计
    print_section "文件类型"
    print_kv "Python (.py)" "$file_count 个文件"

    # 最大文件 Top 5
    print_section "最大文件 (Top 5)"
    local large_files=$(find "$dir" -type f -name "*.py" -exec ls -lh {} \; 2>/dev/null | sort -k5 -hr | head -5)
    if [ -n "$large_files" ]; then
      echo "$large_files" | awk -v cyan="${CYAN}" -v green="${GREEN}" -v nc="${NC}" '{printf "    %s%-45s%s %s%8s%s\n", cyan, $9, nc, green, $5, nc}'
    else
      echo "    (无文件)"
    fi
  fi
}

clear

# ============================================================================
# 1. 项目概览
# ============================================================================

print_title "📋 项目概览"

# 计算项目总大小（排除 node_modules、.next 和 logs）
TOTAL_BYTES=0

# Web 项目
WEB_SIZE_KB=$(calculate_dir_size "web" "node_modules" ".next")
TOTAL_BYTES=$((TOTAL_BYTES + WEB_SIZE_KB * 1024))

# Server 项目
SERVER_SIZE_KB=$(calculate_dir_size "server" "node_modules" "logs")
TOTAL_BYTES=$((TOTAL_BYTES + SERVER_SIZE_KB * 1024))

# Services 项目
SERVICES_SIZE_KB=$(calculate_dir_size "services" "node_modules")
TOTAL_BYTES=$((TOTAL_BYTES + SERVICES_SIZE_KB * 1024))

# 其他目录（scripts, 配置文件等）
for item in scripts package.json tsconfig.json turbo.json tsconfig.base.json bun.lock; do
  if [ -e "$item" ]; then
    ITEM_SIZE=$(du -sk "$item" 2>/dev/null | awk '{print $1}')
    [ -n "$ITEM_SIZE" ] && TOTAL_BYTES=$((TOTAL_BYTES + ITEM_SIZE * 1024))
  fi
done

TOTAL_SIZE=$(format_size $TOTAL_BYTES)

echo -e "  ${BOLD}项目总大小:${NC} ${GREEN}${TOTAL_SIZE}${NC} (排除依赖和构建产物)"
echo ""
echo -e "  ${CYAN}主要代码目录:${NC}"

# 统计各个工作空间
stat_code_dir "server" "server/"
stat_code_dir "web/src" "web/src/"
stat_code_dir "services/embedding" "services/embedding/"

# ============================================================================
# 2. Server 项目统计
# ============================================================================

stat_ts_project "server" "💻 Server 项目统计 (server/)"

# ============================================================================
# 3. Web 项目统计
# ============================================================================

if [ -d "web" ]; then
  print_title "🌐 Web 项目统计 (web/)"

  WEB_SIZE_FORMATTED=$(format_size $((WEB_SIZE_KB * 1024)))
  WEB_SRC_SIZE=$(du -sh web/src 2>/dev/null | awk '{print $1}')
  WEB_PUBLIC_SIZE=$(du -sh web/public 2>/dev/null | awk '{print $1}')
  WEB_CONFIG_FILES=$(find web -maxdepth 1 -type f \( -name "*.json" -o -name "*.ts" -o -name "*.js" -o -name "*.mjs" \) 2>/dev/null | wc -l | tr -d ' ')

  WEB_SRC_FILE_COUNT=$(find web/src -type f ! -path "*/node_modules/*" ! -path "*/.next/*" 2>/dev/null | wc -l | tr -d ' ')
  WEB_SRC_LINE_COUNT=$(find web/src -type f ! -path "*/node_modules/*" ! -path "*/.next/*" -exec wc -l {} + 2>/dev/null | tail -1 | awk '{print $1}')
  [ -z "$WEB_SRC_LINE_COUNT" ] && WEB_SRC_LINE_COUNT=0

  echo -e "  ${BOLD}源代码大小:${NC} ${GREEN}${WEB_SIZE_FORMATTED}${NC} (排除 node_modules 和 .next)"
  echo ""
  print_kv "web/src/" "$WEB_SRC_SIZE | ${WEB_SRC_FILE_COUNT} 个文件 | ${WEB_SRC_LINE_COUNT} 行代码"
  print_kv "web/public/" "$WEB_PUBLIC_SIZE"
  print_kv "配置文件" "${WEB_CONFIG_FILES} 个"

  # 显示 web 目录中的主要文件类型
  if [ "$WEB_SRC_FILE_COUNT" -gt 0 ]; then
    WEB_TSX_FILES=$(find web/src -type f -name "*.tsx" ! -path "*/node_modules/*" 2>/dev/null | wc -l | tr -d ' ')
    WEB_TS_FILES=$(find web/src -type f -name "*.ts" ! -path "*/node_modules/*" 2>/dev/null | wc -l | tr -d ' ')
    WEB_CSS_FILES=$(find web/src -type f -name "*.css" ! -path "*/node_modules/*" 2>/dev/null | wc -l | tr -d ' ')

    print_section "文件类型"
    [ "$WEB_TSX_FILES" -gt 0 ] && print_kv "TSX 组件" "$WEB_TSX_FILES 个"
    [ "$WEB_TS_FILES" -gt 0 ] && print_kv "TypeScript" "$WEB_TS_FILES 个"
    [ "$WEB_CSS_FILES" -gt 0 ] && print_kv "CSS 样式" "$WEB_CSS_FILES 个"
  fi
fi

# ============================================================================
# 4. Services 项目统计
# ============================================================================

stat_python_project "services/embedding" "🐍 Embedding 服务统计 (services/embedding/)"

# ============================================================================
# 6. 项目组成
# ============================================================================

print_title "📦 项目组成"

# 主要目录大小
print_section "主要目录"
[ -d "server" ] && echo -e "    ${CYAN}server/${NC}              ${GREEN}$(format_size $((SERVER_SIZE_KB * 1024)))${NC}"
[ -d "web" ] && echo -e "    ${CYAN}web/${NC}                ${GREEN}$(format_size $((WEB_SIZE_KB * 1024)))${NC}"
[ -d "services/embedding" ] && echo -e "    ${CYAN}services/embedding/${NC}  ${GREEN}$(du -sh services/embedding 2>/dev/null | awk '{print $1}')${NC}"
[ -d "scripts" ] && echo -e "    ${CYAN}scripts/${NC}             ${GREEN}$(du -sh scripts 2>/dev/null | awk '{print $1}')${NC}"

# 锁定文件
print_section "依赖管理"
if [ -f "bun.lock" ]; then
  BUN_LOCK_SIZE=$(du -sh bun.lock 2>/dev/null | awk '{print $1}')
  echo -e "    包管理器: ${BLUE}Bun${NC}"
  echo -e "    bun.lock: ${GREEN}${BUN_LOCK_SIZE}${NC}"
elif [ -f "package-lock.json" ]; then
  NPM_LOCK_SIZE=$(du -sh package-lock.json 2>/dev/null | awk '{print $1}')
  echo -e "    包管理器: ${BLUE}npm${NC}"
  echo -e "    package-lock.json: ${GREEN}${NPM_LOCK_SIZE}${NC}"
elif [ -f "yarn.lock" ]; then
  YARN_LOCK_SIZE=$(du -sh yarn.lock 2>/dev/null | awk '{print $1}')
  echo -e "    包管理器: ${BLUE}Yarn${NC}"
  echo -e "    yarn.lock: ${GREEN}${YARN_LOCK_SIZE}${NC}"
fi

# 检查各个子项目的 package.json
print_section "子项目"
[ -f "server/package.json" ] && echo -e "    ${CYAN}server/package.json${NC}     ${GREEN}✓${NC}"
[ -f "web/package.json" ] && echo -e "    ${CYAN}web/package.json${NC}         ${GREEN}✓${NC}"
[ -f "services/embedding/requirements.txt" ] && echo -e "    ${CYAN}services/embedding/requirements.txt${NC}  ${GREEN}✓${NC}"

# ============================================================================
# 7. 总结
# ============================================================================

print_title "📊 统计总结"

# 计算总代码行数
TOTAL_LINES=0
TOTAL_FILES=0

# Server 代码行数
if [ -d "server" ]; then
  SERVER_LINES=$(find server -type f \( -name "*.ts" -o -name "*.tsx" \) ! -path "*/node_modules/*" ! -path "*/logs/*" -exec wc -l {} + 2>/dev/null | tail -1 | awk '{print $1}')
  [ -z "$SERVER_LINES" ] && SERVER_LINES=0
  SERVER_FILES=$(find server -type f \( -name "*.ts" -o -name "*.tsx" \) ! -path "*/node_modules/*" ! -path "*/logs/*" 2>/dev/null | wc -l | tr -d ' ')
  TOTAL_LINES=$((TOTAL_LINES + SERVER_LINES))
  TOTAL_FILES=$((TOTAL_FILES + SERVER_FILES))
fi

# Web 代码行数
if [ -d "web/src" ]; then
  WEB_LINES=$(find web/src -type f ! -path "*/node_modules/*" ! -path "*/.next/*" -exec wc -l {} + 2>/dev/null | tail -1 | awk '{print $1}')
  [ -z "$WEB_LINES" ] && WEB_LINES=0
  WEB_FILES=$(find web/src -type f ! -path "*/node_modules/*" ! -path "*/.next/*" 2>/dev/null | wc -l | tr -d ' ')
  TOTAL_LINES=$((TOTAL_LINES + WEB_LINES))
  TOTAL_FILES=$((TOTAL_FILES + WEB_FILES))
fi

# Python 代码行数
if [ -d "services/embedding" ]; then
  PYTHON_LINES=$(find services/embedding -type f -name "*.py" -exec wc -l {} + 2>/dev/null | tail -1 | awk '{print $1}')
  [ -z "$PYTHON_LINES" ] && PYTHON_LINES=0
  PYTHON_FILES=$(find services/embedding -type f -name "*.py" 2>/dev/null | wc -l | tr -d ' ')
  TOTAL_LINES=$((TOTAL_LINES + PYTHON_LINES))
  TOTAL_FILES=$((TOTAL_FILES + PYTHON_FILES))
fi

print_section "总体统计"
print_kv "总代码行数" "${TOTAL_LINES} 行"
print_kv "总文件数" "${TOTAL_FILES} 个"
print_kv "项目总大小" "${TOTAL_SIZE}"

echo ""
echo -e "${BOLD}${GREEN}✓ 统计完成${NC}"
echo ""
