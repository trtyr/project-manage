interface Props {
  label: string
  value: number | string
  /** dot color — CSS color value shown next to the label */
  dot?: string
}

/** Dashboard metric tile: label row + large mono value. */
export default function StatTile({ label, value, dot }: Props) {
  return (
    <div className="stat-tile">
      <div className="stat-tile__label">
        {dot && <span className="stat-tile__dot" style={{ background: dot }} />}
        {label}
      </div>
      <div className="stat-tile__value">{value}</div>
    </div>
  )
}
