import type { ReactNode } from 'react'

type SectionTone = 'blue' | 'green' | 'amber' | 'slate'

type SectionBlockProps = {
  kicker?: ReactNode
  title: ReactNode
  description?: ReactNode
  icon: ReactNode
  tone?: SectionTone
  action?: ReactNode
  children?: ReactNode
  className?: string
}

export function SectionBlock({ kicker, title, description, icon, tone = 'slate', action, children, className }: SectionBlockProps) {
  return (
    <section className={`product-section section-block section-block--${tone}${className ? ` ${className}` : ''}`}>
      <div className="product-section-head section-block-head">
        <div className="section-block-title-group">
          <span className="section-block-icon" aria-hidden="true">
            {icon}
          </span>
          <div>
            {kicker ? <span className="section-label">{kicker}</span> : null}
            <h3>{title}</h3>
            {description ? <p className="section-block-description">{description}</p> : null}
          </div>
        </div>
        {action ? <div className="product-section-action">{action}</div> : null}
      </div>
      {children}
    </section>
  )
}
