import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction, type ReactNode } from 'react'
import { useParams } from 'react-router'
import {
  Activity,
  Check,
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
  Languages,
  ListChecks,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
  Search,
  RotateCcw,
  Settings,
  ShieldCheck,
  SunMoon,
  Trash2,
  Wrench,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { apiGet, apiPut } from '../api'
import { ActionIcon } from '../components/primitives/ActionIcon'
import { GithubGlyph, GitlabGlyph } from '../components/primitives/ProviderGlyphs'
import { DropdownSelect, type DropdownSelectOption } from '../components/primitives/DropdownSelect'
import { Tooltip } from '../components/primitives/Tooltip'
import { useTranslation } from 'react-i18next'
import { normalizeSettingsSection, type SettingsSection } from '../settingsSections'
import i18n from '../i18n'
import { changeLocale, supportedLocales, type AppLocale } from '../i18n'
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
type RepositoryAllowlistKind = 'autoReview' | 'publish' | 'followUp'
type SourceProviderId = 'github' | 'gitlab'

const DEFAULT_RUN_TIMEOUT_SECONDS = 30 * 60

function approvalPolicyOptions(): DropdownSelectOption[] {
  return [
    { value: 'default', label: i18n.t('settings:agents.approvalPolicyOptions.default') },
    { value: 'interrupt', label: i18n.t('settings:agents.approvalPolicyOptions.interrupt') },
    { value: 'autoApprove', label: i18n.t('settings:agents.approvalPolicyOptions.autoApprove') },
  ]
}

function deliveryPolicyOptions(): DropdownSelectOption[] {
  return [
    { value: 'manualDelivery', label: i18n.t('settings:worktree.automation.deliveryLabelManual') },
    { value: 'autoPr', label: i18n.t('settings:worktree.automation.deliveryLabelAutoPr') },
  ]
}

const sourceProviderOptions: DropdownSelectOption[] = [
  { value: 'github', label: 'GitHub' },
  { value: 'gitlab', label: 'GitLab' },
]

const sourceSyncScheduleDefaultIntervalSeconds = 300
const sourceSyncScheduleMinSeconds = 60
const sourceSyncScheduleMaxSeconds = 86400
function sourceSyncSchedulePresets(): DropdownSelectOption[] {
  return [
    { value: '60', label: '1 min' },
    { value: '300', label: '5 min' },
    { value: '900', label: '15 min' },
    { value: '1800', label: '30 min' },
    { value: '3600', label: '1 hr' },
    { value: '86400', label: '24 hr' },
    { value: 'custom', label: i18n.t('settings:sources.schedule.custom') },
  ]
}

const windowCloseBehaviorOptions = [
  { value: 'minimizeToTray', label: 'Minimize to tray' },
  { value: 'quitApp', label: 'Quit app' },
]

function concurrencyControlLabels(): string[] {
  return [
    i18n.t('settings:worktree.concurrencyLabels.global'),
    i18n.t('settings:worktree.concurrencyLabels.perRepository'),
    i18n.t('settings:worktree.concurrencyLabels.perSource'),
  ]
}
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
    autoFollowUpEnabled: boolean
    autoFollowUpRepositories: string[]
    maxFollowUpRounds: number
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
  onReplayOnboarding?: () => void
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
  onReplayOnboarding,
}: SettingsViewProps) {
  const { section } = useParams()
  const { t, i18n: i18nInstance } = useTranslation('settings')
  const currentLocale: AppLocale = (supportedLocales.some((locale) => locale.value === i18nInstance.language) ? i18nInstance.language : 'en') as AppLocale
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
      setConfigError(reason instanceof Error ? reason.message : t('notices.serverConfigUnavailable'))
    }
  }, [])

  const loadWorkspaceInventory = useCallback(async () => {
    setWorkspaceError(null)
    try {
      setWorkspaceInventory(await apiGet<DotCraftWorkspacesResponse>('/dotcraft/workspaces'))
    } catch (reason) {
      setWorkspaceInventory(null)
      setWorkspaceError(reason instanceof Error ? reason.message : t('notices.workspaceInventoryUnavailable'))
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
      setConfigError(reason instanceof Error ? reason.message : t('notices.serverConfigSaveFailed'))
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
      setConfigError(reason instanceof Error ? reason.message : t('notices.githubInstallationDetectionFailed'))
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
      setConfigError(reason instanceof Error ? reason.message : t('notices.selectWorkspaceFailed'))
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

  const diagnosticsGitHub = diagnostics?.gitHub ?? diagnostics?.github
  const diagnosticsGitLab = diagnostics?.gitLab
  const githubAuthenticationLabel = diagnosticsGitHub?.authentication ? authLabel(diagnosticsGitHub.authentication) : githubStatus.configured ? t('credentials.authLabel.configured') : t('credentials.authLabel.none')
  const gitLabConfig = normalizeGitLabConfig(configDraft?.gitLab)
  const persistedGitLabConfig = normalizeGitLabConfig(serverConfig?.configuration.gitLab)
  const gitLabEndpointHostChanged = sourceInstance('gitlab', persistedGitLabConfig.endpoint) !== sourceInstance('gitlab', gitLabConfig.endpoint)
  const gitLabEndpointDescription = gitLabEndpointHostChanged && persistedGitLabConfig.projectProfiles.length > 0
    ? t('credentials.gitlab.endpointHostChange')
    : t('credentials.gitlab.endpointDefault')
  const gitLabTokenConfiguredCount = gitLabConfig.projectProfiles.filter((profile) => normalizeGitLabSecrets(profile.secrets).token.configured).length
  const gitLabAuthenticationLabel = diagnosticsGitLab?.authentication ? authLabel(diagnosticsGitLab.authentication) : gitLabTokenConfiguredCount ? gitLabTokenConfiguredCount === gitLabConfig.projects.length ? t('credentials.authLabel.token') : t('credentials.authLabel.partial') : t('credentials.authLabel.none')
  const gitLabWebhookLabel = diagnosticsGitLab?.webhookVerificationMode ? gitLabWebhookModeLabel(diagnosticsGitLab.webhookVerificationMode) : t('credentials.webhookMode.none')
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
  const deliveryLabel = hasGitLabProject ? t('worktree.automation.deliveryLabelAutoPrMr') : t('worktree.automation.deliveryLabelAutoPr')
  const deliveryDescription = hasGitLabProject
    ? t('worktree.automation.deliveryWithGitlab')
    : t('worktree.automation.deliveryDefault')
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
      setConfigError(reason instanceof Error ? reason.message : t('notices.scheduleSaveFailed'))
    } finally {
      setScheduleSavingProvider(null)
    }
  }
  const addProjectDisabled = !serverConfig?.writable || !newProjectPath.trim()
  const implementationAutoDispatchDescription = hasGitLabProject
    ? t('worktree.automation.autoDispatchWithGitlab')
    : t('worktree.automation.autoDispatchDefault')
  const reviewPolicyDescription = hasGitLabProject
    ? t('review.group.descriptionWithGitlab')
    : t('review.group.descriptionDefault')
  const publishAllowlistDescription = hasGitLabProject
    ? t('review.publishWithGitlab')
    : t('review.publishDefault')
  const autoReviewAllowlistDescription = hasGitLabProject
    ? t('review.autoReviewWithGitlab')
    : t('review.autoReviewDefault')
  const allowlistEmptyLabel = hasGitLabProject ? t('review.emptyWithGitlab') : t('review.emptyDefault')
  const allowlistManageDisabled = !serverConfig?.writable || configuredProjects.length === 0
  const reviewTargetTerm = hasGitLabProject ? t('review.term.prmr') : t('review.term.pr')
  const publishRouteTerm = hasGitLabProject ? t('review.term.providerRoutes') : t('review.term.githubComment')
  const reviewSourceSupports = hasGitLabProject ? t('review.reviewSupportsWithGitlab') : t('review.reviewSupportsDefault')
  const diagnosticsGitLabWriteLabel = (diagnosticsGitLab?.writeConfigured ?? gitLabTokenConfiguredCount > 0) ? gitLabTokenConfiguredCount && gitLabTokenConfiguredCount < gitLabConfig.projects.length ? t('credentials.gitlabWriteLabel.partial') : t('credentials.gitlabWriteLabel.configured') : t('credentials.gitlabWriteLabel.missingToken')

  const shouldShowStartServer = !dotcraftStatus.connected || Boolean(workspaceInventory?.workspaces?.some((workspace) => !workspace.connected))
  const bridgeActions = shouldShowStartServer ? (
    <button
      type="button"
      className="primary-button inline compact-row-action settings-action-button"
      disabled={isStartingAppServer}
      onClick={() => void startAndRefreshDotCraftAppServer()}
    >
      {isStartingAppServer ? <RefreshCw size={14} className="spin-icon" /> : <Play size={14} />}
      {isStartingAppServer ? t('agents.bridge.starting') : t('agents.bridge.startServer')}
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
  const addProjectCard = (provider: SourceProviderId) => {
    updateServerConfiguration((current) => applyProjectCardAdd(current, provider, newProjectPath, newWorkspacePath))
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
  const updateAutoFollowUpRepositories = (repositories: string[]) => {
    const filtered = filterRepositories(repositories, configuredProjects)
    updateAutomationConfig({
      autoFollowUpEnabled: filtered.length > 0,
      autoFollowUpRepositories: filtered,
    })
  }

  const renderProviderSettings = (providerId: 'github' | 'gitlab') => {
    const provider = providerCards.find((card) => card.provider === providerId) ?? null
    const job = sourceSyncJobs[providerId] ?? null
    const schedule = sourceSyncSchedules[providerId] ?? null
    const Glyph = providerId === 'gitlab' ? GitlabGlyph : GithubGlyph
    const name = providerId === 'gitlab' ? 'GitLab' : 'GitHub'
    const endpoint = provider ? formatEndpoint(provider.endpoint) || t('sources.card.noEndpoint') : ''
    const configured = provider?.configured ?? false
    const active = isActiveSourceSyncJob(job)
    const failedRuns = job?.projects.filter((run) => run.status === 'failed') ?? []
    const canSync = Boolean(provider?.readCapability.available) && !active && !isSyncing && !serverRestartPending
    const projectTerm = providerId === 'gitlab' ? t('sources.card.termProjects') : t('sources.card.termRepositories')
    const reviewTargetTerm = providerId === 'gitlab' ? t('sources.card.reviewMRs') : t('sources.card.reviewPRs')
    const metaText = provider
      ? `${t('sources.card.configuredProjects', { count: provider.configuredProjectCount, term: projectTerm })} · ${provider.lastSyncAt ? t('sources.card.lastSync', { time: relativeTime(provider.lastSyncAt) }) : t('sources.card.noSyncYet')}`
      : ''
    const latestFailure = provider?.recentSourceWriteFailures?.[0] ?? provider?.recentSyncFailures?.[0] ?? job?.errorMessage ?? provider?.diagnostic ?? null
    const overflowItems = [
      ...(configured ? [{ key: 'fullRepair', label: t('sources.card.fullRepair'), icon: <Wrench size={15} />, onSelect: () => void syncSource(providerId, 'full') }] : []),
      ...(failedRuns.length ? [{ key: 'retry', label: t('sources.card.syncFailed'), icon: <RotateCcw size={15} />, onSelect: () => void retrySourceProjects(providerId, failedRuns.map((run) => run.sourceProjectKey || run.projectPath)) }] : []),
    ]

    return (
      <div className="settings-stack provider-settings">
        <header className="provider-settings-header">
          <span className="provider-settings-id">
            <span className="provider-settings-glyph" aria-hidden="true"><Glyph size={18} /></span>
            <small>{endpoint || name}</small>
          </span>
          <span className="provider-settings-actions">
            {configured ? (
              <button className="primary-button inline compact-row-action settings-action-button" type="button" disabled={!canSync} onClick={() => void syncSource(providerId, 'incremental')}>
                <RefreshCw size={14} className={active || isSyncing ? 'spin-icon' : undefined} />
                {isSyncing ? t('sources.card.starting') : active ? t('sources.card.syncing') : t('sources.card.syncNow')}
              </button>
            ) : null}
            <ProviderOverflowMenu disabled={active || isSyncing} items={overflowItems} />
          </span>
        </header>

        {configured && provider ? (
          <ProviderHealthLine provider={provider} metaText={metaText} />
        ) : (
          <p className="provider-needs-setup">{t('sources.needsSetupHint', { provider: name })}</p>
        )}

        <SettingsGroup title={t('sources.connectionTitle')} description={providerId === 'gitlab' ? t('credentials.gitlab.description') : t('credentials.github.description')}>
          {providerId === 'github' ? (
            <>
              <SettingsRow icon={Code2} label={t('credentials.github.endpoint')} description={t('credentials.github.endpointDescription')} control={<TextControl value={configDraft?.gitHub.endpoint ?? ''} disabled={!serverConfig?.writable} onChange={(value) => updateGitHubConfig({ endpoint: value }, 'immediate')} />} />
              <SettingsRow icon={KeyRound} label={t('credentials.github.appId')} description={t('credentials.github.appIdDescription')} control={<TextControl value={configDraft?.gitHub.appId ?? ''} disabled={!serverConfig?.writable} onChange={(value) => updateGitHubConfig({ appId: emptyToNull(value) }, 'immediate')} />} />
              <SettingsRow icon={ShieldCheck} label={t('credentials.github.authentication')} description={t('credentials.github.authenticationDescription')} control={<ValuePill>{githubAuthenticationLabel}</ValuePill>} />
              <SettingsRow icon={CheckCircle2} label={t('credentials.github.writes')} description={t('credentials.github.writesDescription')} control={<button className="toggle-button" aria-pressed={configDraft?.gitHub.writesEnabled ?? false} disabled={!serverConfig?.writable} onClick={() => updateGitHubConfig({ writesEnabled: !(configDraft?.gitHub.writesEnabled ?? false) })}>{configDraft?.gitHub.writesEnabled ? t('common.on') : t('common.off')}</button>} />
              <SecretSettingsRow icon={KeyRound} label={t('credentials.github.token')} field={normalizeGitHubSecrets(configDraft?.gitHub.secrets).token} disabled={!serverConfig?.writable} onChange={(next) => updateGitHubSecret('token', next)} />
              <SecretSettingsRow icon={KeyRound} label={t('credentials.github.privateKey')} multiline field={normalizeGitHubSecrets(configDraft?.gitHub.secrets).privateKey} disabled={!serverConfig?.writable} onChange={(next) => updateGitHubSecret('privateKey', next)} />
              <SecretSettingsRow icon={KeyRound} label={t('credentials.github.privateKeyPath')} field={normalizeGitHubSecrets(configDraft?.gitHub.secrets).privateKeyPath} disabled={!serverConfig?.writable} onChange={(next) => updateGitHubSecret('privateKeyPath', next)} />
              <SecretSettingsRow icon={KeyRound} label={t('credentials.github.webhookSecret')} field={normalizeGitHubSecrets(configDraft?.gitHub.secrets).webhookSecret} disabled={!serverConfig?.writable} onChange={(next) => updateGitHubSecret('webhookSecret', next)} />
            </>
          ) : (
            <>
              <SettingsRow icon={CheckCircle2} label={t('credentials.gitlab.readSync')} description={t('credentials.gitlab.readSyncDescription')} control={<button className="toggle-button" aria-pressed={gitLabConfig.enabled} disabled={!serverConfig?.writable} onClick={() => updateGitLabConfig({ enabled: !gitLabConfig.enabled })}>{gitLabConfig.enabled ? t('common.on') : t('common.off')}</button>} />
              <SettingsRow icon={GitPullRequest} label={t('credentials.gitlab.writes')} description={t('credentials.gitlab.writesDescription')} control={<button className="toggle-button" aria-pressed={gitLabConfig.writesEnabled} disabled={!serverConfig?.writable} onClick={() => updateGitLabConfig({ writesEnabled: !gitLabConfig.writesEnabled })}>{gitLabConfig.writesEnabled ? t('common.on') : t('common.off')}</button>} />
              <SettingsRow icon={Code2} label={t('credentials.gitlab.endpoint')} description={gitLabEndpointDescription} control={<TextControl value={gitLabConfig.endpoint} disabled={!serverConfig?.writable} onChange={(value) => updateGitLabConfig({ endpoint: value }, 'immediate')} />} />
              <SettingsRow icon={ShieldCheck} label={t('credentials.gitlab.authentication')} description={t('credentials.gitlab.authenticationDescription')} control={<ValuePill>{gitLabAuthenticationLabel}</ValuePill>} />
              <SettingsRow icon={ShieldCheck} label={t('credentials.gitlab.writeCredentials')} description={t('credentials.gitlab.writeCredentialsDescription')} control={<ValuePill>{diagnosticsGitLabWriteLabel}</ValuePill>} />
              <SettingsRow icon={ShieldCheck} label={t('credentials.gitlab.webhookVerification')} description={t('credentials.gitlab.webhookVerificationDescription')} control={<ValuePill>{gitLabWebhookLabel}</ValuePill>} />
              <SettingsRow icon={ShieldCheck} label={t('credentials.gitlab.localBypass')} description={t('credentials.gitlab.localBypassDescription')} control={<button className="toggle-button" aria-pressed={gitLabConfig.allowLocalDevelopmentUnsafeWebhooks} disabled={!serverConfig?.writable} onClick={() => updateGitLabConfig({ allowLocalDevelopmentUnsafeWebhooks: !gitLabConfig.allowLocalDevelopmentUnsafeWebhooks })}>{gitLabConfig.allowLocalDevelopmentUnsafeWebhooks ? t('common.on') : t('common.off')}</button>} />
            </>
          )}
        </SettingsGroup>

        <SettingsGroup title={t('projects.groupTitle')} description={serverConfig?.writable ? t('common.overlay', { path: serverConfig.overlayPath }) : serverConfig?.disabledReason ?? t('common.readOnly')}>
            <div className="repository-card-list">
              {projectCards.some((card) => card.provider === providerId) ? (
                projectCards.map((card, index) => (card.provider !== providerId ? null : (
                  <ProjectRouteCard
                    key={`${card.canonicalKey || 'empty'}-${index}`}
                    card={card}
                    gitLabProfile={card.provider === 'gitlab' ? gitLabProfileForCard(gitLabConfig, card) : null}
                    sourceProject={card.provider === 'gitlab' ? sourceProjectByKey.get(card.canonicalKey.toLowerCase()) ?? null : null}
                    disabled={!serverConfig?.writable}
                    onProviderChange={(value) => updateProjectCard(index, { provider: value as SourceProviderId })}
                    onProjectPathChange={(projectPath) => updateProjectCard(index, { projectPath }, 'immediate')}
                    onWorkspacePathChange={(workspacePath) => updateProjectCard(index, { workspacePath }, 'immediate')}
                    onGitLabProfileTokenKindChange={(tokenKind) => updateGitLabProjectProfileTokenKind(card, tokenKind)}
                    onGitLabProfileSecretChange={(key, next) => updateGitLabProjectProfileSecret(card, key, next)}
                    canBrowseWorkspace={Boolean(window.oratorioDesktop?.selectDirectory)}
                    onBrowseWorkspace={() => void selectWorkspaceDirectory(card.workspacePath, (workspacePath) => updateProjectCard(index, { workspacePath }))}
                    onRemove={() => removeProjectCard(index)}
                  />
                )))
              ) : (
                <div className="empty-settings-card">
                  <GitPullRequest size={16} />
                  <span>{t('projects.emptyNoProjects')}</span>
                </div>
              )}
            </div>
            {providerId === 'github' && gitHubInstallationRows.length ? (
              <GitHubInstallationProfileList
                rows={gitHubInstallationRows}
                disabled={!serverConfig?.writable}
                onChange={updateGitHubInstallationProfile}
                onDetect={() => void detectGitHubInstallationsNow()}
              />
            ) : null}
            <div className="repository-add-row provider-add-row">
              <TextControl placeholder={providerId === 'gitlab' ? t('projects.gitlabPlaceholder') : t('projects.githubPlaceholder')} value={newProjectPath} disabled={!serverConfig?.writable} onChange={setNewProjectPath} commitOnBlur={false} />
              <WorkspacePathControl
                value={newWorkspacePath}
                placeholder={t('projects.workspacePlaceholder')}
                disabled={!serverConfig?.writable}
                canBrowse={Boolean(window.oratorioDesktop?.selectDirectory)}
                onChange={setNewWorkspacePath}
                onBrowse={() => void selectWorkspaceDirectory(newWorkspacePath, setNewWorkspacePath)}
                commitOnBlur={false}
              />
              <button className="secondary-button inline compact-row-action settings-action-button" disabled={addProjectDisabled} onClick={() => addProjectCard(providerId)}>
                <Plus size={14} />
                {t('projects.add')}
              </button>
            </div>
            {workspaceError ? <SettingsNotice tone="error">{workspaceError}</SettingsNotice> : null}
        </SettingsGroup>

        {provider ? (
          <SettingsGroup title={t('sources.syncGroupTitle')} description={t('sources.syncGroupDescription')}>
            <SourceSyncSchedulePanel
              provider={provider}
              schedule={schedule}
              saving={scheduleSavingProvider === providerId}
              onChange={(request) => void updateProviderSchedule(providerId, request)}
            />
            <SourceSyncPanel
              provider={providerId}
              projectTerm={projectTerm}
              reviewTargetTerm={reviewTargetTerm}
              job={job}
              pendingRestart={serverRestartPending}
            />
          </SettingsGroup>
        ) : null}

        {latestFailure ? <SettingsNotice tone="error">{latestFailure}</SettingsNotice> : null}
      </div>
    )
  }

  return (
      <section className="settings-page" aria-label={t('pageTitle')} ref={settingsPageRef}>
        <div className="settings-content">
          <header className="settings-page-header">
            <div>
              <h1>{t(`sections.${activeSection}.label`)}</h1>
              <p>{activeSectionCopy(activeSection)}</p>
            </div>
            <span className="settings-page-header-actions">
              <SettingsAutosaveStatus saveState={configSaveState} onRetry={retryServerConfigurationAutosave} />
              <ActionIcon className="icon-button settings-refresh-action" label={isRefreshing ? t('refreshing') : t('refresh')} title={isRefreshing ? t('refreshing') : t('refresh')} onClick={() => void refreshSettings()} disabled={isRefreshing}>
                <RefreshCw size={15} className={isRefreshing ? 'spin-icon' : undefined} />
              </ActionIcon>
            </span>
          </header>
          {configError ? <SettingsNotice tone="error">{configError}</SettingsNotice> : null}
          {activeSection === 'general' ? (
            <div className="settings-stack">
              <SettingsGroup title={t('appearance.title')} description={t('appearance.description')}>
                <SettingsRow
                  icon={SunMoon}
                  label={t('theme.label')}
                  description={t('theme.description')}
                  control={
                    <SegmentedControl
                      value={theme}
                      options={[
                        { value: 'dark', label: t('theme.dark') },
                        { value: 'light', label: t('theme.light') },
                      ]}
                      onChange={(value) => setTheme(value as ThemeMode)}
                    />
                  }
                />
                <SettingsRow
                  icon={Languages}
                  label={t('language.label')}
                  description={t('language.description')}
                  control={
                    <SegmentedControl
                      value={currentLocale}
                      options={supportedLocales.map((locale) => ({ value: locale.value, label: locale.label }))}
                      onChange={(value) => changeLocale(value as AppLocale)}
                    />
                  }
                />
              </SettingsGroup>
              {canConfigureWindowBehavior ? (
                <SettingsGroup title={t('desktop.title')} description={t('desktop.description')}>
                  <SettingsRow
                    icon={Settings}
                    label={t('windowBehavior.label')}
                    description={t('windowBehavior.description')}
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
              {onReplayOnboarding ? (
                <SettingsGroup title={t('onboarding:replay.groupTitle')}>
                  <SettingsRow
                    icon={RotateCcw}
                    label={t('onboarding:replay.label')}
                    description={t('onboarding:replay.description')}
                    control={
                      <button type="button" className="primary-button inline compact-row-action settings-action-button" onClick={onReplayOnboarding}>
                        <RotateCcw size={14} />
                        {t('onboarding:replay.button')}
                      </button>
                    }
                  />
                </SettingsGroup>
              ) : null}
            </div>
          ) : null}

          {activeSection === 'github' ? renderProviderSettings('github') : null}

          {activeSection === 'gitlab' ? renderProviderSettings('gitlab') : null}

          {activeSection === 'agents' ? (
            <div className="settings-stack">
              <SettingsGroup title={t('agents.connection.title')} description={serverConfig?.writable ? t('agents.connection.restartDescription') : serverConfig?.disabledReason ?? t('common.readOnly')} headerAction={bridgeActions}>
                <SettingsRow icon={Code2} label={t('agents.connection.appServerUrl')} description={t('agents.connection.appServerUrlDescription')} control={<TextControl value={configDraft?.dotCraft.appServerUrl ?? ''} disabled={!serverConfig?.writable} onChange={(value) => updateDotCraftConfig({ appServerUrl: value }, 'immediate')} />} />
                <SettingsRow icon={GitPullRequest} label={t('agents.connection.hubDiscovery')} description={t('agents.connection.hubDiscoveryDescription')} control={<button className="toggle-button" aria-pressed={configDraft?.dotCraft.hubDiscoveryEnabled ?? false} disabled={!serverConfig?.writable} onClick={() => updateDotCraftConfig({ hubDiscoveryEnabled: !(configDraft?.dotCraft.hubDiscoveryEnabled ?? false) })}>{configDraft?.dotCraft.hubDiscoveryEnabled ? t('common.on') : t('common.off')}</button>} />
                <SettingsRow icon={Code2} label={t('agents.connection.hubLockPath')} description={t('agents.connection.hubLockPathDescription')} control={<TextControl value={configDraft?.dotCraft.hubLockPath ?? ''} disabled={!serverConfig?.writable} onChange={(value) => updateDotCraftConfig({ hubLockPath: value }, 'immediate')} />} />
                <SettingsRow icon={ShieldCheck} label={t('agents.connection.approvalPolicy')} description={t('agents.connection.approvalPolicyDescription')} control={<SelectControl label={t('agents.connection.approvalPolicy')} value={configDraft?.dotCraft.approvalPolicy ?? 'interrupt'} disabled={!serverConfig?.writable} options={approvalPolicyOptions()} onChange={(value) => updateDotCraftConfig({ approvalPolicy: value })} />} />
                <SettingsRow icon={Activity} label={t('agents.connection.runTimeout')} description={t('agents.connection.runTimeoutDescription')} control={<DurationControl label={t('worktree.stepperLabels.runTimeout')} value={configDraft?.dotCraft.runTimeoutSeconds ?? DEFAULT_RUN_TIMEOUT_SECONDS} disabled={!serverConfig?.writable} min={30} max={7200} units={secondsDurationUnits()} onChange={(value) => updateDotCraftConfig({ runTimeoutSeconds: value })} />} />
                <SettingsRow
                  icon={Code2}
                  label={t('agents.bridge.health')}
                  description={dotcraftStatus.message ?? t('agents.bridge.healthDescription')}
                  control={<StatusPill tone={dotcraftStatus.connected ? 'ok' : dotcraftStatus.configured ? 'warn' : 'muted'} label={healthLabel(dotcraftStatus.health)} />}
                />
              </SettingsGroup>
            </div>
          ) : null}

          {activeSection === 'worktree' ? (
            <div className="settings-stack">
              <SettingsGroup title={t('worktree.group.title')} description={serverConfig?.writable ? t('worktree.group.restartDescription') : serverConfig?.disabledReason ?? t('common.readOnly')}>
                <SettingsRow icon={ShieldCheck} label={t('worktree.managedWorktrees')} description={t('worktree.managedWorktreesDescription')} control={<button className="toggle-button" aria-pressed={configDraft?.runtime.managedWorktreesEnabled ?? false} disabled={!serverConfig?.writable} onClick={() => updateRuntimeConfig({ managedWorktreesEnabled: !(configDraft?.runtime.managedWorktreesEnabled ?? false) })}>{configDraft?.runtime.managedWorktreesEnabled ? t('common.on') : t('common.off')}</button>} />
                <SettingsRow icon={Code2} label={t('worktree.worktreeRoot')} description={t('worktree.worktreeRootDescription')} control={<TextControl value={configDraft?.runtime.worktreeRoot ?? ''} disabled={!serverConfig?.writable} onChange={(value) => updateRuntimeConfig({ worktreeRoot: value }, 'immediate')} />} />
                <SettingsRow icon={GitPullRequest} label={t('worktree.branchPrefix')} description={t('worktree.branchPrefixDescription')} control={<TextControl value={configDraft?.runtime.worktreeBranchPrefix ?? ''} disabled={!serverConfig?.writable} onChange={(value) => updateRuntimeConfig({ worktreeBranchPrefix: value }, 'immediate')} />} />
                <SettingsRow icon={Activity} label={t('worktree.concurrency')} description={t('worktree.concurrencyDescription')} control={<NumberTripleControl values={[configDraft?.runtime.globalMaxActiveRuns ?? 1, configDraft?.runtime.maxActiveRunsPerRepository ?? 1, configDraft?.runtime.maxActiveRunsPerSource ?? 1]} disabled={!serverConfig?.writable} onChange={([globalMaxActiveRuns, maxActiveRunsPerRepository, maxActiveRunsPerSource]) => updateRuntimeConfig({ globalMaxActiveRuns, maxActiveRunsPerRepository, maxActiveRunsPerSource })} />} />
                <SettingsRow icon={RefreshCw} label={t('worktree.retries')} description={t('worktree.retriesDescription')} control={<RetryPolicyControl attempts={configDraft?.runtime.maxRunAttempts ?? 1} initialBackoffSeconds={configDraft?.runtime.retryBackoffSeconds ?? 1} maxBackoffSeconds={configDraft?.runtime.maxRetryBackoffSeconds ?? 1} disabled={!serverConfig?.writable} onChange={(maxRunAttempts, retryBackoffSeconds, maxRetryBackoffSeconds) => updateRuntimeConfig({ maxRunAttempts, retryBackoffSeconds, maxRetryBackoffSeconds })} />} />
                <SettingsRow icon={Activity} label={t('worktree.stallTimeout')} description={t('worktree.stallTimeoutDescription')} control={<DurationControl label={t('worktree.stepperLabels.stallTimeout')} value={configDraft?.runtime.stallTimeoutSeconds ?? 300} disabled={!serverConfig?.writable} min={5} max={7200} units={secondsDurationUnits()} onChange={(value) => updateRuntimeConfig({ stallTimeoutSeconds: value })} />} />
                <SettingsRow icon={RotateCcw} label={t('worktree.retention')} description={t('worktree.retentionDescription')} control={<RetentionControl succeededHours={configDraft?.runtime.succeededWorktreeRetentionHours ?? 24} failedHours={configDraft?.runtime.failedWorktreeRetentionHours ?? 168} disabled={!serverConfig?.writable} onChange={(succeededWorktreeRetentionHours, failedWorktreeRetentionHours) => updateRuntimeConfig({ succeededWorktreeRetentionHours, failedWorktreeRetentionHours })} />} />
                <SettingsRow icon={RotateCcw} label={t('worktree.cleanupWorker')} description={t('worktree.cleanupWorkerDescription')} control={<CleanupControl enabled={configDraft?.runtime.worktreeCleanupEnabled ?? false} interval={configDraft?.runtime.worktreeCleanupIntervalSeconds ?? 60} disabled={!serverConfig?.writable} onChange={(worktreeCleanupEnabled, worktreeCleanupIntervalSeconds) => updateRuntimeConfig({ worktreeCleanupEnabled, worktreeCleanupIntervalSeconds })} />} />
              </SettingsGroup>
              <SettingsGroup title={t('worktree.automation.title')} description={t('worktree.automation.description')}>
                <SettingsRow icon={Activity} label={t('worktree.automation.autoDispatch')} description={implementationAutoDispatchDescription} control={<button className="toggle-button" aria-pressed={configDraft?.automation.autoDispatchEnabled ?? false} disabled={!serverConfig?.writable} onClick={() => updateAutomationConfig({ autoDispatchEnabled: !(configDraft?.automation.autoDispatchEnabled ?? false) })}>{configDraft?.automation.autoDispatchEnabled ? t('common.on') : t('common.off')}</button>} />
                <SettingsRow icon={GitPullRequest} label={t('worktree.automation.allowLabels')} description={t('worktree.automation.allowLabelsDescription')} control={<LabelListControl labels={configDraft?.automation.autoDispatchAllowLabels ?? []} disabled={!serverConfig?.writable} placeholder={t('worktree.automation.addAllowLabel')} emptyLabel={t('worktree.automation.allUnblockedItems')} ariaLabel={t('worktree.automation.allowLabels')} onChange={(labels) => updateAutomationConfig({ autoDispatchAllowLabels: labels })} />} />
                <SettingsRow icon={ShieldCheck} label={t('worktree.automation.blockLabels')} description={t('worktree.automation.blockLabelsDescription')} control={<LabelListControl labels={configDraft?.automation.autoDispatchBlockLabels ?? []} disabled={!serverConfig?.writable} placeholder={t('worktree.automation.addBlockLabel')} emptyLabel={t('worktree.automation.noBlockLabels')} ariaLabel={t('worktree.automation.blockLabels')} onChange={(labels) => updateAutomationConfig({ autoDispatchBlockLabels: labels })} />} />
                <SettingsRow icon={Activity} label={t('worktree.automation.implementationTurns')} description={t('worktree.automation.implementationTurnsDescription')} control={<NumberControl label={t('worktree.automation.implementationTurns')} value={configDraft?.automation.maxImplementationTurns ?? 3} disabled={!serverConfig?.writable} min={1} max={10} onChange={(value) => updateAutomationConfig({ maxImplementationTurns: value })} />} />
                <SettingsRow icon={ShieldCheck} label={t('worktree.automation.delivery')} description={deliveryDescription} control={<SelectControl label={t('worktree.automation.delivery')} value={configDraft?.automation.deliveryPolicy ?? 'manualDelivery'} disabled={!serverConfig?.writable} options={deliveryPolicyOptions().map((option) => option.value === 'autoPr' ? { ...option, label: deliveryLabel } : option)} onChange={(value) => updateAutomationConfig({ deliveryPolicy: value as DeliveryPolicy })} />} />
              </SettingsGroup>
            </div>
          ) : null}

          {activeSection === 'review' ? (
            <div className="settings-stack">
              <SettingsGroup title={t('review.group.title')} description={reviewPolicyDescription}>
                <RepositoryAllowlistCard
                  title={hasGitLabProject ? t('review.projectAllowlist') : t('review.repositoryAllowlist')}
                  description={`${autoReviewAllowlistDescription} ${reviewSourceSupports}`}
                  repositories={configDraft?.automation.autoReviewRepositories ?? []}
                  disabled={!serverConfig?.writable}
                  manageDisabled={allowlistManageDisabled}
                  emptyLabel={allowlistEmptyLabel}
                  onManage={() => setRepositoryAllowlistModal('autoReview')}
                  onRemove={(repository) => updateAutoReviewRepositories(removeRepository(configDraft?.automation.autoReviewRepositories ?? [], repository))}
                />
                <RepositoryAllowlistCard
                  title={t('review.publishAllowlist')}
                  description={publishAllowlistDescription}
                  repositories={effectiveAutoReviewPublishRepositories(configDraft?.automation)}
                  disabled={!serverConfig?.writable}
                  manageDisabled={allowlistManageDisabled}
                  emptyLabel={allowlistEmptyLabel}
                  onManage={() => setRepositoryAllowlistModal('publish')}
                  onRemove={(repository) => updateAutoReviewPublishRepositories(removeRepository(effectiveAutoReviewPublishRepositories(configDraft?.automation), repository))}
                />
                <RepositoryAllowlistCard
                  title={t('review.followUpAllowlist')}
                  description={t('review.followUpAllowlistDescription')}
                  repositories={effectiveAutoFollowUpRepositories(configDraft?.automation)}
                  disabled={!serverConfig?.writable}
                  manageDisabled={allowlistManageDisabled}
                  emptyLabel={allowlistEmptyLabel}
                  onManage={() => setRepositoryAllowlistModal('followUp')}
                  onRemove={(repository) => updateAutoFollowUpRepositories(removeRepository(effectiveAutoFollowUpRepositories(configDraft?.automation), repository))}
                />
                <SettingsRow icon={RotateCcw} label={t('review.followUpRounds')} description={t('review.followUpRoundsDescription')} control={<NumberControl label={t('review.followUpRounds')} value={configDraft?.automation.maxFollowUpRounds ?? 5} disabled={!serverConfig?.writable} min={1} max={20} onChange={(value) => updateAutomationConfig({ maxFollowUpRounds: value })} />} />
              </SettingsGroup>
            </div>
          ) : null}

        </div>
        {repositoryAllowlistModal ? (
          <RepositoryAllowlistModal
            kind={repositoryAllowlistModal}
            repositories={configuredProjects}
            selectedRepositories={
              repositoryAllowlistModal === 'autoReview'
                ? configDraft?.automation.autoReviewRepositories ?? []
                : repositoryAllowlistModal === 'followUp'
                  ? effectiveAutoFollowUpRepositories(configDraft?.automation)
                  : effectiveAutoReviewPublishRepositories(configDraft?.automation)
            }
            targetTerm={reviewTargetTerm}
            publishRouteTerm={publishRouteTerm}
            onCancel={() => setRepositoryAllowlistModal(null)}
            onSave={(selectedRepositories) => {
              if (repositoryAllowlistModal === 'autoReview') {
                updateAutoReviewRepositories(selectedRepositories)
              } else if (repositoryAllowlistModal === 'followUp') {
                updateAutoFollowUpRepositories(selectedRepositories)
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

function SettingsGroup({ title, description, icon, headerAction, children }: { title: string; description?: string; icon?: ReactNode; headerAction?: ReactNode; children: ReactNode }) {
  return (
    <section className="settings-group">
      <header className="settings-group-header">
        <div>
          <strong className="settings-group-title">
            {icon ? <span className="settings-group-title-icon" aria-hidden="true">{icon}</span> : null}
            {title}
          </strong>
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

function ProviderHealthLine({ provider, metaText }: { provider: SourceProviderCardModel; metaText: string }) {
  const { t } = useTranslation('settings')
  const dotTone = (capability: SourceProviderStatus['readCapability']) =>
    capability.available ? 'ok' : capability.state === 'disabled' || capability.state === 'unconfigured' ? 'muted' : 'warn'
  const items = [
    { label: t('sources.card.read'), capability: provider.readCapability },
    { label: t('sources.card.write'), capability: provider.writeCapability },
    { label: t('sources.card.webhook'), capability: provider.webhookCapability },
  ]
  return (
    <div className="provider-health" role="list" aria-label={t('sources.card.capabilities', { provider: providerLabel(provider.provider) })}>
      {items.map((item) => (
        <span
          key={item.label}
          className="provider-health-item"
          role="listitem"
          title={item.capability.available ? undefined : item.capability.reason ?? undefined}
        >
          <span className={`provider-health-dot ${dotTone(item.capability)}`} aria-hidden="true" />
          <strong>{item.label}</strong>
        </span>
      ))}
      {metaText ? <span className="provider-health-meta">{metaText}</span> : null}
    </div>
  )
}

function ProviderOverflowMenu({ disabled, items }: { disabled?: boolean; items: Array<{ key: string; label: string; icon: ReactNode; onSelect: () => void }> }) {
  const { t } = useTranslation('settings')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) {
      return
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [open])
  if (items.length === 0) {
    return null
  }
  return (
    <div className="provider-overflow" ref={wrapRef}>
      <button
        type="button"
        className="icon-button provider-overflow-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('sources.card.moreActions')}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal size={16} />
      </button>
      {open ? (
        <div className="provider-overflow-menu" role="menu">
          {items.map((item) => (
            <button key={item.key} type="button" role="menuitem" onClick={() => { setOpen(false); item.onSelect() }}>
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
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
  const { t } = useTranslation('settings')
  const intervalSeconds = schedule?.intervalSeconds ?? sourceSyncScheduleDefaultIntervalSeconds
  const enabled = schedule?.enabled ?? false
  const readAvailable = schedule?.readAvailable ?? provider.readCapability.available
  const disabledReason = schedule?.disabledReason ?? provider.readCapability.reason ?? t('sources.schedule.defaultDisabledReason')
  const controlsDisabled = saving || !readAvailable
  const summary = !readAvailable
    ? disabledReason
    : enabled
      ? t('sources.schedule.every', { interval: formatScheduleInterval(intervalSeconds), nextRun: formatScheduleNextRun(schedule?.nextRunAt) })
      : t('sources.schedule.offInterval', { interval: formatScheduleInterval(intervalSeconds) })
  const failure = schedule?.lastErrorMessage ?? null

  return (
    <section className="settings-row source-schedule-panel" aria-label={t('sources.schedule.ariaLabel', { provider: provider.displayName })}>
      <span className="settings-row-icon source-schedule-icon">
        <Clock size={15} />
      </span>
      <span className="settings-row-copy source-schedule-copy">
        <strong>{t('sources.schedule.scheduledSync')}</strong>
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
          {saving ? t('sources.schedule.saving') : enabled ? t('sources.schedule.on') : t('sources.schedule.off')}
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
  const { t } = useTranslation('settings')
  const preset = sourceSyncSchedulePresets().find((option) => option.value === String(intervalSeconds))
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
        label={t('sources.schedule.interval')}
        value={selected}
        disabled={disabled}
        options={sourceSyncSchedulePresets()}
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
            label={t('sources.schedule.customInterval')}
            value={customMinutes}
            disabled={disabled}
            min={Math.ceil(sourceSyncScheduleMinSeconds / 60)}
            max={Math.floor(sourceSyncScheduleMaxSeconds / 60)}
            onChange={(minutes) => onChange(minutes * 60)}
          />
          <small>{t('sources.schedule.minutesAbbrev')}</small>
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
  const { t } = useTranslation('settings')
  const projectRuns = job?.projects ?? []
  const completed = job ? `${job.projectsCompleted}/${job.projectsTotal}` : '0/0'
  const summary = job
    ? t('sources.syncPanel.summary', { completed, term: projectTerm, issues: job.issuesImported, reviewTargets: job.reviewTargetsImported, reviewTerm: reviewTargetTerm, comments: job.commentsImported })
    : t('sources.syncPanel.noActiveSync')
  return (
    <section className="settings-row github-sync-panel source-sync-panel" aria-label={t('sources.syncPanel.scanProgress', { provider: providerLabel(provider) })}>
      <span className="settings-row-icon github-sync-icon">
        {sourceSyncStatusIcon(job)}
      </span>
      <span className="settings-row-copy github-sync-copy">
        <strong>{job ? sourceSyncJobStatusLabel(job.status) : t('sources.syncPanel.idle')}</strong>
        <small>{summary}</small>
        {pendingRestart ? <small className="github-sync-warning">{t('sources.syncPanel.pendingRestart')}</small> : null}
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
  const { t } = useTranslation('settings')
  const phase = run.completedAt ? t('sources.phase.completedAt', { phase: sourceProjectPhaseLabel(run), time: relativeTime(run.completedAt) }) : sourceProjectPhaseLabel(run)
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
        {t('sources.syncPanel.rowCounts', { issues: run.issuesImported, reviewTargets: run.reviewTargetsImported, reviewTerm: reviewTargetTerm, comments: run.commentsImported })}
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
  const { t } = useTranslation('settings')
  const providerName = providerLabel(card.provider)
  const projectPlaceholder = card.provider === 'gitlab' ? t('projects.gitlabPlaceholder') : t('projects.githubPlaceholder')
  const gitLabStatus = gitLabProfile ? gitLabProfileStatus(gitLabProfile, sourceProject) : null
  return (
    <div className="repository-card">
      <header className="repository-card-header">
        <span className="repository-card-heading">
          <span className="repository-card-provider-icon" aria-hidden="true">
            {card.provider === 'gitlab' ? <GitlabGlyph size={15} /> : <GithubGlyph size={15} />}
          </span>
          <span className="repository-card-heading-copy">
            <strong>{card.projectPath || t('projects.card.newProject', { provider: providerName })}</strong>
            <small>{card.canonicalKey || t('projects.card.canonicalHint')}</small>
          </span>
        </span>
        <span className="settings-actions">
          {gitLabStatus ? <StatusPill tone={gitLabStatus.tone} label={gitLabStatus.label} /> : null}
          {card.workspace ? <StatusPill tone={workspaceTone(card.workspace)} label={healthLabel(card.workspace.health)} /> : <StatusPill tone="muted" label={t('projects.card.notProbed')} />}
          <Tooltip content={t('projects.card.removeProject')}>
            <button className="icon-button repository-remove-button" type="button" aria-label={t('projects.card.removeNamed', { name: card.projectPath || t('projects.card.removeFallback') })} disabled={disabled} onClick={onRemove}>
              <Trash2 size={14} />
            </button>
          </Tooltip>
        </span>
      </header>
      <div className="repository-card-fields">
        <label>
          <span>{t('projects.card.provider')}</span>
          <SelectControl label={t('projects.card.providerLabel')} value={card.provider} disabled={disabled} options={sourceProviderOptions} onChange={(value) => onProviderChange(value as SourceProviderId)} />
        </label>
        <label>
          <span>{card.provider === 'gitlab' ? t('projects.card.gitlabProject') : t('projects.card.githubRepository')}</span>
          <TextControl value={card.projectPath} placeholder={projectPlaceholder} disabled={disabled} onChange={onProjectPathChange} />
        </label>
        <label>
          <span>{t('projects.card.dotcraftWorkspace')}</span>
          <WorkspacePathControl value={card.workspacePath} placeholder={t('projects.card.workspaceAbsolute')} disabled={disabled} canBrowse={canBrowseWorkspace} onChange={onWorkspacePathChange} onBrowse={onBrowseWorkspace} />
        </label>
      </div>
      {card.provider === 'gitlab' && gitLabProfile ? (
        <div className="gitlab-project-profile-fields" aria-label={t('projects.card.gitlabProfile', { name: card.projectPath })}>
          <label>
            <span>{t('projects.card.tokenKind')}</span>
            <TextControl value={gitLabProfile.tokenKind} placeholder={t('projects.card.tokenKindPlaceholder')} disabled={disabled} onChange={onGitLabProfileTokenKindChange} />
          </label>
          <ProjectSecretField label={t('projects.card.gitlabToken')} field={gitLabProfile.secrets.token} disabled={disabled} onChange={(next) => onGitLabProfileSecretChange('token', next)} />
          <ProjectSecretField label={t('projects.card.webhookSecret')} field={gitLabProfile.secrets.webhookSecret} disabled={disabled} onChange={(next) => onGitLabProfileSecretChange('webhookSecret', next)} />
          <ProjectSecretField label={t('projects.card.signingToken')} field={gitLabProfile.secrets.webhookSigningToken} disabled={disabled} onChange={(next) => onGitLabProfileSecretChange('webhookSigningToken', next)} />
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
  const { t } = useTranslation('settings')
  return (
    <div className="github-installation-profile-list" aria-label={t('projects.installations.ariaLabel')}>
      <header className="github-installation-profile-list-header">
        <span>
          <strong>{t('projects.installations.title')}</strong>
          <small>{t('projects.installations.description')}</small>
        </span>
        <Tooltip content={t('projects.installations.detectTooltip')}>
          <button className="icon-button repository-remove-button" type="button" aria-label={t('projects.installations.detectAria')} disabled={disabled} onClick={onDetect}>
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
                <small>{t('projects.installations.meta', { instance: row.instance, count: row.repositories.length, repositoryTerm: row.repositories.length === 1 ? t('projects.installations.repositorySingular') : t('projects.installations.repositoryPlural') })}</small>
                {row.warning ? <small className="github-installation-profile-warning">{row.warning.message}</small> : null}
              </span>
              <TextControl
                value={row.installationId}
                placeholder={t('projects.installations.installationId')}
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
  const { t } = useTranslation('settings')
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
  const toggleLabel = revealed ? t('common.hide', { label }) : t('common.show', { label })

  return (
    <label className="gitlab-project-secret-field">
      <span>{label}</span>
      <span className="secret-input-shell">
        <input
          aria-label={t('credentials.secret.value', { label })}
          className="settings-input secret-value"
          type={revealed ? 'text' : 'password'}
          value={draftValue}
          disabled={disabled}
          placeholder={field.configured ? t('credentials.secret.configuredPlaceholder') : t('credentials.secret.emptyPlaceholder')}
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
  const { t } = useTranslation('settings')
  const browseDisabled = disabled || !canBrowse
  return (
    <span className="workspace-path-control">
      <TextControl value={value} placeholder={placeholder} disabled={disabled} onChange={onChange} commitOnBlur={commitOnBlur} />
      <Tooltip content={canBrowse ? t('projects.workspacePicker.available') : t('projects.workspacePicker.unavailable')}>
        <button
          className="icon-button workspace-browse-button"
          type="button"
          aria-label={t('projects.workspacePicker.choose')}
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
  const { t } = useTranslation('settings')
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
    ? t('credentials.secret.newValue')
    : field.configured
      ? t('credentials.secret.configured')
      : t('credentials.secret.empty')
  const inputId = `settings-secret-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const toggleLabel = revealed ? t('common.hide', { label }) : t('common.show', { label })
  const valueLabel = t('credentials.secret.value', { label })
  const placeholderText = field.configured ? t('credentials.secret.configuredPlaceholder') : t('credentials.secret.emptyPlaceholder')
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
                aria-label={valueLabel}
                className={`settings-textarea secret-value${revealed ? '' : ' masked'}`}
                value={draftValue}
                disabled={disabled}
                rows={3}
                placeholder={placeholderText}
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
                aria-label={valueLabel}
                className="settings-input secret-value"
                type={revealed ? 'text' : 'password'}
                value={draftValue}
                disabled={disabled}
                placeholder={placeholderText}
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
  const { t } = useTranslation('settings')
  const normalized = normalizeRepositoryList(repositories)

  return (
    <section className="repository-allowlist-card">
      <header className="repository-allowlist-card-header">
        <span>
          <strong>{title}</strong>
          <small>{normalized.length === 1 ? t('review.allowlistCard.includedSingular', { count: normalized.length }) : t('review.allowlistCard.includedPlural', { count: normalized.length })}</small>
          <small>{description}</small>
        </span>
        <button className="primary-button inline compact-row-action settings-action-button" type="button" disabled={manageDisabled} onClick={onManage}>
          <ListChecks size={14} />
          {t('review.allowlistCard.manage')}
        </button>
      </header>
      <div className="repository-allowlist-card-body">
        {normalized.length ? (
          normalized.map((repository) => (
            <div className="repository-allowlist-row" key={repository}>
              <strong>{repository}</strong>
              <Tooltip content={t('review.allowlistCard.removeTooltip', { name: repository })}>
                <button className="icon-button repository-allowlist-remove" type="button" aria-label={t('review.allowlistCard.removeAria', { name: repository })} disabled={disabled} onClick={() => onRemove(repository)}>
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
  const { t } = useTranslation('settings')
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

  const title = kind === 'autoReview'
    ? t('review.modal.autoReviewTitle')
    : kind === 'followUp'
      ? t('review.modal.followUpTitle')
      : t('review.modal.publishTitle')
  const description = kind === 'autoReview'
    ? t('review.modal.autoReviewDescription', { term: targetTerm })
    : kind === 'followUp'
      ? t('review.modal.followUpDescription')
      : t('review.modal.publishDescription', { route: publishRouteTerm })
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
          <Tooltip content={t('review.modal.close')}>
            <button className="icon-button" type="button" aria-label={t('review.modal.close')} onClick={onCancel}>
              <X size={16} />
            </button>
          </Tooltip>
        </header>
        <label className="settings-repository-search">
          <Search size={15} />
          <input
            ref={searchRef}
            value={query}
            placeholder={t('review.modal.searchPlaceholder')}
            aria-label={t('review.modal.searchAria')}
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
            <p className="settings-repository-picker-empty">{normalizedRepositories.length ? t('review.modal.noMatch') : t('review.modal.noConfigured')}</p>
          )}
        </div>
        <footer className="settings-repository-modal-footer">
          <button className="secondary-button inline compact-row-action settings-action-button" type="button" onClick={onCancel}>
            {t('review.modal.cancel')}
          </button>
          <button className="primary-button inline compact-row-action settings-action-button" type="submit">
            <Check size={14} />
            {t('review.modal.apply', { count: draftSelection.length })}
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
  const { t } = useTranslation('settings')
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
              <Tooltip content={t('common.remove', { name: label })}>
                <button type="button" aria-label={t('common.remove', { name: label })} disabled={disabled} onClick={() => onChange(removeLabel(normalizedLabels, label))}>
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
          aria-label={t('worktree.automation.labelInput', { label: ariaLabel })}
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
  const { t } = useTranslation('settings')
  if (saveState === 'idle') {
    return null
  }

  if (saveState === 'failed') {
    return (
      <span className="settings-autosave-status failed" role="status">
        <XCircle size={13} />
        <span>{t('autosave.saveFailed')}</span>
        <button type="button" onClick={onRetry}>{t('autosave.retry')}</button>
      </span>
    )
  }

  return (
    <span className={`settings-autosave-status ${saveState}`} role="status">
      {saveState === 'saving' ? <RefreshCw size={13} className="spin-icon" /> : <CheckCircle2 size={13} />}
      <span>{saveState === 'saving' ? t('autosave.saving') : t('autosave.saved')}</span>
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
  return <NumberStepperControl label={label ?? i18n.t('settings:control.number')} value={value} disabled={disabled} min={min} max={max} onChange={onChange} />
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
  const { t } = useTranslation('settings')
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
          aria-label={t('control.increase', { label })}
          disabled={incrementDisabled}
          onClick={() => changeBy(1)}
        >
          <ChevronUp size={12} />
        </button>
        <button
          className="number-stepper-button"
          type="button"
          tabIndex={-1}
          aria-label={t('control.decrease', { label })}
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

function secondsDurationUnits(): DurationUnit[] {
  return [
    { value: 'seconds', label: i18n.t('settings:duration.sec'), multiplier: 1 },
    { value: 'minutes', label: i18n.t('settings:duration.min'), multiplier: 60 },
    { value: 'hours', label: i18n.t('settings:duration.hr'), multiplier: 3600 },
  ]
}

function hoursDurationUnits(): DurationUnit[] {
  return [
    { value: 'hours', label: i18n.t('settings:duration.hr'), multiplier: 1 },
    { value: 'days', label: i18n.t('settings:duration.days'), multiplier: 24 },
  ]
}

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
  const { t } = useTranslation('settings')
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
        label={t('duration.amount', { label })}
        className="duration-value"
        value={amount}
        disabled={disabled}
        min={minAmount}
        max={maxAmount}
        onChange={(nextAmount) => setAmount(String(nextAmount))}
      />
      <SelectControl
        label={t('duration.unit', { label })}
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
          label={concurrencyControlLabels()[index]}
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
  const { t } = useTranslation('settings')
  return (
    <span className="settings-field-cluster retry-policy-control">
      <label className="settings-labeled-control">
        <span>{t('worktree.retry.attempts')}</span>
        <NumberStepperControl
          className="compact"
          label={t('worktree.retry.attemptsLabel')}
          value={attempts}
          disabled={disabled}
          min={1}
          max={10}
          onChange={(value) => onChange(value, initialBackoffSeconds, maxBackoffSeconds)}
        />
      </label>
      <label className="settings-labeled-control">
        <span>{t('worktree.retry.initial')}</span>
        <DurationControl label={t('worktree.retry.initialBackoff')} value={initialBackoffSeconds} disabled={disabled} min={1} max={300} units={secondsDurationUnits()} onChange={(value) => onChange(attempts, value, maxBackoffSeconds)} />
      </label>
      <label className="settings-labeled-control">
        <span>{t('worktree.retry.maximum')}</span>
        <DurationControl label={t('worktree.retry.maximumBackoff')} value={maxBackoffSeconds} disabled={disabled} min={1} max={1800} units={secondsDurationUnits()} onChange={(value) => onChange(attempts, initialBackoffSeconds, value)} />
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
  const { t } = useTranslation('settings')
  return (
    <span className="settings-field-cluster retention-control">
      <label className="settings-labeled-control">
        <span>{t('worktree.retentionControl.success')}</span>
        <DurationControl label={t('worktree.retentionControl.successLabel')} value={succeededHours} disabled={disabled} min={0} max={24 * 30} units={hoursDurationUnits()} onChange={(value) => onChange(value, failedHours)} />
      </label>
      <label className="settings-labeled-control">
        <span>{t('worktree.retentionControl.failed')}</span>
        <DurationControl label={t('worktree.retentionControl.failedLabel')} value={failedHours} disabled={disabled} min={1} max={24 * 60} units={hoursDurationUnits()} onChange={(value) => onChange(succeededHours, value)} />
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
  const { t } = useTranslation('settings')
  return (
    <span className="settings-field-cluster cleanup-control">
      <button className="toggle-button" aria-pressed={enabled} disabled={disabled} onClick={() => onChange(!enabled, interval)}>
        {enabled ? t('common.on') : t('common.off')}
      </button>
      <DurationControl label={t('worktree.cleanupControl.interval')} value={interval} disabled={disabled} min={5} max={3600} units={secondsDurationUnits()} onChange={(value) => onChange(enabled, value)} />
    </span>
  )
}

function activeSectionCopy(section: SettingsSection) {
  if (section === 'github') return i18n.t('settings:sectionCopy.github')
  if (section === 'gitlab') return i18n.t('settings:sectionCopy.gitlab')
  if (section === 'agents') return i18n.t('settings:sectionCopy.agents')
  if (section === 'worktree') return i18n.t('settings:sectionCopy.worktree')
  if (section === 'review') return i18n.t('settings:sectionCopy.review')
  return i18n.t('settings:sectionCopy.default')
}

function authLabel(value?: string) {
  if (value === 'githubApp+staticToken') return i18n.t('settings:credentials.authLabel.githubAppToken')
  if (value === 'githubApp') return i18n.t('settings:credentials.authLabel.githubApp')
  if (value === 'staticToken') return i18n.t('settings:credentials.authLabel.staticToken')
  if (value === 'projectProfiles') return i18n.t('settings:credentials.authLabel.projectProfiles')
  if (value === 'accessToken' || value === 'token') return i18n.t('settings:credentials.authLabel.token')
  if (value === 'partial') return i18n.t('settings:credentials.authLabel.partial')
  return i18n.t('settings:credentials.authLabel.none')
}

function gitLabWebhookModeLabel(value?: string) {
  if (value === 'signingToken') return i18n.t('settings:credentials.webhookMode.signingToken')
  if (value === 'secretToken') return i18n.t('settings:credentials.webhookMode.secretToken')
  if (value === 'localDevelopmentDisabled') return i18n.t('settings:credentials.webhookMode.localBypass')
  return i18n.t('settings:credentials.webhookMode.none')
}

function healthLabel(health: DotCraftHealth) {
  if (health === 'connected') return i18n.t('settings:agents.health.connected')
  if (health === 'configured') return i18n.t('settings:agents.health.configured')
  return i18n.t('settings:agents.health.unavailable')
}

function workspaceTone(workspace: DotCraftWorkspace): 'ok' | 'warn' | 'muted' {
  if (workspace.connected) return 'ok'
  if (workspace.configured) return 'warn'
  return 'muted'
}

function gitHubProfileStatus(row: GitHubInstallationProfileRow): { tone: 'ok' | 'warn' | 'muted'; label: string } {
  if (row.warning) return { tone: 'warn', label: i18n.t('settings:projects.installations.statusError') }
  if (!row.installationId) return { tone: 'warn', label: i18n.t('settings:projects.installations.statusMissing') }
  if (row.source === 'detected') return { tone: 'ok', label: i18n.t('settings:projects.installations.statusDetected') }
  return { tone: 'ok', label: i18n.t('settings:projects.installations.statusManual') }
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

function relativeTime(value: string) {
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) {
    return value
  }

  const diffSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  if (diffSeconds < 60) return i18n.t('settings:relativeTime.justNow')
  const diffMinutes = Math.round(diffSeconds / 60)
  if (diffMinutes < 60) return i18n.t('settings:relativeTime.minAgo', { value: diffMinutes })
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return i18n.t('settings:relativeTime.hrAgo', { value: diffHours })
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
        reason: githubStatus.writesEnabled ? null : i18n.t('settings:providerReasons.githubWritesDisabled'),
      },
      webhookCapability: {
        available: false,
        state: 'unconfigured',
        reason: i18n.t('settings:providerReasons.webhookInDiagnostics'),
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
        reason: !gitLabConfig.enabled ? i18n.t('settings:providerReasons.gitlabReadDisabled') : gitLabConfig.projects.length ? allTokensConfigured ? null : i18n.t('settings:providerReasons.gitlabReadRequiresTokens') : i18n.t('settings:providerReasons.gitlabNoProjects'),
      },
      writeCapability: {
        available: configured && gitLabConfig.writesEnabled && writeConfigured,
        state: !gitLabConfig.enabled ? 'disabled' : !gitLabConfig.writesEnabled ? 'disabled' : allTokensConfigured ? 'available' : writeConfigured ? 'partial' : 'credentialsMissing',
        reason: !gitLabConfig.enabled ? i18n.t('settings:providerReasons.gitlabProviderDisabled') : !gitLabConfig.writesEnabled ? i18n.t('settings:providerReasons.gitlabWritesDisabled') : allTokensConfigured ? null : i18n.t('settings:providerReasons.gitlabWritesRequireTokens'),
      },
      webhookCapability: {
        available: diagnosticsGitLab?.webhookVerificationMode !== undefined && diagnosticsGitLab.webhookVerificationMode !== 'none',
        state: diagnosticsGitLab?.webhookVerificationMode === 'none' ? 'unconfigured' : diagnosticsGitLab?.webhookVerificationMode ?? 'unconfigured',
        reason: diagnosticsGitLab?.webhookVerificationMode ? gitLabWebhookModeLabel(diagnosticsGitLab.webhookVerificationMode) : i18n.t('settings:providerReasons.gitlabWebhookUnconfigured'),
      },
      configuredProjectCount: gitLabConfig.projects.length,
      lastSyncAt: diagnosticsGitLab?.lastSyncAt ?? null,
      diagnostic: diagnosticsGitLab?.enabled === false ? i18n.t('settings:providerReasons.gitlabReadDisabled') : null,
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
            : { available: false, state: 'credentialsMissing', reason: i18n.t('settings:providerReasons.gitlabProjectTokenMissing') },
          writeCapability: !gitLabConfig.writesEnabled
            ? { available: false, state: 'disabled', reason: i18n.t('settings:providerReasons.gitlabWritesDisabled') }
            : profileTokenConfigured
              ? { available: true, state: 'available', reason: null }
              : { available: false, state: 'credentialsMissing', reason: i18n.t('settings:providerReasons.gitlabProjectTokenMissing') },
          webhookCapability: gitLabProfileWebhookConfigured(profile)
            ? { available: true, state: 'available', reason: null }
            : { available: false, state: 'unconfigured', reason: i18n.t('settings:providerReasons.gitlabProjectWebhookUnconfigured') },
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
  if (!status.hasToken) return { tone: 'warn', label: i18n.t('settings:projects.gitLabStatus.missingToken') }
  if (sourceProject?.readCapability?.state === 'partial' || sourceProject?.readCapability?.available === false) return { tone: 'warn', label: i18n.t('settings:projects.gitLabStatus.profileIssue') }
  return { tone: status.hasWebhook ? 'ok' : 'warn', label: status.hasWebhook ? i18n.t('settings:projects.gitLabStatus.profileReady') : i18n.t('settings:projects.gitLabStatus.noWebhook') }
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

function effectiveAutoFollowUpRepositories(automation?: ServerConfiguration['automation']) {
  if (!automation?.autoFollowUpEnabled) {
    return []
  }

  return automation.autoFollowUpRepositories ?? []
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
    return i18n.t('settings:scheduleFormat.hours', { count: hours })
  }

  if (intervalSeconds % 60 === 0) {
    const minutes = intervalSeconds / 60
    return i18n.t('settings:scheduleFormat.minutes', { count: minutes })
  }

  return i18n.t('settings:scheduleFormat.seconds', { count: intervalSeconds })
}

function formatScheduleNextRun(nextRunAt?: string | null) {
  if (!nextRunAt) {
    return i18n.t('settings:scheduleFormat.notScheduled')
  }

  const timestamp = new Date(nextRunAt).getTime()
  if (Number.isNaN(timestamp)) {
    return i18n.t('settings:scheduleFormat.nextRaw', { value: nextRunAt })
  }

  const diffSeconds = Math.round((timestamp - Date.now()) / 1000)
  if (diffSeconds <= 0) {
    return i18n.t('settings:scheduleFormat.dueNow')
  }

  if (diffSeconds < 60) {
    return i18n.t('settings:scheduleFormat.nextInSec', { count: diffSeconds })
  }

  const diffMinutes = Math.round(diffSeconds / 60)
  if (diffMinutes < 60) {
    return i18n.t('settings:scheduleFormat.nextInMin', { count: diffMinutes })
  }

  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) {
    return i18n.t('settings:scheduleFormat.nextInHr', { count: diffHours })
  }

  return i18n.t('settings:scheduleFormat.nextRaw', { value: new Date(nextRunAt).toLocaleString() })
}

function sourceSyncJobStatusLabel(status: SourceSyncJob['status']) {
  if (status === 'queued') return i18n.t('settings:sources.status.queued')
  if (status === 'running') return i18n.t('settings:sources.status.running')
  if (status === 'succeeded') return i18n.t('settings:sources.status.succeeded')
  if (status === 'partialFailed') return i18n.t('settings:sources.status.partialFailed')
  return i18n.t('settings:sources.status.failed')
}

function sourceProjectPhaseLabel(run: SourceSyncProjectRun) {
  if (run.errorMessage) return i18n.t('settings:sources.phase.failed')
  if (run.phase === 'queued') return i18n.t('settings:sources.phase.queued')
  if (run.phase === 'fetching') return i18n.t('settings:sources.phase.fetching', { name: run.displayName || run.projectPath })
  if (run.phase === 'importing') return i18n.t('settings:sources.phase.importing', { issues: run.issuesDiscovered, reviewTargets: run.reviewTargetsDiscovered })
  if (run.phase === 'done') return run.completedAt ? i18n.t('settings:sources.phase.doneAt', { time: relativeTime(run.completedAt) }) : i18n.t('settings:sources.phase.done')
  return i18n.t('settings:sources.phase.failed')
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
