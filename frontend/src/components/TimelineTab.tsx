import { useMemo } from 'react'
import { Button } from 'antd'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { CalendarOutlined } from '@ant-design/icons'
import { phasesApi } from '../api'
import type { Phase } from '../types'
import Pill from './ui/Pill'
import EmptyState from './ui/EmptyState'
import { PHASE_STATUS_META } from '../utils/status'

interface Props {
  projectId: string
  /** D3: shown when phases exist but carry no dates — jumps to 推进/阶段. */
  onGoFillDates?: () => void
}

/**
 * 阶段甘特图（嵌入「概览」）。只读 phases 数据画条；日期缺失时给
 * 直达「去填日期」的空状态（D3）。
 */
export default function TimelineTab({ projectId, onGoFillDates }: Props) {
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
      <div className="card">
        <EmptyState
          icon={<CalendarOutlined />}
          title="还没有阶段数据"
          desc="添加阶段并填写计划日期后，这里会显示甘特图。"
          action={
            onGoFillDates && <Button onClick={onGoFillDates}>去添加阶段</Button>
          }
        />
      </div>
    )
  }

  if (!start) {
    return (
      <div className="card">
        <EmptyState
          icon={<CalendarOutlined />}
          title="阶段还没有计划日期"
          desc="填入「计划开始」和「计划结束」后查看时间线。"
          action={
            onGoFillDates && (
              <Button type="primary" onClick={onGoFillDates}>
                去填阶段日期
              </Button>
            )
          }
        />
      </div>
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

  // Week markers across the span (first week of a month also shows the
  // month for long-range context — L12)
  const weekMarkers: { label: string; pct: number; isMonth?: boolean }[] = []
  const totalWeeks = Math.ceil(span / 7)
  let lastMonth = -1
  for (let w = 0; w <= totalWeeks; w++) {
    const day = w * 7
    if (day > span) break
    const d = start.add(day, 'day')
    const isMonth = d.month() !== lastMonth
    lastMonth = d.month()
    weekMarkers.push({
      label: isMonth ? d.format('YY年M月') : d.format('MM/DD'),
      pct: (day / span) * 100,
      isMonth,
    })
  }

  // L12: today marker position (only when today falls inside the span)
  const todayOffsetPct = (() => {
    const diff = dayjs().diff(start, 'day')
    if (diff < 0 || diff > span) return null
    return (diff / span) * 100
  })()

  return (
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      {/* Header: date axis */}
      <div className="timeline-axis">
        {weekMarkers.map((m, i) => (
          <span
            key={i}
            className={`timeline-axis__tick${m.isMonth ? ' timeline-axis__tick--month' : ''}`}
            style={{ left: `${m.pct}%` }}
          >
            {m.label}
          </span>
        ))}
      </div>

      {/* Phase rows */}
      <div className="timeline-body">
        {/* L12: today line across all phase rows */}
        {todayOffsetPct !== null && (
          <div
            className="timeline-today"
            aria-hidden
            style={{ ['--today-pct' as string]: todayOffsetPct / 100 }}
            title="今天"
          />
        )}
        {phases.map((p) => {
          const bar = barFor(p)
          const statusMeta = PHASE_STATUS_META[p.status]
          return (
            <div key={p.id} className="timeline-row">
              {/* Label */}
              <div className="timeline-row__label">
                <span className="timeline-row__name" title={p.name}>
                  {p.name}
                </span>
                {statusMeta && p.status !== 'pending' && (
                  <Pill small tone={statusMeta.tone}>
                    {statusMeta.label}
                  </Pill>
                )}
              </div>

              {/* Bar track */}
              <div className="timeline-row__track">
                {bar ? (
                  <div
                    className={`timeline-row__bar${p.status === 'completed' ? ' timeline-row__bar--done' : ''}`}
                    style={{
                      left: `${bar.offsetPct}%`,
                      width: `${Math.max(bar.widthPct, 2)}%`,
                    }}
                    title={`${bar.ps.format('MM-DD')} → ${bar.pe.format('MM-DD')}`}
                  >
                    {bar.widthPct > 8
                      ? `${bar.pe.diff(bar.ps, 'day') + 1}天`
                      : ''}
                  </div>
                ) : (
                  <span className="timeline-row__none">未排期</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
