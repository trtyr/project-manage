import { useNavigate } from 'react-router-dom'
import { PaperClipOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { Communication, ProjectFile } from '../types'
import Pill from './ui/Pill'
import EmptyState from './ui/EmptyState'

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
      <div className="card">
        <EmptyState
          icon={<PaperClipOutlined />}
          title="还没有沟通记录"
          desc="会议纪要、微信要点、电话结论——记下和客户的每次关键往来。"
        />
      </div>
    )
  }

  const go = (cid: string) =>
    navigate(`/projects/${projectId}/communications/${cid}`)

  return (
    <div className="card row-list">
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
                <Pill key={p} small>
                  {p}
                </Pill>
              ))}
              {linkedCount > 0 && (
                <Pill small>
                  <PaperClipOutlined /> {linkedCount}
                </Pill>
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
