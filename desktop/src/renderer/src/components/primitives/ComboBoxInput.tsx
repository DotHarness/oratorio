import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { CheckCircle2, ChevronDown } from 'lucide-react'

export type ComboBoxOption = {
  value: string
  label: string
}

type ComboBoxInputProps = {
  ariaLabel: string
  value: string
  onChange: (value: string) => void
  options: ComboBoxOption[]
  placeholder?: string
  id?: string
  autoFocus?: boolean
}

/**
 * Editable combobox: a free-text input paired with a custom-styled suggestion
 * menu (reusing the board dropdown styling). Unlike DropdownSelect it allows
 * arbitrary typed values while still offering the known options.
 */
export function ComboBoxInput({ ariaLabel, value, onChange, options, placeholder, id, autoFocus }: ComboBoxInputProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const generatedId = useId()
  const listId = `${id ?? generatedId}-combobox-list`

  const query = value.trim().toLowerCase()
  // When the current value already matches an option exactly (a selection),
  // show the full list so the user can switch; only filter while typing.
  const isExactMatch = options.some((option) => option.value === value)
  const filtered = query && !isExactMatch
    ? options.filter((option) => option.value.toLowerCase().includes(query) || option.label.toLowerCase().includes(query))
    : options
  const showMenu = isOpen && filtered.length > 0

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

  function commit(nextValue: string) {
    onChange(nextValue)
    setIsOpen(false)
    setHighlightedIndex(-1)
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!isOpen) {
        setIsOpen(true)
        return
      }
      if (filtered.length > 0) {
        setHighlightedIndex((current) => (current + 1) % filtered.length)
      }
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!isOpen) {
        setIsOpen(true)
        return
      }
      if (filtered.length > 0) {
        setHighlightedIndex((current) => (current - 1 + filtered.length) % filtered.length)
      }
      return
    }

    if (event.key === 'Enter') {
      if (isOpen && highlightedIndex >= 0 && filtered[highlightedIndex]) {
        event.preventDefault()
        commit(filtered[highlightedIndex].value)
      }
      return
    }

    if (event.key === 'Escape') {
      setIsOpen(false)
      setHighlightedIndex(-1)
    }
  }

  return (
    <div className="combobox-control" ref={rootRef}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={showMenu}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value)
          setIsOpen(true)
          setHighlightedIndex(-1)
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {options.length > 0 ? (
        <button
          type="button"
          className="combobox-toggle"
          tabIndex={-1}
          aria-hidden="true"
          onMouseDown={(event) => {
            event.preventDefault()
            setIsOpen((open) => !open)
            inputRef.current?.focus()
          }}
        >
          <ChevronDown size={15} />
        </button>
      ) : null}
      {showMenu ? (
        <div className="repository-select-menu combobox-menu" role="listbox" id={listId} aria-label={ariaLabel}>
          {filtered.map((option, index) => (
            <button
              key={option.value}
              type="button"
              role="option"
              data-value={option.value}
              aria-selected={option.value === value}
              tabIndex={-1}
              className={`repository-select-option${index === highlightedIndex ? ' highlighted' : ''}${option.value === value ? ' selected' : ''}`}
              onMouseEnter={() => setHighlightedIndex(index)}
              onMouseDown={(event) => {
                event.preventDefault()
                commit(option.value)
              }}
            >
              <span>{option.label}</span>
              {option.value === value ? <CheckCircle2 size={14} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
