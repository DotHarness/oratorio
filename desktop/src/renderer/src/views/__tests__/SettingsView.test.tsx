import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  jsonResponse,
  serverConfigurationFixture,
  settingsDiagnosticsFixture,
  workspaceInventoryFixture,
} from '../../__mocks__/api'
import { setServerBaseUrl } from '../../api'
import { settingsSections } from '../../settingsSections'
import { SettingsView } from '../SettingsView'

const githubStatus = {
  available: true,
  configured: true,
  repositories: ['example-owner/oratorio'],
  lastSyncAt: '2026-05-09T00:00:00Z',
  message: 'GitHub is configured.',
  writesEnabled: true,
  writeConfigured: true,
}

const dotcraftStatus = {
  available: true,
  configured: true,
  connected: true,
  health: 'connected' as const,
  autoStart: true,
  workspacePath: 'C:/example/workspaces/oratorio',
  endpoint: 'ws://127.0.0.1:5089',
  approvalPolicy: 'interrupt',
  runTimeoutSeconds: 1800,
  managedWorktreesEnabled: true,
  worktreeRootPolicy: 'workspace',
  globalMaxActiveRuns: 1,
  maxActiveRunsPerRepository: 1,
  maxActiveRunsPerSource: 1,
  message: 'DotCraft is connected.',
}

describe('SettingsView', () => {
  let lastUpdateRequest: any
  let updateRequests: any[]
  let serverConfigurationResponse: any
  let workspaceInventoryResponse: any

  beforeEach(() => {
    lastUpdateRequest = null
    updateRequests = []
    serverConfigurationResponse = structuredClone(serverConfigurationFixture)
    workspaceInventoryResponse = workspaceInventoryFixture
    setServerBaseUrl('http://127.0.0.1:5087')
    vi.stubGlobal('confirm', vi.fn(() => true))
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.includes('/settings/diagnostics')) {
          return jsonResponse(settingsDiagnosticsFixture)
        }
        if (url.includes('/settings/server-configuration')) {
          if (init?.method === 'PUT') {
            lastUpdateRequest = JSON.parse(String(init.body))
            updateRequests.push(lastUpdateRequest)
            const savedConfiguration = redactSavedConfiguration(lastUpdateRequest.configuration)
            const revision = `revision-updated-${updateRequests.length}`
            serverConfigurationResponse = {
              ...serverConfigurationResponse,
              revision,
              configuration: savedConfiguration,
            }
            return jsonResponse({
              configuration: {
                ...serverConfigurationResponse,
                revision,
                configuration: savedConfiguration,
                restartRequired: true,
                restartSignature: 'restart-123',
              },
              changeId: 'change-1',
              appliedFields: ['dotCraft.repositoryWorkspaces'],
              restartRequired: true,
              restartSignature: 'restart-123',
            })
          }

          return jsonResponse(serverConfigurationResponse)
        }
        if (url.includes('/dotcraft/workspaces')) {
          return jsonResponse(workspaceInventoryResponse)
        }

        return jsonResponse({}, { status: 404 })
      }),
    )
  })

  afterEach(() => {
    cleanup()
    Object.defineProperty(window, 'oratorioDesktop', { configurable: true, value: undefined })
    setServerBaseUrl(null)
    vi.unstubAllGlobals()
  })

  it('renders only meaningful local preferences in General', async () => {
    renderSettings('/settings/general')

    expect(screen.getByRole('region', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'General' })).toBeInTheDocument()
    expect(screen.getByText('Appearance')).toBeInTheDocument()
    expect(screen.queryByText('Window behavior')).not.toBeInTheDocument()
    expect(screen.queryByText('Developer dispatch')).not.toBeInTheDocument()
    expect(screen.queryByText('Mock outcome')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Discard' })).not.toBeInTheDocument()
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
  })

  it('does not expose Diagnostics as a Settings destination', async () => {
    expect(settingsSections.map((section) => section.label)).not.toContain('Diagnostics')

    renderSettings('/settings/diagnostics')

    expect(await screen.findByRole('heading', { name: 'General' })).toBeInTheDocument()
    expect(screen.getByText('Appearance')).toBeInTheDocument()
    expect(screen.queryByText('Redacted diagnostics')).not.toBeInTheDocument()
  })

  it('saves desktop window close behavior from General', async () => {
    const getWindowCloseBehavior = vi.fn(async () => 'minimizeToTray' as const)
    const setWindowCloseBehavior = vi.fn(async () => undefined)
    Object.defineProperty(window, 'oratorioDesktop', {
      configurable: true,
      value: { getWindowCloseBehavior, setWindowCloseBehavior },
    })

    renderSettings('/settings/general')

    expect(await screen.findByText('Window behavior')).toBeInTheDocument()
    await waitFor(() => expect(getWindowCloseBehavior).toHaveBeenCalledOnce())

    fireEvent.click(screen.getByRole('button', { name: 'Quit app' }))

    await waitFor(() => expect(setWindowCloseBehavior).toHaveBeenCalledWith('quitApp'))
  })

  it('edits source project cards into source configuration and workspace draft fields', async () => {
    const onServerRestartRequired = vi.fn()
    renderSettings('/settings/projects', { onServerRestartRequired })

    expect(screen.queryByText('Fallback workspace')).not.toBeInTheDocument()
    const repositoryInput = await screen.findByDisplayValue('example-owner/oratorio')
    const repositoryCard = repositoryInput.closest('.repository-card') as HTMLElement
    const workspaceInput = within(repositoryCard).getByDisplayValue('C:/example/workspaces/oratorio')
    fireEvent.change(workspaceInput, { target: { value: 'C:\\example\\workspaces\\companion-repo' } })
    fireEvent.change(repositoryInput, { target: { value: 'example-owner/companion-repo' } })
    fireEvent.blur(workspaceInput)
    fireEvent.blur(repositoryInput)

    await waitFor(() => expect(lastUpdateRequest).toBeTruthy())
    expect(lastUpdateRequest.configuration.gitHub.repositories).toEqual(['example-owner/companion-repo'])
    expect(lastUpdateRequest.configuration.gitLab.projects).toEqual(['group/subgroup/project'])
    expect(lastUpdateRequest.configuration.dotCraft.repositoryWorkspaces).toMatchObject({
      'example-owner/companion-repo': 'C:\\example\\workspaces\\companion-repo',
      'gitlab:gitlab.example.test/group/subgroup/project': 'C:/example/workspaces/oratorio',
    })
    await waitFor(() => expect(onServerRestartRequired).toHaveBeenCalledWith({
      signature: 'restart-123',
      fields: ['dotCraft.repositoryWorkspaces'],
    }))
    expect(document.querySelector('.settings-restart-banner')).not.toBeInTheDocument()
  })

  it('summarizes project route cards with only the canonical source id', async () => {
    serverConfigurationResponse.configuration.gitHub.repositories = ['example-org/unity-example']
    serverConfigurationResponse.configuration.gitHub.installationProfiles = [
      { instance: 'github.com', owner: 'example-org', installationId: '456', source: 'manual' },
    ]
    serverConfigurationResponse.configuration.gitLab.endpoint = 'https://gitlab.internal.test'
    serverConfigurationResponse.configuration.gitLab.apiBaseUrl = 'https://gitlab.internal.test/api/v4'
    serverConfigurationResponse.configuration.gitLab.projects = ['team/subsystem/example-project']
    serverConfigurationResponse.configuration.dotCraft.repositoryWorkspaces = {
      'github:github.com/example-org/unity-example': 'C:\\example\\workspaces\\unity-example',
      'gitlab:gitlab.internal.test/team/subsystem/example-project': 'C:\\example\\workspaces\\gitlab-example-project',
    }

    renderSettings('/settings/github')

    const githubInput = await screen.findByDisplayValue('example-org/unity-example')
    const githubCard = githubInput.closest('.repository-card') as HTMLElement
    const githubHeader = githubCard.querySelector('.repository-card-header') as HTMLElement
    expect(within(githubHeader).getByText('github:github.com/example-org/unity-example')).toBeInTheDocument()
    expect(githubHeader.querySelectorAll('small')).toHaveLength(1)
    expect(githubHeader.textContent).not.toContain('GitHub · github.com')
    expect(githubHeader.textContent).not.toContain('C:\\example\\workspaces\\unity-example')

    cleanup()
    renderSettings('/settings/gitlab')

    const gitlabInput = await screen.findByDisplayValue('team/subsystem/example-project')
    const gitlabCard = gitlabInput.closest('.repository-card') as HTMLElement
    const gitlabHeader = gitlabCard.querySelector('.repository-card-header') as HTMLElement
    expect(within(gitlabHeader).getByText('gitlab:gitlab.internal.test/team/subsystem/example-project')).toBeInTheDocument()
    expect(gitlabHeader.querySelectorAll('small')).toHaveLength(1)
    expect(gitlabHeader.textContent).not.toContain('GitLab · gitlab.internal.test')
    expect(gitlabHeader.textContent).not.toContain('C:\\example\\workspaces\\gitlab-example-project')
  })

  it('manages GitHub installation profiles from Project routing', async () => {
    serverConfigurationResponse.configuration.gitHub.installationProfiles = []
    renderSettings('/settings/projects')

    expect(await screen.findByText('GitHub installation profiles')).toBeInTheDocument()
    expect(screen.getAllByText('Missing profile').length).toBeGreaterThan(0)
    const profileList = screen.getByText('GitHub installation profiles').closest('.github-installation-profile-list') as HTMLElement
    const profileRow = within(profileList).getByText('example-owner').closest('.github-installation-profile-row') as HTMLElement
    const installationInput = within(profileRow).getByPlaceholderText('Installation ID')
    fireEvent.change(installationInput, { target: { value: '999001' } })
    fireEvent.blur(installationInput)

    await waitFor(() => expect(lastUpdateRequest?.configuration.gitHub.installationProfiles[0]).toMatchObject({
      instance: 'github.com',
      owner: 'example-owner',
      installationId: '999001',
      source: 'manual',
    }))
    expect(lastUpdateRequest.detectGitHubInstallations).toBe(true)
  })

  it('keeps GitHub installation status pills concise in Project routing', async () => {
    serverConfigurationResponse.configuration.gitHub.repositories = ['example-owner/example-project']
    serverConfigurationResponse.configuration.gitHub.installationProfiles = [
      { instance: 'github.com', owner: 'example-owner', installationId: '134339486', source: 'detected' },
    ]
    serverConfigurationResponse.configuration.dotCraft.repositoryWorkspaces = {
      'github:github.com/example-owner/example-project': 'C:\\example\\workspaces\\example-project',
    }

    renderSettings('/settings/projects')

    const projectInput = await screen.findByDisplayValue('example-owner/example-project')
    const projectCard = projectInput.closest('.repository-card') as HTMLElement
    const projectHeader = projectCard.querySelector('.repository-card-header') as HTMLElement
    expect(projectHeader.textContent).not.toContain('Detected')
    expect(projectHeader.textContent).not.toContain('example-owner · Detected')

    const profileList = screen.getByText('GitHub installation profiles').closest('.github-installation-profile-list') as HTMLElement
    expect(within(profileList).getByText('Detected')).toBeInTheDocument()
    expect(within(profileList).queryByText('example-owner · Detected')).not.toBeInTheDocument()
  })

  it('does not expose the legacy global GitHub Installation ID field', async () => {
    renderSettings('/settings/credentials')

    expect(await screen.findByText('GitHub')).toBeInTheDocument()
    expect(screen.queryByText('Installation ID')).not.toBeInTheDocument()
  })

  it('waits for the latest queued project route save before requesting restart', async () => {
    const onServerRestartRequired = vi.fn()
    const pendingUpdates: Array<{
      request: any
      deferred: ReturnType<typeof deferred<Response>>
    }> = []
    const resolveSettingsUpdate = (pending: (typeof pendingUpdates)[number]) => {
      const savedConfiguration = redactSavedConfiguration(pending.request.configuration)
      const revision = `revision-race-${pendingUpdates.indexOf(pending) + 1}`
      serverConfigurationResponse = {
        ...serverConfigurationResponse,
        revision,
        configuration: savedConfiguration,
      }
      pending.deferred.resolve(jsonResponse({
        configuration: {
          ...serverConfigurationResponse,
          revision,
          configuration: savedConfiguration,
          restartRequired: true,
          restartSignature: 'restart-123',
        },
        changeId: 'change-1',
        appliedFields: ['dotCraft.repositoryWorkspaces'],
        restartRequired: true,
        restartSignature: 'restart-123',
      }))
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.includes('/settings/diagnostics')) {
          return jsonResponse(settingsDiagnosticsFixture)
        }
        if (url.includes('/settings/server-configuration')) {
          if (init?.method === 'PUT') {
            const request = JSON.parse(String(init.body))
            const pending = deferred<Response>()
            pendingUpdates.push({ request, deferred: pending })
            return pending.promise
          }

          return jsonResponse(serverConfigurationResponse)
        }
        if (url.includes('/dotcraft/workspaces')) {
          return jsonResponse(workspaceInventoryResponse)
        }

        return jsonResponse({}, { status: 404 })
      }),
    )
    renderSettings('/settings/gitlab', { onServerRestartRequired })

    const projectInput = await screen.findByDisplayValue('group/subgroup/project')
    const projectCard = projectInput.closest('.repository-card') as HTMLElement
    const workspaceInput = within(projectCard).getByDisplayValue('C:/example/workspaces/oratorio')
    fireEvent.focus(workspaceInput)
    fireEvent.change(workspaceInput, { target: { value: 'C:\\example\\workspaces\\first-save' } })
    fireEvent.blur(workspaceInput)
    await waitFor(() => expect(pendingUpdates).toHaveLength(1))

    fireEvent.focus(workspaceInput)
    fireEvent.change(workspaceInput, { target: { value: 'C:\\example\\workspaces\\final-save' } })
    fireEvent.blur(workspaceInput)
    await act(async () => {
      resolveSettingsUpdate(pendingUpdates[0])
      await flushAsyncWork()
    })

    expect(onServerRestartRequired).not.toHaveBeenCalled()
    await waitFor(() => expect(pendingUpdates).toHaveLength(2))
    await act(async () => {
      resolveSettingsUpdate(pendingUpdates[1])
      await flushAsyncWork()
    })

    await waitFor(() => expect(onServerRestartRequired).toHaveBeenCalledOnce())
    expect(pendingUpdates[0].request.configuration.dotCraft.repositoryWorkspaces['gitlab:gitlab.example.test/group/subgroup/project']).toBe('C:\\example\\workspaces\\first-save')
    expect(pendingUpdates[1].request.configuration.dotCraft.repositoryWorkspaces['gitlab:gitlab.example.test/group/subgroup/project']).toBe('C:\\example\\workspaces\\final-save')
  })

  it('uses the desktop folder picker for new source project workspace paths', async () => {
    const selectDirectory = vi.fn(async () => 'C:\\example\\workspaces\\picked-workspace')
    Object.defineProperty(window, 'oratorioDesktop', {
      configurable: true,
      value: { selectDirectory },
    })
    renderSettings('/settings/projects')

    await screen.findByText('Project routing')
    const addRow = document.querySelector('.repository-add-row') as HTMLElement
    fireEvent.change(within(addRow).getByPlaceholderText('owner/name'), { target: { value: 'example-owner/new-repo' } })
    fireEvent.click(within(addRow).getByRole('button', { name: 'Choose workspace folder' }))

    await waitFor(() => expect(selectDirectory).toHaveBeenCalledOnce())
    expect(within(addRow).getByDisplayValue('C:\\example\\workspaces\\picked-workspace')).toBeInTheDocument()

    fireEvent.click(within(addRow).getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(lastUpdateRequest?.configuration.dotCraft.repositoryWorkspaces['example-owner/new-repo']).toBe('C:\\example\\workspaces\\picked-workspace'))
    expect(lastUpdateRequest?.configuration.gitHub.repositories).toContain('example-owner/new-repo')
  })

  it('renders GitHub and GitLab source provider cards with redacted operational status', async () => {
    renderSettings('/settings/github')

    expect(await screen.findByRole('region', { name: 'GitHub sync progress' })).toBeInTheDocument()
    const githubHealth = document.querySelector('.provider-health') as HTMLElement
    expect(githubHealth).toBeTruthy()
    expect(within(githubHealth).getByText('Write')).toBeInTheDocument()

    cleanup()
    renderSettings('/settings/gitlab')

    expect(await screen.findByRole('region', { name: 'GitLab sync progress' })).toBeInTheDocument()
    expect(screen.getByText('https://gitlab.example.test')).toBeInTheDocument()
  })

  it('renders scheduled sync controls with the five-minute default and saves enablement', async () => {
    const updateSourceSyncSchedule = vi.fn(async () => undefined)
    renderSettings('/settings/github', {
      updateSourceSyncSchedule,
      sourceSyncSchedules: {
        github: {
          provider: 'github',
          enabled: false,
          intervalSeconds: 300,
          nextRunAt: null,
          lastScheduledAt: null,
          lastJobId: null,
          lastJobStatus: null,
          lastJobCompletedAt: null,
          lastErrorCode: null,
          lastErrorMessage: 'Previous background pull failed.',
          readAvailable: true,
          disabledReason: null,
          updatedAt: '2026-05-09T00:00:00Z',
        },
      },
    })

    const syncGroup = (await screen.findByText('Sync & schedule')).closest('.settings-group') as HTMLElement

    expect(within(syncGroup).getByText('Scheduled sync')).toBeInTheDocument()
    expect(within(syncGroup).getByText('Off · interval 5 minutes')).toBeInTheDocument()
    expect(within(syncGroup).getByText('Previous background pull failed.')).toBeInTheDocument()

    fireEvent.click(within(syncGroup).getByRole('button', { name: 'Off' }))

    await waitFor(() => expect(updateSourceSyncSchedule).toHaveBeenCalledWith('github', {
      enabled: true,
      intervalSeconds: 300,
    }))
  })

  it('saves scheduled sync interval presets without requiring a server restart', async () => {
    const updateSourceSyncSchedule = vi.fn(async () => undefined)
    const onServerRestartRequired = vi.fn()
    renderSettings('/settings/github', {
      updateSourceSyncSchedule,
      onServerRestartRequired,
      sourceSyncSchedules: {
        github: {
          provider: 'github',
          enabled: true,
          intervalSeconds: 300,
          nextRunAt: '2026-05-09T00:05:00Z',
          lastScheduledAt: null,
          lastJobId: null,
          lastJobStatus: null,
          lastJobCompletedAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          readAvailable: true,
          disabledReason: null,
          updatedAt: '2026-05-09T00:00:00Z',
        },
      },
    })

    const syncGroup = (await screen.findByText('Sync & schedule')).closest('.settings-group') as HTMLElement
    fireEvent.click(within(syncGroup).getByRole('button', { name: 'Scheduled sync interval' }))
    fireEvent.click(screen.getByRole('option', { name: '1 min' }))

    await waitFor(() => expect(updateSourceSyncSchedule).toHaveBeenCalledWith('github', {
      enabled: true,
      intervalSeconds: 60,
    }))
    expect(onServerRestartRequired).not.toHaveBeenCalled()
  })

  it('disables scheduled sync when provider read capability is unavailable', async () => {
    renderSettings('/settings/github', {
      sourceProviders: [{
        provider: 'github',
        displayName: 'GitHub',
        endpoint: 'https://api.github.com',
        configured: false,
        authenticationState: 'none',
        readCapability: {
          available: false,
          state: 'credentialsMissing',
          reason: 'GitHub read sync requires credentials.',
        },
        writeCapability: {
          available: false,
          state: 'credentialsMissing',
          reason: 'GitHub writes require credentials.',
        },
        webhookCapability: {
          available: false,
          state: 'unconfigured',
          reason: 'Webhook secret is missing.',
        },
        configuredProjectCount: 0,
        lastSyncAt: null,
        diagnostic: 'GitHub read sync requires credentials.',
        projects: [],
      }],
      sourceSyncSchedules: {
        github: {
          provider: 'github',
          enabled: false,
          intervalSeconds: 300,
          nextRunAt: null,
          lastScheduledAt: null,
          lastJobId: null,
          lastJobStatus: null,
          lastJobCompletedAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          readAvailable: false,
          disabledReason: 'GitHub read sync requires credentials.',
          updatedAt: '2026-05-09T00:00:00Z',
        },
      },
    })

    const syncGroup = (await screen.findByText('Sync & schedule')).closest('.settings-group') as HTMLElement

    expect(within(syncGroup).getAllByText('GitHub read sync requires credentials.').length).toBeGreaterThan(0)
    expect(within(syncGroup).getByRole('button', { name: 'Off' })).toBeDisabled()
    expect(within(syncGroup).getByRole('button', { name: 'Scheduled sync interval' })).toBeDisabled()
  })

  it('saves GitLab subgroup project routes with canonical workspace keys', async () => {
    renderSettings('/settings/gitlab')

    await screen.findByText('Project routing')
    const addRow = () => document.querySelector('.repository-add-row') as HTMLElement
    fireEvent.change(within(addRow()).getByPlaceholderText('group/project or group/subgroup/project'), { target: { value: 'group/team/project' } })
    fireEvent.change(within(addRow()).getByPlaceholderText('DotCraft workspace path'), { target: { value: 'C:\\example\\workspaces\\gitlab-project' } })
    fireEvent.click(within(addRow()).getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(lastUpdateRequest).toBeTruthy())
    expect(lastUpdateRequest.configuration.gitLab.projects).toContain('group/team/project')
    expect(lastUpdateRequest.configuration.dotCraft.repositoryWorkspaces['gitlab:gitlab.example.test/group/team/project']).toBe('C:\\example\\workspaces\\gitlab-project')
  })

  it('derives GitLab API base URL and project keys from the endpoint', async () => {
    serverConfigurationResponse.configuration.gitLab.endpoint = 'https://gitlab.old.test'
    serverConfigurationResponse.configuration.gitLab.apiBaseUrl = 'https://gitlab.old.test/api/v4'
    serverConfigurationResponse.configuration.gitLab.projects = ['team/subsystem/example-project']
    serverConfigurationResponse.configuration.gitLab.projectProfiles = [
      {
        instance: 'gitlab.old.test',
        projectPath: 'team/subsystem/example-project',
        tokenKind: 'projectAccessToken',
        secrets: {
          token: { configured: true, mode: 'unchanged', value: null },
          webhookSecret: { configured: true, mode: 'unchanged', value: null },
          webhookSigningToken: { configured: false, mode: 'unchanged', value: null },
        },
      },
    ]
    serverConfigurationResponse.configuration.dotCraft.repositoryWorkspaces = {
      'gitlab:gitlab.old.test/team/subsystem/example-project': 'C:\\example\\workspaces\\gitlab-example-project',
    }
    serverConfigurationResponse.configuration.automation.autoReviewRepositories = ['gitlab:gitlab.old.test/team/subsystem/example-project']
    serverConfigurationResponse.configuration.automation.autoReviewPublishEnabled = true
    serverConfigurationResponse.configuration.automation.autoReviewPublishRepositories = ['gitlab:gitlab.old.test/team/subsystem/example-project']

    renderSettings('/settings/gitlab')

    expect(screen.queryByText('API base URL')).not.toBeInTheDocument()

    const endpointInput = await screen.findByDisplayValue('https://gitlab.old.test')
    fireEvent.change(endpointInput, { target: { value: 'https://gitlab.internal.test' } })
    fireEvent.blur(endpointInput)
    expect(screen.getByText('Changing host clears GitLab project profiles on save; new profiles are required after restart.')).toBeInTheDocument()

    await waitFor(() => expect(lastUpdateRequest?.configuration.gitLab.endpoint).toBe('https://gitlab.internal.test'))
    expect(lastUpdateRequest.configuration.gitLab.apiBaseUrl).toBe('https://gitlab.internal.test/api/v4')
    expect(lastUpdateRequest.configuration.gitLab.projectProfiles).toEqual([])
    expect(lastUpdateRequest.configuration.dotCraft.repositoryWorkspaces['gitlab:gitlab.internal.test/team/subsystem/example-project']).toBe('C:\\example\\workspaces\\gitlab-example-project')
    expect(lastUpdateRequest.configuration.dotCraft.repositoryWorkspaces['gitlab:gitlab.old.test/team/subsystem/example-project']).toBeUndefined()
    expect(lastUpdateRequest.configuration.automation.autoReviewRepositories).toEqual(['gitlab:gitlab.internal.test/team/subsystem/example-project'])
    expect(lastUpdateRequest.configuration.automation.autoReviewPublishRepositories).toEqual(['gitlab:gitlab.internal.test/team/subsystem/example-project'])
  })

  it('saves GitHub private key replacements without echoing plaintext after the response', async () => {
    renderSettings('/settings/credentials')

    const privateKeyRow = (await screen.findByText('Private key')).closest('.settings-row') as HTMLElement
    expect(within(privateKeyRow).queryByRole('button', { name: 'Replace' })).not.toBeInTheDocument()
    expect(within(privateKeyRow).queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()

    const privateKeyInput = within(privateKeyRow).getByLabelText('Private key value') as HTMLTextAreaElement
    expect(privateKeyInput).toHaveClass('masked')
    fireEvent.click(within(privateKeyRow).getByRole('button', { name: 'Show Private key' }))
    expect(privateKeyInput).not.toHaveClass('masked')
    fireEvent.change(privateKeyInput, { target: { value: 'super-secret-private-key' } })
    expect(lastUpdateRequest).toBeNull()
    fireEvent.blur(privateKeyInput)

    await waitFor(() => expect(lastUpdateRequest?.configuration.gitHub.secrets.privateKey.value).toBe('super-secret-private-key'))
    expect(lastUpdateRequest?.configuration.gitHub.secrets.token).toBeUndefined()
    expect(window.confirm).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByDisplayValue('super-secret-private-key')).not.toBeInTheDocument())
    expect(within(privateKeyRow).getByText('Configured. Enter a new value to replace it.')).toBeInTheDocument()
  })

  it('saves GitLab token replacements without echoing plaintext after the response', async () => {
    renderSettings('/settings/gitlab')

    const gitLabInput = await screen.findByDisplayValue('group/subgroup/project')
    const gitLabCard = gitLabInput.closest('.repository-card') as HTMLElement
    const tokenInput = within(gitLabCard).getByLabelText('GitLab token value') as HTMLInputElement
    fireEvent.change(tokenInput, { target: { value: 'gitlab-secret-token' } })
    expect(lastUpdateRequest).toBeNull()
    fireEvent.blur(tokenInput)

    await waitFor(() => expect(lastUpdateRequest?.configuration.gitLab.projectProfiles[0].secrets.token.value).toBe('gitlab-secret-token'))
    expect(window.confirm).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByDisplayValue('gitlab-secret-token')).not.toBeInTheDocument())
    expect(tokenInput).toHaveAttribute('placeholder', 'Configured')
  })

  it('does not expose legacy global GitLab secret fields in Credentials', async () => {
    renderSettings('/settings/gitlab')

    const connection = (await screen.findByText('Connection')).closest('.settings-group') as HTMLElement
    expect(within(connection).queryByText('GitLab token')).not.toBeInTheDocument()
    expect(within(connection).queryByText('GitLab webhook secret')).not.toBeInTheDocument()
    expect(within(connection).queryByText('GitLab signing token')).not.toBeInTheDocument()
  })

  it('shows one autosave error and keeps the edited value when saving fails', async () => {
    let failNextUpdate = true
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.includes('/settings/diagnostics')) {
          return jsonResponse(settingsDiagnosticsFixture)
        }
        if (url.includes('/settings/server-configuration')) {
          if (init?.method === 'PUT') {
            lastUpdateRequest = JSON.parse(String(init.body))
            updateRequests.push(lastUpdateRequest)
            if (failNextUpdate) {
              failNextUpdate = false
              return jsonResponse({ error: { code: 'SAVE_FAILED', message: 'Disk is read-only' } }, { status: 500 })
            }
            const savedConfiguration = redactSavedConfiguration(lastUpdateRequest.configuration)
            serverConfigurationResponse = {
              ...serverConfigurationResponse,
              revision: 'revision-retry',
              configuration: savedConfiguration,
            }
            return jsonResponse({
              configuration: serverConfigurationResponse,
              changeId: 'change-retry',
              appliedFields: ['gitHub.endpoint'],
              restartRequired: false,
              restartSignature: null,
            })
          }

          return jsonResponse(serverConfigurationResponse)
        }
        if (url.includes('/dotcraft/workspaces')) {
          return jsonResponse(workspaceInventoryResponse)
        }

        return jsonResponse({}, { status: 404 })
      }),
    )
    renderSettings('/settings/credentials')

    const endpointInput = await screen.findByDisplayValue('https://api.github.com')
    fireEvent.focus(endpointInput)
    fireEvent.change(endpointInput, { target: { value: 'https://api.github.test' } })
    fireEvent.blur(endpointInput)

    expect(await screen.findByText('Disk is read-only')).toBeInTheDocument()
    expect(document.querySelectorAll('.settings-notice.error')).toHaveLength(1)
    expect(screen.getByDisplayValue('https://api.github.test')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(updateRequests).toHaveLength(2))
    expect(lastUpdateRequest.configuration.gitHub.endpoint).toBe('https://api.github.test')
    await waitFor(() => expect(screen.queryByText('Disk is read-only')).not.toBeInTheDocument())
  })

  it('saves the latest queued draft with the updated server revision', async () => {
    let resolveFirstUpdate!: (response: Response) => void
    const firstUpdate = new Promise<Response>((resolve) => {
      resolveFirstUpdate = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.includes('/settings/diagnostics')) {
          return jsonResponse(settingsDiagnosticsFixture)
        }
        if (url.includes('/settings/server-configuration')) {
          if (init?.method === 'PUT') {
            const request = JSON.parse(String(init.body))
            lastUpdateRequest = request
            updateRequests.push(request)
            const revision = `revision-updated-${updateRequests.length}`
            const savedConfiguration = redactSavedConfiguration(request.configuration)
            serverConfigurationResponse = {
              ...serverConfigurationResponse,
              revision,
              configuration: savedConfiguration,
            }
            const response = jsonResponse({
              configuration: {
                ...serverConfigurationResponse,
                revision,
                configuration: savedConfiguration,
              },
              changeId: `change-${updateRequests.length}`,
              appliedFields: ['gitHub.endpoint'],
              restartRequired: false,
              restartSignature: null,
            })
            return updateRequests.length === 1 ? firstUpdate : response
          }

          return jsonResponse(serverConfigurationResponse)
        }
        if (url.includes('/dotcraft/workspaces')) {
          return jsonResponse(workspaceInventoryResponse)
        }

        return jsonResponse({}, { status: 404 })
      }),
    )
    renderSettings('/settings/credentials')

    const endpointInput = await screen.findByDisplayValue('https://api.github.com')
    fireEvent.focus(endpointInput)
    fireEvent.change(endpointInput, { target: { value: 'https://api.github.test' } })
    fireEvent.blur(endpointInput)
    await waitFor(() => expect(updateRequests).toHaveLength(1))

    const appIdInput = screen.getByDisplayValue('123')
    fireEvent.focus(appIdInput)
    fireEvent.change(appIdInput, { target: { value: '999' } })
    fireEvent.blur(appIdInput)
    expect(updateRequests).toHaveLength(1)

    resolveFirstUpdate(
      jsonResponse({
        configuration: {
          ...serverConfigurationResponse,
          revision: 'revision-updated-1',
          configuration: redactSavedConfiguration(updateRequests[0].configuration),
        },
        changeId: 'change-1',
        appliedFields: ['gitHub.endpoint'],
        restartRequired: false,
        restartSignature: null,
      }),
    )

    await waitFor(() => expect(updateRequests).toHaveLength(2))
    expect(updateRequests[1].baseRevision).toBe('revision-updated-1')
    expect(updateRequests[1].configuration.gitHub.endpoint).toBe('https://api.github.test')
    expect(updateRequests[1].configuration.gitHub.appId).toBe('999')
  })

  it('keeps source sync disabled while a server restart is pending', async () => {
    renderSettings('/settings/github', { serverRestartPending: true })

    expect(await screen.findAllByText('Saved source changes need a restart before Sync now can use them.')).not.toHaveLength(0)
    expect(screen.getAllByRole('button', { name: 'Sync now' }).every((button) => button.hasAttribute('disabled'))).toBe(true)
  })

  it('shows Start server when any configured workspace is disconnected', async () => {
    const startDotCraftAppServer = vi.fn(async () => undefined)
    workspaceInventoryResponse = {
      ...workspaceInventoryFixture,
      summary: {
        ...workspaceInventoryFixture.summary,
        total: 2,
        connected: 1,
      },
      workspaces: [
        ...workspaceInventoryFixture.workspaces,
        {
          path: 'C:/example/workspaces/companion-repo',
          label: 'dotcraft',
          isDefault: false,
          repositories: ['example-owner/companion-repo'],
          configured: true,
          connected: false,
          health: 'configured',
          endpoint: 'ws://127.0.0.1:9100/ws',
          endpointSource: 'hub',
          hubManaged: true,
          reason: 'unreachable',
          message: 'DotCraft AppServer is not reachable.',
        },
      ],
    }

    renderSettings('/settings/advanced', { startDotCraftAppServer })

    expect(await screen.findByRole('heading', { name: 'Agents' })).toBeInTheDocument()
    expect(screen.getByText('Agent connection')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Start server' })).toBeInTheDocument()
    expect(screen.queryByText('Lifecycle ownership')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Start server' }))

    await waitFor(() => expect(startDotCraftAppServer).toHaveBeenCalledOnce())
  })

  it('uses themed dropdown labels while saving agent configuration values', async () => {
    renderSettings('/settings/agents')

    await screen.findByText('Agent connection')
    fireEvent.click(screen.getByRole('button', { name: 'Approval policy' }))
    fireEvent.click(screen.getByRole('option', { name: 'Auto approve' }))
    fireEvent.click(screen.getByRole('button', { name: 'Run timeout unit' }))
    fireEvent.click(screen.getByRole('option', { name: 'hr' }))

    await waitFor(() => expect(lastUpdateRequest).toBeTruthy())
    expect(lastUpdateRequest.configuration.dotCraft.approvalPolicy).toBe('autoApprove')
    expect(lastUpdateRequest.configuration.dotCraft.runTimeoutSeconds).toBe(3600)
  })

  it('saves source-project Auto review independently from draft auto-publish and implementation labels', async () => {
    serverConfigurationResponse.configuration.gitHub.repositories = ['example-owner/oratorio', 'example-owner/unity-example']
    serverConfigurationResponse.configuration.dotCraft.repositoryWorkspaces['example-owner/unity-example'] = 'C:/example/workspaces/unity-example'
    renderSettings('/settings/review')

    await screen.findByText('Automatic review')
    expect(screen.getByText('Project allowlist')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Auto review' })).not.toBeInTheDocument()
    const allowlistCard = screen.getByText('Project allowlist').closest('.repository-allowlist-card') as HTMLElement
    fireEvent.click(within(allowlistCard).getByRole('button', { name: 'Manage' }))

    const modal = await screen.findByRole('dialog', { name: 'Select source projects' })
    fireEvent.change(within(modal).getByRole('textbox', { name: 'Search source projects' }), { target: { value: 'oratorio' } })
    expect(within(modal).queryByRole('checkbox', { name: /example-owner\/unity-example/i })).not.toBeInTheDocument()
    fireEvent.click(within(modal).getByRole('checkbox', { name: /example-owner\/oratorio/i }))
    fireEvent.click(within(modal).getByRole('button', { name: 'Apply selection (1 selected)' }))

    await waitFor(() => expect(lastUpdateRequest).toBeTruthy())
    expect(lastUpdateRequest.configuration.automation.autoReviewRepositories).toEqual(['github:github.com/example-owner/oratorio'])
    expect(lastUpdateRequest.configuration.automation.autoReviewPublishRepositories).toEqual([])
    expect(lastUpdateRequest.configuration.automation.autoDispatchAllowLabels).toEqual([])
  })

  it('saves Draft auto-publish from the publish allowlist manager', async () => {
    renderSettings('/settings/review')

    await screen.findByText('Automatic review')
    expect(screen.queryByText('Draft auto-publish')).not.toBeInTheDocument()
    const publishCard = screen.getByText('Publish allowlist').closest('.repository-allowlist-card') as HTMLElement
    fireEvent.click(within(publishCard).getByRole('button', { name: 'Manage' }))

    const modal = await screen.findByRole('dialog', { name: 'Select publish projects' })
    fireEvent.click(within(modal).getByRole('checkbox', { name: /example-owner\/oratorio/i }))
    fireEvent.click(within(modal).getByRole('button', { name: 'Apply selection (1 selected)' }))

    await waitFor(() => expect(lastUpdateRequest).toBeTruthy())
    expect(lastUpdateRequest.configuration.automation.autoReviewPublishEnabled).toBe(true)
    expect(lastUpdateRequest.configuration.automation.autoReviewPublishRepositories).toEqual(['github:github.com/example-owner/oratorio'])
  })

  it('disables Draft auto-publish when the last publish repository is removed', async () => {
    serverConfigurationResponse.configuration.automation.autoReviewPublishEnabled = true
    serverConfigurationResponse.configuration.automation.autoReviewPublishRepositories = ['github:github.com/example-owner/oratorio']

    renderSettings('/settings/review')

    await screen.findByText('Automatic review')
    const publishCard = screen.getByText('Publish allowlist').closest('.repository-allowlist-card') as HTMLElement
    fireEvent.click(within(publishCard).getByRole('button', { name: 'Remove github:github.com/example-owner/oratorio' }))

    await waitFor(() => expect(lastUpdateRequest).toBeTruthy())
    expect(lastUpdateRequest.configuration.automation.autoReviewPublishEnabled).toBe(false)
    expect(lastUpdateRequest.configuration.automation.autoReviewPublishRepositories).toEqual([])
  })

  it('keeps repository allowlist draft unchanged when Manage is cancelled', async () => {
    renderSettings('/settings/review')

    await screen.findByText('Automatic review')
    const allowlistCard = screen.getByText('Project allowlist').closest('.repository-allowlist-card') as HTMLElement
    fireEvent.click(within(allowlistCard).getByRole('button', { name: 'Manage' }))

    const modal = await screen.findByRole('dialog', { name: 'Select source projects' })
    fireEvent.click(within(modal).getByRole('checkbox', { name: /example-owner\/oratorio/i }))
    fireEvent.click(within(modal).getByRole('button', { name: 'Cancel' }))

    expect(lastUpdateRequest).toBeFalsy()
  })

  it('shows empty Review allowlists when no repositories are configured', async () => {
    serverConfigurationResponse.configuration.gitHub.repositories = []
    serverConfigurationResponse.configuration.gitLab.projects = []
    serverConfigurationResponse.configuration.dotCraft.repositoryWorkspaces = {}

    renderSettings('/settings/review')

    await screen.findByText('Automatic review')
    expect(screen.getAllByText('No repositories included.')).toHaveLength(3)
    expect(screen.getAllByRole('button', { name: 'Manage' }).every((button) => button.hasAttribute('disabled'))).toBe(true)
  })

  it('edits auto-dispatch labels as chips from single-line inputs', async () => {
    renderSettings('/settings/worktree')

    await screen.findByText('Automation policy')
    const allowRow = screen.getByText('Auto-dispatch allow labels').closest('.settings-row') as HTMLElement
    const blockRow = screen.getByText('Auto-dispatch block labels').closest('.settings-row') as HTMLElement
    expect(within(allowRow).getByText('All unblocked items')).toBeInTheDocument()
    expect(document.querySelectorAll('textarea.settings-textarea')).toHaveLength(0)

    const allowInput = within(allowRow).getByLabelText('Auto-dispatch allow labels input')
    fireEvent.change(allowInput, { target: { value: ' ready-for-agent ' } })
    fireEvent.keyDown(allowInput, { key: 'Enter' })
    fireEvent.change(allowInput, { target: { value: 'READY-FOR-AGENT' } })
    fireEvent.keyDown(allowInput, { key: 'Enter' })

    const blockInput = within(blockRow).getByLabelText('Auto-dispatch block labels input')
    fireEvent.change(blockInput, { target: { value: 'blocked' } })
    fireEvent.click(within(blockRow).getByRole('button', { name: 'Add block label' }))

    expect(within(allowRow).getByText('ready-for-agent')).toBeInTheDocument()
    expect(within(blockRow).getByText('blocked')).toBeInTheDocument()

    await waitFor(() => expect(lastUpdateRequest).toBeTruthy())
    expect(lastUpdateRequest.configuration.automation.autoDispatchAllowLabels).toEqual(['ready-for-agent'])
    expect(lastUpdateRequest.configuration.automation.autoDispatchBlockLabels).toEqual(['blocked'])
  })

  it('edits numeric settings through themed steppers and duration unit dropdowns', async () => {
    renderSettings('/settings/worktree')

    await screen.findByText('Worktrees and scheduling')
    expect(document.querySelector('select')).not.toBeInTheDocument()
    expect(document.querySelector('input[type="number"]')).not.toBeInTheDocument()

    const implementationTurnsInput = screen.getByRole('spinbutton', { name: 'Implementation turns' })
    fireEvent.focus(implementationTurnsInput)
    fireEvent.change(implementationTurnsInput, { target: { value: '12' } })
    fireEvent.blur(implementationTurnsInput)
    fireEvent.keyDown(screen.getByRole('spinbutton', { name: 'Retry attempts' }), { key: 'ArrowUp' })
    fireEvent.click(screen.getByRole('button', { name: 'Implementation delivery' }))
    fireEvent.click(screen.getByRole('option', { name: 'Auto PR/MR' }))

    await waitFor(() => expect(lastUpdateRequest?.configuration.automation.deliveryPolicy).toBe('autoPr'))
    expect(lastUpdateRequest.configuration.automation.maxImplementationTurns).toBe(10)
    expect(lastUpdateRequest.configuration.automation.deliveryPolicy).toBe('autoPr')
    expect(lastUpdateRequest.configuration.runtime.maxRunAttempts).toBe(3)
  })

  it('renders per-project source sync progress', async () => {
    renderSettings('/settings/github', {
      sourceSyncJobs: {
        github: {
        jobId: 'job-1',
        provider: 'github',
        trigger: 'manual',
        mode: 'incremental',
        status: 'running',
        projectsTotal: 2,
        projectsCompleted: 1,
        projectsFailed: 0,
        issuesImported: 3,
        reviewTargetsImported: 1,
        commentsImported: 4,
        skipped: 0,
        createdAt: '2026-05-09T00:00:00Z',
        updatedAt: '2026-05-09T00:01:00Z',
        startedAt: '2026-05-09T00:00:00Z',
        completedAt: null,
        projects: [
          {
            projectRunId: 'run-1',
            jobId: 'job-1',
            provider: 'github',
            sourceProjectKey: 'github:github.com/example-owner/oratorio',
            projectPath: 'example-owner/oratorio',
            displayName: 'example-owner/oratorio',
            status: 'running',
            phase: 'importing',
            issuesDiscovered: 10,
            reviewTargetsDiscovered: 4,
            issuesImported: 3,
            reviewTargetsImported: 1,
            commentsImported: 4,
            skipped: 0,
            createdAt: '2026-05-09T00:00:00Z',
            updatedAt: '2026-05-09T00:01:00Z',
            startedAt: '2026-05-09T00:00:00Z',
            completedAt: null,
          },
          {
            projectRunId: 'run-2',
            jobId: 'job-1',
            provider: 'github',
            sourceProjectKey: 'github:github.com/example-owner/unity-example',
            projectPath: 'example-owner/unity-example',
            displayName: 'example-owner/unity-example',
            status: 'succeeded',
            phase: 'done',
            issuesDiscovered: 0,
            reviewTargetsDiscovered: 1,
            issuesImported: 0,
            reviewTargetsImported: 1,
            commentsImported: 0,
            skipped: 1,
            createdAt: '2026-05-09T00:00:00Z',
            updatedAt: '2026-05-09T00:01:00Z',
            startedAt: '2026-05-09T00:00:00Z',
            completedAt: '2026-05-09T00:01:00Z',
          },
        ],
      },
      },
    })

    const syncPanel = screen.getByRole('region', { name: 'GitHub sync progress' })
    expect(await within(syncPanel).findByText('Sync running')).toBeInTheDocument()
    expect(within(syncPanel).getByText('1/2 repositories · 3 issues · 1 PRs · 4 comments')).toBeInTheDocument()
    expect(within(syncPanel).getByText('example-owner/oratorio')).toBeInTheDocument()
    expect(within(syncPanel).getByText('example-owner/unity-example')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Syncing' })).toBeDisabled()
  })
})

function renderSettings(initialEntry: string, overrides: Partial<Parameters<typeof SettingsView>[0]> = {}) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/settings/:section"
          element={
            <SettingsView
              theme="dark"
              setTheme={vi.fn()}
              githubStatus={githubStatus}
              dotcraftStatus={dotcraftStatus}
              refreshAll={vi.fn(async () => undefined)}
              syncGitHubSource={vi.fn(async () => undefined)}
              syncGitHubFullRepair={vi.fn(async () => undefined)}
              syncFailedGitHubRepositories={vi.fn(async () => undefined)}
              startDotCraftAppServer={vi.fn(async () => undefined)}
              isSyncing={false}
              isStartingAppServer={false}
              serverRestartPending={false}
              onServerRestartRequired={vi.fn()}
              {...overrides}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

function redactSavedConfiguration(configuration: any) {
  const secrets = configuration.gitHub.secrets
  return {
    ...configuration,
    gitHub: {
      ...configuration.gitHub,
      secrets: {
        privateKey: savedSecret(secrets.privateKey),
        privateKeyPath: savedSecret(secrets.privateKeyPath),
        webhookSecret: savedSecret(secrets.webhookSecret),
      },
    },
    gitLab: {
      ...configuration.gitLab,
      projectProfiles: (configuration.gitLab.projectProfiles ?? []).map((profile: any) => ({
        ...profile,
        secrets: {
          token: savedSecret(profile.secrets.token),
          webhookSecret: savedSecret(profile.secrets.webhookSecret),
          webhookSigningToken: savedSecret(profile.secrets.webhookSigningToken),
        },
      })),
    },
  }
}

function savedSecret(field: any) {
  if (field.mode === 'replace') return { configured: true, mode: 'unchanged', value: null }
  if (field.mode === 'clear') return { configured: false, mode: 'unchanged', value: null }
  return { configured: Boolean(field.configured), mode: 'unchanged', value: null }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

async function flushAsyncWork(turns = 8) {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve()
  }
}
