/**
 * 消息气泡底部操作栏
 */

import { Button, Tooltip } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { Actions } from "@ant-design/x";

interface BubbleFooterProps {
  id?: string;
  content: string;
  status?: string;
  onReload?: (id: string) => void;
}

export function BubbleFooter({
  id,
  content,
  status,
  onReload,
}: BubbleFooterProps) {
  const items = [
    {
      key: "retry",
      label: "重试",
      actionRender: (
        <Tooltip title="重试">
          <Button
            type="text"
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => {
              if (id && onReload) {
                onReload(id);
              }
            }}
          />
        </Tooltip>
      ),
    },
    {
      key: "copy",
      actionRender: <Actions.Copy text={content} />,
    },
  ];

  // 只有在非更新和非加载状态时显示操作栏
  if (status === "updating" || status === "loading") {
    return null;
  }

  return (
    <div style={{ display: "flex" }}>{id && <Actions items={items} />}</div>
  );
}
