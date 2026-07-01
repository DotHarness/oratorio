import { CircleDot, GitPullRequest, Plus, RefreshCw, Search } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ItemState, WorkItem } from '../lib/types'
import { buildSourceProjectFilterOptions, sourceProjectDisplay } from '../lib/sourceProjects'
import {
  checkIcon,
  checkLabel,
  queueLabelBadges,
  sourceLifecycleBadge,
  sourceMetaLabel,
  stateClassName,
  stateFilterIcon,
  stateLabel,
  stateTabs,
} from '../lib/format'
import { ActionIcon } from '../components/primitives/ActionIcon'
import { Tooltip } from '../components/primitives/Tooltip'
import { RepositoryFilterDropdown } from '../components/filters/RepositoryFilterDropdown'

type QueueViewProps = {
  query: string
  setQuery: (value: string) => void
  stateFilter: 'all' | ItemState
  setStateFilter: (value: 'all' | ItemState) => void
  repositoryFilter: string
  repositories: string[]
  setRepositoryFilter: (value: string) => void
  openCreateLocalTask: () => void
  refreshAll: () => Promise<void>
  visibleItems: WorkItem[]
  selectedItem: WorkItem | null | undefined
  openItemFromQueue: (item: WorkItem) => void
}

export function QueueView({
  query,
  setQuery,
  stateFilter,
  setStateFilter,
  repositoryFilter,
  repositories,
  setRepositoryFilter,
  openCreateLocalTask,
  refreshAll,
  visibleItems,
  selectedItem,
  openItemFromQueue,
}: QueueViewProps) {
  const { t } = useTranslation('board')
  const sourceProjectOptions = useMemo(
    () => buildSourceProjectFilterOptions(repositories),
    [repositories],
  )
  return (
    <>
              <section className="queue-pane" aria-label={t('queue.reviewQueue')}>
                <div className="search-box">
                  <Search size={16} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t('queue.searchItems')}
                    aria-label={t('queue.searchItems')}
                  />
                </div>

                <div className="tab-strip" aria-label={t('queue.stateFilters')}>
                  {stateTabs.map((tab) => (
                    <Tooltip key={tab} content={tab === 'all' ? t('queue.allItems') : stateLabel(tab)}>
                      <button
                        className={stateFilter === tab ? 'selected' : ''}
                        onClick={() => setStateFilter(tab)}
                        aria-label={tab === 'all' ? t('queue.allItems') : stateLabel(tab)}
                      >
                        {stateFilterIcon(tab)}
                      </button>
                    </Tooltip>
                  ))}
                </div>

                <div className="queue-toolbar">
                  <RepositoryFilterDropdown value={repositoryFilter} repositories={repositories} onChange={setRepositoryFilter} />
                  <span className="queue-actions">
                    <ActionIcon label={t('actions.newLocalTask')} onClick={openCreateLocalTask}>
                      <Plus size={16} />
                    </ActionIcon>
                    <ActionIcon label={t('actions.refresh')} onClick={() => void refreshAll()}>
                      <RefreshCw size={16} />
                    </ActionIcon>
                  </span>
                </div>

                <div className="item-list">
                  {visibleItems.map((item) => {
                    const sourceProject = sourceProjectDisplay(item.repository, sourceProjectOptions, item.sourceKey)
                    return (
                      <button
                        key={item.id}
                        className={`item-row board-item-row ${selectedItem?.id === item.id ? 'active' : ''}`}
                        onClick={() => openItemFromQueue(item)}
                      >
                        <span className={`item-icon ${item.type}`}>
                          {item.type === 'pr' ? <GitPullRequest size={17} /> : <CircleDot size={17} />}
                        </span>
                        <span className="item-main">
                          <span className="item-title-line">
                            <span className="item-title">{item.title}</span>
                            <span className={`state-dot ${stateClassName(item.state)}`} />
                          </span>
                          <Tooltip content={sourceProject.tooltip}>
                            <span className="item-meta">{sourceProject.label} {item.number}</span>
                          </Tooltip>
                          <span className="item-source-meta">{sourceMetaLabel(item)} · {t('card.updated', { value: item.updated })}</span>
                          <span className="item-badges">
                            {sourceLifecycleBadge(item)}
                            <Tooltip content={`oratorio/review: ${checkLabel(item.check)}`}>
                              <span className={`mini-check ${item.check}`}>
                                {checkIcon(item.check)}
                                <span className="chip-text">{checkLabel(item.check)}</span>
                              </span>
                            </Tooltip>
                            {queueLabelBadges(item)}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
    </>
  )
}
