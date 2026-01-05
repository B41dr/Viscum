#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

mkdir -p logs

osascript <<EOF
tell application "iTerm2"
    activate
    # 如果没有窗口，创建一个新窗口；否则使用当前窗口
    if (count of windows) is 0 then
        create window with default profile
    end if

    tell current window
        # 创建新的标签页
        create tab with default profile

        # 垂直分割窗口（左侧运行应用，右侧显示日志）
        tell current session of current tab
            split vertically with default profile
        end tell

        # 在右侧面板启动日志查看
        tell second session of current tab
            write text "cd '$SCRIPT_DIR' && tail -f logs/combined.log"
        end tell

        # 在左侧面板启动应用
        tell first session of current tab
            write text "cd '$SCRIPT_DIR' && bun run --filter @viscum/cli dev"
        end tell
    end tell
end tell
EOF

echo "已启动"
