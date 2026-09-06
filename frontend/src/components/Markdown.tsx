import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Mermaid from './Mermaid'

interface Props {
  children: string
}

/** Fenced ```mermaid blocks become diagrams; every other code stays code. */
function CodeBlock(props: {
  className?: string
  children?: ReactNode
}) {
  const code = String(props.children ?? '')
  if (props.className?.includes('language-mermaid')) {
    return <Mermaid chart={code.replace(/\n$/, '')} />
  }
  return <code className={props.className}>{props.children}</code>
}

/** A fenced block renders as <pre><code class="language-x">…</code></pre>;
 * skip the <pre> for mermaid so the SVG isn't trapped in code styling. */
function PreBlock({ children }: { children?: ReactNode }) {
  const child = Array.isArray(children) ? children[0] : children
  const cls = (child as { props?: { className?: string } })?.props?.className
  if (typeof cls === 'string' && cls.includes('language-mermaid')) {
    return <>{children}</>
  }
  return <pre>{children}</pre>
}

export default function Markdown({ children }: Props) {
  return (
    <div className="md-render">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ pre: PreBlock, code: CodeBlock }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
