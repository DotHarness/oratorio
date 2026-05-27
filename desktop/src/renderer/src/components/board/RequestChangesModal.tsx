import { useEffect, useRef, useState } from 'react'
import type { WorkItem } from '../../lib/types'

export type RequestChangesValue = {
  body: string
  severity: 'yellow' | 'red'
}

export function RequestChangesModal({
  item,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  item: WorkItem
  busy: boolean
  error: string | null
  onCancel: () => void
  onSubmit: (value: RequestChangesValue) => void
}) {
  const [body, setBody] = useState('')
  const [severity, setSeverity] = useState<RequestChangesValue['severity']>('yellow')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const canSubmit = body.trim().length > 0 && !busy

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="request-changes-modal"
        aria-label={`Request changes for ${item.shortId ?? item.title}`}
        onSubmit={(event) => {
          event.preventDefault()
          if (canSubmit) {
            onSubmit({ body: body.trim(), severity })
          }
        }}
      >
        <header>
          <p className="eyebrow">Request changes</p>
          <h2>{item.shortId ?? item.number}</h2>
          <p>{item.title}</p>
        </header>
        <label className="board-modal-field">
          <span>Feedback</span>
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={6}
            placeholder="Describe what the agent should change before the next run."
          />
        </label>
        <label className="board-modal-field compact">
          <span>Severity</span>
          <select value={severity} onChange={(event) => setSeverity(event.target.value as RequestChangesValue['severity'])}>
            <option value="yellow">Needs changes</option>
            <option value="red">Blocking</option>
          </select>
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <footer>
          <button type="button" className="secondary-button inline" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="primary-button inline" disabled={!canSubmit}>
            {busy ? 'Sending...' : 'Send feedback'}
          </button>
        </footer>
      </form>
    </div>
  )
}
