import type { ReactNode } from 'react'
import { Tooltip } from './Tooltip'

type ActionIconProps = {
  label: string
  title?: string
  active?: boolean
  disabled?: boolean
  href?: string | null
  className?: string
  onClick?: () => void
  /** Optional stable anchor for the onboarding tour spotlight. */
  dataTour?: string
  children: ReactNode
}

export function ActionIcon({ active, children, className = 'icon-button', dataTour, disabled = false, href, label, onClick, title }: ActionIconProps) {
  const classes = `${className} action-icon${active ? ' active' : ''}`
  const tooltip = title ?? label
  if (href && !disabled) {
    return (
      <Tooltip content={tooltip}>
        <a className={classes} aria-label={label} href={href} target="_blank" rel="noreferrer" data-tour={dataTour}>
          {children}
        </a>
      </Tooltip>
    )
  }

  return (
    <Tooltip content={tooltip}>
      <button className={classes} aria-label={label} onClick={onClick} disabled={disabled} data-tour={dataTour}>
        {children}
      </button>
    </Tooltip>
  )
}
