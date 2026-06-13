import { Archive, ArchiveRestore, CircleDot, Clipboard, ExternalLink, GitPullRequest, Maximize2, MoreHorizontal, Pencil, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ActionIcon } from '../primitives/ActionIcon'
import { Tooltip } from '../primitives/Tooltip'
import { microStatusDot, stateCopy, taskStatusBadgeClass, taskStatusLabel } from '../../lib/format'
import type { WorkItem } from '../../lib/types'

type DrawerHeaderProps = {
  item: WorkItem | null
  onClose: () => void
  actionMenuOpen?: boolean
  onToggleActionMenu?: () => void
  canEditLocalTask?: boolean
  canReopen?: boolean
  canArchive?: boolean
  isBusy?: boolean
  onEditLocalTask?: () => void
  onOpenDetailPage?: () => void
  onReopen?: () => void
  onArchive?: () => void
  onCopyId?: () => void
}

export function DrawerHeader({
  item,
  onClose,
  actionMenuOpen = false,
  onToggleActionMenu,
  canEditLocalTask = false,
  canReopen = false,
  canArchive = false,
  isBusy = false,
  onEditLocalTask,
  onOpenDetailPage,
  onReopen,
  onArchive,
  onCopyId,
}: DrawerHeaderProps) {
  const { t } = useTranslation('drawer')
  if (!item) {
    return (
      <header className="task-drawer-header" role="banner">
        <div className="task-drawer-title-group">
          <span className="eyebrow">{t('kicker')}</span>
          <h2>{t('loading')}</h2>
        </div>
        <ActionIcon label={t('closeDrawer')} onClick={onClose}>
          <X size={16} />
        </ActionIcon>
      </header>
    )
  }

  const microStatus = microStatusDot(item)
  const isLocalTask = item.sourceKey === 'local' && item.kind === 'localTask'
  return (
    <header className="task-drawer-header" role="banner">
      <div className="task-drawer-title-group">
        <span className="task-drawer-kicker">
          <Tooltip content={microStatus.label}>
            <span className={`state-dot micro-status ${microStatus.className}`} />
          </Tooltip>
          <span>{item.shortId ?? item.number}</span>
          <span className={`source-chip ${item.type}`}>
            {item.type === 'pr' ? <GitPullRequest size={13} /> : <CircleDot size={13} />}
            <span>{item.type === 'task' ? t('localShort') : item.number}</span>
          </span>
          <span className={`state-pill ${taskStatusBadgeClass(item.taskStatus)}`}>{taskStatusLabel(item.taskStatus)}</span>
        </span>
        <h2>
          <Tooltip content={item.title}>
            <span>{item.title}</span>
          </Tooltip>
        </h2>
        <p className="task-drawer-state-copy">{stateCopy(item.state)}</p>
      </div>
      <div className="task-drawer-actions">
        <ActionIcon
          label={t('openDetail')}
          title={t('openDetail')}
          onClick={onOpenDetailPage}
          disabled={!onOpenDetailPage}
        >
          <Maximize2 size={16} />
        </ActionIcon>
        <div className="action-menu-wrap">
          <ActionIcon
            label={t('moreActions')}
            title={t('moreActions')}
            active={actionMenuOpen}
            onClick={onToggleActionMenu}
            disabled={!onToggleActionMenu}
          >
            <MoreHorizontal size={17} />
          </ActionIcon>
          {actionMenuOpen ? (
            <div className="action-menu task-drawer-action-menu" role="menu">
              {item.externalUrl ? (
                <a role="menuitem" href={item.externalUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={15} />
                  {t('menu.openSource')}
                </a>
              ) : null}
              {isLocalTask ? (
                <button role="menuitem" onClick={onEditLocalTask} disabled={!canEditLocalTask || isBusy}>
                  <Pencil size={15} />
                  {t('menu.editLocal')}
                </button>
              ) : null}
              {item.state === 'archived' ? (
                <button role="menuitem" onClick={onReopen} disabled={!canReopen || isBusy}>
                  <ArchiveRestore size={15} />
                  {t('menu.reopen')}
                </button>
              ) : (
                <button role="menuitem" onClick={onArchive} disabled={!canArchive || isBusy}>
                  <Archive size={15} />
                  {t('menu.archive')}
                </button>
              )}
              <button role="menuitem" onClick={onCopyId}>
                <Clipboard size={15} />
                {t('menu.copyId')}
              </button>
            </div>
          ) : null}
        </div>
        <ActionIcon label="Close task drawer" onClick={onClose}>
          <X size={16} />
        </ActionIcon>
      </div>
    </header>
  )
}
