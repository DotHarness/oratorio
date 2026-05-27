import { useEffect, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { DrawerHeader } from '../components/drawer/DrawerHeader'
import type { WorkItem } from '../lib/types'

type TaskDrawerProps = {
  item: WorkItem | null
  onClose: () => void
  onResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void
  onResizeMove: (event: ReactPointerEvent<HTMLDivElement>) => void
  onResizeEnd: (event: ReactPointerEvent<HTMLDivElement>) => void
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
  statusContent: ReactNode
}

export function TaskDrawer({
  item,
  onClose,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  actionMenuOpen,
  onToggleActionMenu,
  canEditLocalTask,
  canReopen,
  canArchive,
  isBusy,
  onEditLocalTask,
  onOpenDetailPage,
  onReopen,
  onArchive,
  onCopyId,
  statusContent,
}: TaskDrawerProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <aside className="task-drawer" aria-label={item ? `Task drawer for ${item.shortId ?? item.title}` : 'Task drawer'}>
      <div
        className="task-drawer-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize task drawer"
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
      />
      <DrawerHeader
        item={item}
        onClose={onClose}
        actionMenuOpen={actionMenuOpen}
        onToggleActionMenu={onToggleActionMenu}
        canEditLocalTask={canEditLocalTask}
        canReopen={canReopen}
        canArchive={canArchive}
        isBusy={isBusy}
        onEditLocalTask={onEditLocalTask}
        onOpenDetailPage={onOpenDetailPage}
        onReopen={onReopen}
        onArchive={onArchive}
        onCopyId={onCopyId}
      />
      <section
        aria-label="Task status"
        className="task-drawer-panel"
      >
        {statusContent}
      </section>
    </aside>
  )
}
