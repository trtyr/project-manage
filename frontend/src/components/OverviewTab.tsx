import type { Client, Project } from '../types'
import TimelineTab from './TimelineTab'

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
  client,
  onGoFillPhaseDates,
}: Props) {
  const hasGoals = project.goals.length > 0
  const hasCompetitors = !!project.competitors
  const hasAnything = hasGoals || hasCompetitors || !!client

  return (
    <div>
      {hasAnything && (
        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          {hasGoals && (
            <div className="info-row">
              <div className="info-row__label">目标</div>
              <div className="info-row__value">
                <ul className="check-list">
                  {project.goals.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          {project.competitors !== undefined && (
            <div className="info-row">
              <div className="info-row__label">竞品</div>
              <div className="info-row__value">
                {project.competitors || (
                  <span className="info-dim">未记录</span>
                )}
              </div>
            </div>
          )}
          {client && (
            <div className="info-row">
              <div className="info-row__label">客户</div>
              <div className="info-row__value">
                {client.name}
                {client.contact_person && (
                  <span style={{ color: 'var(--ink-3)' }}>
                    {' '}
                    · {client.contact_person}
                  </span>
                )}
                {client.contact_info && (
                  <span className="mono" style={{ color: 'var(--ink-3)' }}>
                    {' '}
                    · {client.contact_info}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="section-label">时间线</div>
      <TimelineTab projectId={projectId} onGoFillDates={onGoFillPhaseDates} />
    </div>
  )
}
