import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WorkItem } from '../../lib/types'

export function CancelRunModal({
  item,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  item: WorkItem
  busy: boolean
  error: string | null
  onCancel: () => void
  onConfirm: (body?: string) => void
}) {
  const { t } = useTranslation('board')
  const [body, setBody] = useState('')
  const confirmRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    confirmRef.current?.focus()
  }, [])

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="request-changes-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('cancelRun.ariaForm', { name: item.shortId ?? item.title })}
        onSubmit={(event) => {
          event.preventDefault()
          if (!busy) {
            onConfirm(body.trim())
          }
        }}
      >
        <header>
          <p className="eyebrow">{t('cancelRun.title')}</p>
          <h2>{item.shortId ?? item.number}</h2>
          <p>{item.title}</p>
        </header>
        <p>{t('cancelRun.copy')}</p>
        <label className="board-modal-field">
          <span>{t('cancelRun.reason')}</span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={3}
            placeholder={t('cancelRun.reasonPlaceholder')}
            disabled={busy}
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <footer>
          <button type="button" className="secondary-button inline" onClick={onCancel} disabled={busy}>
            {t('common:cancel')}
          </button>
          <button ref={confirmRef} type="submit" className="primary-button inline" disabled={busy}>
            {busy ? t('cancelRun.confirming') : t('cancelRun.confirm')}
          </button>
        </footer>
      </form>
    </div>
  )
}
