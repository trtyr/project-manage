import type { CSSProperties, ReactNode } from 'react'

export type PillTone =
  'neutral' | 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'teal'

interface Props {
  tone?: PillTone
  /** leading status dot (off for plain labels like tags) */
  dot?: boolean
  small?: boolean
  className?: string
  style?: CSSProperties
  onClick?: () => void
  title?: string
  children: ReactNode
}

/** Geist status pill: colored dot + label on a tinted full-round chip. */
export default function Pill({
  tone = 'neutral',
  dot = false,
  small = false,
  className = '',
  style,
  onClick,
  title,
  children,
}: Props) {
  const cls = [
    'pill',
    tone !== 'neutral' ? `pill--${tone}` : '',
    small ? 'pill--sm' : '',
    onClick ? 'row-clickable' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <span
      className={cls}
      style={style}
      title={title}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
    >
      {dot && <span className="pill__dot" />}
      {children}
    </span>
  )
}
