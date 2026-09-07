import { Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import { MoreOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { Project } from '../types'
import Pill from './ui/Pill'
import { PROJECT_STATUS_META } from '../utils/status'

interface Props {
  project: Project
  clientName: string
  onClick: () => void
  menuItems?: MenuProps['items']
}

/** One project row: the name owns the full first line (never squeezed by a
 *  status column), the meta line below carries status/client/phase/date. */
export default function ProjectRow({
  project,
  clientName,
  onClick,
  menuItems,
}: Props) {
  const status = PROJECT_STATUS_META[project.status] ?? {
    label: project.status,
    tone: 'neutral' as const,
  }
  return (
    <div
      className="project-row"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onClick()
      }}
    >
      <div className="project-row__body">
        <div className="project-row__name" title={project.name}>
          {project.name}
        </div>
        <div className="project-row__meta">
          <Pill small tone={status.tone} dot>
            {status.label}
          </Pill>
          <span className="project-row__meta-text">
            {clientName}
            {project.phase && (
              <>
                <span className="project-row__meta-sep">·</span>
                {project.phase}
              </>
            )}
          </span>
          <span className="project-row__meta-date">
            更新于 {dayjs(project.updated_at).format('YYYY-MM-DD')}
          </span>
        </div>
      </div>
      {menuItems && (
        <Dropdown menu={{ items: menuItems }} trigger={['click']}>
          <button
            type="button"
            className="project-row__more"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            aria-label="更多操作"
          >
            <MoreOutlined />
          </button>
        </Dropdown>
      )}
    </div>
  )
}
