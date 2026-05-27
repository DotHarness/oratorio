import { CircleDot, GitPullRequest, Plus, RefreshCw, Search } from 'lucide-react'
import type { ItemState, WorkItem } from '../lib/types'
import {
  checkIcon,
  checkLabel,
  queueLabelBadges,
  sourceLifecycleBadge,
  sourceMetaLabel,
  stateClassName,
  stateFilterIcon,
  stateLabels,
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
  return (
    <>
              <section className="queue-pane" aria-label="Review queue">
                <div className="search-box">
                  <Search size={16} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search items"
                    aria-label="Search items"
                  />
                </div>

                <div className="tab-strip" aria-label="State filters">
                  {stateTabs.map((tab) => (
                    <Tooltip key={tab} content={tab === 'all' ? 'All items' : stateLabels[tab]}>
                      <button
                        className={stateFilter === tab ? 'selected' : ''}
                        onClick={() => setStateFilter(tab)}
                        aria-label={tab === 'all' ? 'All items' : stateLabels[tab]}
                      >
                        {stateFilterIcon(tab)}
                      </button>
                    </Tooltip>
                  ))}
                </div>

                <div className="queue-toolbar">
                  <RepositoryFilterDropdown value={repositoryFilter} repositories={repositories} onChange={setRepositoryFilter} />
                  <span className="queue-actions">
                    <ActionIcon label="New local task" onClick={openCreateLocalTask}>
                      <Plus size={16} />
                    </ActionIcon>
                    <ActionIcon label="Refresh" onClick={() => void refreshAll()}>
                      <RefreshCw size={16} />
                    </ActionIcon>
                  </span>
                </div>

                <div className="item-list">
                  {visibleItems.map((item) => (
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
                        <span className="item-meta">{item.repository} {item.number}</span>
                        <span className="item-source-meta">{sourceMetaLabel(item)} · updated {item.updated}</span>
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
                  ))}
                </div>
              </section>
    </>
  )
}
