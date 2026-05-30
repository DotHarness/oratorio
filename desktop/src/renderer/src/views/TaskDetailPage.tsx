import { ArrowLeft, CircleDot, FileText, Folder, GitPullRequest } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import { ActionIcon } from '../components/primitives/ActionIcon'
import { taskStatusBadgeClass, taskStatusLabel } from '../lib/format'
import type { ReviewStageId, WorkItem } from '../lib/types'
import { ItemDetailView, type ItemDetailViewProps } from './ItemDetailView'

type TaskDetailPageProps = {
  item: WorkItem | null | undefined
  itemDetailProps: ItemDetailViewProps
  activeStage: ReviewStageId
  onBackToBoard: () => void
}

const chipIconProps = { size: 14, strokeWidth: 1.75 } as const

function GithubGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11.04 11.04 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56C20.22 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  )
}

function GitlabGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="m23.6 9.6-.03-.09L20.42.7a.83.83 0 0 0-1.55.05L16.74 7.2H7.27L5.13.75a.82.82 0 0 0-.78-.56.83.83 0 0 0-.78.56L.43 9.5l-.03.1a5.85 5.85 0 0 0 2.13 6.78l.01.01.03.02 5.27 3.94 2.61 1.97 1.58 1.2a.97.97 0 0 0 1.18 0l1.58-1.2 2.6-1.97 5.32-3.96.02-.02a5.86 5.86 0 0 0 2.12-6.77Z" />
    </svg>
  )
}

function sourceChipIcon(item: WorkItem) {
  if (item.sourceKey === 'github') return <GithubGlyph />
  if (item.sourceKey === 'gitlab') return <GitlabGlyph />
  return <Folder {...chipIconProps} />
}

function sourceChipLabel(item: WorkItem) {
  if (item.sourceKey === 'github' || item.sourceKey === 'gitlab') {
    return item.sourceKey === 'github' ? 'GitHub' : 'GitLab'
  }
  return i18n.t('detail:chip.local')
}

function kindChipIcon(item: WorkItem) {
  if (item.type === 'pr') return <GitPullRequest {...chipIconProps} />
  if (item.type === 'issue') return <CircleDot {...chipIconProps} />
  return <FileText {...chipIconProps} />
}

function kindChipLabel(item: WorkItem) {
  if (item.type === 'pr') return i18n.t('detail:chip.pr')
  if (item.type === 'issue') return i18n.t('detail:chip.issue')
  return i18n.t('detail:chip.task')
}

export function TaskDetailPage({
  item,
  itemDetailProps,
  activeStage,
  onBackToBoard,
}: TaskDetailPageProps) {
  const { t } = useTranslation('detail')
  return (
    <section className="task-detail-page" aria-label={item ? t('page.detailForName', { name: item.shortId ?? item.title }) : t('page.detail')}>
      <header className="task-detail-header">
        <ActionIcon className="icon-button task-detail-back" label={t('page.backToBoard')} onClick={onBackToBoard}>
          <ArrowLeft size={16} />
        </ActionIcon>
        <nav className="task-detail-breadcrumb" aria-label={t('page.breadcrumb')}>
          {item ? (
            <>
              <span className={`card-chip card-chip--source card-chip--source-${item.sourceKey}`}>
                {sourceChipIcon(item)}
                <span>{sourceChipLabel(item)}</span>
              </span>
              <span className={`card-chip card-chip--kind card-chip--kind-${item.type}`}>
                {kindChipIcon(item)}
                <span>{kindChipLabel(item)}</span>
              </span>
              {item.repository ? <span className="task-detail-breadcrumb-repo">{item.repository}</span> : null}
              <span className="card-chip card-chip--id">{item.shortId ?? item.externalId ?? item.number}</span>
              <span className={`state-pill ${taskStatusBadgeClass(item.taskStatus)}`}>{taskStatusLabel(item.taskStatus)}</span>
              <span className="task-detail-stage-label">{t('page.stageLabel', { stage: activeStage })}</span>
            </>
          ) : (
            <span>{t('page.loadingTask')}</span>
          )}
        </nav>
      </header>
      <div className="task-detail-body">
        <ItemDetailView {...itemDetailProps} />
      </div>
    </section>
  )
}
