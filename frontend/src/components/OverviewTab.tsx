import { Descriptions, Tag, Typography } from 'antd'
import type {
  Client,
  Project,
  ProjectStatus,
  TechApprovalStatus,
} from '../types'
import TimelineTab from './TimelineTab'

const { Text } = Typography

const statusLabel: Record<ProjectStatus, string> = {
  in_progress: '进行中',
  completed: '已完成',
  paused: '已暂停',
}

const techTagColors: Record<TechApprovalStatus, string | undefined> = {
  未接触: undefined,
  POC中: 'processing',
  已认可: 'success',
  技术否决: 'error',
}

interface Props {
  projectId: string
  /** from the parent's existing project query — no refetch here */
  project: Project
  /** from the parent's existing client query (may still be loading) */
  client?: Client
}

/**
 * 「概览」tab: a structured summary card of the project (the header only
 * shows inline chips) plus the cross-entity timeline. Data arrives via
 * props from ProjectDetail's existing queries — no extra requests.
 */
export default function OverviewTab({ projectId, project, client }: Props) {
  return (
    <div>
      <Descriptions
        size="small"
        column={2}
        bordered
        style={{ marginBottom: 24 }}
        items={[
          {
            key: 'status',
            label: '状态',
            children: (
              <Tag className={`status-badge status-badge--${project.status}`}>
                {statusLabel[project.status] ?? project.status}
              </Tag>
            ),
          },
          {
            key: 'client',
            label: '客户',
            children: client
              ? `${client.name}${client.contact_person ? ` · ${client.contact_person}` : ''}${
                  client.contact_info ? ` · ${client.contact_info}` : ''
                }`
              : '-',
          },
          { key: 'phase', label: '阶段', children: project.phase || '-' },
          {
            key: 'tech',
            label: '技术认可',
            children: project.tech_approval ? (
              <Tag
                color={techTagColors[project.tech_approval]}
                style={{ marginInlineEnd: 0 }}
              >
                {project.tech_approval}
              </Tag>
            ) : (
              '-'
            ),
          },
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
        ]}
      />
      <Text
        type="secondary"
        style={{ fontSize: 13, display: 'block', marginBottom: 8 }}
      >
        时间线
      </Text>
      <TimelineTab projectId={projectId} />
    </div>
  )
}
