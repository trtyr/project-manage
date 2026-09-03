import { Descriptions, Typography } from 'antd'
import type { Client, Project } from '../types'
import TimelineTab from './TimelineTab'

const { Text } = Typography

interface Props {
  projectId: string
  /** from the parent's existing project query — no refetch here */
  project: Project
  /** from the parent's existing client query (may still be loading) */
  client?: Client
  /** D3: handed to TimelineTab's 去填日期 empty-state button. */
  onGoFillPhaseDates?: () => void
}

/**
 * 「概览」tab: the deep fields the header chips don't carry (goals,
 * competitor notes) plus the cross-entity timeline. Status / client /
 * phase / tech-approval live in the detail header only (L10 dedup).
 * Data arrives via props from ProjectDetail's existing queries — no
 * extra requests.
 */
export default function OverviewTab({
  projectId,
  project,
  onGoFillPhaseDates,
}: Props) {
  return (
    <div>
      <Descriptions
        size="small"
        column={2}
        bordered
        style={{ marginBottom: 'var(--space-6)' }}
        items={[
          {
            key: 'goals',
            label: '目标',
            span: 2,
            children: project.goals.length ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {project.goals.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            ) : (
              '-'
            ),
          },
          {
            key: 'competitors',
            label: '竞品',
            span: 2,
            children: project.competitors || '-',
          },
          // L10 fix: 状态/客户/阶段/技术认可 rows removed — the detail header
          // already shows all four; the overview keeps only the deeper fields.
        ]}
      />
      <Text
        type="secondary"
        style={{
          fontSize: 13,
          display: 'block',
          marginBottom: 'var(--space-2)',
        }}
      >
        时间线
      </Text>
      <TimelineTab projectId={projectId} onGoFillDates={onGoFillPhaseDates} />
    </div>
  )
}
