import { useEffect, useId, useState } from 'react'

interface Props {
  chart: string
}

/** Render a Mermaid diagram definition to SVG. mermaid (~1MB) is loaded
 * lazily on first use so the main bundle stays untouched; the theme
 * follows the app's light/dark mode at render time. */
export default function Mermaid({ chart }: Props) {
  const [svg, setSvg] = useState('')
  const [error, setError] = useState<string | null>(null)
  const id = 'mmd-' + useId().replace(/[^a-zA-Z0-9]/g, '')

  useEffect(() => {
    let cancelled = false
    import('mermaid')
      .then((m) => {
        const isDark = document.documentElement.classList.contains('dark')
        m.default.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: isDark ? 'dark' : 'default',
        })
        // Random suffix: the same chart may be rendered in several places.
        return m.default.render(
          `${id}-${Math.random().toString(36).slice(2, 7)}`,
          chart,
        )
      })
      .then(({ svg: rendered }) => {
        if (cancelled) return
        setSvg(rendered)
        setError(null)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [chart, id])

  if (error) {
    return (
      <div className="mermaid-error">
        <p>Mermaid 图表渲染失败：{error}</p>
        <pre>{chart}</pre>
      </div>
    )
  }
  return (
    <div
      className="mermaid-render"
      {...(svg ? { dangerouslySetInnerHTML: { __html: svg } } : {})}
    >
      {svg ? null : <span className="mermaid-loading">图表渲染中…</span>}
    </div>
  )
}
