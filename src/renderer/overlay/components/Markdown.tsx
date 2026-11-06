import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Icon } from './Icon'

// Renders Claude's markdown. Links are shown but not followed (the overlay never
// navigates); clicking one copies it. Code blocks get a copy button.

const components: Components = {
  a: ({ href, children }) => (
    <button type="button" className="md-link" title={`Copy link: ${href}`} onClick={() => href && window.sotto.copyText(href)}>
      {children}
    </button>
  ),
  pre: ({ children }) => {
    const text = extractText(children)
    return (
      <div className="md-code">
        <button type="button" className="md-copy" onClick={() => window.sotto.copyText(text)} aria-label="Copy code">
          <Icon name="copy" size={14} />
        </button>
        <pre>{children}</pre>
      </div>
    )
  },
  img: () => null
}

export function Markdown({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
}

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (node && typeof node === 'object' && 'props' in node) {
    return extractText((node as { props: { children?: React.ReactNode } }).props.children)
  }
  return ''
}
