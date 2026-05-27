import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Code2,
  Eye,
  EyeOff,
  FolderOpen,
  GitPullRequest,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  RotateCcw,
  Settings,
  ShieldCheck,
  SunMoon,
  Trash2,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { apiGet, apiPut } from '../api'
import { ActionIcon } from '../components/primitives/ActionIcon'
import { DropdownSelect, type DropdownSelectOption } from '../components/primitives/DropdownSelect'
import { Tooltip } from '../components/primitives/Tooltip'
import { normalizeSettingsSection, settingsSections, type SettingsSection } from '../settingsSections'
import type {
  SourceProviderStatus,
  SourceSyncJob,
  SourceSyncMode,
  SourceSyncProjectRun,
  SourceSyncSchedule,
  SourceSyncScheduleUpdateRequest,
} from '../lib/types'

type ThemeMode = 'dark' | 'light'
type WindowCloseBehavior = 'minimizeToTray' | 'quitApp'
type DotCraftHealth = 'connected' | 'configured' | 'unavailable'
type DeliveryPolicy = 'manualDelivery' | 'autoPr'
type SecretMode = 'unchanged' | 'replace' | 'clear'
type RepositoryAllowlistKind = 'autoReview' | 'publish'
type SourceProviderId = 'github' | 'gitlab'

const DEFAULT_RUN_TIMEOUT_SECONDS = 30 * 60

const approvalPolicyOptions: DropdownSelectOption[] = [
  { value: 'default', label: 'Default' },
  { value: 'interrupt', label: 'Interrupt' },
  { value: 'autoApprove', label: 'Auto approve' },
]

const deliveryPolicyOptions: DropdownSelectOption[] = [
  { value: 'manualDelivery', label: 'Manual delivery' },
  { value: 'autoPr', label: 'Auto PR' },
]

const sourceProviderOptions: DropdownSelectOption[] = [
  { value: 'github', label: 'GitHub' },
  { value: 'gitlab', label: 'GitLab' },
]

const sourceSyncScheduleDefaultIntervalSeconds = 300
const sourceSyncScheduleMinSeconds = 60
const sourceSyncScheduleMaxSeconds = 86400
const sourceSyncSchedulePresets: DropdownSelectOption[] = [
  { value: '60', label: '1 min' },
  { value: '300', label: '5 min' },
  { value: '900', label: '15 min' },
  { value: '1800', label: '30 min' },
  { value: '3600', label: '1 hr' },
  { value: '86400', label: '24 hr' },
  { value: 'custom', label: 'Custom' },
]

const windowCloseBehaviorOptions = [
  { value: 'minimizeToTray', label: 'Minimize to tray' },
  { value: 'quitApp', label: 'Quit app' },
]

const concurrencyControlLabels = ['Global concurrency', 'Per repository concurrency', 'Per source concurrency']
const autosaveDebounceMs = 250

type ConfigSaveState = 'idle' | 'saving' | 'saved' | 'failed'
type ConfigSaveMode = 'debounced' | 'immediate'

export type GitHubSettingsStatus = {
  available: boolean
  configured: boolean
  repositories: string[]
  lastSyncAt: string | null
  message: string
  writesEnabled: boolean
  writeConfigured: boolean
}

export type DotCraftSettingsStatus = {
  available: boolean
  configured: boolean
  connected: boolean
  health: DotCraftHealth
  autoStart: boolean
  workspacePath: string
  endpoint: string
  endpointSource?: string
  approvalPolicy: string
  runTimeoutSeconds: number
  managedWorktreesEnabled: boolean
  worktreeRootPolicy: string
  globalMaxActiveRuns: number
  maxActiveRunsPerRepository: number
  maxActiveRunsPerSource: number
  message: string | null
}

type DotCraftWorkspace = {
  path: string
  label: string
  isDefault: boolean
  repositories: string[]
  configured: boolean
  connected: boolean
  health: DotCraftHealth
  endpoint: string
  endpointSource: string
  hubManaged: boolean
  reason: string
  message: string
}

type DotCraftWorkspacesResponse = {
  generatedAt: string
  summary: {
    total: number
    connected: number
    hubManaged: number
    defaultPath: string
  }
  workspaces: DotCraftWorkspace[]
}

type SettingsDiagnosticsResponse = {
  generatedAt: string
  service: {
    name: string
    mode: string
    workspaceMode: string
  }
  capabilities: Record<string, boolean>
  gitHub?: {
    available: boolean
    enabled: boolean
    authentication: string
    writesEnabled: boolean
    writeConfigured: boolean
    webhookSecretConfigured: boolean
    endpoint: string
    repositories: string[]
    lastSyncAt: string | null
  }
  github?: {
    available: boolean
    enabled: boolean
    authentication: string
    writesEnabled: boolean
    writeConfigured: boolean
    webhookSecretConfigured: boolean
    endpoint: string
    repositories: string[]
    lastSyncAt: string | null
  }
  gitLab?: {
    available: boolean
    enabled: boolean
    authentication: string
    writesEnabled?: boolean
    writeConfigured?: boolean
    webhookSecretConfigured: boolean
    webhookSigningTokenConfigured: boolean
    webhookVerificationMode: string
    endpoint: string
    apiBaseUrl: string
    projects: string[]
    lastSyncAt: string | null
    recentSyncFailures?: string[]
    recentSourceWriteFailures?: string[]
  }
  dotCraft: {
    available: boolean
    configured: boolean
    connected: boolean
    health: DotCraftHealth
    endpoint: string
    endpointSource: string
    workspacePath: string
    approvalPolicy: string
    runTimeoutSeconds: number
    hubDiscoveryEnabled: boolean
    message: string | null
  }
  runtime: {
    managedWorktreesEnabled: boolean
    worktreeRootPolicy: string
    worktreeBranchPrefix: string
    globalMaxActiveRuns: number
    maxActiveRunsPerRepository: number
    maxActiveRunsPerSource: number
    maxRunAttempts: number
    retryBackoffSeconds: number
    maxRetryBackoffSeconds: number
    stallTimeoutSeconds: number
    succeededWorktreeRetentionHours: number
    failedWorktreeRetentionHours: number
    worktreeCleanupEnabled: boolean
    worktreeCleanupIntervalSeconds: number
  }
  redaction: {
    secretsRedacted: boolean
    redactedFields: string[]
    urlPartsRemoved: string[]
  }
}

type ServerConfigurationResponse = {
  generatedAt: string
  writable: boolean
  disabledReason: string | null
  revision: string
  overlayPath: string
  configuration: ServerConfiguration
  impactWarnings: string[]
  recentChanges: ConfigurationChange[]
  restartRequired?: boolean
  restartSignature?: string | null
}

type ServerConfigurationUpdateResponse = {
  configuration: ServerConfigurationResponse
  changeId: string
  appliedFields: string[]
  gitHubInstallationWarnings?: GitHubInstallationWarning[]
  restartRequired: boolean
  restartSignature: string | null
}

type SecretConfigurationField = {
  configured: boolean
  mode: SecretMode
  value: string | null
}

type GitHubSecretConfiguration = {
  token: SecretConfigurationField
  privateKey: SecretConfigurationField
  privateKeyPath: SecretConfigurationField
  webhookSecret: SecretConfigurationField
}

type GitHubInstallationProfile = {
  instance: string
  owner: string
  installationId: string
  source: 'detected' | 'manual'
}

type GitHubInstallationWarning = {
  instance: string
  owner: string
  repository: string
  code: string
  message: string
}

type GitLabSecretConfiguration = {
  token: SecretConfigurationField
  webhookSecret: SecretConfigurationField
  webhookSigningToken: SecretConfigurationField
}

type GitLabProjectProfile = {
  instance: string
  projectPath: string
  tokenKind: string
  secrets?: GitLabSecretConfiguration | null
}

type ServerConfiguration = {
  gitHub: {
    endpoint: string
    appId: string | null
    installationProfiles: GitHubInstallationProfile[]
    repositories: string[]
    writesEnabled: boolean
    secrets?: GitHubSecretConfiguration | null
  }
  gitLab: {
    enabled: boolean
    writesEnabled: boolean
    endpoint: string
    apiBaseUrl: string
    projects: string[]
    projectProfiles: GitLabProjectProfile[]
    allowLocalDevelopmentUnsafeWebhooks: boolean
  }
  dotCraft: {
    repositoryWorkspaces: Record<string, string>
    appServerUrl: string
    hubDiscoveryEnabled: boolean
    hubLockPath: string
    approvalPolicy: string
    runTimeoutSeconds: number
  }
  runtime: {
    managedWorktreesEnabled: boolean
    worktreeRoot: string
    worktreeBranchPrefix: string
    globalMaxActiveRuns: number
    maxActiveRunsPerRepository: number
    maxActiveRunsPerSource: number
    maxRunAttempts: number
    retryBackoffSeconds: number
    maxRetryBackoffSeconds: number
    stallTimeoutSeconds: number
    succeededWorktreeRetentionHours: number
    failedWorktreeRetentionHours: number
    worktreeCleanupEnabled: boolean
    worktreeCleanupIntervalSeconds: number
  }
  automation: {
    autoDispatchEnabled: boolean
    autoDispatchAllowLabels: string[]
    autoDispatchBlockLabels: string[]
    deliveryPolicy: DeliveryPolicy
    maxImplementationTurns: number
    autoReviewRepositories: string[]
    autoReviewPublishEnabled: boolean
    autoReviewPublishRepositories: string[]
  }
}

type ConfigurationChange = {
  changeId: string
  createdAt: string
  actor: string
  remoteAddress: string | null
  baseRevision: string
  newRevision: string
  changedFields: string[]
  impactWarnings: string[]
}

type SettingsViewProps = {
  theme: ThemeMode
  setTheme: Dispatch<SetStateAction<ThemeMode>>
  githubStatus: GitHubSettingsStatus
  sourceProviders?: SourceProviderStatus[]
  sourceSyncJobs?: Record<string, SourceSyncJob | null>
  sourceSyncSchedules?: Record<string, SourceSyncSchedule | null>
  dotcraftStatus: DotCraftSettingsStatus
  refreshAll: () => Promise<void>
  syncGitHubSource: () => Promise<void>
  syncGitHubFullRepair: () => Promise<void>
  syncFailedGitHubRepositories: (repositories: string[]) => Promise<void>
  syncSourceProvider?: (provider: string, mode?: SourceSyncMode, projects?: string[]) => Promise<void>
  syncFailedSourceProjects?: (provider: string, projects: string[]) => Promise<void>
  updateSourceSyncSchedule?: (provider: string, request: SourceSyncScheduleUpdateRequest) => Promise<void>
  startDotCraftAppServer: () => Promise<void>
  isSyncing: boolean
  isStartingAppServer: boolean
  serverRestartPending: boolean
  onServerRestartRequired: (restart: { signature: string; fields: string[] }) => void
}

export function SettingsView({
  theme,
  setTheme,
  githubStatus,
  sourceProviders = [],
  sourceSyncJobs = {},
  sourceSyncSchedules = {},
  dotcraftStatus,
  refreshAll,
  syncGitHubSource,
  syncGitHubFullRepair,
  syncFailedGitHubRepositories,
  syncSourceProvider,
  syncFailedSourceProjects,
  updateSourceSyncSchedule,
  startDotCraftAppServer,
  isSyncing,
  isStartingAppServer,
  serverRestartPending,
  onServerRestartRequired,
}: SettingsViewProps) {
  const { section } = useParams()
  const navigate = useNavigate()
  const activeSection = normalizeSettingsSection(section)
  const [diagnostics, setDiagnostics] = useState<SettingsDiagnosticsResponse | null>(null)
  const [serverConfig, setServerConfig] = useState<ServerConfigurationResponse | null>(null)
  const [configDraft, setConfigDraft] = useState<ServerConfiguration | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)
  const [gitHubInstallationWarnings, setGitHubInstallationWarnings] = useState<GitHubInstallationWarning[]>([])
  const [configSaveState, setConfigSaveState] = useState<ConfigSaveState>('idle')
  const [workspaceInventory, setWorkspaceInventory] = useState<DotCraftWorkspacesResponse | null>(null)
  const [workspaceError, setWorkspaceError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [scheduleSavingProvider, setScheduleSavingProvider] = useState<string | null>(null)
  const [newProjectProvider, setNewProjectProvider] = useState<SourceProviderId>('github')
  const [newProjectPath, setNewProjectPath] = useState('')
  const [newWorkspacePath, setNewWorkspacePath] = useState('')
  const [repositoryAllowlistModal, setRepositoryAllowlistModal] = useState<RepositoryAllowlistKind | null>(null)
  const [windowCloseBehavior, setWindowCloseBehaviorState] = useState<WindowCloseBehavior>('minimizeToTray')
  const settingsPageRef = useRef<HTMLElement | null>(null)
  const serverConfigRef = useRef<ServerConfigurationResponse | null>(null)
  const configDraftRef = useRef<ServerConfiguration | null>(null)
  const autosaveTimerRef = useRef<number | null>(null)
  const savedStateTimerRef = useRef<number | null>(null)
  const saveInFlightRef = useRef(false)
  const queuedSaveRef = useRef(false)
  const canConfigureWindowBehavior = Boolean(window.oratorioDesktop?.getWindowCloseBehavior && window.oratorioDesktop?.setWindowCloseBehavior)

  const loadDiagnostics = useCallback(async () => {
    try {
      setDiagnostics(await apiGet<SettingsDiagnosticsResponse>('/settings/diagnostics'))
    } catch {
      setDiagnostics(null)
    }
  }, [])

  const loadServerConfiguration = useCallback(async () => {
    setConfigError(null)
    try {
      const response = await apiGet<ServerConfigurationResponse>('/settings/server-configuration')
      const normalized = { ...response, configuration: normalizeServerConfiguration(response.configuration) }
      serverConfigRef.current = normalized
      configDraftRef.current = normalized.configuration
      setServerConfig(normalized)
      setConfigDraft(normalized.configuration)
      setGitHubInstallationWarnings([])
    } catch (reason) {
      setServerConfig(null)
      setConfigDraft(null)
      serverConfigRef.current = null
      configDraftRef.current = null
      setConfigError(reason instanceof Error ? reason.message : 'Server configuration is unavailable.')
    }
  }, [])

  const loadWorkspaceInventory = useCallback(async () => {
    setWorkspaceError(null)
    try {
      setWorkspaceInventory(await apiGet<DotCraftWorkspacesResponse>('/dotcraft/workspaces'))
    } catch (reason) {
      setWorkspaceInventory(null)
      setWorkspaceError(reason instanceof Error ? reason.message : 'Workspace inventory is unavailable.')
    }
  }, [])

  useEffect(() => {
    void loadDiagnostics()
    void loadServerConfiguration()
    void loadWorkspaceInventory()
  }, [loadDiagnostics, loadServerConfiguration, loadWorkspaceInventory])

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current)
      }
      if (savedStateTimerRef.current !== null) {
        window.clearTimeout(savedStateTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const desktop = window.oratorioDesktop
    if (!desktop?.getWindowCloseBehavior) {
      return
    }

    let cancelled = false
    void desktop.getWindowCloseBehavior()
      .then((closeBehavior) => {
        if (!cancelled && isWindowCloseBehavior(closeBehavior)) {
          setWindowCloseBehaviorState(closeBehavior)
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const page = settingsPageRef.current
    if (!page) {
      return
    }

    page.scrollTop = 0
    page.scrollLeft = 0
  }, [activeSection])

  const refreshSettings = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await Promise.all([refreshAll(), loadDiagnostics(), loadServerConfiguration(), loadWorkspaceInventory()])
    } finally {
      setIsRefreshing(false)
    }
  }, [loadDiagnostics, loadServerConfiguration, loadWorkspaceInventory, refreshAll])

  function clearAutosaveTimer() {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
  }

  function scheduleSavedStateReset() {
    if (savedStateTimerRef.current !== null) {
      window.clearTimeout(savedStateTimerRef.current)
    }
    savedStateTimerRef.current = window.setTimeout(() => {
      setConfigSaveState('idle')
      savedStateTimerRef.current = null
    }, 1600)
  }

  async function runServerConfigurationAutosave() {
    clearAutosaveTimer()
    if (saveInFlightRef.current) {
      queuedSaveRef.current = true
      return
    }

    const currentServerConfig = serverConfigRef.current
    const configuration = configDraftRef.current
    if (!currentServerConfig || !configuration || !currentServerConfig.writable) {
      return
    }

    if (JSON.stringify(currentServerConfig.configuration) === JSON.stringify(configuration)) {
      queuedSaveRef.current = false
      if (configSaveState !== 'failed') {
        setConfigSaveState('idle')
      }
      return
    }

    saveInFlightRef.current = true
    queuedSaveRef.current = false
    setConfigSaveState('saving')
    setConfigError(null)
    try {
      const response = await apiPut<ServerConfigurationUpdateResponse>('/settings/server-configuration', {
        baseRevision: currentServerConfig.revision,
        confirmImpact: true,
        detectGitHubInstallations: true,
        configuration,
      })
      const normalizedResponse = {
        ...response.configuration,
        configuration: normalizeServerConfiguration(response.configuration.configuration),
      }
      serverConfigRef.current = normalizedResponse
      setServerConfig(normalizedResponse)
      setGitHubInstallationWarnings(response.gitHubInstallationWarnings ?? [])
      await Promise.all([refreshAll(), loadDiagnostics(), loadWorkspaceInventory()])

      const latestDraft = configDraftRef.current
      const savedDraftStillCurrent = Boolean(latestDraft && JSON.stringify(latestDraft) === JSON.stringify(configuration))
      if (savedDraftStillCurrent && !queuedSaveRef.current) {
        configDraftRef.current = normalizedResponse.configuration
        setConfigDraft(normalizedResponse.configuration)
        if (response.restartRequired && response.restartSignature) {
          onServerRestartRequired({ signature: response.restartSignature, fields: response.appliedFields })
        }
        setConfigSaveState('saved')
        scheduleSavedStateReset()
      }
    } catch (reason) {
      setConfigSaveState('failed')
      setConfigError(reason instanceof Error ? reason.message : 'Server configuration save failed.')
      return
    } finally {
      saveInFlightRef.current = false
    }

    if (
      queuedSaveRef.current ||
      (serverConfigRef.current && configDraftRef.current && JSON.stringify(serverConfigRef.current.configuration) !== JSON.stringify(configDraftRef.current))
    ) {
      void runServerConfigurationAutosave()
    }
  }

  function queueServerConfigurationAutosave(mode: ConfigSaveMode = 'debounced') {
    if (!serverConfigRef.current?.writable || !configDraftRef.current) {
      return
    }

    queuedSaveRef.current = true
    setConfigError(null)
    if (savedStateTimerRef.current !== null) {
      window.clearTimeout(savedStateTimerRef.current)
      savedStateTimerRef.current = null
    }

    if (mode === 'immediate') {
      void runServerConfigurationAutosave()
      return
    }

    clearAutosaveTimer()
    autosaveTimerRef.current = window.setTimeout(() => {
      void runServerConfigurationAutosave()
    }, autosaveDebounceMs)
  }

  function retryServerConfigurationAutosave() {
    queuedSaveRef.current = true
    void runServerConfigurationAutosave()
  }

  async function detectGitHubInstallationsNow() {
    const currentServerConfig = serverConfigRef.current
    const configuration = configDraftRef.current
    if (!currentServerConfig || !configuration || !currentServerConfig.writable || saveInFlightRef.current) {
      return
    }

    saveInFlightRef.current = true
    setConfigSaveState('saving')
    setConfigError(null)
    try {
      const response = await apiPut<ServerConfigurationUpdateResponse>('/settings/server-configuration', {
        baseRevision: currentServerConfig.revision,
        confirmImpact: true,
        detectGitHubInstallations: true,
        configuration,
      })
      const normalizedResponse = {
        ...response.configuration,
        configuration: normalizeServerConfiguration(response.configuration.configuration),
      }
      serverConfigRef.current = normalizedResponse
      configDraftRef.current = normalizedResponse.configuration
      setServerConfig(normalizedResponse)
      setConfigDraft(normalizedResponse.configuration)
      setGitHubInstallationWarnings(response.gitHubInstallationWarnings ?? [])
      if (response.restartRequired && response.restartSignature) {
        onServerRestartRequired({ signature: response.restartSignature, fields: response.appliedFields })
      }
      await Promise.all([refreshAll(), loadDiagnostics(), loadWorkspaceInventory()])
      setConfigSaveState('saved')
      scheduleSavedStateReset()
    } catch (reason) {
      setConfigSaveState('failed')
      setConfigError(reason instanceof Error ? reason.message : 'GitHub installation detection failed.')
    } finally {
      saveInFlightRef.current = false
    }
  }

  async function selectWorkspaceDirectory(currentPath: string, onSelect: (path: string) => void) {
    const selectDirectory = window.oratorioDesktop?.selectDirectory
    if (!selectDirectory) {
      return
    }

    try {
      const selected = await selectDirectory(currentPath.trim() || undefined)
      if (selected) {
        onSelect(selected)
      }
    } catch (reason) {
      setConfigError(reason instanceof Error ? reason.message : 'Could not select workspace folder.')
    }
  }

  function updateWindowCloseBehavior(value: string) {
    if (!isWindowCloseBehavior(value)) {
      return
    }

    const previous = windowCloseBehavior
    setWindowCloseBehaviorState(value)
    void window.oratorioDesktop?.setWindowCloseBehavior?.(value).catch(() => {
      setWindowCloseBehaviorState(previous)
    })
  }

  const diagnosticsDotcraft = diagnostics?.dotCraft
  const diagnosticsGitHub = diagnostics?.gitHub ?? diagnostics?.github
  const diagnosticsGitLab = diagnostics?.gitLab
  const dotcraftEndpoint = diagnosticsDotcraft?.endpoint || formatEndpoint(dotcraftStatus.endpoint) || 'No endpoint configured.'
  const dotcraftEndpointSource = diagnosticsDotcraft?.endpointSource ?? dotcraftStatus.endpointSource ?? 'configuration'
  const dotcraftApprovalPolicy = diagnosticsDotcraft?.approvalPolicy ?? dotcraftStatus.approvalPolicy
  const dotcraftRunTimeoutSeconds = diagnosticsDotcraft?.runTimeoutSeconds ?? dotcraftStatus.runTimeoutSeconds
  const dotcraftHubDiscoveryEnabled = diagnosticsDotcraft?.hubDiscoveryEnabled ?? configDraft?.dotCraft.hubDiscoveryEnabled ?? false
  const githubAuthenticationLabel = diagnosticsGitHub?.authentication ? authLabel(diagnosticsGitHub.authentication) : githubStatus.configured ? 'Configured' : 'None'
  const gitLabConfig = normalizeGitLabConfig(configDraft?.gitLab)
  const persistedGitLabConfig = normalizeGitLabConfig(serverConfig?.configuration.gitLab)
  const gitLabEndpointHostChanged = sourceInstance('gitlab', persistedGitLabConfig.endpoint) !== sourceInstance('gitlab', gitLabConfig.endpoint)
  const gitLabEndpointDescription = gitLabEndpointHostChanged && persistedGitLabConfig.projectProfiles.length > 0
    ? 'Changing host clears GitLab project profiles on save; new profiles are required after restart.'
    : 'GitLab instance URL.'
  const gitLabTokenConfiguredCount = gitLabConfig.projectProfiles.filter((profile) => normalizeGitLabSecrets(profile.secrets).token.configured).length
  const gitLabAuthenticationLabel = diagnosticsGitLab?.authentication ? authLabel(diagnosticsGitLab.authentication) : gitLabTokenConfiguredCount ? gitLabTokenConfiguredCount === gitLabConfig.projects.length ? 'Token' : 'Partial' : 'None'
  const gitLabWebhookLabel = diagnosticsGitLab?.webhookVerificationMode ? gitLabWebhookModeLabel(diagnosticsGitLab.webhookVerificationMode) : 'None'
  const providerCards = useMemo(
    () => buildSourceProviderCards(sourceProviders, githubStatus, gitLabConfig, diagnosticsGitLab),
    [sourceProviders, githubStatus, gitLabConfig, diagnosticsGitLab],
  )
  const projectCards = useMemo(
    () => buildProjectCards(configDraft, workspaceInventory),
    [configDraft, workspaceInventory],
  )
  const gitHubInstallationRows = useMemo(
    () => buildGitHubInstallationRows(configDraft, gitHubInstallationWarnings),
    [configDraft, gitHubInstallationWarnings],
  )
  const sourceProjectByKey = useMemo(() => {
    const rows = new Map<string, SourceProviderStatus['projects'][number]>()
    for (const provider of providerCards) {
      for (const project of provider.projects ?? []) {
        rows.set(project.key.toLowerCase(), project)
      }
    }
    return rows
  }, [providerCards])
  const configuredProjects = useMemo(
    () => projectCards.map((card) => card.canonicalKey).filter(Boolean),
    [projectCards],
  )
  const hasGitLabProject = providerCards.some((provider) => provider.provider === 'gitlab' && provider.configured) ||
    projectCards.some((card) => card.provider === 'gitlab')
  const deliveryLabel = hasGitLabProject ? 'Auto PR/MR' : 'Auto PR'
  const deliveryDescription = hasGitLabProject
    ? 'Default delivery policy for auto-dispatched implementation items. Auto delivery creates a GitHub PR or GitLab MR from the origin project.'
    : 'Default delivery policy for auto-dispatched implementation items.'
  const sourceProjectPlaceholder = newProjectProvider === 'gitlab' ? 'group/project or group/subgroup/project' : 'owner/name'
  const sourceProjectEmptyLabel = providerCards.length ? 'No source projects configured.' : 'No source providers configured.'
  const providerCountCopy = providerCards.length
    ? `${providerCards.filter((provider) => provider.configured).length}/${providerCards.length} providers configured`
    : 'No source providers configured.'
  const routeStatusTone = projectCards.length ? 'ok' : providerCards.length ? 'warn' : 'muted'
  const routeStatusLabel = projectCards.length ? `${projectCards.length} projects` : providerCards.length ? 'No projects' : 'No providers'
  const syncSource = syncSourceProvider ?? (async (provider: string, mode: SourceSyncMode = 'incremental') => {
    if (provider === 'github') {
      await (mode === 'full' ? syncGitHubFullRepair() : syncGitHubSource())
    }
  })
  const retrySourceProjects = syncFailedSourceProjects ?? (async (provider: string, projects: string[]) => {
    if (provider === 'github') {
      await syncFailedGitHubRepositories(projects)
    }
  })
  const updateProviderSchedule = async (provider: string, request: SourceSyncScheduleUpdateRequest) => {
    if (!updateSourceSyncSchedule) {
      return
    }

    setScheduleSavingProvider(provider)
    setConfigError(null)
    try {
      await updateSourceSyncSchedule(provider, request)
    } catch (reason) {
      setConfigError(reason instanceof Error ? reason.message : 'Scheduled sync settings could not be saved.')
    } finally {
      setScheduleSavingProvider(null)
    }
  }
  const goToCredentials = () => navigate('/settings/credentials')
  const goToProjects = () => navigate('/settings/projects')
  const addProjectDisabled = !serverConfig?.writable || !newProjectPath.trim()
  const implementationAutoDispatchDescription = hasGitLabProject
    ? 'Starts eligible GitHub/GitLab issues and local tasks when allow/block labels permit it.'
    : 'Starts eligible GitHub issues and local tasks when allow/block labels permit it.'
  const reviewPolicyDescription = hasGitLabProject
    ? 'Project-level PR/MR review triggers and draft publication policy.'
    : 'Repository-level PR review triggers and draft publication policy.'
  const publishAllowlistDescription = hasGitLabProject
    ? 'Publishes valid Review Drafts through the provider-specific route for selected projects.'
    : 'Publishes valid Review Drafts as GitHub COMMENT reviews only.'
  const autoReviewAllowlistDescription = hasGitLabProject
    ? 'Automatically queues read-only PR/MR reviews for enabled projects.'
    : 'Automatically queues read-only PR reviews for enabled repositories.'
  const allowlistEmptyLabel = hasGitLabProject ? 'No projects included.' : 'No repositories included.'
  const allowlistManageDisabled = !serverConfig?.writable || configuredProjects.length === 0
  const reviewTargetTerm = hasGitLabProject ? 'PR/MR' : 'PR'
  const publishRouteTerm = hasGitLabProject ? 'provider review routes' : 'GitHub COMMENT reviews'
  const reviewSourceSupports = hasGitLabProject ? 'GitHub PRs and GitLab MRs support head-SHA re-review.' : 'GitHub PRs support head-SHA re-review.'
  const sourceWriteFailureSummary = diagnosticsGitLab?.recentSourceWriteFailures?.[0] ?? diagnosticsGitLab?.recentSyncFailures?.[0] ?? null
  const diagnosticsGitLabWriteLabel = (diagnosticsGitLab?.writeConfigured ?? gitLabTokenConfiguredCount > 0) ? gitLabTokenConfiguredCount && gitLabTokenConfiguredCount < gitLabConfig.projects.length ? 'Partial' : 'Configured' : 'Missing token'

  const shouldShowStartServer = !dotcraftStatus.connected || Boolean(workspaceInventory?.workspaces?.some((workspace) => !workspace.connected))
  const bridgeActions = shouldShowStartServer ? (
    <button className="secondary-button inline compact-row-action settings-action-button" type="button" disabled={isStartingAppServer} onClick={() => void startAndRefreshDotCraftAppServer()}>
      {isStartingAppServer ? 'Starting...' : 'Start server'}
    </button>
  ) : null

  async function startAndRefreshDotCraftAppServer() {
    await startDotCraftAppServer()
    await Promise.all([loadDiagnostics(), loadWorkspaceInventory()])
  }

  const updateServerConfiguration = (updater: (current: ServerConfiguration) => ServerConfiguration, saveMode: ConfigSaveMode = 'debounced') => {
    const current = configDraftRef.current
    if (!current) {
      return
    }
    const next = updater(current)
    configDraftRef.current = next
    setConfigDraft(next)
    queueServerConfigurationAutosave(saveMode)
  }

  const updateGitHubConfig = (next: Partial<ServerConfiguration['gitHub']>, saveMode: ConfigSaveMode = 'debounced') => {
    updateServerConfiguration((current) => ({ ...current, gitHub: { ...current.gitHub, ...next } }), saveMode)
  }

  const updateGitLabConfig = (next: Partial<ServerConfiguration['gitLab']>, saveMode: ConfigSaveMode = 'debounced') => {
    updateServerConfiguration((current) => applyGitLabConfigUpdate(current, next), saveMode)
  }
  const updateDotCraftConfig = (next: Partial<ServerConfiguration['dotCraft']>, saveMode: ConfigSaveMode = 'debounced') => {
    updateServerConfiguration((current) => ({ ...current, dotCraft: { ...current.dotCraft, ...next } }), saveMode)
  }
  const updateRuntimeConfig = (next: Partial<ServerConfiguration['runtime']>, saveMode: ConfigSaveMode = 'debounced') => {
    updateServerConfiguration((current) => ({ ...current, runtime: { ...current.runtime, ...next } }), saveMode)
  }
  const updateAutomationConfig = (next: Partial<ServerConfiguration['automation']>, saveMode: ConfigSaveMode = 'debounced') => {
    updateServerConfiguration((current) => ({ ...current, automation: { ...current.automation, ...next } }), saveMode)
  }
  const updateProjectCard = (index: number, next: Partial<ProjectRouteCardDraft>, saveMode: ConfigSaveMode = 'debounced') => {
    updateServerConfiguration((current) => applyProjectCardUpdate(current, index, next), saveMode)
  }
  const removeProjectCard = (index: number) => {
    updateServerConfiguration((current) => applyProjectCardRemoval(current, index))
  }
  const addProjectCard = () => {
    updateServerConfiguration((current) => applyProjectCardAdd(current, newProjectProvider, newProjectPath, newWorkspacePath))
    setNewProjectPath('')
    setNewWorkspacePath('')
  }
  const updateGitHubInstallationProfile = (instance: string, owner: string, installationId: string) => {
    updateServerConfiguration((current) => ({
      ...current,
      gitHub: {
        ...current.gitHub,
        installationProfiles: upsertGitHubInstallationProfile(current.gitHub.installationProfiles, instance, owner, installationId),
      },
    }), 'immediate')
  }
  const updateGitHubSecret = (key: keyof GitHubSecretConfiguration, next: Partial<SecretConfigurationField>) => {
    updateServerConfiguration((current) => {
      const secrets = normalizeGitHubSecrets(current.gitHub.secrets)
      return {
        ...current,
        gitHub: {
          ...current.gitHub,
          secrets: {
            ...secrets,
            [key]: { ...secrets[key], ...next },
          },
        },
      }
    }, 'immediate')
  }

  const updateGitLabProjectProfileTokenKind = (card: ProjectRouteCardDraft, tokenKind: string) => {
    updateServerConfiguration((current) => upsertGitLabProjectProfile(current, card, { tokenKind }), 'immediate')
  }
  const updateGitLabProjectProfileSecret = (card: ProjectRouteCardDraft, key: keyof GitLabSecretConfiguration, next: Partial<SecretConfigurationField>) => {
    updateServerConfiguration((current) => upsertGitLabProjectProfileSecret(current, card, key, next), 'immediate')
  }
  const updateAutoReviewRepositories = (repositories: string[]) => {
    updateAutomationConfig({ autoReviewRepositories: filterRepositories(repositories, configuredProjects) })
  }
  const updateAutoReviewPublishRepositories = (repositories: string[]) => {
    const filtered = filterRepositories(repositories, configuredProjects)
    updateAutomationConfig({
      autoReviewPublishEnabled: filtered.length > 0,
      autoReviewPublishRepositories: filtered,
    })
  }

  return (
      <section className="settings-page" aria-label="Settings" ref={settingsPageRef}>
        <div className="settings-content">
          <header className="settings-page-header">
            <div>
              <h1>{settingsSections.find((item) => item.id === activeSection)?.label ?? 'Settings'}</h1>
              <p>{activeSectionCopy(activeSection)}</p>
            </div>
            <span className="settings-page-header-actions">
              <SettingsAutosaveStatus saveState={configSaveState} onRetry={retryServerConfigurationAutosave} />
              <ActionIcon className="icon-button settings-refresh-action" label={isRefreshing ? 'Refreshing settings' : 'Refresh settings'} title={isRefreshing ? 'Refreshing settings' : 'Refresh settings'} onClick={() => void refreshSettings()} disabled={isRefreshing}>
                <RefreshCw size={15} />
              </ActionIcon>
            </span>
          </header>
          {configError ? <SettingsNotice tone="error">{configError}</SettingsNotice> : null}
          {activeSection === 'general' ? (
            <div className="settings-stack">
              <SettingsGroup title="Appearance" description="Browser-local preferences for this console.">
                <SettingsRow
                  icon={SunMoon}
                  label="Theme"
                  description="Stored in this browser and applied immediately."
                  control={
                    <SegmentedControl
                      value={theme}
                      options={[
                        { value: 'dark', label: 'Dark' },
                        { value: 'light', label: 'Light' },
                      ]}
                      onChange={(value) => setTheme(value as ThemeMode)}
                    />
                  }
                />
              </SettingsGroup>
              {canConfigureWindowBehavior ? (
                <SettingsGroup title="Desktop" description="Window and tray preferences for this device.">
                  <SettingsRow
                    icon={Settings}
                    label="Window behavior"
                    description="Choose what the close button does."
                    control={
                      <SegmentedControl
                        value={windowCloseBehavior}
                        options={windowCloseBehaviorOptions}
                        onChange={updateWindowCloseBehavior}
                      />
                    }
                  />
                </SettingsGroup>
              ) : null}
            </div>
          ) : null}

          {activeSection === 'sources' ? (
            <div className="settings-stack">
              <SettingsGroup title="Source providers" description={providerCountCopy}>
                <div className="source-provider-card-list">
                  {providerCards.length ? providerCards.map((provider) => (
                    <SourceProviderCard
                      key={provider.provider}
                      provider={provider}
                      job={sourceSyncJobs[provider.provider] ?? null}
                      schedule={sourceSyncSchedules[provider.provider] ?? null}
                      isStarting={isSyncing}
                      isSavingSchedule={scheduleSavingProvider === provider.provider}
                      pendingRestart={serverRestartPending}
                      onSync={() => void syncSource(provider.provider, 'incremental')}
                      onFullRepair={() => void syncSource(provider.provider, 'full')}
                      onRetryFailed={(projects) => void retrySourceProjects(provider.provider, projects)}
                      onScheduleChange={(request) => void updateProviderSchedule(provider.provider, request)}
                      onConfigure={goToCredentials}
                      onRouteProjects={goToProjects}
                    />
                  )) : (
                    <div className="empty-settings-card">
                      <GitPullRequest size={16} />
                      <span>No source providers configured.</span>
                    </div>
                  )}
                </div>
                {sourceWriteFailureSummary ? <SettingsNotice tone="error">{sourceWriteFailureSummary}</SettingsNotice> : null}
              </SettingsGroup>
            </div>
          ) : null}

          {activeSection === 'projects' ? (
            <div className="settings-stack">
              <SettingsGroup title="Project routing" description={serverConfig?.writable ? `Overlay: ${serverConfig.overlayPath}` : serverConfig?.disabledReason ?? 'Server configuration is read-only.'}>
                <SettingsRow icon={GitPullRequest} label="Source projects" description="Map GitHub repositories and GitLab projects to DotCraft workspaces." control={<StatusPill tone={routeStatusTone} label={routeStatusLabel} />} />
                <div className="repository-card-list">
                  {projectCards.length ? projectCards.map((card, index) => (
                    <ProjectRouteCard
                      key={`${card.canonicalKey || 'empty'}-${index}`}
                      card={card}
                      gitLabProfile={card.provider === 'gitlab' ? gitLabProfileForCard(gitLabConfig, card) : null}
                      sourceProject={card.provider === 'gitlab' ? sourceProjectByKey.get(card.canonicalKey.toLowerCase()) ?? null : null}
                      disabled={!serverConfig?.writable}
                      onProviderChange={(provider) => updateProjectCard(index, { provider: provider as SourceProviderId })}
                      onProjectPathChange={(projectPath) => updateProjectCard(index, { projectPath }, 'immediate')}
                      onWorkspacePathChange={(workspacePath) => updateProjectCard(index, { workspacePath }, 'immediate')}
                      onGitLabProfileTokenKindChange={(tokenKind) => updateGitLabProjectProfileTokenKind(card, tokenKind)}
                      onGitLabProfileSecretChange={(key, next) => updateGitLabProjectProfileSecret(card, key, next)}
                      canBrowseWorkspace={Boolean(window.oratorioDesktop?.selectDirectory)}
                      onBrowseWorkspace={() => void selectWorkspaceDirectory(card.workspacePath, (workspacePath) => updateProjectCard(index, { workspacePath }))}
                      onRemove={() => removeProjectCard(index)}
                    />
                  )) : (
                    <div className="empty-settings-card">
                      <GitPullRequest size={16} />
                      <span>{sourceProjectEmptyLabel}</span>
                    </div>
                  )}
                </div>
                {gitHubInstallationRows.length ? (
                  <GitHubInstallationProfileList
                    rows={gitHubInstallationRows}
                    disabled={!serverConfig?.writable}
                    onChange={updateGitHubInstallationProfile}
                    onDetect={() => void detectGitHubInstallationsNow()}
                  />
                ) : null}
                <div className="repository-add-row">
                  <SelectControl label="Source provider" value={newProjectProvider} disabled={!serverConfig?.writable} options={sourceProviderOptions} onChange={(value) => setNewProjectProvider(value as SourceProviderId)} />
                  <TextControl placeholder={sourceProjectPlaceholder} value={newProjectPath} disabled={!serverConfig?.writable} onChange={setNewProjectPath} commitOnBlur={false} />
                  <WorkspacePathControl
                    value={newWorkspacePath}
                    placeholder="DotCraft workspace path"
                    disabled={!serverConfig?.writable}
                    canBrowse={Boolean(window.oratorioDesktop?.selectDirectory)}
                    onChange={setNewWorkspacePath}
                    onBrowse={() => void selectWorkspaceDirectory(newWorkspacePath, setNewWorkspacePath)}
                    commitOnBlur={false}
                  />
                  <button className="secondary-button inline compact-row-action settings-action-button" disabled={addProjectDisabled} onClick={addProjectCard}>
                    <Plus size={14} />
                    Add
                  </button>
                </div>
                {workspaceError ? <SettingsNotice tone="error">{workspaceError}</SettingsNotice> : null}
              </SettingsGroup>
            </div>
          ) : null}

          {activeSection === 'credentials' ? (
            <div className="settings-stack">
              <SettingsGroup title="GitHub credentials" description="Secrets are submitted once and never echoed back.">
                <SettingsRow icon={Code2} label="Endpoint" description="GitHub API base URL." control={<TextControl value={configDraft?.gitHub.endpoint ?? ''} disabled={!serverConfig?.writable} onChange={(value) => updateGitHubConfig({ endpoint: value }, 'immediate')} />} />
                <SettingsRow icon={KeyRound} label="App ID" description="GitHub App identifier." control={<TextControl value={configDraft?.gitHub.appId ?? ''} disabled={!serverConfig?.writable} onChange={(value) => updateGitHubConfig({ appId: emptyToNull(value) }, 'immediate')} />} />
                <SettingsRow icon={ShieldCheck} label="Authentication" description="Resolved credential shape; values are redacted." control={<ValuePill>{githubAuthenticationLabel}</ValuePill>} />
                <SettingsRow icon={CheckCircle2} label="GitHub writes" description="Issue comments, PR reviews, check runs, and Auto PR delivery." control={<button className="toggle-button" aria-pressed={configDraft?.gitHub.writesEnabled ?? false} disabled={!serverConfig?.writable} onClick={() => updateGitHubConfig({ writesEnabled: !(configDraft?.gitHub.writesEnabled ?? false) })}>{configDraft?.gitHub.writesEnabled ? 'On' : 'Off'}</button>} />
                <SecretSettingsRow icon={KeyRound} label="Token" field={normalizeGitHubSecrets(configDraft?.gitHub.secrets).token} disabled={!serverConfig?.writable} onChange={(next) => updateGitHubSecret('token', next)} />
                <SecretSettingsRow icon={KeyRound} label="Private key" multiline field={normalizeGitHubSecrets(configDraft?.gitHub.secrets).privateKey} disabled={!serverConfig?.writable} onChange={(next) => updateGitHubSecret('privateKey', next)} />
                <SecretSettingsRow icon={KeyRound} label="Private key path" field={normalizeGitHubSecrets(configDraft?.gitHub.secrets).privateKeyPath} disabled={!serverConfig?.writable} onChange={(next) => updateGitHubSecret('privateKeyPath', next)} />
                <SecretSettingsRow icon={KeyRound} label="Webhook secret" field={normalizeGitHubSecrets(configDraft?.gitHub.secrets).webhookSecret} disabled={!serverConfig?.writable} onChange={(next) => updateGitHubSecret('webhookSecret', next)} />
              </SettingsGroup>
              <SettingsGroup title="GitLab" description="Token-based import, review publication, and merge request delivery.">
                <SettingsRow icon={CheckCircle2} label="GitLab read sync" description="Controls GitLab issue and MR import." control={<button className="toggle-button" aria-pressed={gitLabConfig.enabled} disabled={!serverConfig?.writable} onClick={() => updateGitLabConfig({ enabled: !gitLabConfig.enabled })}>{gitLabConfig.enabled ? 'On' : 'Off'}</button>} />
                <SettingsRow icon={GitPullRequest} label="GitLab writes" description="Issue notes, MR notes, discussions, commit status, and MR delivery." control={<button className="toggle-button" aria-pressed={gitLabConfig.writesEnabled} disabled={!serverConfig?.writable} onClick={() => updateGitLabConfig({ writesEnabled: !gitLabConfig.writesEnabled })}>{gitLabConfig.writesEnabled ? 'On' : 'Off'}</button>} />
                <SettingsRow icon={Code2} label="Endpoint" description={gitLabEndpointDescription} control={<TextControl value={gitLabConfig.endpoint} disabled={!serverConfig?.writable} onChange={(value) => updateGitLabConfig({ endpoint: value }, 'immediate')} />} />
                <SettingsRow icon={ShieldCheck} label="Authentication" description="Resolved token presence; values are redacted." control={<ValuePill>{gitLabAuthenticationLabel}</ValuePill>} />
                <SettingsRow icon={ShieldCheck} label="Write credentials" description="GitLab writes happen as the configured token identity." control={<ValuePill>{diagnosticsGitLabWriteLabel}</ValuePill>} />
                <SettingsRow icon={ShieldCheck} label="Webhook verification" description="Signing tokens are preferred; secret tokens remain supported." control={<ValuePill>{gitLabWebhookLabel}</ValuePill>} />
                <SettingsRow icon={ShieldCheck} label="Local webhook bypass" description="Only for local development receivers." control={<button className="toggle-button" aria-pressed={gitLabConfig.allowLocalDevelopmentUnsafeWebhooks} disabled={!serverConfig?.writable} onClick={() => updateGitLabConfig({ allowLocalDevelopmentUnsafeWebhooks: !gitLabConfig.allowLocalDevelopmentUnsafeWebhooks })}>{gitLabConfig.allowLocalDevelopmentUnsafeWebhooks ? 'On' : 'Off'}</button>} />
              </SettingsGroup>
            </div>
          ) : null}

          {activeSection === 'agents' ? (
            <div className="settings-stack">
              <SettingsGroup title="DotCraft bridge" description={dotcraftStatus.message ?? 'DotCraft bridge status.'} headerAction={bridgeActions}>
                <SettingsRow
                  icon={Code2}
                  label="Health"
                  description="Current AppServer reachability."
                  control={<StatusPill tone={dotcraftStatus.connected ? 'ok' : dotcraftStatus.configured ? 'warn' : 'muted'} label={healthLabel(dotcraftStatus.health)} />}
                />
                <SettingsRow icon={Code2} label="Endpoint" description={dotcraftEndpoint} control={<ValuePill>{dotcraftEndpointSource}</ValuePill>} />
                <SettingsRow icon={ShieldCheck} label="Approval policy" description="Prompt guard policy used for AppServer runs." control={<ValuePill>{dotcraftApprovalPolicy}</ValuePill>} />
                <SettingsRow icon={Activity} label="Run timeout" description="Maximum AppServer run duration." control={<ValuePill>{formatSecondsDuration(dotcraftRunTimeoutSeconds)}</ValuePill>} />
                <SettingsRow icon={GitPullRequest} label="Hub discovery" description="Whether Oratorio may discover AppServer endpoints through Hub." control={<StatusPill tone={dotcraftHubDiscoveryEnabled ? 'ok' : 'muted'} label={dotcraftHubDiscoveryEnabled ? 'Enabled' : 'Disabled'} />} />
              </SettingsGroup>
              <SettingsGroup title="Agent connection" description={serverConfig?.writable ? 'Changes apply after Oratorio server restart.' : serverConfig?.disabledReason ?? 'Server configuration is read-only.'}>
                <SettingsRow icon={Code2} label="AppServer URL" description="Absolute ws or wss endpoint used when Hub discovery is unavailable." control={<TextControl value={configDraft?.dotCraft.appServerUrl ?? ''} disabled={!serverConfig?.writable} onChange={(value) => updateDotCraftConfig({ appServerUrl: value }, 'immediate')} />} />
                <SettingsRow icon={GitPullRequest} label="Hub discovery" description="Allows Oratorio to discover AppServer endpoints through DotCraft Hub." control={<button className="toggle-button" aria-pressed={configDraft?.dotCraft.hubDiscoveryEnabled ?? false} disabled={!serverConfig?.writable} onClick={() => updateDotCraftConfig({ hubDiscoveryEnabled: !(configDraft?.dotCraft.hubDiscoveryEnabled ?? false) })}>{configDraft?.dotCraft.hubDiscoveryEnabled ? 'On' : 'Off'}</button>} />
                <SettingsRow icon={Code2} label="Hub lock path" description="Optional absolute path to DotCraft Hub workspace lock data." control={<TextControl value={configDraft?.dotCraft.hubLockPath ?? ''} disabled={!serverConfig?.writable} onChange={(value) => updateDotCraftConfig({ hubLockPath: value }, 'immediate')} />} />
                <SettingsRow icon={ShieldCheck} label="Approval policy" description="Prompt guard policy for new DotCraft threads." control={<SelectControl label="Approval policy" value={configDraft?.dotCraft.approvalPolicy ?? 'interrupt'} disabled={!serverConfig?.writable} options={approvalPolicyOptions} onChange={(value) => updateDotCraftConfig({ approvalPolicy: value })} />} />
                <SettingsRow icon={Activity} label="Run timeout" description="Maximum AppServer run duration." control={<DurationControl label="Run timeout" value={configDraft?.dotCraft.runTimeoutSeconds ?? DEFAULT_RUN_TIMEOUT_SECONDS} disabled={!serverConfig?.writable} min={30} max={7200} units={secondsDurationUnits} onChange={(value) => updateDotCraftConfig({ runTimeoutSeconds: value })} />} />
              </SettingsGroup>
            </div>
          ) : null}

          {activeSection === 'worktree' ? (
            <div className="settings-stack">
              <SettingsGroup title="Worktrees and scheduling" description={serverConfig?.writable ? 'Changes affect new scheduling and worktree cleanup decisions after restart.' : serverConfig?.disabledReason ?? 'Server configuration is read-only.'}>
                <SettingsRow icon={ShieldCheck} label="Managed worktrees" description="Prepare DotCraft runs in Oratorio-managed worktrees." control={<button className="toggle-button" aria-pressed={configDraft?.runtime.managedWorktreesEnabled ?? false} disabled={!serverConfig?.writable} onClick={() => updateRuntimeConfig({ managedWorktreesEnabled: !(configDraft?.runtime.managedWorktreesEnabled ?? false) })}>{configDraft?.runtime.managedWorktreesEnabled ? 'On' : 'Off'}</button>} />
                <SettingsRow icon={Code2} label="Worktree root" description="Absolute root path, or blank for each workspace default." control={<TextControl value={configDraft?.runtime.worktreeRoot ?? ''} disabled={!serverConfig?.writable} onChange={(value) => updateRuntimeConfig({ worktreeRoot: value }, 'immediate')} />} />
                <SettingsRow icon={GitPullRequest} label="Branch prefix" description="Namespace for generated worktree branches." control={<TextControl value={configDraft?.runtime.worktreeBranchPrefix ?? ''} disabled={!serverConfig?.writable} onChange={(value) => updateRuntimeConfig({ worktreeBranchPrefix: value }, 'immediate')} />} />
                <SettingsRow icon={Activity} label="Concurrency" description="Global, per repository, and per source active run limits." control={<NumberTripleControl values={[configDraft?.runtime.globalMaxActiveRuns ?? 1, configDraft?.runtime.maxActiveRunsPerRepository ?? 1, configDraft?.runtime.maxActiveRunsPerSource ?? 1]} disabled={!serverConfig?.writable} onChange={([globalMaxActiveRuns, maxActiveRunsPerRepository, maxActiveRunsPerSource]) => updateRuntimeConfig({ globalMaxActiveRuns, maxActiveRunsPerRepository, maxActiveRunsPerSource })} />} />
                <SettingsRow icon={RefreshCw} label="Retries" description="Attempts plus initial and maximum backoff." control={<RetryPolicyControl attempts={configDraft?.runtime.maxRunAttempts ?? 1} initialBackoffSeconds={configDraft?.runtime.retryBackoffSeconds ?? 1} maxBackoffSeconds={configDraft?.runtime.maxRetryBackoffSeconds ?? 1} disabled={!serverConfig?.writable} onChange={(maxRunAttempts, retryBackoffSeconds, maxRetryBackoffSeconds) => updateRuntimeConfig({ maxRunAttempts, retryBackoffSeconds, maxRetryBackoffSeconds })} />} />
                <SettingsRow icon={Activity} label="Stall timeout" description="How long a silent active run can continue before being treated as stalled." control={<DurationControl label="Stall timeout" value={configDraft?.runtime.stallTimeoutSeconds ?? 300} disabled={!serverConfig?.writable} min={5} max={7200} units={secondsDurationUnits} onChange={(value) => updateRuntimeConfig({ stallTimeoutSeconds: value })} />} />
                <SettingsRow icon={RotateCcw} label="Retention" description="How long successful and failed worktrees are kept." control={<RetentionControl succeededHours={configDraft?.runtime.succeededWorktreeRetentionHours ?? 24} failedHours={configDraft?.runtime.failedWorktreeRetentionHours ?? 168} disabled={!serverConfig?.writable} onChange={(succeededWorktreeRetentionHours, failedWorktreeRetentionHours) => updateRuntimeConfig({ succeededWorktreeRetentionHours, failedWorktreeRetentionHours })} />} />
                <SettingsRow icon={RotateCcw} label="Cleanup worker" description="Enable cleanup and set the worker interval." control={<CleanupControl enabled={configDraft?.runtime.worktreeCleanupEnabled ?? false} interval={configDraft?.runtime.worktreeCleanupIntervalSeconds ?? 60} disabled={!serverConfig?.writable} onChange={(worktreeCleanupEnabled, worktreeCleanupIntervalSeconds) => updateRuntimeConfig({ worktreeCleanupEnabled, worktreeCleanupIntervalSeconds })} />} />
              </SettingsGroup>
              <SettingsGroup title="Automation policy" description="Implementation auto-dispatch and delivery defaults.">
                <SettingsRow icon={Activity} label="Implementation auto-dispatch" description={implementationAutoDispatchDescription} control={<button className="toggle-button" aria-pressed={configDraft?.automation.autoDispatchEnabled ?? false} disabled={!serverConfig?.writable} onClick={() => updateAutomationConfig({ autoDispatchEnabled: !(configDraft?.automation.autoDispatchEnabled ?? false) })}>{configDraft?.automation.autoDispatchEnabled ? 'On' : 'Off'}</button>} />
                <SettingsRow icon={GitPullRequest} label="Auto-dispatch allow labels" description="Empty means every unblocked eligible item may run." control={<LabelListControl labels={configDraft?.automation.autoDispatchAllowLabels ?? []} disabled={!serverConfig?.writable} placeholder="Add allow label" emptyLabel="All unblocked items" ariaLabel="Auto-dispatch allow labels" onChange={(labels) => updateAutomationConfig({ autoDispatchAllowLabels: labels })} />} />
                <SettingsRow icon={ShieldCheck} label="Auto-dispatch block labels" description="Any matching label prevents implementation auto-dispatch." control={<LabelListControl labels={configDraft?.automation.autoDispatchBlockLabels ?? []} disabled={!serverConfig?.writable} placeholder="Add block label" emptyLabel="No block labels" ariaLabel="Auto-dispatch block labels" onChange={(labels) => updateAutomationConfig({ autoDispatchBlockLabels: labels })} />} />
                <SettingsRow icon={Activity} label="Implementation turns" description="Maximum continuation turns before an implementation run finishes without a draft." control={<NumberControl label="Implementation turns" value={configDraft?.automation.maxImplementationTurns ?? 3} disabled={!serverConfig?.writable} min={1} max={10} onChange={(value) => updateAutomationConfig({ maxImplementationTurns: value })} />} />
                <SettingsRow icon={ShieldCheck} label="Implementation delivery" description={deliveryDescription} control={<SelectControl label="Implementation delivery" value={configDraft?.automation.deliveryPolicy ?? 'manualDelivery'} disabled={!serverConfig?.writable} options={deliveryPolicyOptions.map((option) => option.value === 'autoPr' ? { ...option, label: deliveryLabel } : option)} onChange={(value) => updateAutomationConfig({ deliveryPolicy: value as DeliveryPolicy })} />} />
              </SettingsGroup>
            </div>
          ) : null}

          {activeSection === 'review' ? (
            <div className="settings-stack">
              <SettingsGroup title="Automatic review" description={reviewPolicyDescription}>
                <RepositoryAllowlistCard
                  title={hasGitLabProject ? 'Project allowlist' : 'Repository allowlist'}
                  description={`${autoReviewAllowlistDescription} ${reviewSourceSupports}`}
                  repositories={configDraft?.automation.autoReviewRepositories ?? []}
                  disabled={!serverConfig?.writable}
                  manageDisabled={allowlistManageDisabled}
                  emptyLabel={allowlistEmptyLabel}
                  onManage={() => setRepositoryAllowlistModal('autoReview')}
                  onRemove={(repository) => updateAutoReviewRepositories(removeRepository(configDraft?.automation.autoReviewRepositories ?? [], repository))}
                />
                <RepositoryAllowlistCard
                  title="Publish allowlist"
                  description={publishAllowlistDescription}
                  repositories={effectiveAutoReviewPublishRepositories(configDraft?.automation)}
                  disabled={!serverConfig?.writable}
                  manageDisabled={allowlistManageDisabled}
                  emptyLabel={allowlistEmptyLabel}
                  onManage={() => setRepositoryAllowlistModal('publish')}
                  onRemove={(repository) => updateAutoReviewPublishRepositories(removeRepository(effectiveAutoReviewPublishRepositories(configDraft?.automation), repository))}
                />
              </SettingsGroup>
            </div>
          ) : null}

        </div>
        {repositoryAllowlistModal ? (
          <RepositoryAllowlistModal
            kind={repositoryAllowlistModal}
            repositories={configuredProjects}
            selectedRepositories={repositoryAllowlistModal === 'autoReview' ? configDraft?.automation.autoReviewRepositories ?? [] : effectiveAutoReviewPublishRepositories(configDraft?.automation)}
            targetTerm={reviewTargetTerm}
            publishRouteTerm={publishRouteTerm}
            onCancel={() => setRepositoryAllowlistModal(null)}
            onSave={(selectedRepositories) => {
              if (repositoryAllowlistModal === 'autoReview') {
                updateAutoReviewRepositories(selectedRepositories)
              } else {
                updateAutoReviewPublishRepositories(selectedRepositories)
              }
              setRepositoryAllowlistModal(null)
            }}
          />
        ) : null}
      </section>
  )
}

function SettingsGroup({ title, description, headerAction, children }: { title: string; description?: string; headerAction?: ReactNode; children: ReactNode }) {
  return (
    <section className="settings-group">
      <header className="settings-group-header">
        <div>
          <strong>{title}</strong>
          {description ? <p>{description}</p> : null}
        </div>
        {headerAction}
      </header>
      <div className="settings-group-body">{children}</div>
    </section>
  )
}

function SettingsRow({ icon: Icon, label, description, control }: { icon: LucideIcon; label: string; description: string; control: ReactNode }) {
  return (
    <div className="settings-row">
      <span className="settings-row-icon">
        <Icon size={16} />
      </span>
      <span className="settings-row-copy">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <span className="settings-row-control">{control}</span>
    </div>
  )
}

function SettingsNotice({ tone, children }: { tone: 'error'; children: ReactNode }) {
  return <div className={`settings-notice ${tone}`}>{children}</div>
}

type SourceProviderCardModel = SourceProviderStatus & {
  writeConfigured?: boolean
  recentSyncFailures?: string[]
  recentSourceWriteFailures?: string[]
}

function SourceProviderCard({
  provider,
  job,
  schedule,
  isStarting,
  isSavingSchedule,
  pendingRestart,
  onSync,
  onFullRepair,
  onRetryFailed,
  onScheduleChange,
  onConfigure,
  onRouteProjects,
}: {
  provider: SourceProviderCardModel
  job: SourceSyncJob | null
  schedule: SourceSyncSchedule | null
  isStarting: boolean
  isSavingSchedule: boolean
  pendingRestart: boolean
  onSync: () => void
  onFullRepair: () => void
  onRetryFailed: (projects: string[]) => void
  onScheduleChange: (request: SourceSyncScheduleUpdateRequest) => void
  onConfigure: () => void
  onRouteProjects: () => void
}) {
  const active = isActiveSourceSyncJob(job)
  const failedRuns = job?.projects.filter((run) => run.status === 'failed') ?? []
  const canSync = provider.readCapability.available && !active && !isStarting && !pendingRestart
  const stateTone = provider.configured ? 'ok' : provider.readCapability.available ? 'warn' : 'muted'
  const stateLabel = provider.configured ? 'Configured' : provider.readCapability.available ? 'Ready' : 'Needs setup'
  const endpoint = formatEndpoint(provider.endpoint) || 'No endpoint configured.'
  const latestFailure = provider.recentSourceWriteFailures?.[0] ?? provider.recentSyncFailures?.[0] ?? job?.errorMessage ?? provider.diagnostic ?? null
  const providerLabel = provider.provider === 'gitlab' ? 'GitLab' : provider.provider === 'github' ? 'GitHub' : provider.displayName
  const projectTerm = provider.provider === 'gitlab' ? 'projects' : 'repositories'
  const reviewTargetTerm = provider.provider === 'gitlab' ? 'MRs' : 'PRs'
  const writeLabel = provider.writeCapability.available
    ? 'Writes ready'
    : provider.writeCapability.state === 'disabled'
      ? 'Writes off'
      : provider.writeCapability.reason ?? 'Writes unavailable'

  return (
    <section className="source-provider-card">
      <header className="source-provider-card-header">
        <span className="source-provider-title">
          <GitPullRequest size={16} />
          <span>
            <strong>{providerLabel}</strong>
            <small>{endpoint}</small>
          </span>
        </span>
        <StatusPill tone={stateTone} label={stateLabel} />
      </header>
      <div className="source-provider-capabilities" role="list" aria-label={`${providerLabel} capabilities`}>
        <CapabilityPill label="Read" capability={provider.readCapability} />
        <CapabilityPill label="Write" capability={provider.writeCapability} fallback={writeLabel} />
        <CapabilityPill label="Webhook" capability={provider.webhookCapability} />
      </div>
      <div className="source-provider-meta">
        <span>{provider.configuredProjectCount} configured {projectTerm}</span>
        <span>{provider.lastSyncAt ? `Last sync ${relativeTime(provider.lastSyncAt)}` : 'No sync yet'}</span>
        <span>{reviewTargetTerm} use head-SHA re-review when available</span>
      </div>
      <SourceSyncSchedulePanel
        provider={provider}
        schedule={schedule}
        saving={isSavingSchedule}
        onChange={onScheduleChange}
      />
      <SourceSyncPanel
        provider={provider.provider}
        projectTerm={projectTerm}
        reviewTargetTerm={reviewTargetTerm}
        job={job}
        pendingRestart={pendingRestart}
      />
      {latestFailure ? <SettingsNotice tone="error">{latestFailure}</SettingsNotice> : null}
      <footer className="source-provider-actions">
        <button className="secondary-button inline compact-row-action settings-action-button" type="button" onClick={onConfigure}>
          Configure
        </button>
        <button className="secondary-button inline compact-row-action settings-action-button" type="button" onClick={onRouteProjects}>
          Route projects
        </button>
        {failedRuns.length > 0 ? (
          <button className="secondary-button inline compact-row-action settings-action-button" type="button" disabled={active || isStarting} onClick={() => onRetryFailed(failedRuns.map((run) => run.sourceProjectKey || run.projectPath))}>
            Sync failed
          </button>
        ) : null}
        <button className="secondary-button inline compact-row-action settings-action-button" type="button" onClick={onFullRepair} disabled={active || isStarting || !provider.configured}>
          Full repair
        </button>
        <button className="primary-button inline compact-row-action settings-action-button" type="button" onClick={onSync} disabled={!canSync}>
          {isStarting ? 'Starting' : active ? 'Syncing' : 'Sync now'}
        </button>
      </footer>
    </section>
  )
}

function CapabilityPill({ label, capability, fallback }: { label: string; capability: SourceProviderStatus['readCapability']; fallback?: string }) {
  const tone = capability.available ? 'ok' : capability.state === 'disabled' || capability.state === 'unconfigured' ? 'muted' : 'warn'
  const text = capability.available ? `${label} ready` : fallback ?? capability.reason ?? `${label} unavailable`
  return <StatusPill tone={tone} label={text} />
}

function SourceSyncSchedulePanel({
  provider,
  schedule,
  saving,
  onChange,
}: {
  provider: SourceProviderCardModel
  schedule: SourceSyncSchedule | null
  saving: boolean
  onChange: (request: SourceSyncScheduleUpdateRequest) => void
}) {
  const intervalSeconds = schedule?.intervalSeconds ?? sourceSyncScheduleDefaultIntervalSeconds
  const enabled = schedule?.enabled ?? false
  const readAvailable = schedule?.readAvailable ?? provider.readCapability.available
  const disabledReason = schedule?.disabledReason ?? provider.readCapability.reason ?? 'Configure read sync before enabling scheduled sync.'
  const controlsDisabled = saving || !readAvailable
  const summary = !readAvailable
    ? disabledReason
    : enabled
      ? `Every ${formatScheduleInterval(intervalSeconds)} · ${formatScheduleNextRun(schedule?.nextRunAt)}`
      : `Off · interval ${formatScheduleInterval(intervalSeconds)}`
  const failure = schedule?.lastErrorMessage ?? null

  return (
    <section className="settings-row source-schedule-panel" aria-label={`${provider.displayName} scheduled sync`}>
      <span className="settings-row-icon source-schedule-icon">
        <Clock size={15} />
      </span>
      <span className="settings-row-copy source-schedule-copy">
        <strong>Scheduled sync</strong>
        <small>{summary}</small>
        {failure ? <small className="github-sync-error">{failure}</small> : null}
      </span>
      <span className="settings-row-control source-schedule-control">
        <ScheduleIntervalControl
          intervalSeconds={intervalSeconds}
          disabled={controlsDisabled}
          onChange={(nextInterval) => onChange({ enabled, intervalSeconds: nextInterval })}
        />
        <button
          className="toggle-button"
          type="button"
          aria-pressed={enabled}
          disabled={controlsDisabled}
          title={!readAvailable ? disabledReason : undefined}
          onClick={() => onChange({ enabled: !enabled, intervalSeconds })}
        >
          {saving ? 'Saving' : enabled ? 'On' : 'Off'}
        </button>
      </span>
    </section>
  )
}

function ScheduleIntervalControl({
  intervalSeconds,
  disabled,
  onChange,
}: {
  intervalSeconds: number
  disabled: boolean
  onChange: (intervalSeconds: number) => void
}) {
  const preset = sourceSyncSchedulePresets.find((option) => option.value === String(intervalSeconds))
  const [customMode, setCustomMode] = useState(!preset)
  useEffect(() => {
    if (preset) {
      setCustomMode(false)
    }
  }, [preset])

  const selected = customMode || !preset ? 'custom' : String(intervalSeconds)
  const customMinutes = Math.max(1, Math.round(intervalSeconds / 60))

  return (
    <span className="source-schedule-interval">
      <SelectControl
        label="Scheduled sync interval"
        value={selected}
        disabled={disabled}
        options={sourceSyncSchedulePresets}
        onChange={(value) => {
          if (value === 'custom') {
            setCustomMode(true)
            return
          }

          setCustomMode(false)
          onChange(Number(value))
        }}
      />
      {selected === 'custom' ? (
        <span className="source-schedule-custom">
          <NumberControl
            label="Custom scheduled sync interval in minutes"
            value={customMinutes}
            disabled={disabled}
            min={Math.ceil(sourceSyncScheduleMinSeconds / 60)}
            max={Math.floor(sourceSyncScheduleMaxSeconds / 60)}
            onChange={(minutes) => onChange(minutes * 60)}
          />
          <small>min</small>
        </span>
      ) : null}
    </span>
  )
}

function SourceSyncPanel({
  provider,
  projectTerm,
  reviewTargetTerm,
  job,
  pendingRestart,
}: {
  provider: string
  projectTerm: string
  reviewTargetTerm: string
  job: SourceSyncJob | null
  pendingRestart: boolean
}) {
  const projectRuns = job?.projects ?? []
  const completed = job ? `${job.projectsCompleted}/${job.projectsTotal}` : '0/0'
  const summary = job
    ? `${completed} ${projectTerm} · ${job.issuesImported} issues · ${job.reviewTargetsImported} ${reviewTargetTerm} · ${job.commentsImported} comments`
    : 'No active sync.'
  return (
    <section className="settings-row github-sync-panel source-sync-panel" aria-label={`${providerLabel(provider)} sync progress`}>
      <span className="settings-row-icon github-sync-icon">
        {sourceSyncStatusIcon(job)}
      </span>
      <span className="settings-row-copy github-sync-copy">
        <strong>{job ? sourceSyncJobStatusLabel(job.status) : 'Sync idle'}</strong>
        <small>{summary}</small>
        {pendingRestart ? <small className="github-sync-warning">Saved source changes need a restart before Sync now can use them.</small> : null}
      </span>
      {projectRuns.length ? (
        <div className="github-sync-repository-list">
          {projectRuns.map((run) => (
            <SourceSyncProjectRow key={run.projectRunId} run={run} reviewTargetTerm={reviewTargetTerm} />
          ))}
        </div>
      ) : null}
    </section>
  )
}

function SourceSyncProjectRow({ run, reviewTargetTerm }: { run: SourceSyncProjectRun; reviewTargetTerm: string }) {
  const phase = run.completedAt ? `${sourceProjectPhaseLabel(run)} · completed ${relativeTime(run.completedAt)}` : sourceProjectPhaseLabel(run)
  return (
    <div className={`github-sync-repository-row ${run.status}`}>
      <span className="github-sync-repository-name">
        {run.status === 'running' ? <RefreshCw size={14} className="spin-icon" /> : sourceProjectStatusIcon(run)}
        <span>
          <strong>{run.displayName || run.projectPath}</strong>
          <small>{phase}</small>
        </span>
      </span>
      <span className="github-sync-counts">
        {run.issuesImported} issues · {run.reviewTargetsImported} {reviewTargetTerm} · {run.commentsImported} comments
      </span>
      {run.errorMessage ? <small className="github-sync-error">{run.errorMessage}</small> : null}
    </div>
  )
}

type ProjectRouteCardDraft = {
  provider: SourceProviderId
  instance: string
  projectPath: string
  canonicalKey: string
  workspacePath: string
  workspace: DotCraftWorkspace | null
}

type GitHubInstallationProfileRow = {
  instance: string
  owner: string
  installationId: string
  source: 'detected' | 'manual' | 'missing'
  repositories: string[]
  warning: GitHubInstallationWarning | null
}

type GitLabProjectProfileRow = {
  instance: string
  projectPath: string
  tokenKind: string
  secrets: GitLabSecretConfiguration
}

function ProjectRouteCard({
  card,
  gitLabProfile,
  sourceProject,
  disabled,
  canBrowseWorkspace,
  onProviderChange,
  onProjectPathChange,
  onWorkspacePathChange,
  onGitLabProfileTokenKindChange,
  onGitLabProfileSecretChange,
  onBrowseWorkspace,
  onRemove,
}: {
  card: ProjectRouteCardDraft
  gitLabProfile: GitLabProjectProfileRow | null
  sourceProject: SourceProviderStatus['projects'][number] | null
  disabled: boolean
  canBrowseWorkspace: boolean
  onProviderChange: (provider: SourceProviderId) => void
  onProjectPathChange: (projectPath: string) => void
  onWorkspacePathChange: (workspacePath: string) => void
  onGitLabProfileTokenKindChange: (tokenKind: string) => void
  onGitLabProfileSecretChange: (key: keyof GitLabSecretConfiguration, next: Partial<SecretConfigurationField>) => void
  onBrowseWorkspace: () => void
  onRemove: () => void
}) {
  const providerName = providerLabel(card.provider)
  const projectPlaceholder = card.provider === 'gitlab' ? 'group/project or group/subgroup/project' : 'owner/name'
  const gitLabStatus = gitLabProfile ? gitLabProfileStatus(gitLabProfile, sourceProject) : null
  return (
    <div className="repository-card">
      <header className="repository-card-header">
        <span>
          <strong>{card.projectPath || `New ${providerName} project`}</strong>
          <small>{card.canonicalKey || 'Canonical source id will appear after a project path is set.'}</small>
        </span>
        <span className="settings-actions">
          {gitLabStatus ? <StatusPill tone={gitLabStatus.tone} label={gitLabStatus.label} /> : null}
          {card.workspace ? <StatusPill tone={workspaceTone(card.workspace)} label={healthLabel(card.workspace.health)} /> : <StatusPill tone="muted" label="Not probed" />}
          <Tooltip content="Remove project">
            <button className="icon-button repository-remove-button" type="button" aria-label={`Remove ${card.projectPath || 'project'}`} disabled={disabled} onClick={onRemove}>
              <Trash2 size={14} />
            </button>
          </Tooltip>
        </span>
      </header>
      <div className="repository-card-fields">
        <label>
          <span>Provider</span>
          <SelectControl label="Project provider" value={card.provider} disabled={disabled} options={sourceProviderOptions} onChange={(value) => onProviderChange(value as SourceProviderId)} />
        </label>
        <label>
          <span>{card.provider === 'gitlab' ? 'GitLab project' : 'GitHub repository'}</span>
          <TextControl value={card.projectPath} placeholder={projectPlaceholder} disabled={disabled} onChange={onProjectPathChange} />
        </label>
        <label>
          <span>DotCraft workspace</span>
          <WorkspacePathControl value={card.workspacePath} placeholder="Absolute workspace path" disabled={disabled} canBrowse={canBrowseWorkspace} onChange={onWorkspacePathChange} onBrowse={onBrowseWorkspace} />
        </label>
      </div>
      {card.provider === 'gitlab' && gitLabProfile ? (
        <div className="gitlab-project-profile-fields" aria-label={`GitLab profile for ${card.projectPath}`}>
          <label>
            <span>Token kind</span>
            <TextControl value={gitLabProfile.tokenKind} placeholder="accessToken" disabled={disabled} onChange={onGitLabProfileTokenKindChange} />
          </label>
          <ProjectSecretField label="GitLab token" field={gitLabProfile.secrets.token} disabled={disabled} onChange={(next) => onGitLabProfileSecretChange('token', next)} />
          <ProjectSecretField label="Webhook secret" field={gitLabProfile.secrets.webhookSecret} disabled={disabled} onChange={(next) => onGitLabProfileSecretChange('webhookSecret', next)} />
          <ProjectSecretField label="Signing token" field={gitLabProfile.secrets.webhookSigningToken} disabled={disabled} onChange={(next) => onGitLabProfileSecretChange('webhookSigningToken', next)} />
        </div>
      ) : null}
    </div>
  )
}

function GitHubInstallationProfileList({
  rows,
  disabled,
  onChange,
  onDetect,
}: {
  rows: GitHubInstallationProfileRow[]
  disabled: boolean
  onChange: (instance: string, owner: string, installationId: string) => void
  onDetect: () => void
}) {
  return (
    <div className="github-installation-profile-list" aria-label="GitHub installation profiles">
      <header className="github-installation-profile-list-header">
        <span>
          <strong>GitHub installation profiles</strong>
          <small>Profiles are shared by repositories under the same GitHub owner.</small>
        </span>
        <Tooltip content="Detect missing installations">
          <button className="icon-button repository-remove-button" type="button" aria-label="Detect GitHub installations" disabled={disabled} onClick={onDetect}>
            <RefreshCw size={14} />
          </button>
        </Tooltip>
      </header>
      <div className="github-installation-profile-rows">
        {rows.map((row) => {
          const status = gitHubProfileStatus(row)
          return (
            <div className="github-installation-profile-row" key={profileKey(row.instance, row.owner)}>
              <span className="github-installation-profile-copy">
                <strong>{row.owner}</strong>
                <small>{row.instance} · {row.repositories.length} {row.repositories.length === 1 ? 'repository' : 'repositories'}</small>
                {row.warning ? <small className="github-installation-profile-warning">{row.warning.message}</small> : null}
              </span>
              <TextControl
                value={row.installationId}
                placeholder="Installation ID"
                disabled={disabled}
                onChange={(value) => onChange(row.instance, row.owner, value)}
              />
              <StatusPill tone={status.tone} label={status.label} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ProjectSecretField({
  label,
  field,
  disabled,
  onChange,
}: {
  label: string
  field: SecretConfigurationField
  disabled: boolean
  onChange: (next: Partial<SecretConfigurationField>) => void
}) {
  const mode = field.mode ?? 'unchanged'
  const [revealed, setRevealed] = useState(false)
  const incomingDraftValue = mode === 'replace' ? field.value ?? '' : ''
  const [draftValue, setDraftValue] = useState(incomingDraftValue)
  const [focused, setFocused] = useState(false)
  const lastCommittedRef = useRef(incomingDraftValue)

  useEffect(() => {
    lastCommittedRef.current = incomingDraftValue
    if (!focused) {
      setDraftValue(incomingDraftValue)
    }
  }, [focused, incomingDraftValue])

  const commitDraft = () => {
    if (draftValue === lastCommittedRef.current) {
      return
    }
    lastCommittedRef.current = draftValue
    onChange(draftValue.length > 0 ? { mode: 'replace', value: draftValue } : { mode: 'unchanged', value: null })
  }

  return (
    <label className="gitlab-project-secret-field">
      <span>{label}</span>
      <span className="secret-input-shell">
        <input
          aria-label={`${label} value`}
          className="settings-input secret-value"
          type={revealed ? 'text' : 'password'}
          value={draftValue}
          disabled={disabled}
          placeholder={field.configured ? 'Configured' : 'Empty'}
          onFocus={() => setFocused(true)}
          onChange={(event) => setDraftValue(event.target.value)}
          onBlur={() => {
            setFocused(false)
            commitDraft()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commitDraft()
              event.currentTarget.blur()
            }
          }}
        />
        <Tooltip content={`${revealed ? 'Hide' : 'Show'} ${label}`}>
          <button
            className="icon-button secret-visibility-button"
            type="button"
            aria-label={`${revealed ? 'Hide' : 'Show'} ${label}`}
            disabled={disabled}
            onClick={() => setRevealed((current) => !current)}
          >
            {revealed ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </Tooltip>
      </span>
    </label>
  )
}

function WorkspacePathControl({
  value,
  placeholder,
  disabled,
  canBrowse,
  commitOnBlur = true,
  onChange,
  onBrowse,
}: {
  value: string
  placeholder: string
  disabled: boolean
  canBrowse: boolean
  commitOnBlur?: boolean
  onChange: (value: string) => void
  onBrowse: () => void
}) {
  const browseDisabled = disabled || !canBrowse
  return (
    <span className="workspace-path-control">
      <TextControl value={value} placeholder={placeholder} disabled={disabled} onChange={onChange} commitOnBlur={commitOnBlur} />
      <Tooltip content={canBrowse ? 'Choose workspace folder' : 'Folder picker is available in the desktop app'}>
        <button
          className="icon-button workspace-browse-button"
          type="button"
          aria-label="Choose workspace folder"
          disabled={browseDisabled}
          onClick={onBrowse}
        >
          <FolderOpen size={15} />
        </button>
      </Tooltip>
    </span>
  )
}

function SecretSettingsRow({
  icon,
  label,
  field,
  disabled,
  multiline = false,
  onChange,
}: {
  icon: LucideIcon
  label: string
  field: SecretConfigurationField
  disabled: boolean
  multiline?: boolean
  onChange: (next: Partial<SecretConfigurationField>) => void
}) {
  const mode = field.mode ?? 'unchanged'
  const [revealed, setRevealed] = useState(false)
  const incomingDraftValue = mode === 'replace' ? field.value ?? '' : ''
  const [draftValue, setDraftValue] = useState(incomingDraftValue)
  const [focused, setFocused] = useState(false)
  const lastCommittedRef = useRef(incomingDraftValue)

  useEffect(() => {
    lastCommittedRef.current = incomingDraftValue
    if (!focused) {
      setDraftValue(incomingDraftValue)
    }
  }, [focused, incomingDraftValue])

  const hasDraftValue = draftValue.length > 0
  const description = hasDraftValue
    ? 'New value will be encrypted automatically.'
    : field.configured
      ? 'Configured. Enter a new value to replace it.'
      : 'Empty. Enter a value to configure it.'
  const inputId = `settings-secret-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const toggleLabel = `${revealed ? 'Hide' : 'Show'} ${label}`
  const commitDraft = () => {
    if (draftValue === lastCommittedRef.current) {
      return
    }
    lastCommittedRef.current = draftValue
    onChange(draftValue.length > 0 ? { mode: 'replace', value: draftValue } : { mode: 'unchanged', value: null })
  }

  return (
    <SettingsRow
      icon={icon}
      label={label}
      description={description}
      control={
        <span className="secret-control">
          <span className={`secret-input-shell${multiline ? ' multiline' : ''}`}>
            {multiline ? (
              <textarea
                id={inputId}
                aria-label={`${label} value`}
                className={`settings-textarea secret-value${revealed ? '' : ' masked'}`}
                value={draftValue}
                disabled={disabled}
                rows={3}
                placeholder={field.configured ? 'Configured' : 'Empty'}
                spellCheck={false}
                onFocus={() => setFocused(true)}
                onChange={(event) => setDraftValue(event.target.value)}
                onBlur={() => {
                  setFocused(false)
                  commitDraft()
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault()
                    commitDraft()
                    event.currentTarget.blur()
                  }
                }}
              />
            ) : (
              <input
                id={inputId}
                aria-label={`${label} value`}
                className="settings-input secret-value"
                type={revealed ? 'text' : 'password'}
                value={draftValue}
                disabled={disabled}
                placeholder={field.configured ? 'Configured' : 'Empty'}
                onFocus={() => setFocused(true)}
                onChange={(event) => setDraftValue(event.target.value)}
                onBlur={() => {
                  setFocused(false)
                  commitDraft()
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    commitDraft()
                    event.currentTarget.blur()
                  }
                }}
              />
            )}
            <Tooltip content={toggleLabel}>
              <button
                className="icon-button secret-visibility-button"
                type="button"
                aria-label={toggleLabel}
                disabled={disabled}
                onClick={() => setRevealed((current) => !current)}
              >
                {revealed ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </Tooltip>
          </span>
        </span>
      }
    />
  )
}

function RepositoryAllowlistCard({
  title,
  description,
  repositories,
  disabled,
  manageDisabled,
  emptyLabel,
  onManage,
  onRemove,
}: {
  title: string
  description: string
  repositories: string[]
  disabled: boolean
  manageDisabled: boolean
  emptyLabel: string
  onManage: () => void
  onRemove: (repository: string) => void
}) {
  const normalized = normalizeRepositoryList(repositories)

  return (
    <section className="repository-allowlist-card">
      <header className="repository-allowlist-card-header">
        <span>
          <strong>{title}</strong>
          <small>{normalized.length} included {normalized.length === 1 ? 'repository' : 'repositories'}</small>
          <small>{description}</small>
        </span>
        <button className="secondary-button inline compact-row-action settings-action-button" type="button" disabled={manageDisabled} onClick={onManage}>
          Manage
        </button>
      </header>
      <div className="repository-allowlist-card-body">
        {normalized.length ? (
          normalized.map((repository) => (
            <div className="repository-allowlist-row" key={repository}>
              <strong>{repository}</strong>
              <Tooltip content={`Remove ${repository}`}>
                <button className="icon-button repository-allowlist-remove" type="button" aria-label={`Remove ${repository}`} disabled={disabled} onClick={() => onRemove(repository)}>
                  <Trash2 size={14} />
                </button>
              </Tooltip>
            </div>
          ))
        ) : (
          <p>{emptyLabel}</p>
        )}
      </div>
    </section>
  )
}

function RepositoryAllowlistModal({
  kind,
  repositories,
  selectedRepositories,
  targetTerm,
  publishRouteTerm,
  onCancel,
  onSave,
}: {
  kind: RepositoryAllowlistKind
  repositories: string[]
  selectedRepositories: string[]
  targetTerm: string
  publishRouteTerm: string
  onCancel: () => void
  onSave: (repositories: string[]) => void
}) {
  const normalizedRepositories = useMemo(() => normalizeRepositoryList(repositories), [repositories])
  const [query, setQuery] = useState('')
  const [draftSelection, setDraftSelection] = useState(() => filterRepositories(selectedRepositories, normalizedRepositories))
  const searchRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setDraftSelection(filterRepositories(selectedRepositories, normalizedRepositories))
    setQuery('')
  }, [kind, selectedRepositories, normalizedRepositories])

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  const title = kind === 'autoReview' ? 'Select source projects' : 'Select publish projects'
  const description = kind === 'autoReview'
    ? `Select source projects to enable automatic ${targetTerm} reviews.`
    : `Select source projects whose Review Drafts may be published through ${publishRouteTerm}.`
  const filteredRepositories = normalizedRepositories.filter((repository) => repositoryMatchesQuery(repository, query))

  const toggleRepository = (repository: string) => {
    setDraftSelection((current) => current.some((candidate) => sameRepository(candidate, repository)) ? removeRepository(current, repository) : [...current, repository])
  }

  return (
    <div className="modal-backdrop settings-modal-backdrop" role="presentation">
      <form
        className="settings-repository-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onSubmit={(event) => {
          event.preventDefault()
          onSave(filterRepositories(draftSelection, normalizedRepositories))
        }}
      >
        <header className="settings-repository-modal-header">
          <span>
            <h2>{title}</h2>
            <p>{description}</p>
          </span>
          <Tooltip content="Close">
            <button className="icon-button" type="button" aria-label="Close" onClick={onCancel}>
              <X size={16} />
            </button>
          </Tooltip>
        </header>
        <label className="settings-repository-search">
          <Search size={15} />
          <input
            ref={searchRef}
            value={query}
            placeholder="Search source projects..."
            aria-label="Search source projects"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="settings-repository-picker-list">
          {filteredRepositories.length ? (
            filteredRepositories.map((repository) => {
              const { owner, name } = repositoryParts(repository)
              const selected = draftSelection.some((candidate) => sameRepository(candidate, repository))
              return (
                <label className="settings-repository-picker-row" key={repository}>
                  <input type="checkbox" checked={selected} onChange={() => toggleRepository(repository)} />
                  <span>
                    <strong>{name}</strong>
                    {owner ? <small>{owner}</small> : null}
                  </span>
                </label>
              )
            })
          ) : (
            <p className="settings-repository-picker-empty">{normalizedRepositories.length ? 'No source projects match your search.' : 'No source projects configured.'}</p>
          )}
        </div>
        <footer className="settings-repository-modal-footer">
          <button className="secondary-button inline compact-row-action settings-action-button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary-button inline compact-row-action settings-action-button" type="submit">
            Apply selection ({draftSelection.length} selected)
          </button>
        </footer>
      </form>
    </div>
  )
}

function LabelListControl({
  labels,
  disabled,
  placeholder,
  emptyLabel,
  ariaLabel,
  onChange,
}: {
  labels: string[]
  disabled: boolean
  placeholder: string
  emptyLabel: string
  ariaLabel: string
  onChange: (labels: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const normalizedLabels = normalizeLabels(labels)
  const commitDraft = () => {
    const next = addLabel(normalizedLabels, draft)
    setDraft('')
    if (next !== normalizedLabels) {
      onChange(next)
    }
  }

  return (
    <span className="label-list-control" aria-label={ariaLabel}>
      <span className="label-list-chips">
        {normalizedLabels.length ? (
          normalizedLabels.map((label) => (
            <span className="settings-label-chip" key={label}>
              <span>{label}</span>
              <Tooltip content={`Remove ${label}`}>
                <button type="button" aria-label={`Remove ${label}`} disabled={disabled} onClick={() => onChange(removeLabel(normalizedLabels, label))}>
                  <X size={13} />
                </button>
              </Tooltip>
            </span>
          ))
        ) : (
          <span className="label-list-empty">{emptyLabel}</span>
        )}
      </span>
      <span className="label-list-input-row">
        <input
          className="settings-input label-list-input"
          aria-label={`${ariaLabel} input`}
          value={draft}
          disabled={disabled}
          placeholder={placeholder}
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commitDraft()
            }
          }}
        />
        <Tooltip content={placeholder}>
          <button className="icon-button label-list-add-button" type="button" aria-label={placeholder} disabled={disabled || !draft.trim()} onClick={commitDraft}>
            <Plus size={14} />
          </button>
        </Tooltip>
      </span>
    </span>
  )
}

function SegmentedControl({ value, options, onChange, disabled = false }: { value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void; disabled?: boolean }) {
  return (
    <span className="segmented-control">
      {options.map((option) => (
        <button key={option.value} className={value === option.value ? 'selected' : ''} disabled={disabled} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </span>
  )
}

function StatusPill({ tone, label }: { tone: 'ok' | 'warn' | 'muted'; label: string }) {
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'warn' ? Activity : XCircle
  return (
    <span className={`status-pill ${tone}`}>
      <Icon size={13} />
      {label}
    </span>
  )
}

function ValuePill({ children }: { children: ReactNode }) {
  return <span className="value-pill">{children}</span>
}

function SettingsAutosaveStatus({ saveState, onRetry }: { saveState: ConfigSaveState; onRetry: () => void }) {
  if (saveState === 'idle') {
    return null
  }

  if (saveState === 'failed') {
    return (
      <span className="settings-autosave-status failed" role="status">
        <XCircle size={13} />
        <span>Save failed</span>
        <button type="button" onClick={onRetry}>Retry</button>
      </span>
    )
  }

  return (
    <span className={`settings-autosave-status ${saveState}`} role="status">
      {saveState === 'saving' ? <RefreshCw size={13} className="spin-icon" /> : <CheckCircle2 size={13} />}
      <span>{saveState === 'saving' ? 'Saving...' : 'Saved'}</span>
    </span>
  )
}

function TextControl({
  value,
  disabled,
  onChange,
  placeholder = '',
  commitOnBlur = true,
}: {
  value: string
  disabled: boolean
  onChange: (value: string) => void
  placeholder?: string
  commitOnBlur?: boolean
}) {
  const [draftValue, setDraftValue] = useState(value)
  const [focused, setFocused] = useState(false)
  const lastCommittedRef = useRef(value)

  useEffect(() => {
    lastCommittedRef.current = value
    if (!focused) {
      setDraftValue(value)
    }
  }, [focused, value])

  const commitDraft = () => {
    if (!commitOnBlur || draftValue === lastCommittedRef.current) {
      return
    }
    lastCommittedRef.current = draftValue
    onChange(draftValue)
  }

  if (!commitOnBlur) {
    return <input className="settings-input" value={value} placeholder={placeholder} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
  }

  return (
    <input
      className="settings-input"
      value={draftValue}
      placeholder={placeholder}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onChange={(event) => setDraftValue(event.target.value)}
      onBlur={() => {
        setFocused(false)
        commitDraft()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          commitDraft()
          event.currentTarget.blur()
        }
      }}
    />
  )
}

function NumberControl({
  label,
  value,
  disabled,
  min,
  max,
  onChange,
}: {
  label?: string
  value: number
  disabled: boolean
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return <NumberStepperControl label={label ?? 'Number'} value={value} disabled={disabled} min={min} max={max} onChange={onChange} />
}

function NumberStepperControl({
  label,
  value,
  disabled,
  min,
  max,
  onChange,
  className,
}: {
  label: string
  value: number
  disabled: boolean
  min: number
  max: number
  onChange: (value: number) => void
  className?: string
}) {
  const decrementDisabled = disabled || value <= min
  const incrementDisabled = disabled || value >= max
  const [draftValue, setDraftValue] = useState(String(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) {
      setDraftValue(String(value))
    }
  }, [focused, value])

  const commitDraft = () => {
    const nextValue = clampNumber(draftValue, min, max)
    setDraftValue(String(nextValue))
    if (nextValue !== value) {
      onChange(nextValue)
    }
  }
  const changeBy = (delta: number) => {
    const nextValue = clampNumberValue(value + delta, min, max)
    setDraftValue(String(nextValue))
    onChange(nextValue)
  }

  return (
    <span className={`number-stepper-control${className ? ` ${className}` : ''}${disabled ? ' disabled' : ''}`}>
      <input
        className="settings-stepper-input"
        aria-label={label}
        aria-valuemax={max}
        aria-valuemin={min}
        aria-valuenow={value}
        inputMode="numeric"
        role="spinbutton"
        value={focused ? draftValue : String(value)}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onChange={(event) => setDraftValue(event.target.value)}
        onBlur={() => {
          setFocused(false)
          commitDraft()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commitDraft()
            event.currentTarget.blur()
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            changeBy(1)
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            changeBy(-1)
          }
        }}
      />
      <span className="number-stepper-buttons">
        <button
          className="number-stepper-button"
          type="button"
          tabIndex={-1}
          aria-label={`Increase ${label}`}
          disabled={incrementDisabled}
          onClick={() => changeBy(1)}
        >
          <ChevronUp size={12} />
        </button>
        <button
          className="number-stepper-button"
          type="button"
          tabIndex={-1}
          aria-label={`Decrease ${label}`}
          disabled={decrementDisabled}
          onClick={() => changeBy(-1)}
        >
          <ChevronDown size={12} />
        </button>
      </span>
    </span>
  )
}

function SelectControl({
  label,
  value,
  disabled,
  options,
  onChange,
  className,
}: {
  label: string
  value: string
  disabled: boolean
  options: DropdownSelectOption[]
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <DropdownSelect
      label={label}
      value={value}
      disabled={disabled}
      options={options}
      onChange={onChange}
      className={`settings-dropdown-select${className ? ` ${className}` : ''}`}
      triggerClassName="settings-dropdown-trigger"
      menuClassName="settings-dropdown-menu"
      optionClassName="settings-dropdown-option"
      showTooltip={false}
    />
  )
}

type DurationUnit = {
  value: string
  label: string
  multiplier: number
}

const secondsDurationUnits: DurationUnit[] = [
  { value: 'seconds', label: 'sec', multiplier: 1 },
  { value: 'minutes', label: 'min', multiplier: 60 },
  { value: 'hours', label: 'hr', multiplier: 3600 },
]

const hoursDurationUnits: DurationUnit[] = [
  { value: 'hours', label: 'hr', multiplier: 1 },
  { value: 'days', label: 'days', multiplier: 24 },
]

function DurationControl({
  label,
  value,
  disabled,
  min,
  max,
  units,
  onChange,
}: {
  label: string
  value: number
  disabled: boolean
  min: number
  max: number
  units: DurationUnit[]
  onChange: (value: number) => void
}) {
  const unit = pickDurationUnit(value, units)
  const amount = Math.max(0, Math.round(value / unit.multiplier))
  const minAmount = Math.max(0, Math.ceil(min / unit.multiplier))
  const maxAmount = Math.max(minAmount, Math.floor(max / unit.multiplier))
  const setAmount = (nextAmount: string, nextUnit = unit) => {
    onChange(clampNumberValue(clampNumber(nextAmount, Math.max(0, Math.ceil(min / nextUnit.multiplier)), Math.max(1, Math.floor(max / nextUnit.multiplier))) * nextUnit.multiplier, min, max))
  }

  return (
    <span className="duration-control">
      <NumberStepperControl
        label={`${label} amount`}
        className="duration-value"
        value={amount}
        disabled={disabled}
        min={minAmount}
        max={maxAmount}
        onChange={(nextAmount) => setAmount(String(nextAmount))}
      />
      <SelectControl
        label={`${label} unit`}
        className="duration-unit"
        value={unit.value}
        disabled={disabled}
        options={units}
        onChange={(event) => {
          const nextUnit = units.find((candidate) => candidate.value === event) ?? unit
          setAmount(String(Math.max(1, Math.round(value / nextUnit.multiplier))), nextUnit)
        }}
      />
    </span>
  )
}

function NumberTripleControl({
  values,
  disabled,
  onChange,
}: {
  values: [number, number, number]
  disabled: boolean
  onChange: (values: [number, number, number]) => void
}) {
  return (
    <span className="settings-number-cluster">
      {values.map((value, index) => (
        <NumberStepperControl
          key={index}
          className="compact"
          label={concurrencyControlLabels[index]}
          value={value}
          disabled={disabled}
          min={1}
          max={1800}
          onChange={(value) => {
            const next = [...values] as [number, number, number]
            next[index] = value
            onChange(next)
          }}
        />
      ))}
    </span>
  )
}

function RetryPolicyControl({
  attempts,
  initialBackoffSeconds,
  maxBackoffSeconds,
  disabled,
  onChange,
}: {
  attempts: number
  initialBackoffSeconds: number
  maxBackoffSeconds: number
  disabled: boolean
  onChange: (attempts: number, initialBackoffSeconds: number, maxBackoffSeconds: number) => void
}) {
  return (
    <span className="settings-field-cluster retry-policy-control">
      <label className="settings-labeled-control">
        <span>Attempts</span>
        <NumberStepperControl
          className="compact"
          label="Retry attempts"
          value={attempts}
          disabled={disabled}
          min={1}
          max={10}
          onChange={(value) => onChange(value, initialBackoffSeconds, maxBackoffSeconds)}
        />
      </label>
      <label className="settings-labeled-control">
        <span>Initial</span>
        <DurationControl label="Initial backoff" value={initialBackoffSeconds} disabled={disabled} min={1} max={300} units={secondsDurationUnits} onChange={(value) => onChange(attempts, value, maxBackoffSeconds)} />
      </label>
      <label className="settings-labeled-control">
        <span>Maximum</span>
        <DurationControl label="Maximum backoff" value={maxBackoffSeconds} disabled={disabled} min={1} max={1800} units={secondsDurationUnits} onChange={(value) => onChange(attempts, initialBackoffSeconds, value)} />
      </label>
    </span>
  )
}

function RetentionControl({
  succeededHours,
  failedHours,
  disabled,
  onChange,
}: {
  succeededHours: number
  failedHours: number
  disabled: boolean
  onChange: (succeededHours: number, failedHours: number) => void
}) {
  return (
    <span className="settings-field-cluster retention-control">
      <label className="settings-labeled-control">
        <span>Success</span>
        <DurationControl label="Successful worktree retention" value={succeededHours} disabled={disabled} min={0} max={24 * 30} units={hoursDurationUnits} onChange={(value) => onChange(value, failedHours)} />
      </label>
      <label className="settings-labeled-control">
        <span>Failed</span>
        <DurationControl label="Failed worktree retention" value={failedHours} disabled={disabled} min={1} max={24 * 60} units={hoursDurationUnits} onChange={(value) => onChange(succeededHours, value)} />
      </label>
    </span>
  )
}

function CleanupControl({
  enabled,
  interval,
  disabled,
  onChange,
}: {
  enabled: boolean
  interval: number
  disabled: boolean
  onChange: (enabled: boolean, interval: number) => void
}) {
  return (
    <span className="settings-field-cluster cleanup-control">
      <button className="toggle-button" aria-pressed={enabled} disabled={disabled} onClick={() => onChange(!enabled, interval)}>
        {enabled ? 'On' : 'Off'}
      </button>
      <DurationControl label="Cleanup interval" value={interval} disabled={disabled} min={5} max={3600} units={secondsDurationUnits} onChange={(value) => onChange(enabled, value)} />
    </span>
  )
}

function activeSectionCopy(section: SettingsSection) {
  if (section === 'sources') return 'Inspect source provider status, capabilities, sync progress, and recent failures.'
  if (section === 'projects') return 'Map each GitHub repository or GitLab project to the DotCraft workspace it should run against.'
  if (section === 'credentials') return 'Manage source identity and secret presence without exposing plaintext.'
  if (section === 'agents') return 'Configure DotCraft bridge health, AppServer discovery, and agent guardrails.'
  if (section === 'worktree') return 'Tune managed worktrees, scheduling, retries, cleanup, and implementation dispatch.'
  if (section === 'review') return 'Configure source project-level PR/MR review triggers and draft publication.'
  return 'Manage browser-local preferences for the Oratorio console.'
}

function authLabel(value?: string) {
  if (value === 'githubApp+staticToken') return 'GitHub App + token'
  if (value === 'githubApp') return 'GitHub App'
  if (value === 'staticToken') return 'Static token'
  if (value === 'projectProfiles') return 'Project profiles'
  if (value === 'accessToken' || value === 'token') return 'Token'
  if (value === 'partial') return 'Partial'
  return 'None'
}

function gitLabWebhookModeLabel(value?: string) {
  if (value === 'signingToken') return 'Signing token'
  if (value === 'secretToken') return 'Secret token'
  if (value === 'localDevelopmentDisabled') return 'Local bypass'
  return 'None'
}

function healthLabel(health: DotCraftHealth) {
  if (health === 'connected') return 'Connected'
  if (health === 'configured') return 'Configured'
  return 'Unavailable'
}

function workspaceTone(workspace: DotCraftWorkspace): 'ok' | 'warn' | 'muted' {
  if (workspace.connected) return 'ok'
  if (workspace.configured) return 'warn'
  return 'muted'
}

function gitHubProfileStatus(row: GitHubInstallationProfileRow): { tone: 'ok' | 'warn' | 'muted'; label: string } {
  if (row.warning) return { tone: 'warn', label: 'Error' }
  if (!row.installationId) return { tone: 'warn', label: 'Missing profile' }
  if (row.source === 'detected') return { tone: 'ok', label: 'Detected' }
  return { tone: 'ok', label: 'Manual' }
}

function formatEndpoint(endpoint: string) {
  if (!endpoint) return ''
  try {
    const url = new URL(endpoint)
    return `${url.protocol}//${url.host}${url.pathname === '/' ? '' : url.pathname}`
  } catch {
    return endpoint.split('?')[0]
  }
}

function formatSecondsDuration(seconds: number) {
  if (seconds % 3600 === 0) return `${seconds / 3600} hr`
  if (seconds % 60 === 0) return `${seconds / 60} min`
  return `${seconds} sec`
}

function relativeTime(value: string) {
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) {
    return value
  }

  const diffSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  if (diffSeconds < 60) return 'just now'
  const diffMinutes = Math.round(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes} min ago`
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} hr ago`
  return new Date(value).toLocaleDateString()
}

function normalizeServerConfiguration(configuration: ServerConfiguration): ServerConfiguration {
  const configuredProjects = projectCardsFromConfig(configuration).map((card) => card.canonicalKey)
  const autoReviewRepositories = filterRepositories(configuration.automation.autoReviewRepositories ?? [], configuredProjects)
  const autoReviewPublishRepositories = configuration.automation.autoReviewPublishEnabled
    ? filterRepositories(configuration.automation.autoReviewPublishRepositories ?? [], configuredProjects)
    : []
  return {
    ...configuration,
    gitHub: {
      ...configuration.gitHub,
      installationProfiles: normalizeGitHubInstallationProfiles(configuration.gitHub.installationProfiles ?? []),
      secrets: normalizeGitHubSecrets(configuration.gitHub.secrets),
    },
    gitLab: normalizeGitLabConfig(configuration.gitLab),
    automation: {
      ...configuration.automation,
      autoDispatchAllowLabels: normalizeLabels(configuration.automation.autoDispatchAllowLabels ?? []),
      autoDispatchBlockLabels: normalizeLabels(configuration.automation.autoDispatchBlockLabels ?? []),
      autoReviewRepositories,
      autoReviewPublishEnabled: autoReviewPublishRepositories.length > 0,
      autoReviewPublishRepositories,
    },
  }
}

function normalizeGitHubInstallationProfiles(profiles: GitHubInstallationProfile[]): GitHubInstallationProfile[] {
  const normalized: GitHubInstallationProfile[] = []
  for (const profile of profiles ?? []) {
    const instance = (profile.instance || 'github.com').trim().toLowerCase()
    const owner = (profile.owner || '').trim()
    const installationId = (profile.installationId || '').trim()
    const source = profile.source === 'detected' ? 'detected' : 'manual'
    if (!instance || !owner || !installationId || normalized.some((candidate) => sameProfile(candidate.instance, candidate.owner, instance, owner))) {
      continue
    }

    normalized.push({ instance, owner, installationId, source })
  }

  return normalized.sort((left, right) => profileKey(left.instance, left.owner).localeCompare(profileKey(right.instance, right.owner), undefined, { sensitivity: 'base' }))
}

function buildGitHubInstallationRows(configuration: ServerConfiguration | null, warnings: GitHubInstallationWarning[]): GitHubInstallationProfileRow[] {
  if (!configuration) return []

  const endpoint = configuration.gitHub.endpoint || 'https://api.github.com'
  const rows = new Map<string, GitHubInstallationProfileRow>()
  const warningByKey = new Map(warnings.map((warning) => [profileKey(warning.instance, warning.owner).toLowerCase(), warning]))
  for (const profile of normalizeGitHubInstallationProfiles(configuration.gitHub.installationProfiles ?? [])) {
    const key = profileKey(profile.instance, profile.owner).toLowerCase()
    rows.set(key, {
      ...profile,
      repositories: [],
      warning: warningByKey.get(key) ?? null,
    })
  }

  for (const repository of configuration.gitHub.repositories ?? []) {
    const projectPath = normalizeProjectPath(repository)
    const { owner } = repositoryParts(projectPath)
    if (!owner) continue
    const instance = sourceInstance('github', endpoint)
    const key = profileKey(instance, owner).toLowerCase()
    const row = rows.get(key) ?? {
      instance,
      owner,
      installationId: '',
      source: 'missing' as const,
      repositories: [],
      warning: warningByKey.get(key) ?? null,
    }
    if (!row.repositories.some((candidate) => sameRepository(candidate, projectPath))) {
      row.repositories.push(projectPath)
    }
    rows.set(key, row)
  }

  return Array.from(rows.values()).sort((left, right) => profileKey(left.instance, left.owner).localeCompare(profileKey(right.instance, right.owner), undefined, { sensitivity: 'base' }))
}

function upsertGitHubInstallationProfile(profiles: GitHubInstallationProfile[], instance: string, owner: string, installationId: string): GitHubInstallationProfile[] {
  const normalizedInstance = (instance || 'github.com').trim().toLowerCase()
  const normalizedOwner = owner.trim()
  const normalizedId = installationId.trim()
  const next = normalizeGitHubInstallationProfiles(profiles).filter((profile) => !sameProfile(profile.instance, profile.owner, normalizedInstance, normalizedOwner))
  if (normalizedId) {
    next.push({
      instance: normalizedInstance,
      owner: normalizedOwner,
      installationId: normalizedId,
      source: 'manual',
    })
  }

  return normalizeGitHubInstallationProfiles(next)
}

function filterGitHubInstallationProfiles(profiles: GitHubInstallationProfile[], repositories: string[], endpoint: string): GitHubInstallationProfile[] {
  const owners = new Set(repositories.map((repository) => {
    const { owner } = repositoryParts(repository)
    return owner ? profileKey(sourceInstance('github', endpoint), owner).toLowerCase() : ''
  }).filter(Boolean))
  return normalizeGitHubInstallationProfiles(profiles).filter((profile) => owners.has(profileKey(profile.instance, profile.owner).toLowerCase()))
}

function profileKey(instance: string, owner: string) {
  return `${(instance || 'github.com').trim().toLowerCase()}/${owner.trim()}`
}

function sameProfile(leftInstance: string, leftOwner: string, rightInstance: string, rightOwner: string) {
  return profileKey(leftInstance, leftOwner).toLowerCase() === profileKey(rightInstance, rightOwner).toLowerCase()
}

function normalizeGitLabConfig(gitLab?: Partial<ServerConfiguration['gitLab']> | null): ServerConfiguration['gitLab'] {
  const endpoint = normalizeGitLabEndpoint(gitLab?.endpoint)
  return {
    enabled: Boolean(gitLab?.enabled),
    writesEnabled: Boolean(gitLab?.writesEnabled),
    endpoint,
    apiBaseUrl: gitLabDefaultApiBaseUrl(endpoint),
    projects: normalizeRepositoryList(gitLab?.projects ?? []),
    projectProfiles: normalizeGitLabProjectProfiles(gitLab?.projectProfiles ?? [], endpoint, gitLab?.projects ?? []),
    allowLocalDevelopmentUnsafeWebhooks: Boolean(gitLab?.allowLocalDevelopmentUnsafeWebhooks),
  }
}

function applyGitLabConfigUpdate(configuration: ServerConfiguration, next: Partial<ServerConfiguration['gitLab']>): ServerConfiguration {
  const currentGitLab = normalizeGitLabConfig(configuration.gitLab)
  const requestedEndpoint = next.endpoint !== undefined ? normalizeGitLabEndpoint(next.endpoint) : currentGitLab.endpoint
  const endpointChanged = next.endpoint !== undefined && !sameUrlString(currentGitLab.endpoint, requestedEndpoint)
  const gitLab = {
    ...currentGitLab,
    ...next,
    endpoint: requestedEndpoint,
    apiBaseUrl: gitLabDefaultApiBaseUrl(requestedEndpoint),
    projectProfiles: next.projectProfiles !== undefined
      ? normalizeGitLabProjectProfiles(next.projectProfiles, requestedEndpoint, next.projects ?? currentGitLab.projects)
      : endpointChanged
        ? []
        : currentGitLab.projectProfiles,
  }

  if (!endpointChanged) {
    return { ...configuration, gitLab }
  }

  return configurationFromProjectCards(
    {
      ...configuration,
      gitLab,
      automation: migrateGitLabAutomationKeys(configuration.automation, currentGitLab.endpoint, requestedEndpoint, currentGitLab.projects),
    },
    projectCardsFromConfig(configuration),
  )
}

function normalizeGitLabEndpoint(value: string | null | undefined) {
  return (value?.trim() || 'https://gitlab.com').replace(/\/+$/, '')
}

function gitLabDefaultApiBaseUrl(endpoint: string) {
  return `${normalizeGitLabEndpoint(endpoint)}/api/v4`
}

function sameUrlString(left: string | null | undefined, right: string | null | undefined) {
  return (left ?? '').trim().replace(/\/+$/, '').toLowerCase() === (right ?? '').trim().replace(/\/+$/, '').toLowerCase()
}

function migrateGitLabAutomationKeys(
  automation: ServerConfiguration['automation'],
  previousEndpoint: string,
  nextEndpoint: string,
  projects: string[],
): ServerConfiguration['automation'] {
  const keyMap = new Map<string, string>()
  for (const project of projects) {
    const normalized = normalizeProjectPath(project)
    if (!normalized) continue
    keyMap.set(gitLabProjectKey(normalized, previousEndpoint).toLowerCase(), gitLabProjectKey(normalized, nextEndpoint))
  }
  const migrate = (values: string[]) => normalizeRepositoryList(values.map((value) => keyMap.get(value.trim().toLowerCase()) ?? value))
  return {
    ...automation,
    autoReviewRepositories: migrate(automation.autoReviewRepositories ?? []),
    autoReviewPublishRepositories: migrate(automation.autoReviewPublishRepositories ?? []),
  }
}

function normalizeGitHubSecrets(secrets?: GitHubSecretConfiguration | null): GitHubSecretConfiguration {
  return {
    token: normalizeSecretField(secrets?.token),
    privateKey: normalizeSecretField(secrets?.privateKey),
    privateKeyPath: normalizeSecretField(secrets?.privateKeyPath),
    webhookSecret: normalizeSecretField(secrets?.webhookSecret),
  }
}

function normalizeSecretField(field?: Partial<SecretConfigurationField> | null): SecretConfigurationField {
  const mode = field?.mode === 'replace' || field?.mode === 'clear' ? field.mode : 'unchanged'
  return {
    configured: Boolean(field?.configured),
    mode,
    value: mode === 'replace' ? field?.value ?? '' : null,
  }
}

function buildSourceProviderCards(
  providers: SourceProviderStatus[],
  githubStatus: GitHubSettingsStatus,
  gitLabConfig: ServerConfiguration['gitLab'],
  diagnosticsGitLab?: SettingsDiagnosticsResponse['gitLab'],
): SourceProviderCardModel[] {
  const byProvider = new Map<string, SourceProviderCardModel>()
  for (const provider of providers) {
    byProvider.set(provider.provider, provider)
  }

  if (!byProvider.has('github')) {
    byProvider.set('github', {
      provider: 'github',
      displayName: 'GitHub',
      endpoint: 'https://api.github.com',
      configured: githubStatus.configured,
      authenticationState: githubStatus.writeConfigured ? 'githubApp' : 'none',
      readCapability: {
        available: githubStatus.available && githubStatus.configured,
        state: githubStatus.configured ? 'available' : githubStatus.available ? 'unconfigured' : 'unavailable',
        reason: githubStatus.configured ? null : githubStatus.message,
      },
      writeCapability: {
        available: githubStatus.writesEnabled && githubStatus.writeConfigured,
        state: githubStatus.writesEnabled ? githubStatus.writeConfigured ? 'available' : 'credentialsMissing' : 'disabled',
        reason: githubStatus.writesEnabled ? null : 'GitHub writes are disabled.',
      },
      webhookCapability: {
        available: false,
        state: 'unconfigured',
        reason: 'Webhook status is available in diagnostics when configured.',
      },
      configuredProjectCount: githubStatus.repositories.length,
      lastSyncAt: githubStatus.lastSyncAt,
      projects: githubStatus.repositories.map((repository) => {
        const key = githubProjectKey(repository, 'https://api.github.com')
        return {
          provider: 'github',
          instance: sourceInstance('github', 'https://api.github.com'),
          projectPath: repository,
          key,
          displayName: repository,
        }
      }),
    })
  }

  if (!byProvider.has('gitlab')) {
    const projectTokenCount = gitLabConfig.projectProfiles.filter((profile) => normalizeGitLabSecrets(profile.secrets).token.configured).length
    const tokenConfigured = projectTokenCount > 0
    const allTokensConfigured = gitLabConfig.projects.length > 0 && projectTokenCount === gitLabConfig.projects.length
    const configured = gitLabConfig.enabled && gitLabConfig.projects.length > 0
    const writeConfigured = diagnosticsGitLab?.writeConfigured ?? tokenConfigured
    byProvider.set('gitlab', {
      provider: 'gitlab',
      displayName: 'GitLab',
      endpoint: gitLabConfig.endpoint,
      configured,
      authenticationState: tokenConfigured ? allTokensConfigured ? 'token' : 'partial' : 'none',
      readCapability: {
        available: configured && tokenConfigured,
        state: !gitLabConfig.enabled ? 'disabled' : gitLabConfig.projects.length ? allTokensConfigured ? 'available' : tokenConfigured ? 'partial' : 'credentialsMissing' : 'unconfigured',
        reason: !gitLabConfig.enabled ? 'GitLab read sync is disabled.' : gitLabConfig.projects.length ? allTokensConfigured ? null : 'GitLab read sync requires project profile tokens.' : 'No GitLab projects are configured.',
      },
      writeCapability: {
        available: configured && gitLabConfig.writesEnabled && writeConfigured,
        state: !gitLabConfig.enabled ? 'disabled' : !gitLabConfig.writesEnabled ? 'disabled' : allTokensConfigured ? 'available' : writeConfigured ? 'partial' : 'credentialsMissing',
        reason: !gitLabConfig.enabled ? 'GitLab provider is disabled.' : !gitLabConfig.writesEnabled ? 'GitLab writes are disabled.' : allTokensConfigured ? null : 'GitLab writes require project profile tokens.',
      },
      webhookCapability: {
        available: diagnosticsGitLab?.webhookVerificationMode !== undefined && diagnosticsGitLab.webhookVerificationMode !== 'none',
        state: diagnosticsGitLab?.webhookVerificationMode === 'none' ? 'unconfigured' : diagnosticsGitLab?.webhookVerificationMode ?? 'unconfigured',
        reason: diagnosticsGitLab?.webhookVerificationMode ? gitLabWebhookModeLabel(diagnosticsGitLab.webhookVerificationMode) : 'GitLab webhook verification is not configured.',
      },
      configuredProjectCount: gitLabConfig.projects.length,
      lastSyncAt: diagnosticsGitLab?.lastSyncAt ?? null,
      diagnostic: diagnosticsGitLab?.enabled === false ? 'GitLab read sync is disabled.' : null,
      projects: gitLabConfig.projects.map((projectPath) => {
        const key = gitLabProjectKey(projectPath, gitLabConfig.endpoint)
        const profile = gitLabProfileForProject(gitLabConfig, projectPath)
        const profileTokenConfigured = profile ? normalizeGitLabSecrets(profile.secrets).token.configured : false
        return {
          provider: 'gitlab',
          instance: sourceInstance('gitlab', gitLabConfig.endpoint),
          projectPath,
          key,
          displayName: projectPath,
          readCapability: profileTokenConfigured
            ? { available: true, state: 'available', reason: null }
            : { available: false, state: 'credentialsMissing', reason: 'GitLab project profile token is missing.' },
          writeCapability: !gitLabConfig.writesEnabled
            ? { available: false, state: 'disabled', reason: 'GitLab writes are disabled.' }
            : profileTokenConfigured
              ? { available: true, state: 'available', reason: null }
              : { available: false, state: 'credentialsMissing', reason: 'GitLab project profile token is missing.' },
          webhookCapability: gitLabProfileWebhookConfigured(profile)
            ? { available: true, state: 'available', reason: null }
            : { available: false, state: 'unconfigured', reason: 'GitLab project webhook verification is not configured.' },
        }
      }),
      writeConfigured,
      recentSyncFailures: diagnosticsGitLab?.recentSyncFailures ?? [],
      recentSourceWriteFailures: diagnosticsGitLab?.recentSourceWriteFailures ?? [],
    })
  }

  return Array.from(byProvider.values()).sort((left, right) => providerSort(left.provider) - providerSort(right.provider))
}

function providerSort(provider: string) {
  if (provider === 'github') return 0
  if (provider === 'gitlab') return 1
  return 2
}

function buildProjectCards(configuration: ServerConfiguration | null, inventory: DotCraftWorkspacesResponse | null): ProjectRouteCardDraft[] {
  if (!configuration) {
    return []
  }

  return projectCardsFromConfig(configuration).map((card) => ({
    ...card,
    workspace: findWorkspaceForCard(card, inventory),
  }))
}

function projectCardsFromConfig(configuration: ServerConfiguration): Array<Omit<ProjectRouteCardDraft, 'workspace'>> {
  const workspaces = configuration.dotCraft.repositoryWorkspaces ?? {}
  const seen = new Set<string>()
  const cards: Array<Omit<ProjectRouteCardDraft, 'workspace'>> = []
  const gitHubEndpoint = configuration.gitHub.endpoint || 'https://api.github.com'
  const gitLabEndpoint = normalizeGitLabConfig(configuration.gitLab).endpoint

  for (const repository of configuration.gitHub.repositories ?? []) {
    const projectPath = normalizeProjectPath(repository)
    if (!projectPath) continue
    const canonicalKey = githubProjectKey(projectPath, gitHubEndpoint)
    addProjectCard(cards, seen, {
      provider: 'github',
      instance: sourceInstance('github', gitHubEndpoint),
      projectPath,
      canonicalKey,
      workspacePath: workspaces[projectPath] ?? workspaces[canonicalKey] ?? '',
    })
  }

  for (const project of normalizeGitLabConfig(configuration.gitLab).projects) {
    const projectPath = normalizeProjectPath(project)
    if (!projectPath) continue
    const canonicalKey = gitLabProjectKey(projectPath, gitLabEndpoint)
    addProjectCard(cards, seen, {
      provider: 'gitlab',
      instance: sourceInstance('gitlab', gitLabEndpoint),
      projectPath,
      canonicalKey,
      workspacePath: workspaces[canonicalKey] ?? '',
    })
  }

  for (const [key, workspacePath] of Object.entries(workspaces)) {
    const parsed = parseSourceProjectKey(key, gitHubEndpoint, gitLabEndpoint)
    if (!parsed) continue
    addProjectCard(cards, seen, { ...parsed, workspacePath })
  }

  return cards
}

function addProjectCard(
  cards: Array<Omit<ProjectRouteCardDraft, 'workspace'>>,
  seen: Set<string>,
  card: Omit<ProjectRouteCardDraft, 'workspace'>,
) {
  const canonicalKey = card.canonicalKey.trim()
  if (!canonicalKey || seen.has(canonicalKey.toLowerCase())) return
  seen.add(canonicalKey.toLowerCase())
  cards.push(card)
}

function applyProjectCardUpdate(configuration: ServerConfiguration, index: number, next: Partial<ProjectRouteCardDraft>): ServerConfiguration {
  const cards = projectCardsFromConfig(configuration)
  if (!cards[index]) return configuration
  const provider = next.provider ?? cards[index].provider
  const projectPath = normalizeProjectPath(next.projectPath ?? cards[index].projectPath)
  const endpoint = provider === 'gitlab' ? normalizeGitLabConfig(configuration.gitLab).endpoint : configuration.gitHub.endpoint
  cards[index] = {
    provider,
    instance: sourceInstance(provider, endpoint),
    projectPath,
    canonicalKey: provider === 'gitlab' ? gitLabProjectKey(projectPath, endpoint) : githubProjectKey(projectPath, endpoint),
    workspacePath: next.workspacePath ?? cards[index].workspacePath,
  }
  return configurationFromProjectCards(configuration, cards)
}

function applyProjectCardRemoval(configuration: ServerConfiguration, index: number): ServerConfiguration {
  const cards = projectCardsFromConfig(configuration)
  cards.splice(index, 1)
  return configurationFromProjectCards(configuration, cards)
}

function applyProjectCardAdd(configuration: ServerConfiguration, provider: SourceProviderId, projectPath: string, workspacePath: string): ServerConfiguration {
  const normalized = normalizeProjectPath(projectPath)
  if (!normalized) return configuration
  const endpoint = provider === 'gitlab' ? normalizeGitLabConfig(configuration.gitLab).endpoint : configuration.gitHub.endpoint
  const canonicalKey = provider === 'gitlab' ? gitLabProjectKey(normalized, endpoint) : githubProjectKey(normalized, endpoint)
  const cards = projectCardsFromConfig(configuration).filter((card) => !sameRepository(card.canonicalKey, canonicalKey))
  cards.push({
    provider,
    instance: sourceInstance(provider, endpoint),
    projectPath: normalized,
    canonicalKey,
    workspacePath: workspacePath.trim(),
  })
  return configurationFromProjectCards(configuration, cards)
}

function configurationFromProjectCards(configuration: ServerConfiguration, cards: Array<Omit<ProjectRouteCardDraft, 'workspace'>>): ServerConfiguration {
  const seen = new Set<string>()
  const repositories: string[] = []
  const gitLabProjects: string[] = []
  const repositoryWorkspaces: Record<string, string> = {}
  const gitHubEndpoint = configuration.gitHub.endpoint || 'https://api.github.com'
  const gitLabEndpoint = normalizeGitLabConfig(configuration.gitLab).endpoint

  for (const card of cards) {
    const provider = card.provider === 'gitlab' ? 'gitlab' : 'github'
    const projectPath = normalizeProjectPath(card.projectPath)
    if (!projectPath) continue
    const endpoint = provider === 'gitlab' ? gitLabEndpoint : gitHubEndpoint
    const canonicalKey = provider === 'gitlab' ? gitLabProjectKey(projectPath, endpoint) : githubProjectKey(projectPath, endpoint)
    if (seen.has(canonicalKey.toLowerCase())) continue
    seen.add(canonicalKey.toLowerCase())
    if (provider === 'gitlab') {
      gitLabProjects.push(projectPath)
    } else {
      repositories.push(projectPath)
    }
    const workspacePath = card.workspacePath.trim()
    if (workspacePath) {
      repositoryWorkspaces[provider === 'gitlab' ? canonicalKey : projectPath] = workspacePath
    }
  }
  const configuredProjects = [
    ...repositories.map((repository) => githubProjectKey(repository, gitHubEndpoint)),
    ...gitLabProjects.map((project) => gitLabProjectKey(project, gitLabEndpoint)),
  ]
  const autoReviewPublishRepositories = filterRepositories(configuration.automation.autoReviewPublishRepositories ?? [], configuredProjects)
  const gitLab = normalizeGitLabConfig(configuration.gitLab)
  const installationProfiles = filterGitHubInstallationProfiles(configuration.gitHub.installationProfiles ?? [], repositories, gitHubEndpoint)
  const gitLabProjectProfiles = filterGitLabProjectProfiles(gitLab.projectProfiles, gitLabProjects, gitLabEndpoint)

  return {
    ...configuration,
    gitHub: { ...configuration.gitHub, repositories, installationProfiles },
    gitLab: { ...gitLab, projects: gitLabProjects, projectProfiles: gitLabProjectProfiles },
    dotCraft: { ...configuration.dotCraft, repositoryWorkspaces },
    automation: {
      ...configuration.automation,
      autoReviewRepositories: filterRepositories(configuration.automation.autoReviewRepositories ?? [], configuredProjects),
      autoReviewPublishEnabled: autoReviewPublishRepositories.length > 0,
      autoReviewPublishRepositories,
    },
  }
}

function normalizeGitLabSecrets(secrets?: GitLabSecretConfiguration | null): GitLabSecretConfiguration {
  return {
    token: normalizeSecretField(secrets?.token),
    webhookSecret: normalizeSecretField(secrets?.webhookSecret),
    webhookSigningToken: normalizeSecretField(secrets?.webhookSigningToken),
  }
}

function normalizeGitLabProjectProfiles(profiles: GitLabProjectProfile[], endpoint: string, projects: string[]): GitLabProjectProfile[] {
  const instance = sourceInstance('gitlab', endpoint)
  const allowed = new Set(normalizeRepositoryList(projects).map((project) => project.toLowerCase()))
  if (allowed.size === 0) return []
  const normalized: GitLabProjectProfile[] = []
  for (const profile of profiles ?? []) {
    const projectPath = normalizeProjectPath(profile.projectPath)
    if (!projectPath || !allowed.has(projectPath.toLowerCase())) continue
    const profileInstance = (profile.instance || instance).trim().toLowerCase()
    if (profileInstance !== instance.toLowerCase()) continue
    if (normalized.some((candidate) => sameGitLabProfile(candidate.instance, candidate.projectPath, profileInstance, projectPath))) continue
    normalized.push({
      instance: profileInstance,
      projectPath,
      tokenKind: (profile.tokenKind || 'accessToken').trim() || 'accessToken',
      secrets: normalizeGitLabSecrets(profile.secrets),
    })
  }

  return normalized.sort((left, right) => gitLabProfileKey(left.instance, left.projectPath).localeCompare(gitLabProfileKey(right.instance, right.projectPath), undefined, { sensitivity: 'base' }))
}

function gitLabProfileForCard(configuration: ServerConfiguration['gitLab'], card: ProjectRouteCardDraft): GitLabProjectProfileRow {
  return gitLabProfileForProject(configuration, card.projectPath) ?? {
    instance: card.instance || sourceInstance('gitlab', configuration.endpoint),
    projectPath: normalizeProjectPath(card.projectPath),
    tokenKind: 'accessToken',
    secrets: normalizeGitLabSecrets(null),
  }
}

function gitLabProfileForProject(configuration: ServerConfiguration['gitLab'], projectPath: string): GitLabProjectProfileRow | null {
  const normalized = normalizeProjectPath(projectPath)
  const instance = sourceInstance('gitlab', configuration.endpoint)
  const profile = normalizeGitLabProjectProfiles(configuration.projectProfiles ?? [], configuration.endpoint, configuration.projects)
    .find((candidate) => sameGitLabProfile(candidate.instance, candidate.projectPath, instance, normalized))
  if (!profile) return null
  return {
    instance: profile.instance,
    projectPath: profile.projectPath,
    tokenKind: profile.tokenKind || 'accessToken',
    secrets: normalizeGitLabSecrets(profile.secrets),
  }
}

function upsertGitLabProjectProfile(configuration: ServerConfiguration, card: ProjectRouteCardDraft, next: Partial<GitLabProjectProfile>): ServerConfiguration {
  const gitLab = normalizeGitLabConfig(configuration.gitLab)
  const projectPath = normalizeProjectPath(card.projectPath)
  if (!projectPath) return configuration
  const instance = card.instance || sourceInstance('gitlab', gitLab.endpoint)
  const profiles = normalizeGitLabProjectProfiles(gitLab.projectProfiles, gitLab.endpoint, gitLab.projects)
    .filter((profile) => !sameGitLabProfile(profile.instance, profile.projectPath, instance, projectPath))
  const current = gitLabProfileForProject(gitLab, projectPath) ?? {
    instance,
    projectPath,
    tokenKind: 'accessToken',
    secrets: normalizeGitLabSecrets(null),
  }
  profiles.push({
    ...current,
    ...next,
    instance,
    projectPath,
    tokenKind: (next.tokenKind ?? current.tokenKind ?? 'accessToken').trim() || 'accessToken',
    secrets: normalizeGitLabSecrets(next.secrets ?? current.secrets),
  })
  return {
    ...configuration,
    gitLab: {
      ...gitLab,
      projectProfiles: normalizeGitLabProjectProfiles(profiles, gitLab.endpoint, gitLab.projects),
    },
  }
}

function upsertGitLabProjectProfileSecret(
  configuration: ServerConfiguration,
  card: ProjectRouteCardDraft,
  key: keyof GitLabSecretConfiguration,
  next: Partial<SecretConfigurationField>,
): ServerConfiguration {
  const gitLab = normalizeGitLabConfig(configuration.gitLab)
  const current = gitLabProfileForProject(gitLab, card.projectPath)
  const secrets = normalizeGitLabSecrets(current?.secrets)
  return upsertGitLabProjectProfile(configuration, card, {
    secrets: {
      ...secrets,
      [key]: normalizeSecretField({ ...secrets[key], ...next }),
    },
  })
}

function filterGitLabProjectProfiles(profiles: GitLabProjectProfile[], projects: string[], endpoint: string): GitLabProjectProfile[] {
  return normalizeGitLabProjectProfiles(profiles, endpoint, projects)
}

function gitLabProjectProfileStatus(profile: GitLabProjectProfileRow): { hasToken: boolean; hasWebhook: boolean } {
  const secrets = normalizeGitLabSecrets(profile.secrets)
  return {
    hasToken: secrets.token.configured,
    hasWebhook: secrets.webhookSigningToken.configured || secrets.webhookSecret.configured,
  }
}

function gitLabProfileWebhookConfigured(profile: GitLabProjectProfileRow | null): boolean {
  return profile ? gitLabProjectProfileStatus(profile).hasWebhook : false
}

function gitLabProfileStatus(profile: GitLabProjectProfileRow, sourceProject: SourceProviderStatus['projects'][number] | null): { tone: 'ok' | 'warn' | 'muted'; label: string } {
  const status = gitLabProjectProfileStatus(profile)
  if (!status.hasToken) return { tone: 'warn', label: 'Missing token' }
  if (sourceProject?.readCapability?.state === 'partial' || sourceProject?.readCapability?.available === false) return { tone: 'warn', label: 'Profile issue' }
  return { tone: status.hasWebhook ? 'ok' : 'warn', label: status.hasWebhook ? 'Profile ready' : 'No webhook' }
}

function gitLabProfileKey(instance: string, projectPath: string) {
  return `${(instance || 'gitlab.com').trim().toLowerCase()}/${normalizeProjectPath(projectPath)}`
}

function sameGitLabProfile(leftInstance: string, leftProject: string, rightInstance: string, rightProject: string) {
  return gitLabProfileKey(leftInstance, leftProject).toLowerCase() === gitLabProfileKey(rightInstance, rightProject).toLowerCase()
}

function parseSourceProjectKey(value: string, gitHubEndpoint: string, _gitLabEndpoint: string): Omit<ProjectRouteCardDraft, 'workspace' | 'workspacePath'> | null {
  const trimmed = value.trim().replace(/\\/g, '/')
  const match = /^(github|gitlab):([^/]+)\/(.+)$/i.exec(trimmed)
  if (match) {
    const provider = match[1].toLowerCase() as SourceProviderId
    const instance = match[2]
    const projectPath = normalizeProjectPath(match[3])
    if (!projectPath) return null
    return {
      provider,
      instance,
      projectPath,
      canonicalKey: `${provider}:${instance}/${projectPath}`,
    }
  }

  const projectPath = normalizeProjectPath(trimmed)
  if (!projectPath) return null
  return {
    provider: 'github',
    instance: sourceInstance('github', gitHubEndpoint),
    projectPath,
    canonicalKey: githubProjectKey(projectPath, gitHubEndpoint),
  }
}

function normalizeProjectPath(value: string | null | undefined) {
  return (value ?? '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
}

function githubProjectKey(projectPath: string, endpoint: string) {
  return `github:${sourceInstance('github', endpoint)}/${normalizeProjectPath(projectPath)}`
}

function gitLabProjectKey(projectPath: string, endpoint: string) {
  return `gitlab:${sourceInstance('gitlab', endpoint)}/${normalizeProjectPath(projectPath)}`
}

function sourceInstance(provider: SourceProviderId, endpoint: string) {
  const fallback = provider === 'github' ? 'github.com' : 'gitlab.com'
  if (!endpoint) return fallback
  try {
    const host = new URL(endpoint).host
    if (provider === 'github' && host === 'api.github.com') return 'github.com'
    return host || fallback
  } catch {
    return endpoint.replace(/^https?:\/\//i, '').split('/')[0].split('?')[0] || fallback
  }
}

function providerLabel(provider: string) {
  if (provider === 'github') return 'GitHub'
  if (provider === 'gitlab') return 'GitLab'
  return provider
}

function filterRepositories(values: string[], repositories: string[]) {
  const allowed = new Set(repositories.map((repository) => repository.trim().toLowerCase()).filter(Boolean))
  return normalizeRepositoryList(values).filter((value) => allowed.has(value.trim().toLowerCase()))
}

function effectiveAutoReviewPublishRepositories(automation?: ServerConfiguration['automation']) {
  if (!automation?.autoReviewPublishEnabled) {
    return []
  }

  return automation.autoReviewPublishRepositories ?? []
}

function normalizeRepositoryList(repositories: string[]) {
  const normalized: string[] = []
  for (const repository of repositories) {
    const trimmed = repository.trim()
    if (!trimmed || normalized.some((candidate) => sameRepository(candidate, trimmed))) {
      continue
    }

    normalized.push(trimmed)
  }

  return normalized
}

function sameRepository(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

function removeRepository(repositories: string[], repository: string) {
  return repositories.filter((candidate) => !sameRepository(candidate, repository))
}

function repositoryParts(repository: string) {
  const withoutProvider = repository.replace(/^(github|gitlab):/i, '')
  const [owner, ...nameParts] = withoutProvider.split('/')
  const name = nameParts.join('/') || owner
  return { owner: nameParts.length ? owner : '', name }
}

function repositoryMatchesQuery(repository: string, query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const { owner, name } = repositoryParts(repository)
  return repository.toLowerCase().includes(needle) ||
    owner.toLowerCase().includes(needle) ||
    name.toLowerCase().includes(needle)
}

function normalizeLabels(labels: string[]) {
  const normalized: string[] = []
  for (const label of labels) {
    const trimmed = label.trim()
    if (!trimmed || normalized.some((candidate) => candidate.toLowerCase() === trimmed.toLowerCase())) {
      continue
    }

    normalized.push(trimmed)
  }

  return normalized
}

function addLabel(labels: string[], value: string) {
  const trimmed = value.trim()
  if (!trimmed || labels.some((label) => label.toLowerCase() === trimmed.toLowerCase())) {
    return labels
  }

  return [...labels, trimmed]
}

function removeLabel(labels: string[], value: string) {
  return labels.filter((label) => label.toLowerCase() !== value.trim().toLowerCase())
}

function findWorkspaceForCard(card: { canonicalKey: string; projectPath: string; workspacePath: string }, inventory: DotCraftWorkspacesResponse | null) {
  if (!inventory) return null
  const canonicalKey = card.canonicalKey.trim().toLowerCase()
  const projectPath = card.projectPath.trim().toLowerCase()
  const workspacePath = card.workspacePath.trim().toLowerCase()
  return inventory.workspaces.find((workspace) => {
    if (workspacePath && workspace.path.trim().toLowerCase() === workspacePath) return true
    return workspace.repositories.some((candidate) => {
      const normalized = candidate.trim().toLowerCase()
      return normalized === canonicalKey || normalized === projectPath
    })
  }) ?? null
}

function isActiveSourceSyncJob(job: SourceSyncJob | null) {
  return job?.status === 'queued' || job?.status === 'running'
}

function formatScheduleInterval(intervalSeconds: number) {
  if (intervalSeconds % 3600 === 0) {
    const hours = intervalSeconds / 3600
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
  }

  if (intervalSeconds % 60 === 0) {
    const minutes = intervalSeconds / 60
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
  }

  return `${intervalSeconds} seconds`
}

function formatScheduleNextRun(nextRunAt?: string | null) {
  if (!nextRunAt) {
    return 'next run not scheduled'
  }

  const timestamp = new Date(nextRunAt).getTime()
  if (Number.isNaN(timestamp)) {
    return `next ${nextRunAt}`
  }

  const diffSeconds = Math.round((timestamp - Date.now()) / 1000)
  if (diffSeconds <= 0) {
    return 'due now'
  }

  if (diffSeconds < 60) {
    return `next in ${diffSeconds} sec`
  }

  const diffMinutes = Math.round(diffSeconds / 60)
  if (diffMinutes < 60) {
    return `next in ${diffMinutes} min`
  }

  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) {
    return `next in ${diffHours} hr`
  }

  return `next ${new Date(nextRunAt).toLocaleString()}`
}

function sourceSyncJobStatusLabel(status: SourceSyncJob['status']) {
  if (status === 'queued') return 'Sync queued'
  if (status === 'running') return 'Sync running'
  if (status === 'succeeded') return 'Sync complete'
  if (status === 'partialFailed') return 'Sync partially failed'
  return 'Sync failed'
}

function sourceProjectPhaseLabel(run: SourceSyncProjectRun) {
  if (run.errorMessage) return 'Failed'
  if (run.phase === 'queued') return 'Queued'
  if (run.phase === 'fetching') return `Fetching ${run.displayName || run.projectPath}`
  if (run.phase === 'importing') return `${run.issuesDiscovered} issues and ${run.reviewTargetsDiscovered} review targets discovered`
  if (run.phase === 'done') return run.completedAt ? `Done ${relativeTime(run.completedAt)}` : 'Done'
  return 'Failed'
}

function sourceSyncStatusIcon(job: SourceSyncJob | null) {
  if (!job) return <RefreshCw size={15} />
  if (job.status === 'succeeded') return <CheckCircle2 size={15} />
  if (job.status === 'failed' || job.status === 'partialFailed') return <XCircle size={15} />
  return <RefreshCw size={15} className="spin-icon" />
}

function sourceProjectStatusIcon(run: SourceSyncProjectRun) {
  if (run.status === 'succeeded') return <CheckCircle2 size={14} />
  if (run.status === 'failed') return <XCircle size={14} />
  return <RefreshCw size={14} />
}

function clampNumber(value: string, min: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return min
  }

  return clampNumberValue(Math.round(parsed), min, max)
}

function clampNumberValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function pickDurationUnit(value: number, units: DurationUnit[]) {
  for (let index = units.length - 1; index >= 0; index -= 1) {
    const unit = units[index]
    if (value >= unit.multiplier && value % unit.multiplier === 0) {
      return unit
    }
  }

  return units[0]
}

function emptyToNull(value: string) {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function isWindowCloseBehavior(value: unknown): value is WindowCloseBehavior {
  return value === 'minimizeToTray' || value === 'quitApp'
}
