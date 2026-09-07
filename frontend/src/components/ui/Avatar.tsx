interface Props {
  name: string
  size?: number
  className?: string
}

/** Square avatar with the initial — inverted black/white like the brand mark. */
export default function Avatar({ name, size = 26, className = '' }: Props) {
  const initial = (name || '?').trim().charAt(0).toUpperCase()
  return (
    <span
      className={`avatar ${className}`}
      style={
        size !== 26
          ? { width: size, height: size, fontSize: size * 0.42 }
          : undefined
      }
      aria-hidden
    >
      {initial}
    </span>
  )
}
