import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Tooltip } from '../Tooltip'

describe('Tooltip', () => {
  afterEach(cleanup)

  it('does not add a layout wrapper around the trigger', () => {
    const onClick = vi.fn()
    const { container } = render(
      <Tooltip content="Plain tooltip">
        <button type="button" onClick={onClick}>
          Trigger
        </button>
      </Tooltip>,
    )

    const trigger = screen.getByRole('button', { name: 'Trigger' })
    expect(container.childElementCount).toBe(1)
    expect(container.firstElementChild).toBe(trigger)

    fireEvent.click(trigger)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('renders a portalled tooltip on hover and focus', () => {
    render(
      <Tooltip content="Helpful tooltip">
        <button type="button">Hover me</button>
      </Tooltip>,
    )

    const trigger = screen.getByRole('button', { name: 'Hover me' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.pointerEnter(trigger)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Helpful tooltip')
    expect(trigger).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id)

    fireEvent.pointerLeave(trigger)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.focus(trigger)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Helpful tooltip')
  })

  it('preserves trigger event handlers', () => {
    const onPointerEnter = vi.fn()
    const onFocus = vi.fn()

    render(
      <Tooltip content="Event tooltip">
        <button type="button" onFocus={onFocus} onPointerEnter={onPointerEnter}>
          Event target
        </button>
      </Tooltip>,
    )

    const trigger = screen.getByRole('button', { name: 'Event target' })
    fireEvent.pointerEnter(trigger)
    fireEvent.focus(trigger)

    expect(onPointerEnter).toHaveBeenCalledOnce()
    expect(onFocus).toHaveBeenCalledOnce()
  })
})
