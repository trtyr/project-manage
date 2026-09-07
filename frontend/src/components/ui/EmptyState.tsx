import type { ReactNode } from 'react'

interface Props {
  icon: ReactNode
  title: string
  desc?: string
  action?: ReactNode
}

/** Geist empty state: glyph circle, title, secondary description, action.
 *  Usable standalone or as an AntD Table `locale.emptyText`. */
export default function EmptyState({ icon, title, desc, action }: Props) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">{icon}</div>
      <div className="empty-state__title">{title}</div>
      {desc && <div className="empty-state__desc">{desc}</div>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  )
}
