import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { CheckCircle2, ChevronDown } from 'lucide-react'
import { Tooltip } from './Tooltip'

export type DropdownSelectOption = {
  value: string
  label: string
}

type DropdownSelectProps = {
  label: string
  value: string
  options: DropdownSelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
  icon?: ReactNode
  className?: string
  triggerClassName?: string
  menuClassName?: string
  optionClassName?: string
  showTooltip?: boolean
}

export function DropdownSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
  icon,
  className,
  triggerClassName,
  menuClassName,
  optionClassName,
  showTooltip = true,
}: DropdownSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [menuPlacement, setMenuPlacement] = useState<'down' | 'up'>('down')
  const rootRef = useRef<HTMLDivElement | null>(null)
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  )
  const selectedOption = options[selectedIndex] ?? options[0] ?? { value, label: value }

  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(selectedIndex)
    }
  }, [isOpen, selectedIndex])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function closeMenu(event: PointerEvent) {
      const target = event.target as Node | null
      if (target && rootRef.current?.contains(target)) {
        return
      }

      setIsOpen(false)
    }

    window.addEventListener('pointerdown', closeMenu)
    return () => window.removeEventListener('pointerdown', closeMenu)
  }, [isOpen])

  function openMenu() {
    if (!disabled && options.length > 0) {
      setMenuPlacement(resolveMenuPlacement())
      setIsOpen(true)
    }
  }

  function toggleMenu() {
    if (isOpen) {
      setIsOpen(false)
      return
    }

    openMenu()
  }

  function resolveMenuPlacement() {
    const root = rootRef.current
    if (!root || typeof window === 'undefined') {
      return 'down'
    }

    const rect = root.getBoundingClientRect()
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight
    const estimatedMenuHeight = Math.min(280, 8 + options.length * 34)
    const availableBelow = viewportHeight - rect.bottom - 8
    const availableAbove = rect.top - 8
    return availableBelow < estimatedMenuHeight && availableAbove > availableBelow ? 'up' : 'down'
  }

  function chooseOption(nextValue: string) {
    if (disabled) {
      return
    }

    onChange(nextValue)
    setIsOpen(false)
  }

  function moveHighlight(delta: number) {
    if (options.length === 0) {
      return
    }

    setHighlightedIndex((current) => (current + delta + options.length) % options.length)
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (disabled) {
      return
    }

    if (event.key === 'Escape') {
      setIsOpen(false)
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!isOpen) {
        openMenu()
        return
      }
      moveHighlight(1)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!isOpen) {
        openMenu()
        return
      }
      moveHighlight(-1)
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      openMenu()
      setHighlightedIndex(0)
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      openMenu()
      setHighlightedIndex(Math.max(0, options.length - 1))
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!isOpen) {
        openMenu()
        return
      }

      chooseOption(options[highlightedIndex]?.value ?? selectedOption.value)
    }
  }

  const trigger = (
    <button
      type="button"
      className={`repository-select-trigger${triggerClassName ? ` ${triggerClassName}` : ''}`}
      aria-label={label}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          disabled={disabled}
          onClick={toggleMenu}
    >
      {icon}
      <span>{selectedOption.label}</span>
      <ChevronDown size={15} aria-hidden="true" />
    </button>
  )

  return (
    <div className={`select-control${className ? ` ${className}` : ''}`} ref={rootRef} onKeyDown={handleKeyDown}>
      {showTooltip ? <Tooltip content={label}>{trigger}</Tooltip> : trigger}
      {isOpen ? (
        <div className={`repository-select-menu${menuPlacement === 'up' ? ' drop-up' : ''}${menuClassName ? ` ${menuClassName}` : ''}`} role="listbox" aria-label={label}>
          {options.map((option, index) => {
            const optionButton = (
              <button
                key={option.value}
                type="button"
                className={`repository-select-option${optionClassName ? ` ${optionClassName}` : ''}${index === highlightedIndex ? ' highlighted' : ''}${
                  option.value === value ? ' selected' : ''
                }`}
                role="option"
                aria-selected={option.value === value}
                tabIndex={-1}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => chooseOption(option.value)}
              >
                <span>{option.label}</span>
                {option.value === value ? <CheckCircle2 size={14} /> : null}
              </button>
            )

            return showTooltip ? <Tooltip key={option.value} content={option.label}>{optionButton}</Tooltip> : optionButton
          })}
        </div>
      ) : null}
    </div>
  )
}
