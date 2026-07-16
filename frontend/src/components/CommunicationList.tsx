import { useNavigate } from 'react-router-dom'
import { Tag, Empty } from 'antd'
import { PaperClipOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { Communication, ProjectFile } from '../types'

interface Props {
  communications: Communication[] | undefined
  projectId: string
  files?: ProjectFile[]
}

function parseParticipants(value?: string | null): string[] {
  if (!value) return []
  return value
    .split(/[,，、;；]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export default function CommunicationList({
  communications,
  projectId,
  files,
}: Props) {
  const navigate = useNavigate()

  if (!communications?.length) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="还没有沟通记录"
      />
    )
  }

  const go = (cid: string) =>
    navigate(`/projects/${projectId}/communications/${cid}`)

  return (
    <div>
      {communications.map((c) => {
        const participants = parseParticipants(c.participants)
        const linkedCount =
          files?.filter((f) => f.communication_id === c.id).length ?? 0

        return (
          <div
            key={c.id}
            className="comm-list-item"
            role="button"
            tabIndex={0}
            onClick={() => go(c.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') go(c.id)
            }}
          >
            <div className="comm-list-item__head">
              <span className="comm-list-item__date">
                {dayjs(c.occurred_at).format('YYYY-MM-DD HH:mm')}
              </span>
              {participants.map((p) => (
                <Tag key={p} className="tag-participant">
                  {p}
                </Tag>
              ))}
              {linkedCount > 0 && (
                <Tag
                  className="tag-participant"
                  style={{
                    background: 'rgba(var(--primary-rgb), 0.04)',
                    color: 'var(--muted-hex)',
                  }}
                >
                  <PaperClipOutlined /> {linkedCount}
                </Tag>
              )}
            </div>
            <div className="comm-list-item__preview">
              {c.content.replace(/[#*`>\-]/g, '').substring(0, 120) ||
                '(无内容)'}
              {c.content.length > 120 && '…'}
            </div>
          </div>
        )
      })}
    </div>
  )
}
