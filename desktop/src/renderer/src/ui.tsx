import type { ReactNode, TextareaHTMLAttributes } from 'react'

type RowGroupProps = {
  children: ReactNode
  className?: string
}

type SectionProps = RowGroupProps & {
  kicker?: ReactNode
  title: ReactNode
  action?: ReactNode
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: ReactNode
  hint?: ReactNode
}

export function RowGroup({ children, className }: RowGroupProps) {
  return <div className={`row-group${className ? ` ${className}` : ''}`}>{children}</div>
}

export function ProductSection({ kicker, title, action, children, className }: SectionProps) {
  return (
    <section className={`product-section${className ? ` ${className}` : ''}`}>
      <div className="product-section-head">
        <div>
          {kicker ? <span className="section-label">{kicker}</span> : null}
          <h3>{title}</h3>
        </div>
        {action ? <div className="product-section-action">{action}</div> : null}
      </div>
      {children}
    </section>
  )
}

export function ProductTextarea({ label, hint, className, ...props }: TextareaProps) {
  return (
    <label className={`product-field${className ? ` ${className}` : ''}`}>
      {label ? <span>{label}</span> : null}
      <textarea className="product-textarea" {...props} />
      {hint ? <small>{hint}</small> : null}
    </label>
  )
}
