import { useState } from 'react'
import { Segmented } from 'antd'
import type { ReactNode } from 'react'

export interface GroupedTabItem {
  /** stable segment key (unique within the group) */
  key: string
  /** display label of the segment */
  label: string
  /** optional count shown as `label (n)` when > 0 */
  count?: number
  /** segment content — typically one of the existing XxxTab components */
  content: ReactNode
}

interface Props {
  items: GroupedTabItem[]
}

/**
 * Generic aggregation container: a lightweight `Segmented` switcher over
 * 2-4 sibling modules (e.g. 阶段 | 任务 | 交付物). Keeps the main tab bar
 * flat (5 semantic tabs) without nesting a second level of Tabs — the
 * detail-ia plan calls for Segmented precisely to avoid that heaviness.
 */
export default function GroupedTab({ items }: Props) {
  const [activeKey, setActiveKey] = useState(items[0]?.key)
  const current = items.find((i) => i.key === activeKey) ?? items[0]
  if (!current) return null
  return (
    <div>
      <Segmented
        className="grouped-segment"
        value={current.key}
        onChange={(v) => setActiveKey(v as string)}
        options={items.map((i) => ({
          value: i.key,
          label: i.count ? `${i.label} ${i.count}` : i.label,
        }))}
      />
      {current.content}
    </div>
  )
}
