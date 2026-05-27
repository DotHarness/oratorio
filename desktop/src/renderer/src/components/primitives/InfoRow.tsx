import type { ReactNode } from 'react'

type InfoRowGroupProps = {
  children: ReactNode
  className?: string
}

type InfoRowProps = {
  label: string
  children: ReactNode
  multiline?: boolean
}

export function InfoRowGroup({ children, className }: InfoRowGroupProps) {
  return <div className={`info-row-group${className ? ` ${className}` : ''}`}>{children}</div>
}

export function InfoRow({ label, children, multiline = false }: InfoRowProps) {
  return (
    <div className={`info-row${multiline ? ' multiline' : ''}`}>
      <span className="info-row-label">{label}</span>
      <div className="info-row-value">{children}</div>
    </div>
  )
}

export function MissingValue() {
  return <span className="muted-value">-</span>
}
