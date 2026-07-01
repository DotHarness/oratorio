import { ArrowLeft, CircleDot, FileText, Folder, GitPullRequest } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import { ActionIcon } from '../components/primitives/ActionIcon'
import { GithubGlyph, GitlabGlyph } from '../components/primitives/ProviderGlyphs'
import { Tooltip } from '../components/primitives/Tooltip'
import { taskStatusBadgeClass, taskStatusLabel } from '../lib/format'
import { buildSourceProjectFilterOptions, sourceProjectDisplay, type SourceProjectFilterOption } from '../lib/sourceProjects'
import type { ReviewStageId, WorkItem } from '../lib/types'
import { ItemDetailView, type ItemDetailViewProps } from './ItemDetailView'

type TaskDetailPageProps = {
  item: WorkItem | null | undefined
  itemDetailProps: ItemDetailViewProps
  activeStage: ReviewStageId
  repositories?: string[]
  sourceProjectOptions?: SourceProjectFilterOption[]
  onBackToBoard: () => void
}

const chipIconProps = { size: 14, strokeWidth: 1.75 } as const

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
  repositories = [],
  sourceProjectOptions: providedSourceProjectOptions,
  onBackToBoard,
}: TaskDetailPageProps) {
  const { t } = useTranslation('detail')
  const computedSourceProjectOptions = useMemo(
    () => buildSourceProjectFilterOptions(repositories),
    [repositories],
  )
  const sourceProjectOptions = providedSourceProjectOptions ?? computedSourceProjectOptions
  const sourceProject = item
    ? sourceProjectDisplay(item.repository, sourceProjectOptions, item.sourceKey)
    : null
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
              {item.repository && sourceProject ? (
                <Tooltip content={sourceProject.tooltip}>
                  <span className="task-detail-breadcrumb-repo">{sourceProject.label}</span>
                </Tooltip>
              ) : null}
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
