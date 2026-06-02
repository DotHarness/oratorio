import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, SetStateAction } from 'react'
import { HashRouter, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  ChevronRight,
  CheckCircle2,
  Info,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import '../App.css'
import i18n from '../i18n'
import { apiGet, apiPatch, apiPost, apiPut, getServerBaseUrl, setServerBaseUrl as setApiServerBaseUrl } from '../api'
import {
  detailMatchesSelection,
  replaceMatchingItemWithDetail,
  shouldApplyDetailResponse,
} from '../itemDetailState'
import { SettingsView } from '../views/SettingsView'
import { normalizeSettingsSection, settingsSections } from '../settingsSections'
import { ActionIcon } from '../components/primitives/ActionIcon'
import type { ItemDetailViewProps } from '../views/ItemDetailView'
import { TaskDetailPage } from '../views/TaskDetailPage'
import { LocalTaskFormDialog, type LocalTaskSourceProjectOption } from '../views/LocalTaskFormDialog'
import { BoardView, type BoardViewMode } from '../views/BoardView'
import { TaskDrawer } from '../views/TaskDrawer'
import { TaskStatusPanel } from '../views/drawer/TaskStatusPanel'
import { CelebrationBurst } from '../components/feedback/CelebrationBurst'
import { OnboardingTour } from '../components/onboarding/OnboardingTour'
import { markOnboardingSeen, shouldShowOnboarding } from '../lib/onboarding'
import { useBoardStream } from '../hooks/useBoardStream'
import { applyBoardEvent } from '../lib/sortOrder'
import { parseTaskSearchQuery, taskSearchApiSource } from '../lib/taskSearch'
import { DesktopTitlebar } from './DesktopTitlebar'
import type {
  BoardEvent,
  BoardStreamEvent,
  BoardStreamStatus,
  DeliveryPolicy,
  DiscussionTurn,
  DotCraftAppBindingStatusResponse,
  DotCraftStatus,
  DotCraftStatusResponse,
  FollowUpDraft,
  GitHubSyncJob,
  GitHubSyncMode,
  GitHubSyncRepositoryRun,
  GitHubSourceStatus,
  GitHubSourceStatusResponse,
  ItemDetailResponse,
  LocalTaskForm,
  MockOutcome,
  ReviewDraft,
  ReviewFindingResolutionKind,
  ReviewStageId,
  RunnerMode,
  SourceProviderStatus,
  SourcesResponse,
  SourceSyncSchedule,
  SourceSyncSchedulesResponse,
  SourceSyncScheduleUpdateRequest,
  SourceSyncJob,
  SourceSyncMode,
  SourceSyncProjectRun,
  TaskListResponse,
  UiNotice,
  WorkItem,
} from '../lib/types'
import {
  buildRoundHistory,
  clampNumberValue,
  defaultLocalTaskLabels,
  defaultDrawerWidth,
  defaultReviewSidecarWidth,
  defaultReviewStage,
  defaultSidebarWidth,
  detailToWorkItem,
  decisionLabel,
  dotcraftHealthMessage,
  drawerWidthStorageKey,
  emptyLocalTaskForm,
  errorMessage,
  itemHasActiveRun,
  itemSummaryToWorkItem,
  itemUrl,
  isActiveRun,
  isTechnicalTimelineEvent,
  labelsFromInput,
  latestRun,
  localTaskSourceProjectStorageKey,
  localTaskAssigneeOptions,
  localTaskBranchOptions,
  maxReviewSidecarWidth,
  maxSidebarWidth,
  maxDrawerWidth,
  minDrawerWidth,
  minReviewSidecarWidth,
  minSidebarWidth,
  optionalValue,
  parseBrief,
  pullRequestReReviewInfo,
  reviewSidecarWidthStorageKey,
  sidebarWidthStorageKey,
  sourceItemUrl,
  storedClampedNumber,
  storedTheme,
  themeStorageKey,
} from '../lib/format'

function normalizeReviewStage(value: string | undefined): ReviewStageId | null {
  return value === 'intake' || value === 'analysis' || value === 'review' || value === 'decision' || value === 'closed'
    ? value
    : null
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'dark' || value === 'light'
}

function escapeAttributeValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

const activeTaskStateQuery = 'discovered,dispatching,running,failed,awaitingReview,approved'
const closedTaskPageSize = 50
const DEFAULT_RUN_TIMEOUT_SECONDS = 30 * 60
const INITIAL_LAUNCH_REVEAL_MS = 360
const initialLaunchStartingMessage = () => i18n.t('common:shell.launch.starting')
const initialLaunchPreparingMessage = () => i18n.t('common:shell.launch.preparing')
const DEFAULT_APP_BINDING_STATUS: DotCraftAppBindingStatusResponse = {
  appId: 'com.dotharness.oratorio',
  available: false,
  configured: false,
  connected: false,
  state: 'notConnected',
  workspacePath: '',
  endpoint: '',
  endpointSource: '',
  accountLabel: null,
  connectedAt: null,
  expiresAt: null,
  diagnostic: null,
  message: 'DotCraft App Binding status has not been loaded.',
}
type ThemeMode = 'dark' | 'light'
type InitialLaunchPhase = 'loading' | 'revealing' | 'ready'
type OratorioServerState = 'stopped' | 'starting' | 'running' | 'error'
type OratorioServerStatus = {
  state: OratorioServerState
  serverUrl: string | null
  reusedExistingServer: boolean
  pid: number | null
  errorMessage: string | null
}
type ServerRestartState = 'idle' | 'restarting' | 'failed'
type PendingServerRestart = {
  signature: string
  fields: string[]
}
type AppBindingDialogState =
  | { status: 'loading'; url: string }
  | { status: 'ready'; url: string; inspection: AppBindingInspection }
  | { status: 'approving'; url: string; inspection: AppBindingInspection }
  | { status: 'error'; url: string; message: string }

type AppBindingInspection = {
  operation: 'connect' | 'bind' | string
  connection?: {
    displayName: string
    developerName: string
    workspaceLabel: string
    userLabel: string
    expiresAt: string
  } | null
  binding?: {
    displayName: string
    developerName: string
    threadId: string
    threadTitle?: string | null
    requestedScopes: string[]
    scopeCatalog: Array<{ id: string; displayName: string; description: string; risk: string }>
    toolCatalog: Array<{ name: string; risk: string; defaultExposure: string; description?: string | null }>
    expiresAt: string
  } | null
}

type AppBindingApprovalResult = {
  operation: string
  state: string
  bindingId?: string | null
}
const githubWritesDisabledReason = () => i18n.t('common:shell.githubWritesDisabledReason')
const githubAppAuthRequiredReason = () => i18n.t('common:shell.githubAppAuthRequiredReason')

function taskListPath(params: Record<string, string | number | boolean | null | undefined>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') {
      query.set(key, String(value))
    }
  }

  const suffix = query.toString()
  return suffix ? `/tasks?${suffix}` : '/tasks'
}

function isActiveBoardItem(item: WorkItem) {
  return item.state !== 'rejected' && item.state !== 'archived'
}

function itemMatchesBoardEvent(item: WorkItem, event: Pick<BoardEvent, 'taskId' | 'shortId'>) {
  return Boolean(
    (event.taskId && (item.itemId === event.taskId || item.id === event.taskId)) ||
    (event.shortId && item.shortId === event.shortId),
  )
}

function isActiveDiscussionTurn(turn: DiscussionTurn) {
  return turn.status === 'pending' || turn.status === 'running'
}

function waitForInitialBoardPaint(): Promise<void> {
  return new Promise((resolve) => {
    const scheduleFrame =
      typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 16)

    scheduleFrame(() => {
      scheduleFrame(() => resolve())
    })
  })
}

export function AppShell() {
  return (
    <HashRouter>
      <OratorioApp />
    </HashRouter>
  )
}

function OratorioApp() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const [items, setItems] = useState<WorkItem[]>([])
  const [boardViewMode, setBoardViewMode] = useState<BoardViewMode>('active')
  const [closedItems, setClosedItems] = useState<WorkItem[]>([])
  const [closedNextCursor, setClosedNextCursor] = useState<string | null>(null)
  const [closedLoading, setClosedLoading] = useState(false)
  const [closedError, setClosedError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<WorkItem | null>(null)
  const [query, setQuery] = useState('')
  const [repositoryFilter, setRepositoryFilter] = useState('all')
  const [feedbackDraft, setFeedbackDraft] = useState('')
  const [decisionNote, setDecisionNote] = useState('')
  const [taskFormMode, setTaskFormMode] = useState<'create' | 'edit' | null>(null)
  const [taskForm, setTaskForm] = useState<LocalTaskForm>(() => emptyLocalTaskForm())
  const [taskFormError, setTaskFormError] = useState<string | null>(null)
  const [actionMenuItemId, setActionMenuItemId] = useState<string | null>(null)
  const [reviewInspectorOpen, setReviewInspectorOpen] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    storedClampedNumber(sidebarWidthStorageKey, defaultSidebarWidth, minSidebarWidth, maxSidebarWidth),
  )
  const [reviewSidecarWidth, setReviewSidecarWidth] = useState(() =>
    storedClampedNumber(reviewSidecarWidthStorageKey, defaultReviewSidecarWidth, minReviewSidecarWidth, maxReviewSidecarWidth),
  )
  const [drawerWidth, setDrawerWidth] = useState(() =>
    storedClampedNumber(drawerWidthStorageKey, defaultDrawerWidth, minDrawerWidth, maxDrawerWidth),
  )
  const [showTechnicalEventsByRound, setShowTechnicalEventsByRound] = useState<Record<string, boolean>>({})
  const [reviewStageByItem, setReviewStageByItem] = useState<Record<string, ReviewStageId>>({})
  const [taskCreateCelebrationOrigin, setTaskCreateCelebrationOrigin] = useState<{ x: number; y: number } | null>(null)
  const [taskCreateCelebrationKey, setTaskCreateCelebrationKey] = useState(0)
  const [theme, setThemeState] = useState<ThemeMode>(storedTheme)
  const isDesktopShell = typeof window !== 'undefined' && Boolean(window.oratorioDesktop)
  const [serverBaseUrl, setServerBaseUrlState] = useState(() => getServerBaseUrl())
  const latestThemeRef = useRef<ThemeMode>(theme)
  const desktopThemeHydratedRef = useRef(!(typeof window !== 'undefined' && window.oratorioDesktop))
  const desktopThemeUserChangedRef = useRef(false)
  const skipNextDesktopThemePersistRef = useRef(false)
  const setTheme = useCallback((nextTheme: SetStateAction<ThemeMode>) => {
    desktopThemeUserChangedRef.current = true
    setThemeState((currentTheme) => {
      const resolvedTheme = typeof nextTheme === 'function' ? nextTheme(currentTheme) : nextTheme
      latestThemeRef.current = resolvedTheme
      return resolvedTheme
    })
  }, [])
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const onboardingAutoTriggeredRef = useRef(false)
  const completeOnboarding = useCallback(() => {
    markOnboardingSeen()
    setOnboardingOpen(false)
  }, [])
  const replayOnboarding = useCallback(() => {
    setOnboardingOpen(true)
  }, [])
  const appIconSrc = `${import.meta.env.BASE_URL}oratorio-icon.svg`
  const dotcraftIconSrc = `${import.meta.env.BASE_URL}dotcraft-icon.svg`
  const runnerMode: RunnerMode = 'appServer'
  const mockOutcome: MockOutcome = 'success'
  const [, setBoardStreamStatus] = useState<BoardStreamStatus>('disconnected')
  const [isStartingAppServer, setIsStartingAppServer] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [initialLaunchPhase, setInitialLaunchPhase] = useState<InitialLaunchPhase>('loading')
  const [initialLaunchMessage, setInitialLaunchMessage] = useState(initialLaunchStartingMessage)
  const [error, setError] = useState<string | null>(null)
  const [uiNotice, setUiNotice] = useState<UiNotice | null>(null)
  const [appBindingDialog, setAppBindingDialog] = useState<AppBindingDialogState | null>(null)
  const [pendingServerRestart, setPendingServerRestart] = useState<PendingServerRestart | null>(null)
  const [serverRestartState, setServerRestartState] = useState<ServerRestartState>('idle')
  const sidebarResizeStart = useRef<{ x: number; width: number } | null>(null)
  const sidecarResizeStart = useRef<{ x: number; width: number } | null>(null)
  const drawerResizeStart = useRef<{ x: number; width: number } | null>(null)
  const detailRequestIdRef = useRef(0)
  const closedRequestIdRef = useRef(0)
  const selectedIdRef = useRef<string | null>(null)
  const selectedDetailRef = useRef<WorkItem | null>(null)
  const initialRefreshStartedRef = useRef(false)
  const noticeTimerRef = useRef<number | null>(null)
  const celebrationTimerRef = useRef<number | null>(null)
  const githubSyncStatusRef = useRef<string | null>(null)
  const sourceSyncStatusesRef = useRef<Record<string, string | null>>({})
  const rememberedLocalTaskProjectAppliedRef = useRef(false)
  const sourceDetailsAttemptedRef = useRef<Set<string>>(new Set())
  const pendingAppBindingHandoffUrlsRef = useRef<string[]>([])
  const drainingAppBindingHandoffsRef = useRef(false)
  const lastWorkRouteRef = useRef('/projects/default')
  const lastBoardRouteRef = useRef('/projects/default')
  const [githubStatus, setGithubStatus] = useState<GitHubSourceStatus>({
    available: false,
    configured: false,
    repositories: [],
    lastSyncAt: null,
    message: 'GitHub source status has not been loaded.',
    writesEnabled: false,
    writeConfigured: false,
  })
  const [githubSyncJob, setGithubSyncJob] = useState<GitHubSyncJob | null>(null)
  const [sourceProviders, setSourceProviders] = useState<SourceProviderStatus[]>([])
  const sourceProvidersRef = useRef<SourceProviderStatus[]>([])
  const [sourceSyncJobs, setSourceSyncJobs] = useState<Record<string, SourceSyncJob | null>>({})
  const [sourceSyncSchedules, setSourceSyncSchedules] = useState<Record<string, SourceSyncSchedule | null>>({})
  const [sourceDetailsSyncingItemId, setSourceDetailsSyncingItemId] = useState<string | null>(null)
  const [dotcraftStatus, setDotcraftStatus] = useState<DotCraftStatus>({
    available: false,
    configured: false,
    connected: false,
    health: 'unavailable',
    autoStart: false,
    workspacePath: '',
    endpoint: '',
    approvalPolicy: 'interrupt',
    runTimeoutSeconds: DEFAULT_RUN_TIMEOUT_SECONDS,
    managedWorktreesEnabled: false,
    worktreeRootPolicy: '',
    globalMaxActiveRuns: 1,
    maxActiveRunsPerRepository: 1,
    maxActiveRunsPerSource: 1,
    message: 'DotCraft bridge status has not been loaded.',
  })
  const [dotcraftAppBindingStatus, setDotcraftAppBindingStatus] = useState<DotCraftAppBindingStatusResponse>(DEFAULT_APP_BINDING_STATUS)

  useEffect(() => {
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!favicon) {
      return
    }

    favicon.type = 'image/svg+xml'
    favicon.href = appIconSrc
  }, [appIconSrc])

  const isSettingsRoute = location.pathname.startsWith('/settings')
  const isLegacyTopLevelRoute =
    location.pathname.startsWith('/sources') ||
    location.pathname.startsWith('/agents') ||
    location.pathname.startsWith('/rules') ||
    location.pathname.startsWith('/integrations')
  const pathSegments = location.pathname.split('/').filter(Boolean)
  const settingsActiveSection = isSettingsRoute ? normalizeSettingsSection(pathSegments[1]) : null
  const isProjectRoute = pathSegments[0] === 'projects'
  const workspaceId = isProjectRoute ? decodeURIComponent(pathSegments[1] ?? 'default') : 'default'
  const routeTaskShortId = isProjectRoute && pathSegments[2] === 'tasks' && pathSegments[3]
    ? decodeURIComponent(pathSegments[3])
    : null
  const isTaskDetailRoute = Boolean(routeTaskShortId && pathSegments[4] === 'detail')
  const routeDetailStage = normalizeReviewStage(isTaskDetailRoute ? pathSegments[5] : undefined)
  const drawerOpen = Boolean(routeTaskShortId && !isTaskDetailRoute)
  const legacyRouteItemId = location.pathname.startsWith('/items/')
    ? decodeURIComponent(location.pathname.split('/')[2] === 'id' ? location.pathname.split('/')[3] ?? '' : location.pathname.split('/')[2] ?? '')
    : null

  useEffect(() => {
    window.localStorage.setItem(sidebarWidthStorageKey, String(sidebarWidth))
  }, [sidebarWidth])

  useEffect(() => {
    window.localStorage.setItem(reviewSidecarWidthStorageKey, String(reviewSidecarWidth))
  }, [reviewSidecarWidth])

  useEffect(() => {
    window.localStorage.setItem(drawerWidthStorageKey, String(drawerWidth))
  }, [drawerWidth])

  useEffect(() => {
    const desktop = window.oratorioDesktop
    if (!desktop) {
      desktopThemeHydratedRef.current = true
      return
    }

    let cancelled = false
    void desktop.getTheme()
      .then((storedDesktopTheme) => {
        if (cancelled) {
          return
        }

        if (isThemeMode(storedDesktopTheme) && !desktopThemeUserChangedRef.current) {
          skipNextDesktopThemePersistRef.current = storedDesktopTheme !== latestThemeRef.current
          latestThemeRef.current = storedDesktopTheme
          window.localStorage.setItem(themeStorageKey, storedDesktopTheme)
          setThemeState(storedDesktopTheme)
          return
        }

        void desktop.setTheme(latestThemeRef.current).catch(() => {})
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          desktopThemeHydratedRef.current = true
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    latestThemeRef.current = theme
    window.localStorage.setItem(themeStorageKey, theme)

    const desktop = window.oratorioDesktop
    if (!desktop || !desktopThemeHydratedRef.current) {
      return
    }

    if (skipNextDesktopThemePersistRef.current) {
      skipNextDesktopThemePersistRef.current = false
      return
    }

    void desktop.setTheme(theme).catch(() => {})
  }, [theme])

  useEffect(() => {
    if (!isSettingsRoute) {
      lastWorkRouteRef.current = `${location.pathname}${location.search}`
    }
    if (!isSettingsRoute && !isLegacyTopLevelRoute && !isTaskDetailRoute) {
      lastBoardRouteRef.current = `${location.pathname}${location.search}`
    }
  }, [isLegacyTopLevelRoute, isSettingsRoute, isTaskDetailRoute, location.pathname, location.search])

  const knownItems = useMemo(() => {
    const byId = new Map<string, WorkItem>()
    for (const item of [...items, ...closedItems]) {
      byId.set(item.id, item)
    }
    return Array.from(byId.values())
  }, [closedItems, items])
  const selectedListItem = knownItems.find((item) => item.id === selectedId)
  const selectedDetailMatches = detailMatchesSelection(selectedDetail, selectedId, selectedListItem)
  const selectedItem =
    selectedDetailMatches
      ? selectedDetail
      : selectedListItem ?? items[0]
  const selectedDetailItem = selectedDetailMatches ? selectedDetail : null
  const selectedRun = selectedItem ? latestRun(selectedItem) : undefined
  const selectedReviewStage = selectedItem
    ? routeDetailStage ?? reviewStageByItem[selectedItem.id] ?? defaultReviewStage(selectedItem, selectedRun)
    : routeDetailStage ?? 'intake'
  const selectedDetailFocus = location.hash === '#discussion-composer' ? 'discussionComposer' : null
  const selectedRunIsActive = selectedRun ? isActiveRun(selectedRun.status) : selectedItem?.state === 'dispatching' || selectedItem?.state === 'running'
  const selectedIsLocalTask = selectedItem?.sourceKey === 'local' && selectedItem.kind === 'localTask'
  const selectedIsPullRequest = (selectedItem?.sourceKey === 'github' || selectedItem?.sourceKey === 'gitlab') && selectedItem.kind === 'pullRequest'
  const selectedCanArchive = Boolean(selectedItem && !selectedRunIsActive && selectedItem.state !== 'archived')
  const selectedCanReopen = Boolean(selectedItem && !selectedRunIsActive && selectedItem.state === 'archived')
  const selectedCanEditLocalTask = Boolean(selectedIsLocalTask && !selectedRunIsActive)
  const selectedCanDispatch = Boolean(selectedItem && !isBusy && !selectedRunIsActive && selectedItem.state !== 'archived')
  const selectedCanImplementationDispatch = Boolean(selectedCanDispatch && selectedItem && (selectedItem.kind === 'localTask' || ((selectedItem.sourceKey === 'github' || selectedItem.sourceKey === 'gitlab') && selectedItem.kind === 'issue')))
  const selectedCanDecide = Boolean(selectedItem && !isBusy && !selectedRunIsActive && selectedItem.state !== 'archived')
  const selectedReReviewInfo = pullRequestReReviewInfo(selectedItem)
  const reviewDraftPublishDisabledReason = selectedItem?.sourceKey === 'github' && githubStatus.available && !githubStatus.writesEnabled
    ? githubWritesDisabledReason()
    : selectedItem?.sourceKey === 'github' && githubStatus.available && githubStatus.writesEnabled && !githubStatus.writeConfigured
      ? githubAppAuthRequiredReason()
      : null
  const selectedActiveDiscussionTurn = selectedItem?.discussionTurns?.find(isActiveDiscussionTurn) ?? null
  const selectedHasCompatibleDiscussionThread = Boolean(selectedItem?.runs.some((run) =>
    run.runnerKind === 'appServer' &&
    run.status === 'succeeded' &&
    Boolean(run.threadId) &&
    Boolean(run.appServerEndpoint),
  ))
  const askAgentDisabledReason = !selectedItem
    ? t('common:shell.messages.selectTaskFirst')
    : selectedRunIsActive
      ? t('common:shell.messages.askAgentAfterRun')
      : selectedItem.state === 'archived'
        ? t('common:shell.messages.askAgentArchived')
        : selectedActiveDiscussionTurn
          ? t('common:shell.messages.askAgentAlreadyAnswering')
          : !selectedHasCompatibleDiscussionThread
            ? t('common:shell.messages.askAgentAfterCompletedRun')
            : null
  const selectedHasSourceMetadata = Boolean(
    selectedDetailItem?.sourceUpdated || selectedDetailItem?.lastSourceSync || selectedDetailItem?.sourceSnapshot || selectedDetailItem?.headSha,
  )
  const canUseBackend = !isDesktopShell || Boolean(serverBaseUrl)
  const selectedBrief = useMemo(() => parseBrief(selectedDetailItem?.description ?? ''), [selectedDetailItem?.description])
  const selectedRoundHistory = useMemo(() => (selectedDetailItem ? buildRoundHistory(selectedDetailItem) : []), [selectedDetailItem])
  const selectedSourceActivity = useMemo(() => selectedDetailItem?.timeline.filter((event) => !event.roundId) ?? [], [selectedDetailItem])
  const visibleSourceActivity = selectedSourceActivity.slice(0, 3)
  const hiddenSourceActivity = selectedSourceActivity.slice(3)
  const shouldPoll = items.some(itemHasActiveRun) || (selectedItem ? itemHasActiveRun(selectedItem) : false)
  const repositories = useMemo(() => {
    const known = [
      ...githubStatus.repositories,
      ...sourceProviders.flatMap((provider) => provider.projects.map((project) => project.key || project.projectPath)),
      ...knownItems.map((item) => item.repository),
    ]

    return Array.from(new Set(known.filter((repository) => repository && repository !== 'local'))).sort()
  }, [githubStatus.repositories, knownItems, sourceProviders])
  const taskSourceProjectOptions = useMemo(
    () => buildLocalTaskSourceProjectOptions(sourceProviders, githubStatus.repositories, knownItems),
    [githubStatus.repositories, knownItems, sourceProviders],
  )
  const hasConfiguredGitLab = sourceProviders.some((provider) => provider.provider === 'gitlab' && provider.configured)
  const taskAssigneeOptions = useMemo(() => localTaskAssigneeOptions(knownItems), [knownItems])
  const taskBranchOptions = useMemo(() => localTaskBranchOptions(knownItems, taskForm.repository), [knownItems, taskForm.repository])
  const taskLabelOptions = useMemo(() => {
    const known = knownItems.flatMap((item) => item.labels)
    return Array.from(new Set([...defaultLocalTaskLabels, ...known])).sort((left, right) => {
      const leftPreset = defaultLocalTaskLabels.includes(left)
      const rightPreset = defaultLocalTaskLabels.includes(right)
      if (leftPreset !== rightPreset) return leftPreset ? -1 : 1
      return left.localeCompare(right)
    })
  }, [knownItems])

  const refreshItems = useCallback(async () => {
    const response = await apiGet<TaskListResponse>(taskListPath({ state: activeTaskStateQuery, limit: 100 }))
    const nextItems = response.tasks.map(itemSummaryToWorkItem).filter(isActiveBoardItem)
    setItems(nextItems)
    return nextItems
  }, [])

  const fetchClosedItems = useCallback(
    async (mode: BoardViewMode, options?: { append?: boolean; cursor?: string | null }) => {
      if (mode === 'active') {
        return []
      }

      const requestId = closedRequestIdRef.current + 1
      closedRequestIdRef.current = requestId
      const append = options?.append === true
      setClosedLoading(true)
      setClosedError(null)
      try {
        const parsedQuery = parseTaskSearchQuery(query)
        const source = taskSearchApiSource(parsedQuery)
        const response = await apiGet<TaskListResponse>(
          taskListPath({
            state: mode === 'cancelled' ? 'rejected' : mode === 'archived' ? 'archived' : null,
            source,
            includeArchived: mode === 'all' ? true : null,
            sort: 'updatedDesc',
            limit: closedTaskPageSize,
            cursor: options?.cursor ?? null,
            q: parsedQuery.text || null,
            repository: repositoryFilter === 'all' ? null : repositoryFilter,
          }),
        )
        const nextItems = response.tasks.map(itemSummaryToWorkItem)
        if (requestId === closedRequestIdRef.current) {
          setClosedItems((current) => (append ? [...current, ...nextItems] : nextItems))
          setClosedNextCursor(response.nextCursor)
        }
        return nextItems
      } catch (reason) {
        if (requestId === closedRequestIdRef.current) {
          setClosedError(errorMessage(reason))
          if (!append) {
            setClosedItems([])
            setClosedNextCursor(null)
          }
        }
        return []
      } finally {
        if (requestId === closedRequestIdRef.current) {
          setClosedLoading(false)
        }
      }
    },
    [query, repositoryFilter],
  )

  const loadMoreClosedItems = useCallback(() => {
    if (boardViewMode === 'active' || !closedNextCursor || closedLoading) {
      return
    }

    void fetchClosedItems(boardViewMode, { append: true, cursor: closedNextCursor })
  }, [boardViewMode, closedLoading, closedNextCursor, fetchClosedItems])

  const refreshCurrentListView = useCallback(async () => {
    if (boardViewMode !== 'active') {
      await fetchClosedItems(boardViewMode)
    }
  }, [boardViewMode, fetchClosedItems])

  const refreshDetail = useCallback(async (item: WorkItem) => {
    const requestId = detailRequestIdRef.current + 1
    detailRequestIdRef.current = requestId
    const detail = await apiGet<ItemDetailResponse>(itemUrl(item)).catch((reason) => {
      if (!item.itemId) {
        throw reason
      }

      return apiGet<ItemDetailResponse>(sourceItemUrl(item))
    })
    const nextItem = detailToWorkItem(detail)
    if (
      shouldApplyDetailResponse(
        requestId,
        detailRequestIdRef.current,
        item,
        nextItem,
        selectedIdRef.current,
      )
    ) {
      setSelectedDetail(nextItem)
    }

    return nextItem
  }, [])

  const refreshGitHubStatus = useCallback(async () => {
    try {
      const status = await apiGet<GitHubSourceStatusResponse>('/sources/github/status')
      setGithubStatus({
        available: true,
        configured: status.configured ?? status.enabled ?? status.capabilities?.read ?? false,
        repositories: status.repositories ?? [],
        lastSyncAt: status.lastSyncAt ?? null,
        writesEnabled: status.writesEnabled ?? false,
        writeConfigured: status.writeConfigured ?? false,
        message: status.message ?? 'GitHub source read integration is available.',
      })
    } catch {
      setGithubStatus({
        available: false,
        configured: false,
        repositories: [],
        lastSyncAt: null,
        message: 'GitHub source API is not available on this backend yet.',
        writesEnabled: false,
        writeConfigured: false,
      })
    }
  }, [])

  const refreshGitHubSyncJob = useCallback(async () => {
    try {
      const job = await apiGet<GitHubSyncJob | null>('/sources/github/sync-jobs/active')
      setGithubSyncJob((current) => job ?? (current && isActiveGitHubSyncStatus(current.status) ? null : current))
    } catch {
      // Sync progress is best-effort; source status still reports availability.
    }
  }, [])

  const refreshSourceProviders = useCallback(async () => {
    try {
      const response = await apiGet<SourcesResponse>('/sources')
      const providers = response.providers ?? []
      sourceProvidersRef.current = providers
      setSourceProviders(providers)
    } catch {
      sourceProvidersRef.current = []
      setSourceProviders([])
    }
  }, [])

  const refreshSourceSyncJobs = useCallback(async () => {
    const currentProviders = sourceProvidersRef.current
    const providers = currentProviders.length ? currentProviders.map((provider) => provider.provider) : ['github', 'gitlab']
    const entries = await Promise.all(providers.map(async (provider) => {
      try {
        const job = await apiGet<SourceSyncJob | null>(`/sources/sync-jobs/active?provider=${encodeURIComponent(provider)}`)
        return [provider, job] as const
      } catch {
        return [provider, null] as const
      }
    }))
    setSourceSyncJobs((current) => {
      const next = { ...current }
      for (const [provider, job] of entries) {
        next[provider] = job ?? (current[provider] && isActiveSourceSyncStatus(current[provider]?.status ?? '') ? null : current[provider] ?? null)
      }
      return next
    })
  }, [])

  const refreshSourceSyncSchedules = useCallback(async () => {
    try {
      const response = await apiGet<SourceSyncSchedulesResponse>('/sources/sync-schedules')
      setSourceSyncSchedules(Object.fromEntries((response.schedules ?? []).map((schedule) => [schedule.provider, schedule])))
    } catch {
      setSourceSyncSchedules({})
    }
  }, [])

  const refreshDotCraftStatus = useCallback(async () => {
    try {
      const status = await apiGet<DotCraftStatusResponse>('/dotcraft/status')
      setDotcraftStatus({
        ...status,
        available: true,
        health: status.health ?? (status.connected ? 'connected' : status.configured ? 'configured' : 'unavailable'),
        message: status.message ?? dotcraftHealthMessage(status.health ?? (status.connected ? 'connected' : status.configured ? 'configured' : 'unavailable')),
      })
    } catch {
      setDotcraftStatus({
        available: false,
        configured: false,
        connected: false,
        health: 'unavailable',
        autoStart: false,
        workspacePath: '',
        endpoint: '',
        approvalPolicy: 'interrupt',
        runTimeoutSeconds: DEFAULT_RUN_TIMEOUT_SECONDS,
        managedWorktreesEnabled: false,
        worktreeRootPolicy: '',
        globalMaxActiveRuns: 1,
        maxActiveRunsPerRepository: 1,
        maxActiveRunsPerSource: 1,
        message: 'DotCraft bridge API is not available on this backend yet.',
      })
    }
  }, [])

  const refreshAppBindingStatus = useCallback(async () => {
    try {
      const status = await apiGet<DotCraftAppBindingStatusResponse>('/dotcraft/app-binding/status')
      setDotcraftAppBindingStatus({
        ...status,
        available: Boolean(status.available),
        connected: Boolean(status.connected),
        state: status.state || 'notConnected',
        message: status.message || 'DotCraft App Binding status is unavailable.',
      })
    } catch {
      setDotcraftAppBindingStatus({
        ...DEFAULT_APP_BINDING_STATUS,
        message: 'DotCraft App Binding status API is not available on this backend yet.',
      })
    }
  }, [])

  const refreshAll = useCallback(async (options?: { background?: boolean }) => {
    void options
    setError(null)
    try {
      await Promise.all([refreshItems(), refreshGitHubStatus(), refreshSourceProviders(), refreshDotCraftStatus(), refreshGitHubSyncJob(), refreshSourceSyncJobs(), refreshSourceSyncSchedules()])
    } catch (reason) {
      setError(errorMessage(reason))
    }
  }, [refreshDotCraftStatus, refreshGitHubStatus, refreshGitHubSyncJob, refreshItems, refreshSourceProviders, refreshSourceSyncJobs, refreshSourceSyncSchedules])

  const applyDesktopServerStatus = useCallback((status: OratorioServerStatus | null) => {
    if (!status) {
      return
    }

    if (status.state === 'running' && status.serverUrl) {
      setApiServerBaseUrl(status.serverUrl)
      setServerBaseUrlState(getServerBaseUrl())
      return
    }

    if (status.state === 'error' && initialLaunchPhase !== 'ready') {
      setInitialLaunchMessage(
        status.errorMessage
          ? t('common:shell.couldNotStart', { message: status.errorMessage })
          : t('common:shell.couldNotStartGeneric'),
      )
      return
    }

    if (!initialRefreshStartedRef.current && initialLaunchPhase !== 'ready') {
      setInitialLaunchMessage(initialLaunchStartingMessage())
    }
  }, [initialLaunchPhase])

  const applyStreamEvent = useCallback((event: BoardStreamEvent) => {
    if (event.type.startsWith('drawer/')) {
      return
    }

    if (event.type === 'source/github-sync/job.updated') {
      setGithubSyncJob(event.payload)
      return
    }

    if (event.type === 'source/github-sync/repository.updated') {
      setGithubSyncJob((current) => applyGitHubSyncRepositoryUpdate(current, event.payload))
      return
    }

    if (event.type === 'source/sync/job.updated') {
      setSourceSyncJobs((current) => ({ ...current, [event.payload.provider]: event.payload }))
      return
    }

    if (event.type === 'source/sync/project.updated') {
      setSourceSyncJobs((current) => ({
        ...current,
        [event.payload.provider]: applySourceSyncProjectUpdate(current[event.payload.provider] ?? null, event.payload),
      }))
      return
    }

    if (event.type === 'source/sync/schedule.updated') {
      setSourceSyncSchedules((current) => ({ ...current, [event.payload.provider]: event.payload }))
      return
    }

    const boardEvent = event as BoardEvent
    setItems((current) => applyBoardEvent(current, boardEvent).filter(isActiveBoardItem))
    const selectedDetailForEvent = selectedDetailRef.current
    if (boardEvent.type === 'task/updated' && selectedDetailForEvent && itemMatchesBoardEvent(selectedDetailForEvent, boardEvent)) {
      void refreshDetail(selectedDetailForEvent).catch((reason) => setError(errorMessage(reason)))
    }
  }, [refreshDetail])

  const handleBoardStreamStatus = useCallback((status: BoardStreamStatus) => {
    setBoardStreamStatus(status)
    if (status === 'connected') {
      void refreshGitHubSyncJob()
      void refreshSourceSyncJobs()
      void refreshSourceSyncSchedules()
    }
  }, [refreshGitHubSyncJob, refreshSourceSyncJobs, refreshSourceSyncSchedules])

  const sendBoardStreamFrame = useBoardStream({
    enabled: canUseBackend,
    serverBaseUrl,
    onEvent: applyStreamEvent,
    onStatus: handleBoardStreamStatus,
  })
  void sendBoardStreamFrame

  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  useEffect(() => {
    selectedDetailRef.current = selectedDetail
  }, [selectedDetail])

  useEffect(() => {
    if (!isDesktopShell) {
      return
    }

    const desktop = window.oratorioDesktop
    if (!desktop) {
      return
    }

    let cancelled = false
    void desktop.getStatus()
      .then((status) => {
        if (!cancelled) {
          applyDesktopServerStatus(status.server)
        }
      })
      .catch(() => {})

    const unsubscribe = desktop.onServerStatusChanged((status) => {
      applyDesktopServerStatus(status)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [applyDesktopServerStatus, isDesktopShell])

  useEffect(() => {
    if (!canUseBackend || initialRefreshStartedRef.current) {
      return
    }

    initialRefreshStartedRef.current = true
    let cancelled = false

    void (async () => {
      await waitForInitialBoardPaint()
      if (!cancelled) {
        setInitialLaunchMessage(initialLaunchPreparingMessage())
      }

      await refreshAll()
      await waitForInitialBoardPaint()

      if (!cancelled) {
        setInitialLaunchPhase('revealing')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [canUseBackend, refreshAll])

  useEffect(() => {
    if (!canUseBackend) {
      return
    }

    void refreshAppBindingStatus()
    const timer = window.setInterval(() => {
      void refreshAppBindingStatus()
    }, 30000)

    return () => window.clearInterval(timer)
  }, [canUseBackend, refreshAppBindingStatus])

  useEffect(() => {
    if (initialLaunchPhase !== 'revealing') {
      return
    }

    const timer = window.setTimeout(() => {
      setInitialLaunchPhase('ready')
    }, INITIAL_LAUNCH_REVEAL_MS)

    return () => window.clearTimeout(timer)
  }, [initialLaunchPhase])

  useEffect(() => {
    if (initialLaunchPhase !== 'ready' || onboardingAutoTriggeredRef.current) {
      return
    }

    onboardingAutoTriggeredRef.current = true
    if (shouldShowOnboarding()) {
      setOnboardingOpen(true)
    }
  }, [initialLaunchPhase])

  useEffect(() => {
    if (boardViewMode === 'active') {
      setClosedItems([])
      setClosedNextCursor(null)
      setClosedError(null)
      return
    }

    void fetchClosedItems(boardViewMode)
  }, [boardViewMode, fetchClosedItems])

  useEffect(() => {
    if (location.pathname === '/') {
      navigate('/projects/default', { replace: true })
    } else if (location.pathname === '/queue') {
      navigate('/projects/default', { replace: true })
    } else if (isLegacyTopLevelRoute) {
      navigate('/projects/default', { replace: true })
    }
  }, [isLegacyTopLevelRoute, location.pathname, navigate])

  useEffect(() => {
    if (!isTaskDetailRoute || !routeTaskShortId || !selectedItem) {
      return
    }
    const urlStage = pathSegments[5]
    if (urlStage && normalizeReviewStage(urlStage) === null) {
      const fallback = reviewStageByItem[selectedItem.id] ?? defaultReviewStage(selectedItem, selectedRun)
      navigate(
        `/projects/${encodeURIComponent(workspaceId || 'default')}/tasks/${encodeURIComponent(routeTaskShortId)}/detail/${fallback}`,
        { replace: true },
      )
    }
  }, [isTaskDetailRoute, routeTaskShortId, selectedItem, pathSegments, reviewStageByItem, selectedRun, workspaceId, navigate])

  useEffect(() => {
    if (!legacyRouteItemId || items.length === 0) {
      return
    }

    const matched = items.find((item) => item.itemId === legacyRouteItemId || item.id === legacyRouteItemId)
    if (!matched) {
      navigate('/projects/default', { replace: true })
      return
    }

    if (matched && selectedId !== matched.id) {
      setSelectedId(matched.id)
    }
    navigate(`/projects/default/tasks/${encodeURIComponent(matched.shortId ?? matched.itemId ?? matched.id)}`, { replace: true })
  }, [items, legacyRouteItemId, navigate, selectedId])

  useEffect(() => {
    if (!routeTaskShortId || items.length === 0) {
      return
    }

    const matched = knownItems.find((item) => item.shortId === routeTaskShortId || item.itemId === routeTaskShortId || item.id === routeTaskShortId)
    if (matched && selectedId !== matched.id) {
      setSelectedId(matched.id)
    }
  }, [knownItems, routeTaskShortId, selectedId])

  useEffect(() => {
    if (drawerOpen || routeTaskShortId || legacyRouteItemId || selectedId || items.length === 0 || isSettingsRoute || isLegacyTopLevelRoute) {
      return
    }

    setSelectedId(items[0].id)
  }, [drawerOpen, isLegacyTopLevelRoute, isSettingsRoute, items, legacyRouteItemId, routeTaskShortId, selectedId])

  useEffect(() => {
    const item = knownItems.find((candidate) => candidate.id === selectedId)
    if (!item) {
      return
    }

    setError(null)
    void refreshDetail(item).catch((reason) => setError(errorMessage(reason)))
  }, [knownItems, refreshDetail, selectedId])

  useEffect(() => {
    if (!shouldPoll) {
      return
    }

    const timer = window.setInterval(() => {
      void refreshAll({ background: true })
    }, 1000)

    return () => window.clearInterval(timer)
  }, [refreshAll, shouldPoll])

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current)
      }
      if (celebrationTimerRef.current !== null) {
        window.clearTimeout(celebrationTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!actionMenuItemId) {
      return
    }

    function closeMenu(event: PointerEvent) {
      const target = event.target as Element | null
      if (target?.closest('.action-menu-wrap')) {
        return
      }

      setActionMenuItemId(null)
    }

    window.addEventListener('pointerdown', closeMenu)
    return () => window.removeEventListener('pointerdown', closeMenu)
  }, [actionMenuItemId])

  const showNotice = useCallback((message: string, tone: UiNotice['tone'] = 'success', action?: Pick<UiNotice, 'actionLabel' | 'onAction'>) => {
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current)
    }

    setUiNotice({ message, tone, ...action })
    noticeTimerRef.current = window.setTimeout(() => {
      setUiNotice(null)
      noticeTimerRef.current = null
    }, 3200)
  }, [])

  const markDotCraftAppBindingConnected = useCallback(() => {
    setDotcraftAppBindingStatus((current) => ({
      ...current,
      appId: current.appId || DEFAULT_APP_BINDING_STATUS.appId,
      available: true,
      configured: true,
      connected: true,
      state: 'connected',
      accountLabel: current.accountLabel ?? 'Oratorio',
      connectedAt: current.connectedAt ?? new Date().toISOString(),
      message: t('common:shell.messages.dotCraftConnectedToOratorio'),
    }))
  }, [t])

  const inspectAppBindingHandoff = useCallback(async (url: string) => {
    const bindingHandoff = isDotCraftBindingHandoff(url)
    if (!bindingHandoff) {
      setAppBindingDialog({ status: 'loading', url })
    }
    try {
      const inspection = await apiPost<AppBindingInspection>('/dotcraft/app-binding/inspect', { url })
      if (inspection.operation === 'bind') {
        setAppBindingDialog(null)
        try {
          await apiPost<AppBindingApprovalResult>('/dotcraft/app-binding/approve', { url })
          await refreshAppBindingStatus()
          markDotCraftAppBindingConnected()
          showNotice(t('common:shell.notices.dotCraftToolsEnabled'), 'success')
        } catch (error) {
          showNotice(t('common:shell.notices.dotCraftBindingFailed', { message: errorMessage(error) }), 'error')
        }
        return
      }
      setAppBindingDialog({ status: 'ready', url, inspection })
    } catch (error) {
      if (bindingHandoff) {
        setAppBindingDialog(null)
      } else {
        setAppBindingDialog({ status: 'error', url, message: errorMessage(error) })
      }
      showNotice(t('common:shell.notices.dotCraftRequestFailed', { message: errorMessage(error) }), 'error')
    }
  }, [markDotCraftAppBindingConnected, refreshAppBindingStatus, showNotice, t])

  const drainPendingAppBindingHandoffs = useCallback(async () => {
    if (!canUseBackend || drainingAppBindingHandoffsRef.current) {
      return
    }

    drainingAppBindingHandoffsRef.current = true
    try {
      while (pendingAppBindingHandoffUrlsRef.current.length > 0) {
        const nextUrl = pendingAppBindingHandoffUrlsRef.current.shift()
        if (nextUrl) {
          await inspectAppBindingHandoff(nextUrl)
        }
      }
    } finally {
      drainingAppBindingHandoffsRef.current = false
    }
  }, [canUseBackend, inspectAppBindingHandoff])

  const handleAppBindingHandoff = useCallback((url: string) => {
    pendingAppBindingHandoffUrlsRef.current.push(url)
    void drainPendingAppBindingHandoffs()
  }, [drainPendingAppBindingHandoffs])

  useEffect(() => {
    void drainPendingAppBindingHandoffs()
  }, [drainPendingAppBindingHandoffs])

  useEffect(() => {
    const desktop = window.oratorioDesktop
    if (!desktop?.onAppBindingHandoff) {
      return
    }

    let disposed = false
    let unsubscribe: (() => void) | null = null
    void desktop.onAppBindingHandoff(handleAppBindingHandoff).then((nextUnsubscribe) => {
      if (disposed) {
        nextUnsubscribe()
      } else {
        unsubscribe = nextUnsubscribe
      }
    })

    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [handleAppBindingHandoff])

  const approveAppBindingHandoff = useCallback(async () => {
    if (!appBindingDialog || appBindingDialog.status !== 'ready') {
      return
    }

    const { url, inspection } = appBindingDialog
    setAppBindingDialog({ status: 'approving', url, inspection })
    try {
      const result = await apiPost<AppBindingApprovalResult>('/dotcraft/app-binding/approve', { url })
      setAppBindingDialog(null)
      await refreshAppBindingStatus()
      markDotCraftAppBindingConnected()
      showNotice(
        result.operation === 'connect'
          ? t('common:shell.notices.dotCraftConnected')
          : t('common:shell.notices.dotCraftThreadBindingActive'),
        'success',
      )
    } catch (error) {
      setAppBindingDialog({ status: 'ready', url, inspection })
      showNotice(t('common:shell.notices.dotCraftApprovalFailed', { message: errorMessage(error) }), 'error')
    }
  }, [appBindingDialog, markDotCraftAppBindingConnected, refreshAppBindingStatus, showNotice, t])

  useEffect(() => {
    const status = githubSyncJob?.status ?? null
    const previous = githubSyncStatusRef.current
    githubSyncStatusRef.current = status
    if (!previous || !status || !isActiveGitHubSyncStatus(previous) || isActiveGitHubSyncStatus(status)) {
      return
    }

    void refreshAll({ background: true })
    const repositoryRuns = githubSyncJob?.repositories ?? []
    const failedRuns = repositoryRuns.filter((run) => run.status === 'failed')
    if (status === 'succeeded') {
      showNotice(t('common:shell.notices.githubSyncFinished', { names: formatRepositoryNames(repositoryRuns) }))
    } else {
      showNotice(t('common:shell.notices.githubSyncFinishedWithFailures', { names: formatRepositoryNames(failedRuns, t('common:shell.syncFallback.failedRepositories')) }), 'error')
    }
  }, [githubSyncJob, refreshAll, showNotice, t])

  useEffect(() => {
    const previousStatuses = sourceSyncStatusesRef.current
    const nextStatuses: Record<string, string | null> = {}
    let shouldRefresh = false

    for (const [provider, job] of Object.entries(sourceSyncJobs)) {
      const status = job?.status ?? null
      nextStatuses[provider] = status
      const previous = previousStatuses[provider]
      if (
        provider === 'github' ||
        !previous ||
        !status ||
        !isActiveSourceSyncStatus(previous) ||
        isActiveSourceSyncStatus(status)
      ) {
        continue
      }

      shouldRefresh = true
      const projectRuns = job?.projects ?? []
      const failedRuns = projectRuns.filter((run) => run.status === 'failed')
      const providerName = providerLabel(provider)
      if (status === 'succeeded') {
        showNotice(t('common:shell.notices.sourceSyncFinished', { provider: providerName, names: formatSourceProjectNames(projectRuns) }))
      } else {
        showNotice(t('common:shell.notices.sourceSyncFinishedWithFailures', { provider: providerName, names: formatSourceProjectNames(failedRuns, t('common:shell.syncFallback.failedProjects')) }), 'error')
      }
    }

    sourceSyncStatusesRef.current = nextStatuses
    if (shouldRefresh) {
      void refreshAll({ background: true })
    }
  }, [sourceSyncJobs, refreshAll, showNotice, t])

  useEffect(() => {
    if (taskFormMode !== 'create' || taskForm.repository || rememberedLocalTaskProjectAppliedRef.current) {
      return
    }

    const rememberedProject = readRememberedLocalTaskSourceProject()
    if (!rememberedProject || !taskSourceProjectOptions.some((project) => project.value === rememberedProject)) {
      return
    }

    rememberedLocalTaskProjectAppliedRef.current = true
    setTaskForm((current) => current.repository ? current : { ...current, repository: rememberedProject })
  }, [taskFormMode, taskForm.repository, taskSourceProjectOptions])

  useEffect(() => {
    const item = selectedDetailItem
    if (!item?.itemId || item.sourceKey !== 'github' || item.sourceDetailsStatus === 'current' || item.sourceDetailsStatus === 'notRequired') {
      return
    }

    const attemptKey = `${item.itemId}:${item.sourceDetailsStatus}:${item.sourceUpdated ?? 'unknown'}`
    if (sourceDetailsAttemptedRef.current.has(attemptKey)) {
      return
    }

    sourceDetailsAttemptedRef.current.add(attemptKey)
    void syncSourceDetails(item, { silent: true })
  }, [selectedDetailItem?.itemId, selectedDetailItem?.sourceDetailsStatus, selectedDetailItem?.sourceUpdated])

  const startTaskCreateCelebration = useCallback((origin: { x: number; y: number }) => {
    if (celebrationTimerRef.current !== null) {
      window.clearTimeout(celebrationTimerRef.current)
    }

    setTaskCreateCelebrationOrigin(origin)
    setTaskCreateCelebrationKey((current) => current + 1)
    celebrationTimerRef.current = window.setTimeout(() => {
      setTaskCreateCelebrationOrigin(null)
      celebrationTimerRef.current = null
    }, 1200)
  }, [])

  const openCreatedTaskNotice = useCallback((item: WorkItem) => {
    setSelectedId(item.id)
    setSelectedDetail(item)
    navigate(`/projects/${encodeURIComponent(workspaceId || 'default')}/tasks/${encodeURIComponent(item.shortId ?? item.itemId ?? item.id)}`)
  }, [navigate, workspaceId])

  async function mutateSelected<TBody extends object>(path: string, body: TBody) {
    if (!selectedItem) {
      return false
    }

    setIsBusy(true)
    setError(null)
    try {
      const detail = await apiPost<ItemDetailResponse>(`${itemUrl(selectedItem)}${path}`, body).catch((reason) => {
        if (!selectedItem.itemId) {
          throw reason
        }

        return apiPost<ItemDetailResponse>(`${sourceItemUrl(selectedItem)}${path}`, body)
      })
      const nextItem = detailToWorkItem(detail)
      setSelectedDetail(nextItem)
      setItems((current) =>
        replaceMatchingItemWithDetail(current, nextItem).filter(isActiveBoardItem).sort((left, right) => (left.updated < right.updated ? 1 : -1)),
      )
      await refreshItems()
      await refreshCurrentListView()
      return true
    } catch (reason) {
      setError(errorMessage(reason))
      return false
    } finally {
      setIsBusy(false)
    }
  }

  async function syncSourceDetails(item: WorkItem, options: { silent?: boolean } = {}) {
    if (!item.itemId || item.sourceKey !== 'github' || item.sourceDetailsStatus === 'current') {
      return true
    }

    setSourceDetailsSyncingItemId(item.itemId)
    if (!options.silent) {
      setError(null)
    }

    try {
      const detail = await apiPost<ItemDetailResponse>(`/items/id/${encodeURIComponent(item.itemId)}/source-details/sync`, {})
      const nextItem = detailToWorkItem(detail)
      setSelectedDetail(nextItem)
      setItems((current) => replaceMatchingItemWithDetail(current, nextItem).filter(isActiveBoardItem))
      await refreshItems()
      return true
    } catch (reason) {
      try {
        const detail = await apiGet<ItemDetailResponse>(itemUrl(item))
        const nextItem = detailToWorkItem(detail)
        setSelectedDetail(nextItem)
        setItems((current) => replaceMatchingItemWithDetail(current, nextItem).filter(isActiveBoardItem))
      } catch {
        // The original source detail sync error is more useful to the operator.
      }

      setError(errorMessage(reason))
      return false
    } finally {
      setSourceDetailsSyncingItemId((current) => (current === item.itemId ? null : current))
    }
  }

  async function ensureSelectedSourceDetailsReady() {
    if (!selectedItem || selectedItem.sourceKey !== 'github' || selectedItem.sourceDetailsStatus === 'current') {
      return true
    }

    return await syncSourceDetails(selectedItem)
  }

  function openCreateLocalTask() {
    const rememberedProject = readRememberedLocalTaskSourceProject()
    const defaultProject = rememberedProject && taskSourceProjectOptions.some((project) => project.value === rememberedProject)
      ? rememberedProject
      : ''
    rememberedLocalTaskProjectAppliedRef.current = Boolean(defaultProject)
    setTaskForm(emptyLocalTaskForm(defaultProject))
    setTaskFormMode('create')
    setTaskFormError(null)
  }

  function openEditLocalTask() {
    if (!selectedItem || !selectedIsLocalTask) {
      return
    }

    setActionMenuItemId(null)
    setTaskForm({
      title: selectedItem.title,
      description: selectedItem.description,
      repository: selectedItem.repository === 'local' ? '' : selectedItem.repository,
      assignee: selectedItem.assignee === 'unassigned' ? '' : selectedItem.assignee,
      branch: selectedItem.branch === 'no branch' ? '' : selectedItem.branch,
      labels: selectedItem.labels.join(', '),
    })
    setTaskFormMode('edit')
    setTaskFormError(null)
  }

  function closeLocalTaskForm() {
    rememberedLocalTaskProjectAppliedRef.current = false
    setTaskFormMode(null)
    setTaskFormError(null)
  }

  async function submitLocalTaskForm() {
    const title = taskForm.title.trim()
    if (!title) {
      setTaskFormError(t('common:shell.messages.titleRequired'))
      return
    }

    setIsBusy(true)
    setTaskFormError(null)
    setError(null)

    const body = {
      title,
      description: taskForm.description.trim(),
      repository: optionalValue(taskForm.repository),
      assignee: optionalValue(taskForm.assignee),
      branch: optionalValue(taskForm.branch),
      labels: labelsFromInput(taskForm.labels),
    }

    try {
      const detail =
        taskFormMode === 'edit' && selectedItem
          ? await apiPatch<ItemDetailResponse>(itemUrl(selectedItem), body)
          : await apiPost<ItemDetailResponse>('/local-tasks', body)
      const nextItem = detailToWorkItem(detail)
      rememberLocalTaskSourceProject(body.repository)
      setSelectedId(nextItem.id)
      setSelectedDetail(nextItem)
      await refreshItems()
      await refreshCurrentListView()
      closeLocalTaskForm()
      if (taskFormMode === 'edit') {
        showNotice(t('common:shell.notices.localTaskUpdated'))
      } else {
        showNotice(t('common:shell.notices.taskCreated', { title: nextItem.title }), 'success', {
          actionLabel: t('common:shell.notices.viewDetails'),
          onAction: () => openCreatedTaskNotice(nextItem),
        })
      }
    } catch (reason) {
      setTaskFormError(errorMessage(reason))
    } finally {
      setIsBusy(false)
    }
  }

  async function archiveSelectedItem() {
    if (!selectedItem || !selectedCanArchive) {
      return
    }

    setActionMenuItemId(null)
    setIsBusy(true)
    setError(null)
    try {
      const detail = await apiPost<ItemDetailResponse>(`${itemUrl(selectedItem)}/archive`, {})
      const nextItem = detailToWorkItem(detail)
      setSelectedDetail(nextItem)
      setSelectedId(nextItem.id)
      await refreshItems()
      await refreshCurrentListView()
      showNotice(t('common:shell.notices.itemArchived'))
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setIsBusy(false)
    }
  }

  async function retrySourceWrite(writeId: string) {
    setIsBusy(true)
    setError(null)
    try {
      const detail = await apiPost<ItemDetailResponse>(`/source-writes/${encodeURIComponent(writeId)}/retry`, {})
      const nextItem = detailToWorkItem(detail)
      setSelectedDetail(nextItem)
      setItems((current) => replaceMatchingItemWithDetail(current, nextItem))
      const retriedWrite = nextItem.sourceWrites.find((write) => write.writeId === writeId)
      if (retriedWrite?.status === 'failed') {
        const message = sourceWriteFailureNotice(t('common:shell.failureNotices.sourceWriteRetryFailed'), retriedWrite)
        setError(message)
        showNotice(message, 'error')
        await refreshGitHubStatus()
      } else if (retriedWrite?.status === 'succeeded') {
        showNotice(t('common:shell.notices.sourceWriteRetrySucceeded'))
      } else {
        showNotice(t('common:shell.notices.sourceWriteRetryQueued'))
      }
    } catch (reason) {
      const message = errorMessage(reason)
      setError(message)
      showNotice(message, 'error')
    } finally {
      setIsBusy(false)
    }
  }

  function toggleTaskLabel(label: string) {
    setTaskForm((current) => {
      const labels = labelsFromInput(current.labels)
      const nextLabels = labels.includes(label)
        ? labels.filter((candidate) => candidate !== label)
        : [...labels, label]
      return {
        ...current,
        labels: nextLabels.join(', '),
      }
    })
  }

  async function refreshSelectedItem() {
    if (!selectedItem) {
      return
    }

    setActionMenuItemId(null)
    setIsBusy(true)
    setError(null)
    try {
      await refreshDetail(selectedItem)
      await refreshItems()
      await refreshCurrentListView()
      showNotice(t('common:shell.notices.itemRefreshed'), 'info')
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setIsBusy(false)
    }
  }

  function reopenSelectedItem() {
    setActionMenuItemId(null)
    void mutateSelected('/reopen', { body: t('common:shell.dispatchNotes.reopen') }).then((ok) => {
      if (ok) showNotice(t('common:shell.notices.itemReopened'))
    })
  }

  async function copySelectedItemId() {
    if (!selectedItem) {
      return
    }

    const value = selectedItem.itemId ?? `${selectedItem.sourceKey}:${selectedItem.externalId}`
    setActionMenuItemId(null)
    try {
      await navigator.clipboard.writeText(value)
      showNotice(t('common:shell.notices.itemIdentifierCopied'))
    } catch {
      setError(t('common:shell.messages.couldNotCopyIdentifier'))
    }
  }

  function setSelectedReviewStage(stage: ReviewStageId) {
    if (!selectedItem) {
      return
    }

    if (isTaskDetailRoute && routeTaskShortId) {
      navigate(`/projects/${encodeURIComponent(workspaceId || 'default')}/tasks/${encodeURIComponent(routeTaskShortId)}/detail/${stage}`)
      return
    }

    setReviewStageByItem((current) => ({
      ...current,
      [selectedItem.id]: stage,
    }))
  }

  function toggleTechnicalEvents(roundId: string) {
    setShowTechnicalEventsByRound((current) => ({
      ...current,
      [roundId]: !current[roundId],
    }))
  }

  function toggleAllTechnicalEvents() {
    const roundsWithTechnicalEvents = selectedRoundHistory.filter((group) => group.events.some(isTechnicalTimelineEvent))
    const shouldOpen = roundsWithTechnicalEvents.some((group) => !showTechnicalEventsByRound[group.round.roundId])
    setShowTechnicalEventsByRound((current) => {
      const next = { ...current }
      for (const group of roundsWithTechnicalEvents) {
        next[group.round.roundId] = shouldOpen
      }
      return next
    })
  }

  function startSidebarResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (window.matchMedia('(max-width: 820px)').matches) {
      return
    }

    sidebarResizeStart.current = { x: event.clientX, width: sidebarWidth }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveSidebarResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (!sidebarResizeStart.current) {
      return
    }

    const delta = event.clientX - sidebarResizeStart.current.x
    setSidebarWidth(clampNumberValue(sidebarResizeStart.current.width + delta, minSidebarWidth, maxSidebarWidth))
  }

  function stopSidebarResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (!sidebarResizeStart.current) {
      return
    }

    sidebarResizeStart.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function startSidecarResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (window.matchMedia('(max-width: 820px)').matches) {
      return
    }

    sidecarResizeStart.current = { x: event.clientX, width: reviewSidecarWidth }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveSidecarResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (!sidecarResizeStart.current) {
      return
    }

    const delta = sidecarResizeStart.current.x - event.clientX
    setReviewSidecarWidth(clampNumberValue(sidecarResizeStart.current.width + delta, minReviewSidecarWidth, maxReviewSidecarWidth))
  }

  function stopSidecarResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (!sidecarResizeStart.current) {
      return
    }

    sidecarResizeStart.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function startDrawerResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (window.matchMedia('(max-width: 820px)').matches) {
      return
    }

    drawerResizeStart.current = { x: event.clientX, width: drawerWidth }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveDrawerResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drawerResizeStart.current) {
      return
    }

    const delta = drawerResizeStart.current.x - event.clientX
    setDrawerWidth(clampNumberValue(drawerResizeStart.current.width + delta, minDrawerWidth, maxDrawerWidth))
  }

  function stopDrawerResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drawerResizeStart.current) {
      return
    }

    drawerResizeStart.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function returnFromSettings() {
    const fallback = selectedItem ? `/projects/default/tasks/${encodeURIComponent(selectedItem.shortId ?? selectedItem.itemId ?? selectedItem.id)}/status` : '/projects/default'
    navigate(lastWorkRouteRef.current || fallback)
  }

  async function publishReviewDraft(draftId: string) {
    setIsBusy(true)
    setError(null)
    try {
      const detail = await apiPost<ItemDetailResponse>(`/review-drafts/${encodeURIComponent(draftId)}/publish`, {})
      const nextItem = detailToWorkItem(detail)
      setSelectedDetail(nextItem)
      setItems((current) => replaceMatchingItemWithDetail(current, nextItem))
      const draft = nextItem.reviewDrafts.find((candidate) => candidate.draftId === draftId)
      if (draft?.status === 'publishFailed') {
        const write = findReviewDraftPublishWrite(nextItem, draftId)
        const message = sourceWriteFailureNotice(t('common:shell.failureNotices.reviewDraftPublishFailed'), write)
        setError(message)
        showNotice(message, 'error')
        await refreshGitHubStatus()
        return
      }

      showNotice(t('common:shell.notices.reviewDraftPublished'))
    } catch (reason) {
      const message = errorMessage(reason)
      setError(message)
      showNotice(message, 'error')
    } finally {
      setIsBusy(false)
    }
  }

  async function discardReviewDraft(draftId: string) {
    setIsBusy(true)
    setError(null)
    try {
      const detail = await apiPost<ItemDetailResponse>(`/review-drafts/${encodeURIComponent(draftId)}/discard`, {})
      const nextItem = detailToWorkItem(detail)
      setSelectedDetail(nextItem)
      setItems((current) => replaceMatchingItemWithDetail(current, nextItem))
      showNotice(t('common:shell.notices.reviewDraftDiscarded'))
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setIsBusy(false)
    }
  }

  async function resolveReviewFinding(draftId: string, commentId: string, resolutionKind: ReviewFindingResolutionKind, note: string | null) {
    setIsBusy(true)
    setError(null)
    try {
      const detail = await apiPost<ItemDetailResponse>(
        `/review-drafts/${encodeURIComponent(draftId)}/comments/${encodeURIComponent(commentId)}/resolve`,
        { resolutionKind, note })
      const nextItem = detailToWorkItem(detail)
      setSelectedDetail(nextItem)
      setItems((current) => replaceMatchingItemWithDetail(current, nextItem))
      showNotice(t('common:shell.notices.reviewFindingResolved'))
    } catch (reason) {
      const message = errorMessage(reason)
      setError(message)
      showNotice(message, 'error')
    } finally {
      setIsBusy(false)
    }
  }

  async function reopenReviewFinding(draftId: string, commentId: string) {
    setIsBusy(true)
    setError(null)
    try {
      const detail = await apiPost<ItemDetailResponse>(
        `/review-drafts/${encodeURIComponent(draftId)}/comments/${encodeURIComponent(commentId)}/reopen`,
        {})
      const nextItem = detailToWorkItem(detail)
      setSelectedDetail(nextItem)
      setItems((current) => replaceMatchingItemWithDetail(current, nextItem))
      showNotice(t('common:shell.notices.reviewFindingReopened'))
    } catch (reason) {
      const message = errorMessage(reason)
      setError(message)
      showNotice(message, 'error')
    } finally {
      setIsBusy(false)
    }
  }

  async function deliverImplementationDraft(draftId: string) {
    setIsBusy(true)
    setError(null)
    try {
      const detail = await apiPost<ItemDetailResponse>(`/implementation-drafts/${encodeURIComponent(draftId)}/deliver`, {})
      const nextItem = detailToWorkItem(detail)
      setSelectedDetail(nextItem)
      setItems((current) => replaceMatchingItemWithDetail(current, nextItem))
      showNotice(t('common:shell.notices.implementationDraftDelivered'))
    } catch (reason) {
      const message = errorMessage(reason)
      setError(message)
      showNotice(message, 'error')
    } finally {
      setIsBusy(false)
    }
  }

  async function discardFollowUpDraft(draftId: string) {
    setIsBusy(true)
    setError(null)
    try {
      const detail = await apiPost<ItemDetailResponse>(`/follow-up-drafts/${encodeURIComponent(draftId)}/discard`, {})
      const nextItem = detailToWorkItem(detail)
      setSelectedDetail(nextItem)
      setItems((current) => replaceMatchingItemWithDetail(current, nextItem))
      showNotice(t('common:shell.notices.followUpDraftDiscarded'))
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setIsBusy(false)
    }
  }

  async function createLocalTaskFromFollowUpDraft(draftId: string) {
    setIsBusy(true)
    setError(null)
    try {
      const detail = await apiPost<ItemDetailResponse>(`/follow-up-drafts/${encodeURIComponent(draftId)}/create-local-task`, {})
      const nextItem = detailToWorkItem(detail)
      setSelectedDetail(nextItem)
      setItems((current) => replaceMatchingItemWithDetail(current, nextItem))
      await refreshItems()
      showNotice(t('common:shell.notices.localTaskFromFollowUp'))
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setIsBusy(false)
    }
  }

  async function editFollowUpDraft(draft: FollowUpDraft) {
    const nextTitle = window.prompt(t('common:shell.prompts.followUpTitle'), draft.title)
    if (nextTitle === null || !nextTitle.trim()) {
      return
    }

    const nextBody = window.prompt(t('common:shell.prompts.followUpBody'), draft.body)
    if (nextBody === null || !nextBody.trim()) {
      return
    }

    setIsBusy(true)
    setError(null)
    try {
      const detail = await apiPatch<ItemDetailResponse>(`/follow-up-drafts/${encodeURIComponent(draft.draftId)}`, {
        title: nextTitle.trim(),
        body: nextBody.trim(),
        rationale: draft.rationale,
        repository: draft.repository,
        assignee: draft.assignee,
        branch: draft.branch,
        labels: draft.labels,
      })
      const nextItem = detailToWorkItem(detail)
      setSelectedDetail(nextItem)
      setItems((current) => replaceMatchingItemWithDetail(current, nextItem))
      showNotice(t('common:shell.notices.followUpDraftUpdated'))
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setIsBusy(false)
    }
  }

  async function editReviewDraftSummary(draft: ReviewDraft) {
    const nextSummary = window.prompt(t('common:shell.prompts.reviewSummary'), draft.summaryBody)
    if (nextSummary === null || nextSummary.trim() === draft.summaryBody.trim() || !nextSummary.trim()) {
      return
    }

    setIsBusy(true)
    setError(null)
    try {
      const detail = await apiPatch<ItemDetailResponse>(`/review-drafts/${encodeURIComponent(draft.draftId)}`, {
        summaryBody: nextSummary.trim(),
        comments: [],
      })
      const nextItem = detailToWorkItem(detail)
      setSelectedDetail(nextItem)
      setItems((current) => replaceMatchingItemWithDetail(current, nextItem))
      showNotice(t('common:shell.notices.reviewDraftSummaryUpdated'))
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setIsBusy(false)
    }
  }

  function addComment() {
    const body = feedbackDraft.trim()
    if (!body) {
      return
    }

    void mutateSelected('/comments', {
      body,
      roundNumber: selectedItem?.round ? selectedItem.round : null,
    }).then((ok) => {
      if (ok) {
        setFeedbackDraft('')
        showNotice(t('common:shell.notices.feedbackAdded'))
      }
    })
  }

  function dispatchRound() {
    void (async () => {
      if (!await ensureSelectedSourceDetailsReady()) {
        return
      }

      if (runnerMode === 'mock') {
        const ok = await mutateSelected('/dispatch', {
          mode: 'mock',
          mockOutcome,
          mockDurationSeconds: 8,
          note: t('common:shell.dispatchNotes.mock'),
        })
        if (ok && selectedItem) {
          setReviewStageByItem((current) => ({ ...current, [selectedItem.id]: 'analysis' }))
          showNotice(t('common:shell.notices.mockRoundDispatched'))
        }
        return
      }

      const ok = await mutateSelected('/dispatch', {
        mode: 'appServer',
        note: t('common:shell.dispatchNotes.review'),
      })
      if (ok && selectedItem) {
        setReviewStageByItem((current) => ({ ...current, [selectedItem.id]: 'analysis' }))
        showNotice(t('common:shell.notices.dotCraftRoundDispatched'))
      }
    })()
  }

  function reReviewPullRequest() {
    void (async () => {
      if (!selectedItem || !selectedReReviewInfo) {
        return
      }

      if (!await ensureSelectedSourceDetailsReady()) {
        return
      }

      const ok = await mutateSelected('/rereview', {})
      if (ok) {
        setReviewStageByItem((current) => ({ ...current, [selectedItem.id]: 'analysis' }))
        showNotice(t('common:shell.notices.reReviewDispatched', { kind: selectedItem.sourceKey === 'gitlab' ? 'MR' : 'PR' }))
      }
    })()
  }

  function askAgent() {
    const body = feedbackDraft.trim()
    if (!body || askAgentDisabledReason) {
      return
    }

    void mutateSelected('/discussion-turns', {
      body,
      roundNumber: selectedItem?.round ? selectedItem.round : null,
      modelId: null,
    }).then((ok) => {
      if (ok) {
        setFeedbackDraft('')
        showNotice(t('common:shell.notices.questionSentToAgent'))
      }
    })
  }

  function dispatchImplementationRound(deliveryPolicy: DeliveryPolicy = 'manualDelivery') {
    void (async () => {
      if (!await ensureSelectedSourceDetailsReady()) {
        return
      }

      const ok = await mutateSelected('/dispatch', {
        mode: 'appServer',
        workMode: 'implementation',
        deliveryPolicy,
        note: deliveryPolicy === 'autoPr'
          ? t('common:shell.dispatchNotes.implementationAuto')
          : t('common:shell.dispatchNotes.implementationManual'),
      })
      if (ok && selectedItem) {
        setReviewStageByItem((current) => ({ ...current, [selectedItem.id]: 'analysis' }))
        showNotice(deliveryPolicy === 'autoPr' ? t('common:shell.notices.autoPrImplementationDispatched') : t('common:shell.notices.implementationRoundDispatched'))
      }
    })()
  }

  async function syncGitHubSource(mode: GitHubSyncMode = 'incremental') {
    setIsSyncing(true)
    setError(null)
    try {
      const job = await apiPost<GitHubSyncJob>('/sources/github/sync-jobs', { mode })
      setGithubSyncJob(job)
      await refreshAll()
      showNotice(mode === 'full' ? t('common:shell.notices.githubFullRepairSyncStarted') : t('common:shell.notices.githubSyncStarted'))
    } catch (reason) {
      setError(errorMessage(reason))
      await refreshGitHubStatus()
    } finally {
      setIsSyncing(false)
    }
  }

  async function syncFailedGitHubRepositories(repositories: string[]) {
    if (repositories.length === 0) {
      return
    }

    setIsSyncing(true)
    setError(null)
    try {
      const job = await apiPost<GitHubSyncJob>('/sources/github/sync-jobs', { mode: 'incremental', repositories })
      setGithubSyncJob(job)
      showNotice(t('common:shell.notices.githubRetrySyncStarted'))
    } catch (reason) {
      setError(errorMessage(reason))
      await refreshGitHubStatus()
    } finally {
      setIsSyncing(false)
    }
  }

  async function syncSourceProvider(provider: string, mode: SourceSyncMode = 'incremental', projects?: string[]) {
    if (provider === 'github') {
      if (projects?.length) {
        await syncFailedGitHubRepositories(projects)
      } else {
        await syncGitHubSource(mode === 'full' ? 'full' : 'incremental')
      }
      await refreshSourceProviders()
      await refreshSourceSyncJobs()
      return
    }

    setIsSyncing(true)
    setError(null)
    try {
      const job = await apiPost<SourceSyncJob>(`/sources/${encodeURIComponent(provider)}/sync-jobs`, { mode, projects })
      setSourceSyncJobs((current) => ({ ...current, [provider]: job }))
      await refreshAll()
      showNotice(mode === 'full'
        ? t('common:shell.notices.sourceFullRepairSyncStarted', { provider: providerLabel(provider) })
        : t('common:shell.notices.sourceSyncStarted', { provider: providerLabel(provider) }))
    } catch (reason) {
      const message = errorMessage(reason)
      setError(message)
      showNotice(message, 'error')
      await refreshSourceProviders()
    } finally {
      setIsSyncing(false)
    }
  }

  async function syncFailedSourceProjects(provider: string, projects: string[]) {
    if (projects.length === 0) {
      return
    }

    await syncSourceProvider(provider, 'incremental', projects)
  }

  async function updateSourceSyncSchedule(provider: string, request: SourceSyncScheduleUpdateRequest) {
    setError(null)
    try {
      const schedule = await apiPut<SourceSyncSchedule>(`/sources/${encodeURIComponent(provider)}/sync-schedule`, request)
      setSourceSyncSchedules((current) => ({ ...current, [provider]: schedule }))
    } catch (reason) {
      const message = errorMessage(reason)
      setError(message)
      throw reason
    }
  }

  async function syncAllConfiguredSources() {
    const configured = sourceProviders.filter((provider) => provider.configured && provider.readCapability.available)
    if (configured.length === 0) {
      await syncGitHubSource()
      return
    }

    for (const provider of configured) {
      await syncSourceProvider(provider.provider, 'incremental')
    }
  }

  async function startDotCraftAppServer() {
    setIsStartingAppServer(true)
    setError(null)
    try {
      await apiPost<DotCraftStatusResponse>('/dotcraft/appserver/start', {})
      await refreshDotCraftStatus()
      await refreshAppBindingStatus()
      showNotice(t('common:shell.notices.appServerStarting'))
    } catch (reason) {
      const message = errorMessage(reason)
      setError(message)
      showNotice(message, 'error')
      await refreshDotCraftStatus()
      await refreshAppBindingStatus()
    } finally {
      setIsStartingAppServer(false)
    }
  }

  const handleServerRestartRequired = useCallback((restart: PendingServerRestart) => {
    setPendingServerRestart(restart)
    setServerRestartState('idle')
  }, [])

  function dismissPendingServerRestart() {
    setPendingServerRestart(null)
    setServerRestartState('idle')
  }

  async function restartPendingServer() {
    const restartServer = window.oratorioDesktop?.restartServer
    if (!restartServer || serverRestartState === 'restarting') {
      return
    }

    setServerRestartState('restarting')
    try {
      await restartServer()
      setPendingServerRestart(null)
      setServerRestartState('idle')
    } catch {
      setServerRestartState('failed')
    }
  }

  function openItemFromQueue(item: WorkItem) {
    setSelectedId(item.id)
    navigate(`/projects/${encodeURIComponent(workspaceId || 'default')}/tasks/${encodeURIComponent(item.shortId ?? item.itemId ?? item.id)}`)
  }

  function activateUiNotice() {
    if (!uiNotice?.onAction) {
      return
    }

    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current)
      noticeTimerRef.current = null
    }
    const action = uiNotice.onAction
    setUiNotice(null)
    action()
  }

  function closeTaskDrawer() {
    const shortId = routeTaskShortId
    navigate(`/projects/${encodeURIComponent(workspaceId || 'default')}`)
    window.setTimeout(() => {
      if (!shortId) {
        return
      }

      document.querySelector<HTMLElement>(`[data-task-card="${escapeAttributeValue(shortId)}"]`)?.focus()
    }, 0)
  }

  function selectedTaskRouteId() {
    return routeTaskShortId ?? selectedItem?.shortId ?? selectedItem?.itemId ?? selectedItem?.id ?? null
  }

  function openSelectedTaskDetailPage() {
    const taskRouteId = selectedTaskRouteId()
    if (!taskRouteId) {
      return
    }

    setActionMenuItemId(null)
    navigate(`/projects/${encodeURIComponent(workspaceId || 'default')}/tasks/${encodeURIComponent(taskRouteId)}/detail/${selectedReviewStage}`)
  }

  function openSelectedTaskDetailStage(stage: ReviewStageId, options?: { focus?: 'discussionComposer' }) {
    const taskRouteId = selectedTaskRouteId()
    if (!taskRouteId) {
      return
    }

    setActionMenuItemId(null)
    const hash = options?.focus === 'discussionComposer' ? '#discussion-composer' : ''
    navigate(`/projects/${encodeURIComponent(workspaceId || 'default')}/tasks/${encodeURIComponent(taskRouteId)}/detail/${stage}${hash}`)
  }

  function returnToTaskBoard() {
    navigate(lastBoardRouteRef.current || `/projects/${encodeURIComponent(workspaceId || 'default')}`)
  }

  function setDecision(decision: 'approve' | 'request-changes' | 'reject') {
    const noteBody = decisionNote.trim()
    const body =
      decision === 'request-changes'
        ? noteBody
        : noteBody || t('common:shell.dispatchNotes.decisionInOratorio', { label: decisionLabel(decision) })
    if (decision === 'request-changes' && !body) {
      setError(t('common:shell.messages.requestChangesNeedsNote'))
      showNotice(t('common:shell.notices.requestChangesNeedsNote'), 'error')
      return
    }

    void mutateSelected(`/${decision}`, { body }).then((ok) => {
      if (!ok) {
        return
      }

      setDecisionNote('')
      showNotice(t('common:shell.notices.decisionRecorded', { label: decisionLabel(decision) }))
    })
  }

  const itemDetailViewProps: ItemDetailViewProps = {
    selectedItem,
    selectedRun,
    selectedDetailItem,
    selectedReviewStage,
    selectedDetailFocus,
    selectedIsLocalTask,
    selectedIsPullRequest,
    selectedCanEditLocalTask,
    selectedCanReopen,
    selectedCanArchive,
    selectedCanDispatch,
    selectedCanImplementationDispatch,
    selectedCanDecide,
    selectedHasSourceMetadata,
    selectedBrief,
    selectedRoundHistory,
    selectedSourceActivity,
    visibleSourceActivity,
    hiddenSourceActivity,
    reviewInspectorOpen,
    setReviewInspectorOpen,
    actionMenuItemId,
    setActionMenuItemId,
    isBusy,
    sourceDetailsSyncing: Boolean(selectedItem?.itemId && sourceDetailsSyncingItemId === selectedItem.itemId),
    error,
    feedbackDraft,
    setFeedbackDraft,
    decisionNote,
    setDecisionNote,
    runnerMode,
    showTechnicalEventsByRound,
    openEditLocalTask,
    reopenSelectedItem,
    archiveSelectedItem,
    refreshSelectedItem,
    copySelectedItemId,
    syncSelectedSourceDetails: () => selectedItem ? syncSourceDetails(selectedItem) : Promise.resolve(false),
    setSelectedReviewStage,
    dispatchImplementationRound,
    dispatchRound,
    reReviewInfo: selectedReReviewInfo,
    reReviewPullRequest,
    retrySourceWrite,
    publishReviewDraft,
    reviewDraftPublishDisabledReason,
    discardReviewDraft,
    resolveReviewFinding,
    reopenReviewFinding,
    deliverImplementationDraft,
    discardFollowUpDraft,
    createLocalTaskFromFollowUpDraft,
    editFollowUpDraft,
    editReviewDraftSummary,
    addComment,
    askAgent,
    askAgentDisabledReason,
    setDecision,
    toggleAllTechnicalEvents,
    toggleTechnicalEvents,
    startSidecarResize,
    moveSidecarResize,
    stopSidecarResize,
  }

  const showPendingServerRestart = isSettingsRoute && pendingServerRestart !== null

  const shell = (
    <main
      className={`app-shell ${
        isSettingsRoute
          ? 'settings-mode'
          : isTaskDetailRoute
            ? 'task-detail-mode'
            : drawerOpen
              ? 'with-task-drawer'
              : ''
      }${isDesktopShell ? ' desktop-hosted' : ''}${showPendingServerRestart ? ' server-restart-visible' : ''}`}
      data-theme={theme}
      style={{
        '--sidebar-width': `${sidebarWidth}px`,
        '--review-sidecar-width': `${reviewSidecarWidth}px`,
        '--drawer-width': `${drawerWidth}px`,
      } as CSSProperties}
    >
      <div className="ui-notice-region" aria-live="polite" aria-atomic="true">
        {uiNotice ? <UiNoticeToast notice={uiNotice} onActivate={activateUiNotice} /> : null}
      </div>
      <CelebrationBurst key={taskCreateCelebrationKey} origin={taskCreateCelebrationOrigin} />
      {isSettingsRoute ? (
        <aside className="unified-sidebar settings-sidebar-mode" aria-label={t('common:shell.settingsNavigation')}>
          <div className="sidebar-mode-header">
            <ActionIcon className="icon-button sidebar-back-button" label={t('common:shell.backToWorkbench')} title={t('common:shell.backToWorkbench')} onClick={returnFromSettings}>
              <ArrowLeft size={16} />
            </ActionIcon>
            <span>
              <strong>{t('common:shell.settings')}</strong>
              <small>{t('board:appName')}</small>
            </span>
          </div>
          <section className="settings-nav" aria-label={t('common:shell.settingsSections')}>
            <nav>
              {settingsSections.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink key={item.id} to={`/settings/${item.id}`} className={() => `settings-nav-row${settingsActiveSection === item.id ? ' active' : ''}`}>
                    <Icon size={16} />
                    <span>
                      <strong>{t(`settings:sections.${item.id}.label`)}</strong>
                      <small>{t(`settings:sections.${item.id}.description`)}</small>
                    </span>
                    <ChevronRight size={14} />
                  </NavLink>
                )
              })}
            </nav>
          </section>
          <div
            className="sidebar-resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label={t('common:shell.resizeSidebar')}
            onPointerDown={startSidebarResize}
            onPointerMove={moveSidebarResize}
            onPointerUp={stopSidebarResize}
          />
        </aside>
      ) : null}

      {isSettingsRoute ? (
        <section className={`settings-main-panel${showPendingServerRestart ? ' has-server-restart' : ''}`} aria-label={t('common:shell.settingsWorkspace')}>
          {pendingServerRestart ? (
            <PendingServerRestartBanner
              restart={pendingServerRestart}
              canRestart={Boolean(window.oratorioDesktop?.restartServer)}
              restartState={serverRestartState}
              onRestart={() => void restartPendingServer()}
              onDismiss={dismissPendingServerRestart}
            />
          ) : null}
          <Routes>
            <Route path="/settings" element={<Navigate to="/settings/general" replace />} />
            <Route
              path="/settings/:section"
              element={
                <SettingsView
                  theme={theme}
                  setTheme={setTheme}
                  githubStatus={githubStatus}
                  sourceProviders={sourceProviders}
                  sourceSyncJobs={sourceSyncJobs}
                  sourceSyncSchedules={sourceSyncSchedules}
                  dotcraftStatus={dotcraftStatus}
                  refreshAll={refreshAll}
                  syncGitHubSource={syncGitHubSource}
                  syncGitHubFullRepair={() => syncGitHubSource('full')}
                  syncFailedGitHubRepositories={syncFailedGitHubRepositories}
                  syncSourceProvider={syncSourceProvider}
                  syncFailedSourceProjects={syncFailedSourceProjects}
                  updateSourceSyncSchedule={updateSourceSyncSchedule}
                  startDotCraftAppServer={startDotCraftAppServer}
                  isSyncing={isSyncing}
                  isStartingAppServer={isStartingAppServer}
                  serverRestartPending={Boolean(pendingServerRestart)}
                  onServerRestartRequired={handleServerRestartRequired}
                  onReplayOnboarding={replayOnboarding}
                />
              }
            />
            <Route path="*" element={<Navigate to="/settings/general" replace />} />
          </Routes>
        </section>
      ) : isTaskDetailRoute ? (
        <TaskDetailPage
          item={selectedItem}
          itemDetailProps={itemDetailViewProps}
          activeStage={selectedReviewStage}
          onBackToBoard={returnToTaskBoard}
        />
      ) : (
        <>
          <BoardView
            viewMode={boardViewMode}
            setViewMode={setBoardViewMode}
            query={query}
            setQuery={setQuery}
            repositoryFilter={repositoryFilter}
            repositories={repositories}
            setRepositoryFilter={setRepositoryFilter}
            openCreateLocalTask={openCreateLocalTask}
            refreshAll={refreshAll}
            syncGitHubSource={() => hasConfiguredGitLab ? syncAllConfiguredSources() : syncGitHubSource()}
            githubStatus={githubStatus}
            githubSyncJob={githubSyncJob}
            hasConfiguredGitLab={hasConfiguredGitLab}
            isSyncing={isSyncing}
            items={items}
            closedItems={closedItems}
            closedNextCursor={closedNextCursor}
            closedLoading={closedLoading}
            closedError={closedError}
            loadMoreClosedItems={loadMoreClosedItems}
            refreshClosedItems={() => void refreshCurrentListView()}
            selectedItem={selectedItem}
            openItemFromQueue={openItemFromQueue}
            runnerMode={runnerMode}
            mockOutcome={mockOutcome}
            showNotice={showNotice}
            appIconSrc={appIconSrc}
            openSettings={() => navigate('/settings/general')}
          />
          {drawerOpen ? (
            <TaskDrawer
              item={selectedItem ?? null}
              onClose={closeTaskDrawer}
              onResizeStart={startDrawerResize}
              onResizeMove={moveDrawerResize}
              onResizeEnd={stopDrawerResize}
              actionMenuOpen={selectedItem ? actionMenuItemId === selectedItem.id : false}
              onToggleActionMenu={() => {
                if (selectedItem) {
                  setActionMenuItemId((current) => (current === selectedItem.id ? null : selectedItem.id))
                }
              }}
              canEditLocalTask={selectedCanEditLocalTask}
              canReopen={selectedCanReopen}
              canArchive={selectedCanArchive}
              isBusy={isBusy}
              onEditLocalTask={openEditLocalTask}
              onOpenDetailPage={openSelectedTaskDetailPage}
              onReopen={reopenSelectedItem}
              onArchive={() => void archiveSelectedItem()}
              onCopyId={() => void copySelectedItemId()}
              statusContent={
                <TaskStatusPanel
                  item={selectedItem}
                  run={selectedRun}
                  brief={selectedBrief}
                  runnerMode={runnerMode}
                  canDispatch={selectedCanDispatch}
                  canImplementationDispatch={selectedCanImplementationDispatch}
                  isPullRequest={selectedIsPullRequest}
                  reReviewInfo={selectedReReviewInfo}
                  onDispatchRound={dispatchRound}
                  onDispatchImplementationRound={dispatchImplementationRound}
                  onReReviewPullRequest={reReviewPullRequest}
                  onOpenDetailStage={openSelectedTaskDetailStage}
                />
              }
            />
          ) : null}
        </>
      )}

      {initialLaunchPhase !== 'ready' ? (
        <InitialLaunchOverlay phase={initialLaunchPhase} appIconSrc={appIconSrc} message={initialLaunchMessage} />
      ) : null}

      {appBindingDialog ? (
        <AppBindingConsentDialog
          state={appBindingDialog}
          dotcraftIconSrc={dotcraftIconSrc}
          onApprove={() => void approveAppBindingHandoff()}
          onClose={() => setAppBindingDialog(null)}
        />
      ) : null}

      <LocalTaskFormDialog
        taskFormMode={taskFormMode}
        closeLocalTaskForm={closeLocalTaskForm}
        taskForm={taskForm}
        setTaskForm={setTaskForm}
        taskSourceProjectOptions={taskSourceProjectOptions}
        taskLabelOptions={taskLabelOptions}
        taskAssigneeOptions={taskAssigneeOptions}
        taskBranchOptions={taskBranchOptions}
        toggleTaskLabel={toggleTaskLabel}
        taskFormError={taskFormError}
        isBusy={isBusy}
        onCreateIntent={startTaskCreateCelebration}
        submitLocalTaskForm={submitLocalTaskForm}
      />

      {onboardingOpen ? <OnboardingTour onClose={completeOnboarding} /> : null}
    </main>
  )

  return isDesktopShell ? (
    <div className="oratorio-desktop-frame" data-theme={theme}>
      <DesktopTitlebar dotCraftAppBindingStatus={dotcraftAppBindingStatus} dotcraftIconSrc={dotcraftIconSrc} />
      {shell}
    </div>
  ) : shell
}

const noticeIconByTone: Record<UiNotice['tone'], LucideIcon> = {
  success: CheckCircle2,
  info: Info,
  error: TriangleAlert,
}

function UiNoticeToast({ notice, onActivate }: { notice: UiNotice; onActivate: () => void }) {
  const Icon = noticeIconByTone[notice.tone]
  const content = (
    <>
      <span className="ui-notice-icon" aria-hidden="true">
        <Icon size={15} />
      </span>
      <span className="ui-notice-content">
        <span className="ui-notice-message">{notice.message}</span>
        {notice.actionLabel ? <span className="ui-notice-action">{notice.actionLabel}</span> : null}
      </span>
    </>
  )

  if (notice.onAction) {
    return (
      <button
        className={`ui-notice ${notice.tone} actionable`}
        type="button"
        onClick={onActivate}
        aria-label={notice.actionLabel ? `${notice.message} ${notice.actionLabel}` : notice.message}
      >
        {content}
      </button>
    )
  }

  return <div className={`ui-notice ${notice.tone}`}>{content}</div>
}

function PendingServerRestartBanner({
  restart,
  canRestart,
  restartState,
  onRestart,
  onDismiss,
}: {
  restart: PendingServerRestart
  canRestart: boolean
  restartState: ServerRestartState
  onRestart: () => void
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  const fieldLabel = restart.fields.length ? restart.fields.slice(0, 3).join(', ') : t('common:shell.restartBanner.fallbackField')
  const restartLabel = restartState === 'restarting' ? t('common:shell.restartBanner.restarting') : restartState === 'failed' ? t('common:shell.restartBanner.retryRestart') : t('common:shell.restartBanner.restartServer')
  return (
    <div className="settings-server-restart-banner" role="status" aria-live="polite" aria-label={t('common:shell.restartBanner.ariaLabel')}>
      <span className="settings-server-restart-copy">
        <strong>{t('common:shell.restartBanner.title')}</strong>
        <small>{canRestart ? t('common:shell.restartBanner.copyCanRestart', { field: fieldLabel }) : t('common:shell.restartBanner.copyManual', { field: fieldLabel })}</small>
      </span>
      <span className="settings-server-restart-actions">
        <button className="secondary-button inline compact-row-action settings-action-button" type="button" onClick={onDismiss} disabled={restartState === 'restarting'}>
          {t('common:shell.restartBanner.ignore')}
        </button>
        {canRestart ? (
          <button className="primary-button inline compact-row-action settings-action-button" type="button" onClick={onRestart} disabled={restartState === 'restarting'}>
            {restartLabel}
          </button>
        ) : null}
      </span>
    </div>
  )
}

function InitialLaunchOverlay({
  phase,
  appIconSrc,
  message,
}: {
  phase: InitialLaunchPhase
  appIconSrc: string
  message: string
}) {
  const { t } = useTranslation()
  return (
    <div
      className={`initial-launch-overlay initial-launch-overlay--${phase}`}
      role="status"
      aria-live="polite"
      aria-label={t('common:shell.launchStatus')}
    >
      <section className="initial-launch-content">
        <img className="initial-launch-logo" src={appIconSrc} alt="" draggable={false} />
        <h1 className="initial-launch-heading">{t('board:appName')}</h1>
        <p className="initial-launch-status tool-running-gradient-text">{message}</p>
      </section>
    </div>
  )
}

function AppBindingConsentDialog({
  state,
  dotcraftIconSrc,
  onApprove,
  onClose,
}: {
  state: AppBindingDialogState
  dotcraftIconSrc: string
  onApprove: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const busy = state.status === 'loading' || state.status === 'approving'
  const inspection = state.status === 'ready' || state.status === 'approving' ? state.inspection : null
  const connection = inspection?.connection ?? null
  const binding = inspection?.binding ?? null
  const isBind = inspection?.operation === 'bind' && Boolean(binding)
  const title = isBind ? t('common:shell.appBinding.bindTitle') : t('common:shell.appBinding.connectTitle')
  const appName = connection?.displayName ?? binding?.displayName ?? t('common:shell.appBinding.fallbackAppName')
  const developerName = connection?.developerName ?? binding?.developerName ?? t('common:shell.appBinding.fallbackDeveloper')
  const expiresAt = formatAppBindingDate(connection?.expiresAt ?? binding?.expiresAt)
  const primaryLabel = inspection?.operation === 'connect' ? t('common:shell.appBinding.connect') : t('common:shell.appBinding.approve')
  const scopeRows = binding
    ? binding.scopeCatalog.length > 0
      ? binding.scopeCatalog
      : binding.requestedScopes.map((scope) => ({ id: scope, displayName: scope, description: t('common:shell.appBinding.requestedByDotCraft'), risk: 'read' }))
    : []

  return (
    <div className="modal-backdrop app-binding-modal-backdrop" role="presentation">
      <section
        className="task-modal app-binding-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-binding-title"
        aria-describedby="app-binding-description"
      >
        <header className="modal-head app-binding-head">
          <span className="app-binding-mark" aria-hidden="true">
            <img src={dotcraftIconSrc} alt="" draggable={false} />
          </span>
          <div className="app-binding-title-block">
            <p className="app-binding-kicker">{t('common:shell.appBinding.connectedApp')}</p>
            <h2 id="app-binding-title">{title}</h2>
            <p id="app-binding-description">{t('common:shell.appBinding.reviewHandoff')}</p>
          </div>
        </header>

        {state.status === 'loading' ? (
          <div className="app-binding-loading" role="status">{t('common:shell.appBinding.loading')}</div>
        ) : state.status === 'error' ? (
          <div className="app-binding-error" role="alert">{state.message}</div>
        ) : isBind && binding ? (
          <div className="app-binding-content">
            <p className="app-binding-body">
              {t('common:shell.appBinding.bindBodyPrefix', { appName })}
              {' '}
              <strong>{binding.threadTitle || binding.threadId}</strong>?
            </p>
            <div className="app-binding-summary" role="list">
              <div role="listitem">
                <span>{t('common:shell.appBinding.thread')}</span>
                <strong>{binding.threadTitle || binding.threadId}</strong>
                <small>{binding.threadId}</small>
              </div>
              <div role="listitem">
                <span>{t('common:shell.appBinding.appIdentity')}</span>
                <strong>{appName}</strong>
                <small>{developerName}</small>
              </div>
              <div role="listitem">
                <span>{t('common:shell.appBinding.requestExpires')}</span>
                <strong>{expiresAt}</strong>
                <small>{t('common:shell.appBinding.oneTimeApproval')}</small>
              </div>
            </div>
            <div className="app-binding-grid">
              <section className="app-binding-card">
                <h3>{t('common:shell.appBinding.scopes')}</h3>
                <ul>
                  {scopeRows.map((scope) => (
                    <li key={scope.id}>
                      <strong>{scope.displayName || scope.id}</strong>
                      <span>{scope.description}</span>
                      <span className={`app-binding-badge ${scope.risk}`}>{scope.risk}</span>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="app-binding-card">
                <h3>{t('common:shell.appBinding.tools')}</h3>
                <ul>
                  {binding.toolCatalog.map((tool) => (
                    <li key={tool.name}>
                      <strong>{tool.name}</strong>
                      <span>{tool.defaultExposure}</span>
                      <span className={`app-binding-badge ${tool.risk}`}>{tool.risk}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
            <div className="app-binding-risk">
              <TriangleAlert size={15} />
              <span>{t('common:shell.appBinding.bindRisk')}</span>
            </div>
          </div>
        ) : (
          <div className="app-binding-content">
            <p className="app-binding-body">
              {t('common:shell.appBinding.connectBodyPrefix')}
              {' '}
              <strong>{connection?.workspaceLabel ?? t('common:shell.appBinding.fallbackWorkspaceInline')}</strong>
              {' '}
              {t('common:shell.appBinding.connectBodySuffix', { appName })}
            </p>
            <div className="app-binding-summary" role="list">
              <div role="listitem">
                <span>{t('common:shell.appBinding.workspace')}</span>
                <strong>{connection?.workspaceLabel ?? t('common:shell.appBinding.fallbackWorkspace')}</strong>
                <small>{connection?.userLabel ?? t('common:shell.appBinding.fallbackAccount')}</small>
              </div>
              <div role="listitem">
                <span>{t('common:shell.appBinding.appIdentity')}</span>
                <strong>{appName}</strong>
                <small>{developerName}</small>
              </div>
              <div role="listitem">
                <span>{t('common:shell.appBinding.requestExpires')}</span>
                <strong>{expiresAt}</strong>
                <small>{t('common:shell.appBinding.oneTimeConnection')}</small>
              </div>
            </div>
            <div className="app-binding-risk">
              <Info size={15} />
              <span>{t('common:shell.appBinding.connectRisk')}</span>
            </div>
          </div>
        )}

        <footer className="modal-actions app-binding-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={busy}>{t('common:cancel')}</button>
          <button
            className="primary-button"
            type="button"
            onClick={onApprove}
            disabled={state.status !== 'ready'}
          >
            {state.status === 'approving' ? t('common:shell.appBinding.approving') : primaryLabel}
          </button>
        </footer>
      </section>
    </div>
  )
}

function formatAppBindingDate(value: string | null | undefined): string {
  if (!value) {
    return i18n.t('common:shell.appBinding.dateSoon')
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function isDotCraftBindingHandoff(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'oratorio:' && parsed.hostname === 'dotcraft' && parsed.pathname.replace(/^\/+/, '') === 'bind'
  } catch {
    return url.includes('oratorio://dotcraft/bind')
  }
}

function isActiveGitHubSyncStatus(status: string) {
  return status === 'queued' || status === 'running'
}

function isActiveSourceSyncStatus(status: string) {
  return status === 'queued' || status === 'running'
}

function readRememberedLocalTaskSourceProject() {
  try {
    return window.localStorage.getItem(localTaskSourceProjectStorageKey)
  } catch {
    return null
  }
}

function rememberLocalTaskSourceProject(sourceProject: string | null | undefined) {
  try {
    if (!sourceProject) {
      return
    }

    window.localStorage.setItem(localTaskSourceProjectStorageKey, sourceProject)
  } catch {
    // Local task creation should not fail when browser storage is unavailable.
  }
}

function buildLocalTaskSourceProjectOptions(
  sourceProviders: SourceProviderStatus[],
  githubRepositories: string[],
  knownItems: WorkItem[],
): LocalTaskSourceProjectOption[] {
  const options: Array<LocalTaskSourceProjectOption & { rank: number }> = []
  const seenAliases = new Set<string>()
  const addOption = (value: string | null | undefined, label: string, aliases: Array<string | null | undefined>, rank: number) => {
    const trimmed = value?.trim()
    if (!trimmed || trimmed === 'local') {
      return
    }

    const normalizedAliases = [trimmed, ...aliases]
      .map((alias) => alias?.trim())
      .filter((alias): alias is string => Boolean(alias))
      .map(normalizeSourceProjectAlias)
    if (normalizedAliases.some((alias) => seenAliases.has(alias))) {
      return
    }

    for (const alias of normalizedAliases) {
      seenAliases.add(alias)
    }
    options.push({ value: trimmed, label, rank })
  }

  for (const provider of sourceProviders) {
    for (const project of provider.projects) {
      const value = sourceProjectOptionValue(provider, project)
      addOption(
        value,
        `${provider.displayName || providerLabel(provider.provider)}: ${project.displayName || project.projectPath}`,
        [project.projectPath],
        0,
      )
    }
  }

  for (const repository of githubRepositories) {
    addOption(repository, `GitHub: ${repository}`, [`github:github.com/${repository}`], 1)
  }

  for (const item of knownItems) {
    addOption(item.repository, sourceProjectOptionLabel(item.repository), sourceProjectOptionAliases(item.repository), 2)
  }

  return options
    .sort((left, right) => left.rank - right.rank || left.label.localeCompare(right.label))
    .map(({ value, label }) => ({ value, label }))
}

function sourceProjectOptionValue(
  provider: SourceProviderStatus,
  project: SourceProviderStatus['projects'][number],
) {
  if (project.key) {
    return project.key
  }

  const instance = project.instance || hostFromUrl(provider.endpoint)
  return instance ? `${provider.provider}:${instance}/${project.projectPath}` : project.projectPath
}

function sourceProjectOptionLabel(value: string | null | undefined) {
  const parsed = parseCanonicalSourceProject(value)
  return parsed ? `${providerLabel(parsed.provider)}: ${parsed.projectPath}` : value ?? ''
}

function sourceProjectOptionAliases(value: string | null | undefined) {
  const parsed = parseCanonicalSourceProject(value)
  if (parsed) {
    return [parsed.projectPath]
  }

  return value ? [`github:github.com/${value}`] : []
}

function parseCanonicalSourceProject(value: string | null | undefined) {
  const match = value?.trim().match(/^([^:]+):([^/]+)\/(.+)$/)
  if (!match) {
    return null
  }

  return {
    provider: match[1],
    instance: match[2],
    projectPath: match[3],
  }
}

function normalizeSourceProjectAlias(value: string) {
  return value.toLocaleLowerCase()
}

function hostFromUrl(value: string | null | undefined) {
  if (!value) {
    return ''
  }

  try {
    return new URL(value).host
  } catch {
    return value.replace(/^https?:\/\//i, '').split('/')[0] ?? ''
  }
}

function applyGitHubSyncRepositoryUpdate(current: GitHubSyncJob | null, update: GitHubSyncRepositoryRun): GitHubSyncJob | null {
  if (!current || current.jobId !== update.jobId) {
    return current
  }

  const currentRepositories = current.repositories ?? []
  const repositories = currentRepositories.some((run) => run.repositoryRunId === update.repositoryRunId)
    ? currentRepositories.map((run) => (run.repositoryRunId === update.repositoryRunId ? update : run))
    : [...currentRepositories, update]
  const repositoriesCompleted = repositories.filter((run) => run.status === 'succeeded' || run.status === 'failed').length
  const repositoriesFailed = repositories.filter((run) => run.status === 'failed').length
  return {
    ...current,
    repositories,
    repositoriesCompleted,
    repositoriesFailed,
    issuesImported: repositories.reduce((sum, run) => sum + run.issuesImported, 0),
    pullRequestsImported: repositories.reduce((sum, run) => sum + run.pullRequestsImported, 0),
    commentsImported: repositories.reduce((sum, run) => sum + run.commentsImported, 0),
    skipped: repositories.reduce((sum, run) => sum + run.skipped, 0),
    updatedAt: update.updatedAt,
  }
}

function applySourceSyncProjectUpdate(current: SourceSyncJob | null, update: SourceSyncProjectRun): SourceSyncJob | null {
  if (!current || current.jobId !== update.jobId) {
    return current
  }

  const currentProjects = current.projects ?? []
  const projects = currentProjects.some((run) => run.projectRunId === update.projectRunId)
    ? currentProjects.map((run) => (run.projectRunId === update.projectRunId ? update : run))
    : [...currentProjects, update]
  const projectsCompleted = projects.filter((run) => run.status === 'succeeded' || run.status === 'failed').length
  const projectsFailed = projects.filter((run) => run.status === 'failed').length
  return {
    ...current,
    projects,
    projectsCompleted,
    projectsFailed,
    issuesImported: projects.reduce((sum, run) => sum + run.issuesImported, 0),
    reviewTargetsImported: projects.reduce((sum, run) => sum + run.reviewTargetsImported, 0),
    commentsImported: projects.reduce((sum, run) => sum + run.commentsImported, 0),
    skipped: projects.reduce((sum, run) => sum + run.skipped, 0),
    updatedAt: update.updatedAt,
  }
}

function providerLabel(provider: string) {
  const normalized = provider.toLocaleLowerCase()
  if (normalized === 'github') return 'GitHub'
  if (normalized === 'gitlab') return 'GitLab'
  return provider
}

function formatRepositoryNames(runs: GitHubSyncRepositoryRun[], fallback = i18n.t('common:shell.syncFallback.repositories')) {
  const names = runs.map((run) => run.repository).filter(Boolean)
  if (names.length === 0) {
    return fallback
  }

  if (names.length <= 3) {
    return names.join(', ')
  }

  return i18n.t('common:shell.syncFallback.moreSuffix', { names: names.slice(0, 3).join(', '), count: names.length - 3 })
}

function formatSourceProjectNames(runs: SourceSyncProjectRun[], fallback = i18n.t('common:shell.syncFallback.projects')) {
  const names = runs.map((run) => run.displayName || run.projectPath || run.sourceProjectKey).filter(Boolean)
  if (names.length === 0) {
    return fallback
  }

  if (names.length <= 3) {
    return names.join(', ')
  }

  return i18n.t('common:shell.syncFallback.moreSuffix', { names: names.slice(0, 3).join(', '), count: names.length - 3 })
}

function findReviewDraftPublishWrite(item: WorkItem, draftId: string): WorkItem['sourceWrites'][number] | undefined {
  const draft = item.reviewDrafts.find((candidate) => candidate.draftId === draftId)
  if (draft?.sourceWriteId) {
    return item.sourceWrites.find((write) => write.writeId === draft.sourceWriteId)
  }

  return [...item.sourceWrites].reverse().find((write) => write.intent === 'reviewDraftPublish')
}

function sourceWriteFailureNotice(prefix: string, write?: WorkItem['sourceWrites'][number] | null) {
  const provider = write?.repository?.startsWith('gitlab:') || write?.kind.startsWith('mergeRequest') || write?.kind === 'commitStatus'
    ? 'GitLab'
    : i18n.t('common:shell.failureNotices.sourceProvider')
  const detail = write?.errorMessage?.trim() || write?.errorCode?.trim() || i18n.t('common:shell.failureNotices.reviewWriteAudit', { provider })
  return `${prefix}: ${detail}`
}
