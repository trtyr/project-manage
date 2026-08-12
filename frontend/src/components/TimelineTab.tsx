import { useMemo } from 'react'
import { Empty, Tag, Typography } from 'antd'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { phasesApi } from '../api'
import type { Phase } from '../types'

const { Text } = Typography

interface Props {
  projectId: string
}

export default function TimelineTab({ projectId }: Props) {
  const { data: phases = [] } = useQuery({
    queryKey: ['phases', projectId],
    queryFn: () => phasesApi.listByProject(projectId),
    enabled: !!projectId,
  })

  // Compute the date range across all phases that have planned dates.
  const { start, span } = useMemo(() => {
    const dated = phases.filter((p) => p.planned_start || p.planned_end)
    if (!dated.length) return { start: null, end: null, span: 0 }

    const allStarts = dated
      .map((p) => p.planned_start)
      .filter(Boolean) as string[]
    const allEnds = dated
      .map((p) => p.planned_end ?? p.planned_start)
      .filter(Boolean) as string[]

    const minDate = dayjs(allStarts.sort()[0])
    const maxDate = dayjs(allEnds.sort().reverse()[0])
    const days = maxDate.diff(minDate, 'day') + 1
    return { start: minDate, span: Math.max(days, 1) }
  }, [phases])

  if (!phases.length) {
    return (
      <Empty
        description="还没有阶段数据。添加阶段并填写计划日期后，这里会显示甘特图。"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    )
  }

  if (!start) {
    return (
      <Empty
        description="阶段还没有计划日期。编辑阶段填入「计划开始」和「计划结束」后查看时间线。"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    )
  }

  function barFor(p: Phase) {
    if (!p.planned_start && !p.planned_end) return null
    const ps = dayjs(p.planned_start ?? p.planned_end)
    const pe = dayjs(p.planned_end ?? p.planned_start)
    const offsetDays = ps.diff(start!, 'day')
    const durationDays = pe.diff(ps, 'day') + 1
    const offsetPct = (offsetDays / span) * 100
    const widthPct = (durationDays / span) * 100
    return { offsetPct, widthPct, ps, pe }
  }

  // Week markers across the span
  const weekMarkers: { label: string; pct: number }[] = []
  const totalWeeks = Math.ceil(span / 7)
  for (let w = 0; w <= totalWeeks; w++) {
    const day = w * 7
    if (day > span) break
    weekMarkers.push({
      label: start.add(day, 'day').format('MM/DD'),
      pct: (day / span) * 100,
    })
  }

  return (
    <div style={{ marginTop: 8 }}>
      {/* Header: date axis */}
      <div
        style={{
          position: 'relative',
          height: 24,
          marginLeft: 160,
          marginBottom: 4,
          borderBottom: '1px solid var(--hairline)',
        }}
      >
        {weekMarkers.map((m, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${m.pct}%`,
              fontSize: 11,
              color: 'var(--muted-hex)',
              transform: 'translateX(-50%)',
              whiteSpace: 'nowrap',
            }}
          >
            {m.label}
          </div>
        ))}
      </div>

      {/* Phase rows */}
      {phases.map((p) => {
        const bar = barFor(p)
        return (
          <div
            key={p.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: 8,
              minHeight: 32,
            }}
          >
            {/* Label */}
            <div
              style={{
                width: 150,
                flexShrink: 0,
                fontSize: 13,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                paddingRight: 10,
                textAlign: 'right',
              }}
            >
              {p.name}
              {p.status && p.status !== 'pending' && (
                <Tag
                  style={{
                    marginLeft: 4,
                    fontSize: 10,
                    lineHeight: '16px',
                    padding: '0 4px',
                  }}
                >
                  {p.status}
                </Tag>
              )}
            </div>

            {/* Bar track */}
            <div
              style={{
                flex: 1,
                position: 'relative',
                height: 24,
                background: 'var(--subtle-bg)',
                borderRadius: 4,
              }}
            >
              {bar ? (
                <div
                  style={{
                    position: 'absolute',
                    left: `${bar.offsetPct}%`,
                    width: `${Math.max(bar.widthPct, 2)}%`,
                    top: 2,
                    bottom: 2,
                    background: 'var(--primary-hex)',
                    borderRadius: 4,
                    opacity: p.status === 'completed' ? 0.5 : 0.85,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    color: '#fff',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                  }}
                  title={`${bar.ps.format('MM-DD')} → ${bar.pe.format('MM-DD')}`}
                >
                  {bar.widthPct > 8
                    ? `${bar.pe.diff(bar.ps, 'day') + 1}天`
                    : ''}
                </div>
              ) : (
                <Text
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    fontSize: 11,
                  }}
                  type="secondary"
                >
                  未排期
                </Text>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
