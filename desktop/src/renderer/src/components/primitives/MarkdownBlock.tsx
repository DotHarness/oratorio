import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { normalizeMarkdownForDisplay } from '../../markdownDisplay'

export function MarkdownBlock({ value, className, compact = false }: { value: string; className?: string; compact?: boolean }) {
  return (
    <div className={`markdown-block ${compact ? 'compact' : ''} ${className ?? ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {normalizeMarkdownForDisplay(value)}
      </ReactMarkdown>
    </div>
  )
}
