import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  serverConfigurationFixture,
  settingsDiagnosticsFixture,
  workspaceInventoryFixture,
} from '../../__mocks__/api'
import { setServerBaseUrl } from '../../api'
import { localTaskSourceProjectStorageKey, themeStorageKey } from '../../lib/format'
import { AppShell } from '../AppShell'

describe('AppShell local task created notice', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/#/projects/default')
    window.localStorage.clear()
    setServerBaseUrl(null)
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket)
    installAnimationFrameTimers()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/v1/tasks')) {
        return jsonResponse({ tasks: [], nextCursor: null })
      }
      const sourceResponse = sourceApiResponse(url)
      if (sourceResponse) {
        return sourceResponse
      }
      if (url.includes('/api/v1/dotcraft/status')) {
        return jsonResponse({
          configured: true,
          connected: true,
          health: 'connected',
          autoStart: false,
          workspacePath: '',
          endpoint: '',
          approvalPolicy: 'interrupt',
          runTimeoutSeconds: 1800,
          managedWorktreesEnabled: true,
          worktreeRootPolicy: '',
          globalMaxActiveRuns: 1,
          maxActiveRunsPerRepository: 1,
          maxActiveRunsPerSource: 1,
          message: 'ok',
        })
      }
      if (url.includes('/api/v1/dotcraft/app-binding/status')) {
        return jsonResponse(dotCraftAppBindingStatusResponse())
      }
      if (url.includes('/api/v1/local-tasks') && init?.method === 'POST') {
        return jsonResponse(detailResponse('item-1', 'DEF-1', 'Review local task feedback'))
      }

      return jsonResponse(detailResponse('item-1', 'DEF-1', 'Review local task feedback'))
    }))
  })

  afterEach(() => {
    cleanup()
    Object.defineProperty(window, 'oratorioDesktop', { configurable: true, value: undefined })
    window.localStorage.clear()
    setServerBaseUrl(null)
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('offers configured repositories in the repository filter before task history exists', async () => {
    render(<AppShell />)

    const repositoryFilter = await screen.findByRole('button', { name: 'Repository filter' })
    fireEvent.click(repositoryFilter)

    expect(await screen.findByRole('option', { name: 'example-owner/oratorio' })).toBeInTheDocument()
  })

  it('keeps the initial launch cover until the first board refresh paints', async () => {
    vi.useFakeTimers()
    const taskList = deferred<Response>()
    vi.stubGlobal('fetch', startupFetch({ taskList: taskList.promise }))

    render(<AppShell />)

    const cover = screen.getByRole('status', { name: 'Oratorio launch status' })
    expect(cover).toHaveClass('initial-launch-overlay--loading')
    expect(screen.getByText('Starting Oratorio...')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { name: 'Oratorio' }).length).toBeGreaterThan(0)

    await act(async () => {
      vi.advanceTimersByTime(16)
      await flushAsyncWork()
    })
    await act(async () => {
      vi.advanceTimersByTime(16)
      await flushAsyncWork()
    })

    expect(screen.getByText('Preparing Oratorio board...')).toBeInTheDocument()

    await act(async () => {
      taskList.resolve(jsonResponse({ tasks: [detailResponse('item-1', 'DEF-1', 'Loaded task').item], nextCursor: null }))
      await taskList.promise
      await flushAsyncWork()
    })

    expect(screen.getByRole('status', { name: 'Oratorio launch status' })).toHaveClass('initial-launch-overlay--loading')

    await act(async () => {
      vi.advanceTimersByTime(16)
      await flushAsyncWork()
    })
    await act(async () => {
      vi.advanceTimersByTime(16)
      await flushAsyncWork()
    })
    await act(async () => {
      vi.advanceTimersByTime(16)
      await flushAsyncWork()
    })

    expect(screen.getByRole('status', { name: 'Oratorio launch status' })).toHaveClass('initial-launch-overlay--revealing')

    await act(async () => {
      vi.advanceTimersByTime(360)
      await flushAsyncWork()
    })

    expect(screen.queryByRole('status', { name: 'Oratorio launch status' })).not.toBeInTheDocument()
  })

  it('updates the initial launch message without remounting the logo', async () => {
    vi.useFakeTimers()
    const taskList = deferred<Response>()
    vi.stubGlobal('fetch', startupFetch({ taskList: taskList.promise }))

    render(<AppShell />)

    const cover = screen.getByRole('status', { name: 'Oratorio launch status' })
    const logo = cover.querySelector('.initial-launch-logo')
    expect(logo).toBeInstanceOf(HTMLImageElement)
    expect(screen.getByText('Starting Oratorio...')).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(16)
      await flushAsyncWork()
    })
    await act(async () => {
      vi.advanceTimersByTime(16)
      await flushAsyncWork()
    })

    const updatedCover = screen.getByRole('status', { name: 'Oratorio launch status' })
    expect(screen.getByText('Preparing Oratorio board...')).toBeInTheDocument()
    expect(updatedCover.querySelectorAll('.initial-launch-logo')).toHaveLength(1)
    expect(updatedCover.querySelector('.initial-launch-logo')).toBe(logo)
  })

  it('waits for the desktop server before refreshing the board or opening the stream', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => defaultAppShellResponse(String(input)))
    vi.stubGlobal('fetch', fetchMock)
    Object.defineProperty(window, 'oratorioDesktop', {
      configurable: true,
      value: makeDesktopApi({
        getStatus: vi.fn(async () => ({
          appVersion: 'test',
          platform: 'win32',
          server: desktopServerStatus('starting'),
        })),
      }),
    })

    render(<AppShell />)
    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByRole('status', { name: 'Oratorio launch status' })).toHaveClass('initial-launch-overlay--loading')
    expect(screen.getByText('Starting Oratorio...')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(MockWebSocket.instances).toHaveLength(0)
  })

  it('uses one launch cover while the desktop server moves from starting to preparing', async () => {
    vi.useFakeTimers()
    const taskList = deferred<Response>()
    const fetchMock = startupFetch({ taskList: taskList.promise })
    let serverStatusCallback: ((status: ReturnType<typeof desktopServerStatus>) => void) | null = null
    vi.stubGlobal('fetch', fetchMock)
    Object.defineProperty(window, 'oratorioDesktop', {
      configurable: true,
      value: makeDesktopApi({
        getStatus: vi.fn(async () => ({
          appVersion: 'test',
          platform: 'win32',
          server: desktopServerStatus('starting'),
        })),
        onServerStatusChanged: vi.fn((callback: (status: ReturnType<typeof desktopServerStatus>) => void) => {
          serverStatusCallback = callback
          return vi.fn()
        }),
      }),
    })

    render(<AppShell />)
    const cover = screen.getByRole('status', { name: 'Oratorio launch status' })
    const logo = cover.querySelector('.initial-launch-logo')

    await act(async () => {
      await Promise.resolve()
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(MockWebSocket.instances).toHaveLength(0)

    act(() => {
      serverStatusCallback?.(desktopServerStatus('running', { serverUrl: 'http://127.0.0.1:5087' }))
    })
    await act(async () => {
      vi.advanceTimersByTime(16)
      await flushAsyncWork()
    })
    await act(async () => {
      vi.advanceTimersByTime(16)
      await flushAsyncWork()
    })

    const updatedCover = screen.getByRole('status', { name: 'Oratorio launch status' })
    expect(screen.getByText('Preparing Oratorio board...')).toBeInTheDocument()
    expect(updatedCover).toBe(cover)
    expect(updatedCover.querySelector('.initial-launch-logo')).toBe(logo)
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('http://127.0.0.1:5087/api/v1/tasks?'), undefined)
    expect(MockWebSocket.instances[0]?.url).toBe('ws://127.0.0.1:5087/api/v1/stream')

    await act(async () => {
      taskList.resolve(jsonResponse({ tasks: [detailResponse('item-1', 'DEF-1', 'Loaded task').item], nextCursor: null }))
      await taskList.promise
      await flushAsyncWork()
    })
    await act(async () => {
      vi.advanceTimersByTime(16)
      await flushAsyncWork()
    })
    await act(async () => {
      vi.advanceTimersByTime(16)
      await flushAsyncWork()
    })
    await act(async () => {
      vi.advanceTimersByTime(16)
      await flushAsyncWork()
    })
    await act(async () => {
      vi.advanceTimersByTime(360)
      await flushAsyncWork()
    })

    expect(screen.queryByRole('status', { name: 'Oratorio launch status' })).not.toBeInTheDocument()
  })

  it('keeps the desktop launch cover visible when the server fails before the board loads', async () => {
    let serverStatusCallback: ((status: ReturnType<typeof desktopServerStatus>) => void) | null = null
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => defaultAppShellResponse(String(input)))
    vi.stubGlobal('fetch', fetchMock)
    Object.defineProperty(window, 'oratorioDesktop', {
      configurable: true,
      value: makeDesktopApi({
        getStatus: vi.fn(async () => ({
          appVersion: 'test',
          platform: 'win32',
          server: desktopServerStatus('starting'),
        })),
        onServerStatusChanged: vi.fn((callback: (status: ReturnType<typeof desktopServerStatus>) => void) => {
          serverStatusCallback = callback
          return vi.fn()
        }),
      }),
    })

    render(<AppShell />)
    await act(async () => {
      await Promise.resolve()
    })
    act(() => {
      serverStatusCallback?.(desktopServerStatus('error', { errorMessage: 'Port 5087 is busy.' }))
    })

    expect(screen.getByRole('status', { name: 'Oratorio launch status' })).toHaveClass('initial-launch-overlay--loading')
    expect(screen.getByText('Oratorio could not start: Port 5087 is busy.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(MockWebSocket.instances).toHaveLength(0)
  })

  it('reveals the board even when the initial refresh fails', async () => {
    vi.useFakeTimers()
    const taskList = deferred<Response>()
    vi.stubGlobal('fetch', startupFetch({ taskList: taskList.promise }))

    render(<AppShell />)

    expect(screen.getByRole('status', { name: 'Oratorio launch status' })).toHaveClass('initial-launch-overlay--loading')
    expect(screen.getByText('Starting Oratorio...')).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(16)
      await flushAsyncWork()
    })
    await act(async () => {
      vi.advanceTimersByTime(16)
      await flushAsyncWork()
    })
    expect(screen.getByText('Preparing Oratorio board...')).toBeInTheDocument()

    await act(async () => {
      taskList.reject(new Error('network down'))
      await flushAsyncWork()
    })
    await act(async () => {
      vi.advanceTimersByTime(16)
      await flushAsyncWork()
    })
    await act(async () => {
      vi.advanceTimersByTime(16)
      await flushAsyncWork()
    })
    await act(async () => {
      vi.advanceTimersByTime(16)
      await flushAsyncWork()
    })
    await act(async () => {
      vi.advanceTimersByTime(360)
      await flushAsyncWork()
    })

    expect(screen.queryByRole('status', { name: 'Oratorio launch status' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Oratorio' })).toBeInTheDocument()
  })

  it('strips advanced search qualifiers from closed list query parameters', async () => {
    render(<AppShell />)

    fireEvent.change(await screen.findByLabelText('Search tasks'), {
      target: { value: 's:github l:"good first issue" review' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'All' }))

    await waitFor(() => {
      const closedRequest = vi.mocked(fetch).mock.calls
        .map(([input]) => String(input))
        .find((url) => url.includes('/api/v1/tasks?') && url.includes('includeArchived=true'))
      expect(closedRequest).toBeDefined()

      const params = new URL(closedRequest!, 'http://oratorio.test').searchParams
      expect(params.get('source')).toBe('github')
      expect(params.get('q')).toBe('review')
      expect(params.has('label')).toBe(false)
      expect(closedRequest).not.toContain('s%3Agithub')
      expect(closedRequest).not.toContain('good+first+issue')
    })
  })

  it('hydrates and saves the theme through desktop preferences', async () => {
    const setTheme = vi.fn(async () => undefined)
    Object.defineProperty(window, 'oratorioDesktop', {
      configurable: true,
      value: makeDesktopApi({
        getTheme: vi.fn(async () => 'dark' as const),
        setTheme,
      }),
    })

    render(<AppShell />)

    await waitFor(() => expect(document.querySelector('.oratorio-desktop-frame')).toHaveAttribute('data-theme', 'dark'))
    expect(setTheme).not.toHaveBeenCalled()

    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }))
    await screen.findByRole('heading', { name: 'General' })
    fireEvent.click(screen.getByRole('button', { name: 'Light' }))

    await waitFor(() => expect(setTheme).toHaveBeenCalledWith('light'))
  })

  it('shows connection consent for connect handoffs', async () => {
    let handoffCallback: ((url: string) => void) | null = null
    setServerBaseUrl('http://127.0.0.1:5087')
    const desktop = makeDesktopApi({
      onAppBindingHandoff: vi.fn(async (callback: (url: string) => void) => {
        handoffCallback = callback
        return vi.fn()
      }),
    })
    Object.defineProperty(window, 'oratorioDesktop', { configurable: true, value: desktop })
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/v1/dotcraft/app-binding/inspect')) {
        expect(init?.method).toBe('POST')
        return jsonResponse({
          operation: 'connect',
          connection: {
            displayName: 'Oratorio',
            developerName: 'example-org',
            workspaceLabel: 'F:\\dotcraft',
            userLabel: 'Kai',
            expiresAt: '2026-05-17T00:00:00Z',
          },
          binding: null,
        })
      }
      if (url.includes('/api/v1/dotcraft/app-binding/approve')) {
        return jsonResponse({ operation: 'connect', state: 'connected', bindingId: null })
      }
      return defaultAppShellResponse(url)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<AppShell />)
    await waitFor(() => expect(desktop.onAppBindingHandoff).toHaveBeenCalled())
    await act(async () => {
      handoffCallback?.('oratorio://dotcraft/connect?app=com.dotharness.oratorio&request=req-1&token=token-1')
    })

    expect(await screen.findByRole('dialog', { name: 'Connect DotCraft' })).toBeInTheDocument()
    expect(screen.getByText(/Allow DotCraft workspace/)).toBeInTheDocument()
    expect(screen.getAllByText('F:\\dotcraft').length).toBeGreaterThan(0)
    expect(screen.getByText('Kai')).toBeInTheDocument()
    expect(screen.getByText(/Thread access remains separate/)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/dotcraft/app-binding/approve'),
      expect.anything(),
    )
  })

  it('queues app binding handoffs until the desktop server URL is ready', async () => {
    let handoffCallback: ((url: string) => void) | null = null
    let serverStatusCallback: ((status: ReturnType<typeof desktopServerStatus>) => void) | null = null
    const desktop = makeDesktopApi({
      getStatus: vi.fn(async () => ({
        appVersion: 'test',
        platform: 'win32',
        server: desktopServerStatus('starting'),
      })),
      onServerStatusChanged: vi.fn((callback: (status: ReturnType<typeof desktopServerStatus>) => void) => {
        serverStatusCallback = callback
        return vi.fn()
      }),
      onAppBindingHandoff: vi.fn(async (callback: (url: string) => void) => {
        handoffCallback = callback
        return vi.fn()
      }),
    })
    Object.defineProperty(window, 'oratorioDesktop', { configurable: true, value: desktop })
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/v1/dotcraft/app-binding/inspect')) {
        expect(init?.method).toBe('POST')
        return jsonResponse({
          operation: 'connect',
          connection: {
            displayName: 'Oratorio',
            developerName: 'example-org',
            workspaceLabel: 'F:\\dotcraft',
            userLabel: 'Kai',
            expiresAt: '2026-05-17T00:00:00Z',
          },
          binding: null,
        })
      }
      return defaultAppShellResponse(url)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<AppShell />)
    await waitFor(() => expect(desktop.onAppBindingHandoff).toHaveBeenCalled())
    await act(async () => {
      handoffCallback?.('oratorio://dotcraft/connect?app=com.dotharness.oratorio&request=req-1&token=token-1')
    })

    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/dotcraft/app-binding/inspect'),
      expect.anything(),
    )
    expect(screen.queryByText('Oratorio server URL is not available yet.')).not.toBeInTheDocument()

    act(() => {
      serverStatusCallback?.(desktopServerStatus('running', { serverUrl: 'http://127.0.0.1:5087' }))
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/dotcraft/app-binding/inspect'),
        expect.objectContaining({ method: 'POST' }),
      )
    })
    expect(await screen.findByRole('dialog', { name: 'Connect DotCraft' })).toBeInTheDocument()
    expect(screen.getByText(/Allow DotCraft workspace/)).toBeInTheDocument()
  })

  it('auto-accepts bind handoffs without showing thread consent', async () => {
    let handoffCallback: ((url: string) => void) | null = null
    setServerBaseUrl('http://127.0.0.1:5087')
    const desktop = makeDesktopApi({
      onAppBindingHandoff: vi.fn(async (callback: (url: string) => void) => {
        handoffCallback = callback
        return vi.fn()
      }),
    })
    Object.defineProperty(window, 'oratorioDesktop', { configurable: true, value: desktop })
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/v1/dotcraft/app-binding/inspect')) {
        expect(init?.method).toBe('POST')
        return jsonResponse({
          operation: 'bind',
          connection: null,
          binding: {
            displayName: 'Oratorio',
            developerName: 'example-org',
            threadId: 'thread-1',
            threadTitle: 'Board review',
            requestedScopes: ['board.read'],
            scopeCatalog: [],
            toolCatalog: [],
            expiresAt: '2026-05-17T00:00:00Z',
          },
        })
      }
      if (url.includes('/api/v1/dotcraft/app-binding/approve')) {
        expect(init?.method).toBe('POST')
        return jsonResponse({ operation: 'bind', state: 'active', bindingId: 'binding-1' })
      }
      return defaultAppShellResponse(url)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<AppShell />)
    await waitFor(() => expect(desktop.onAppBindingHandoff).toHaveBeenCalled())
    await act(async () => {
      handoffCallback?.('oratorio://dotcraft/bind?app=com.dotharness.oratorio&request=bind-1&token=token-1')
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/dotcraft/app-binding/approve'),
        expect.objectContaining({ method: 'POST' }),
      )
    })
    expect(screen.queryByRole('dialog', { name: 'Bind DotCraft thread' })).not.toBeInTheDocument()
    expect(await screen.findByText('DotCraft tools enabled for this thread.')).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: /Connected to DotCraft/ })).toBeInTheDocument()
  })

  it('uses the launch query theme before stored renderer theme on the first desktop render', () => {
    window.history.replaceState(null, '', '/?serverUrl=http%3A%2F%2F127.0.0.1%3A5087&theme=dark#/projects/default')
    window.localStorage.setItem(themeStorageKey, 'light')
    Object.defineProperty(window, 'oratorioDesktop', {
      configurable: true,
      value: makeDesktopApi(),
    })

    render(<AppShell />)

    expect(document.querySelector('.oratorio-desktop-frame')).toHaveAttribute('data-theme', 'dark')
    expect(screen.getByRole('status', { name: 'Oratorio launch status' })).toHaveClass('initial-launch-overlay--loading')
    expect(screen.getByText('Starting Oratorio...')).toBeInTheDocument()
  })

  it('shows an actionable created notice that opens the task drawer', async () => {
    render(<AppShell />)

    fireEvent.click(await screen.findByRole('button', { name: 'New local task' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Review local task feedback' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))

    const notice = await screen.findByRole('button', {
      name: /New task "Review local task feedback" created\. Click to view details\./,
    })
    expect(notice).toBeInTheDocument()
    expect(notice.querySelector('.ui-notice-icon')).toBeInTheDocument()
    expect(notice.querySelector('.ui-notice-action')).toHaveTextContent('View details')

    fireEvent.click(notice)

    await waitFor(() => expect(window.location.hash).toBe('#/projects/default/tasks/DEF-1'))
    expect(screen.getByRole('complementary', { name: /Task drawer/ })).toBeInTheDocument()
  })

  it('creates local tasks from canonical source projects and remembers the last project', async () => {
    const gitlabProject = 'gitlab:gitlab.example.test/group/project'
    const createdBodies: Array<Record<string, unknown>> = []
    window.localStorage.setItem(localTaskSourceProjectStorageKey, gitlabProject)
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/v1/local-tasks') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>
        createdBodies.push(body)
        return jsonResponse(detailResponse('item-1', 'DEF-1', 'Review GitLab task routing', {
          item: { repository: body.repository },
        }))
      }

      const sourceResponse = sourceApiResponseWithProjects(url)
      if (sourceResponse) {
        return sourceResponse
      }

      return defaultAppShellResponse(url)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<AppShell />)

    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => isSourcesListUrl(String(input)))).toBe(true))
    await act(async () => {
      await flushAsyncWork()
    })
    fireEvent.click(await screen.findByRole('button', { name: 'New local task' }))

    const sourceProjectInput = await screen.findByLabelText('Source project')
    await waitFor(() => expect(sourceProjectInput).toHaveValue(gitlabProject))
    const sourceProjectValues = Array.from(document.querySelectorAll<HTMLOptionElement>('#local-task-source-projects option'))
      .map((option) => option.value)
    expect(sourceProjectValues).toContain('github:github.com/example-owner/oratorio')
    expect(sourceProjectValues).toContain(gitlabProject)
    expect(sourceProjectValues).not.toContain('example-owner/oratorio')

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Review GitLab task routing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))

    await waitFor(() => expect(createdBodies).toHaveLength(1))
    expect(createdBodies[0].repository).toBe(gitlabProject)
    expect(window.localStorage.getItem(localTaskSourceProjectStorageKey)).toBe(gitlabProject)
  })

  it('refreshes the active board when a GitLab source sync job completes', async () => {
    let showGitLabIssue = false
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/v1/tasks')) {
        return jsonResponse({
          tasks: showGitLabIssue
            ? [
              detailResponse('gitlab-issue-1', 'DEF-2', 'Imported GitLab issue', {
                item: {
                  source: 'gitlab',
                  externalId: 'issue:gitlab.example.test/group/project#12',
                  kind: 'issue',
                  repository: 'gitlab:gitlab.example.test/group/project',
                  state: 'discovered',
                  taskStatus: 'todo',
                  boardSortOrder: 0,
                },
              }).item,
            ]
            : [],
          nextCursor: null,
        })
      }

      const sourceResponse = sourceApiResponseWithProjects(url)
      if (sourceResponse) {
        return sourceResponse
      }

      return defaultAppShellResponse(url)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<AppShell />)

    await screen.findByRole('button', { name: 'New local task' })
    actWebSocketOpen()
    await act(async () => {
      await flushAsyncWork()
    })
    const requestCountBeforeSync = taskListRequestCount()

    actWebSocketMessage(sourceSyncJobEvent('running'))
    await act(async () => {
      await flushAsyncWork()
    })
    expect(taskListRequestCount()).toBe(requestCountBeforeSync)

    showGitLabIssue = true
    actWebSocketMessage(sourceSyncJobEvent('succeeded'))

    expect(await screen.findByText('Imported GitLab issue')).toBeInTheDocument()
    expect(taskListRequestCount()).toBeGreaterThan(requestCountBeforeSync)
  })

  it('shows a single top-level restart banner for settings saves', async () => {
    const restartServer = vi.fn(async () => desktopServerStatus('running'))
    Object.defineProperty(window, 'oratorioDesktop', {
      configurable: true,
      value: makeDesktopApi({ restartServer }),
    })
    setServerBaseUrl('http://127.0.0.1:5087')
    vi.stubGlobal('fetch', settingsAppShellFetch())
    window.history.replaceState(null, '', '/#/settings/projects')

    render(<AppShell />)

    await saveSettingsProjectRoute()

    const restartStatus = await screen.findByRole('status', { name: 'Restart required' })
    expect(restartStatus).toHaveClass('settings-server-restart-banner')
    expect(document.querySelectorAll('.settings-server-restart-banner')).toHaveLength(1)
    expect(document.querySelector('.settings-page .settings-server-restart-banner')).not.toBeInTheDocument()
    expect(document.querySelector('.settings-restart-banner')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: /Review/ }))
    expect(await screen.findByRole('heading', { name: 'Review' })).toBeInTheDocument()
    expect(document.querySelectorAll('.settings-server-restart-banner')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Restart server' }))
    await waitFor(() => expect(restartServer).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.queryByRole('status', { name: 'Restart required' })).not.toBeInTheDocument())
  })

  it('keeps the top-level restart banner visible for retry after restart failure', async () => {
    const restartServer = vi.fn(async () => {
      throw new Error('restart failed')
    })
    Object.defineProperty(window, 'oratorioDesktop', {
      configurable: true,
      value: makeDesktopApi({ restartServer }),
    })
    setServerBaseUrl('http://127.0.0.1:5087')
    vi.stubGlobal('fetch', settingsAppShellFetch())
    window.history.replaceState(null, '', '/#/settings/projects')

    render(<AppShell />)

    await saveSettingsProjectRoute()
    fireEvent.click(await screen.findByRole('button', { name: 'Restart server' }))

    await waitFor(() => expect(restartServer).toHaveBeenCalledOnce())
    expect(await screen.findByRole('button', { name: 'Retry restart' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Restart required' })).toHaveClass('settings-server-restart-banner')
  })

  it('shows manual restart copy when no desktop restart API is available', async () => {
    setServerBaseUrl('http://127.0.0.1:5087')
    vi.stubGlobal('fetch', settingsAppShellFetch())
    window.history.replaceState(null, '', '/#/settings/projects')

    render(<AppShell />)

    await saveSettingsProjectRoute()

    expect(await screen.findByText('Saved changes to dotCraft.repositoryWorkspaces need a manual Oratorio server restart.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Restart server' })).not.toBeInTheDocument()
  })

  it('opens the review detail page from the drawer review draft CTA', async () => {
    const detail = detailResponse('item-1', 'DEF-1', 'Review local task feedback', {
      item: { state: 'awaitingReview', taskStatus: 'in_review' },
      reviewDrafts: [reviewDraftResponse()],
    })
    stubFetchForDetail(detail)
    window.history.replaceState(null, '', '/#/projects/default/tasks/DEF-1')

    render(<AppShell />)

    fireEvent.click(await screen.findByRole('button', { name: 'Review agent draft' }))

    await waitFor(() => expect(window.location.hash).toBe('#/projects/default/tasks/DEF-1/detail/review'))
  })

  it('shows the GitHub write failure reason when review draft publish is blocked', async () => {
    const initialDetail = detailResponse('item-1', 'DEF-1', 'Review pull request feedback', {
      item: githubPullRequestOverrides(),
      reviewDrafts: [reviewDraftResponse()],
    })
    const failedDetail = detailResponse('item-1', 'DEF-1', 'Review pull request feedback', {
      item: githubPullRequestOverrides(),
      reviewDrafts: [
        {
          ...reviewDraftResponse(),
          status: 'publishFailed',
          sourceWriteId: 'write-1',
        },
      ],
      sourceWrites: [
        sourceWriteResponse({
          writeId: 'write-1',
          status: 'failed',
          errorCode: 'githubWritesDisabled',
          errorMessage: 'GitHub writes are disabled.',
        }),
      ],
    })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/v1/tasks')) {
        return jsonResponse({ tasks: [initialDetail.item], nextCursor: null })
      }
      if (url.includes('/api/v1/sources/github/status')) {
        return jsonResponse({
          configured: true,
          enabled: true,
          repositories: ['example-owner/oratorio'],
          lastSyncAt: null,
          writesEnabled: true,
          writeConfigured: true,
          message: 'ok',
        })
      }
      const sourceResponse = sourceApiResponse(url)
      if (sourceResponse) {
        return sourceResponse
      }
      if (url.includes('/api/v1/dotcraft/status')) {
        return jsonResponse(dotCraftStatusResponse())
      }
      if (url.includes('/api/v1/dotcraft/app-binding/status')) {
        return jsonResponse(dotCraftAppBindingStatusResponse())
      }
      if (url.includes('/api/v1/review-drafts/draft-1/publish') && init?.method === 'POST') {
        return jsonResponse(failedDetail)
      }

      return jsonResponse(initialDetail)
    }))
    window.history.replaceState(null, '', '/#/projects/default/tasks/DEF-1/detail/review')

    render(<AppShell />)

    const publish = await screen.findByRole('button', { name: 'Publish' })
    expect(publish).not.toBeDisabled()
    fireEvent.click(publish)

    expect(await screen.findByText('Review draft publish failed: GitHub writes are disabled.')).toBeInTheDocument()
  })

  it('opens and focuses review comments from the drawer comment CTA', async () => {
    const detail = detailResponse('item-1', 'DEF-1', 'Review local task feedback', {
      item: { state: 'awaitingReview', taskStatus: 'in_review' },
      comments: [commentResponse()],
    })
    stubFetchForDetail(detail)
    window.history.replaceState(null, '', '/#/projects/default/tasks/DEF-1')

    render(<AppShell />)

    fireEvent.click(await screen.findByRole('button', { name: /1 comments/i }))

    await waitFor(() => expect(window.location.hash).toBe('#/projects/default/tasks/DEF-1/detail/review#discussion-composer'))
  })

  it('continues polling active tasks after the board stream connects', async () => {
    const activeDetail = detailResponse('item-running', 'DEF-2', 'Running task', {
      item: {
        state: 'running',
        taskStatus: 'in_progress',
        currentRunId: 'run-1',
      },
    })
    stubFetchForDetail(activeDetail)

    render(<AppShell />)

    await screen.findByText('Running task')
    actWebSocketOpen()
    const taskRequestsBefore = taskListRequestCount()

    await waitFor(() => expect(taskListRequestCount()).toBeGreaterThan(taskRequestsBefore), { timeout: 1800 })
  })
})

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function sourceApiResponse(url: string) {
  if (url.includes('/api/v1/sources/github/status')) {
    return jsonResponse({
      configured: true,
      enabled: true,
      repositories: ['example-owner/oratorio'],
      lastSyncAt: null,
      writesEnabled: false,
      writeConfigured: false,
      message: 'ok',
    })
  }
  if (url.includes('/api/v1/sources/github/sync-jobs/active') || url.includes('/api/v1/sources/sync-jobs/active')) {
    return jsonResponse(null)
  }
  if (isSourcesListUrl(url)) {
    return jsonResponse({ generatedAt: '2026-05-10T00:00:00Z', providers: [] })
  }

  return null
}

function sourceApiResponseWithProjects(url: string) {
  if (url.includes('/api/v1/sources/github/status')) {
    return jsonResponse({
      configured: true,
      enabled: true,
      repositories: ['example-owner/oratorio'],
      lastSyncAt: null,
      writesEnabled: false,
      writeConfigured: false,
      message: 'ok',
    })
  }
  if (url.includes('/api/v1/sources/github/sync-jobs/active') || url.includes('/api/v1/sources/sync-jobs/active')) {
    return jsonResponse(null)
  }
  if (isSourcesListUrl(url)) {
    return jsonResponse({
      generatedAt: '2026-05-10T00:00:00Z',
      providers: [
        sourceProviderStatus('github', 'GitHub', 'https://api.github.com', [
          {
            provider: 'github',
            instance: 'github.com',
            projectPath: 'example-owner/oratorio',
            key: 'github:github.com/example-owner/oratorio',
            displayName: 'example-owner/oratorio',
          },
        ]),
        sourceProviderStatus('gitlab', 'GitLab', 'https://gitlab.example.test', [
          {
            provider: 'gitlab',
            instance: 'gitlab.example.test',
            projectPath: 'group/project',
            key: 'gitlab:gitlab.example.test/group/project',
            displayName: 'group/project',
          },
        ]),
      ],
    })
  }

  return null
}

function sourceProviderStatus(provider: string, displayName: string, endpoint: string, projects: unknown[]) {
  return {
    provider,
    displayName,
    endpoint,
    configured: true,
    authenticationState: 'configured',
    readCapability: { available: true, state: 'available', reason: null },
    writeCapability: { available: false, state: 'disabled', reason: null },
    webhookCapability: { available: false, state: 'disabled', reason: null },
    configuredProjectCount: projects.length,
    lastSyncAt: null,
    diagnostic: null,
    projects,
  }
}

function isSourcesListUrl(url: string) {
  try {
    return new URL(url, 'http://oratorio.test').pathname === '/api/v1/sources'
  } catch {
    return url.endsWith('/api/v1/sources')
  }
}

function defaultAppShellResponse(url: string) {
  if (url.includes('/api/v1/tasks')) {
    return jsonResponse({ tasks: [], nextCursor: null })
  }
  const sourceResponse = sourceApiResponse(url)
  if (sourceResponse) {
    return sourceResponse
  }
  if (url.includes('/api/v1/dotcraft/status')) {
    return jsonResponse(dotCraftStatusResponse())
  }
  if (url.includes('/api/v1/dotcraft/app-binding/status')) {
    return jsonResponse(dotCraftAppBindingStatusResponse())
  }

  return jsonResponse(detailResponse('item-1', 'DEF-1', 'Review local task feedback'))
}

function settingsAppShellFetch() {
  const serverConfigurationResponse = structuredClone(serverConfigurationFixture)
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/api/v1/settings/diagnostics')) {
      return jsonResponse(settingsDiagnosticsFixture)
    }
    if (url.includes('/api/v1/settings/server-configuration')) {
      if (init?.method === 'PUT') {
        const request = JSON.parse(String(init.body))
        return jsonResponse({
          configuration: {
            ...serverConfigurationResponse,
            revision: 'revision-updated',
            configuration: request.configuration,
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
    if (url.includes('/api/v1/dotcraft/workspaces')) {
      return jsonResponse(workspaceInventoryFixture)
    }

    return defaultAppShellResponse(url)
  })
}

async function saveSettingsProjectRoute() {
  await screen.findByText('Project routing')
  const workspaceInput = screen.getAllByDisplayValue('C:/example/workspaces/oratorio')[0]
  fireEvent.focus(workspaceInput)
  fireEvent.change(workspaceInput, { target: { value: 'F:\\oratorio' } })
  fireEvent.blur(workspaceInput)
}

function detailResponse(
  itemId: string,
  shortId: string,
  title: string,
  overrides: {
    item?: Record<string, unknown>
    comments?: unknown[]
    reviewDrafts?: unknown[]
    implementationDrafts?: unknown[]
    followUpDrafts?: unknown[]
    sourceWrites?: unknown[]
  } = {},
) {
  return {
    item: {
      itemId,
      workspaceId: 'default',
      source: 'local',
      externalId: 'local-1',
      kind: 'localTask',
      title,
      description: '',
      repository: 'example-owner/oratorio',
      assignee: null,
      branch: null,
      externalUrl: null,
      labels: [],
      sourceUpdatedAt: null,
      isDraft: false,
      headSha: null,
      sourceState: 'unknown',
      sourceClosedAt: null,
      sourceMergedAt: null,
      archiveReason: null,
      state: 'discovered',
      currentRound: 0,
      currentRunId: null,
      latestSummary: 'No agent summary is available yet.',
      checkState: 'notConfigured',
      createdAt: '2026-05-10T00:00:00Z',
      updatedAt: '2026-05-10T00:00:00Z',
      lastSourceSyncAt: null,
      parentItemId: null,
      generatedFromDraftId: null,
      shortId,
      taskStatus: 'todo',
      boardSortOrder: 0,
      ...overrides.item,
    },
    rounds: [],
    runs: [],
    comments: overrides.comments ?? [],
    decisions: [],
    timeline: [],
    sourceWrites: overrides.sourceWrites ?? [],
    reviewDrafts: overrides.reviewDrafts ?? [],
    implementationDrafts: overrides.implementationDrafts ?? [],
    followUpDrafts: overrides.followUpDrafts ?? [],
    sourceSnapshot: null,
  }
}

function stubFetchForDetail(detail: ReturnType<typeof detailResponse>) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/v1/tasks')) {
      return jsonResponse({ tasks: [detail.item], nextCursor: null })
    }
    const sourceResponse = sourceApiResponse(url)
    if (sourceResponse) {
      return sourceResponse
    }
    if (url.includes('/api/v1/dotcraft/status')) {
      return jsonResponse({
        configured: true,
        connected: true,
        health: 'connected',
        autoStart: false,
        workspacePath: '',
        endpoint: '',
        approvalPolicy: 'interrupt',
        runTimeoutSeconds: 1800,
        managedWorktreesEnabled: true,
        worktreeRootPolicy: '',
        globalMaxActiveRuns: 1,
        maxActiveRunsPerRepository: 1,
        maxActiveRunsPerSource: 1,
        message: 'ok',
      })
    }
    if (url.includes('/api/v1/dotcraft/app-binding/status')) {
      return jsonResponse(dotCraftAppBindingStatusResponse())
    }

    return jsonResponse(detail)
  }))
}

function reviewDraftResponse() {
  return {
    draftId: 'draft-1',
    itemId: 'item-1',
    roundId: 'round-1',
    runId: 'run-1',
    status: 'draft',
    summaryBody: 'Agent review summary.',
    majorCount: 1,
    minorCount: 0,
    suggestionCount: 0,
    warningCount: 0,
    acceptedCount: 0,
    resolvedCount: 0,
    createdAt: '2026-05-10T00:00:00Z',
    updatedAt: '2026-05-10T00:00:00Z',
    publishedAt: null,
    sourceWriteId: null,
    warnings: [],
    comments: [],
  }
}

function sourceWriteResponse(overrides: Record<string, unknown> = {}) {
  return {
    writeId: 'write-1',
    itemId: 'item-1',
    roundId: 'round-1',
    decisionId: null,
    source: 'github',
    kind: 'pullRequestReview',
    intent: 'reviewDraftPublish',
    status: 'pending',
    repository: 'example-owner/oratorio',
    number: 180,
    headSha: 'abc1234',
    requestJson: '{}',
    responseJson: null,
    externalId: null,
    externalUrl: null,
    attemptCount: 0,
    errorCode: null,
    errorMessage: null,
    createdAt: '2026-05-10T00:00:00Z',
    updatedAt: '2026-05-10T00:00:00Z',
    completedAt: null,
    ...overrides,
  }
}

function githubPullRequestOverrides() {
  return {
    source: 'github',
    externalId: 'pr:example-owner/oratorio#180',
    kind: 'pullRequest',
    state: 'awaitingReview',
    taskStatus: 'in_review',
    currentRound: 1,
    checkState: 'attention',
    branch: 'main',
    headSha: 'abc1234',
  }
}

function dotCraftStatusResponse() {
  return {
    configured: true,
    connected: true,
    health: 'connected',
    autoStart: false,
    workspacePath: '',
    endpoint: '',
    approvalPolicy: 'interrupt',
    runTimeoutSeconds: 1800,
    managedWorktreesEnabled: true,
    worktreeRootPolicy: '',
    globalMaxActiveRuns: 1,
    maxActiveRunsPerRepository: 1,
    maxActiveRunsPerSource: 1,
    message: 'ok',
  }
}

function dotCraftAppBindingStatusResponse() {
  return {
    appId: 'com.dotharness.oratorio',
    available: true,
    configured: true,
    connected: false,
    state: 'notConnected',
    workspacePath: 'F:\\dotcraft',
    endpoint: 'ws://127.0.0.1:9100/ws',
    endpointSource: 'hub',
    accountLabel: null,
    connectedAt: null,
    expiresAt: null,
    diagnostic: null,
    message: 'DotCraft has not connected Oratorio.',
  }
}

function commentResponse() {
  return {
    commentId: 'comment-1',
    itemId: 'item-1',
    roundId: null,
    body: 'Please take another look.',
    authorName: 'operator',
    authorKind: 'operator',
    purpose: 'feedback',
    source: null,
    sourceCommentId: null,
    externalUrl: null,
    createdAt: '2026-05-10T00:00:00Z',
  }
}

class MockWebSocket extends EventTarget {
  static OPEN = 1
  static instances: MockWebSocket[] = []
  url: string
  readyState = MockWebSocket.OPEN
  constructor(url: string) {
    super()
    this.url = url
    MockWebSocket.instances.push(this)
  }
  send() {}
  close() {}
}

function actWebSocketOpen() {
  act(() => {
    MockWebSocket.instances[0]?.dispatchEvent(new Event('open'))
  })
}

function actWebSocketMessage(payload: unknown) {
  act(() => {
    MockWebSocket.instances[0]?.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(payload) }))
  })
}

function sourceSyncJobEvent(status: 'running' | 'succeeded') {
  return {
    type: 'source/sync/job.updated',
    payload: {
      jobId: 'source-job-1',
      provider: 'gitlab',
      trigger: 'manual',
      mode: 'incremental',
      status,
      projectsTotal: 1,
      projectsCompleted: status === 'succeeded' ? 1 : 0,
      projectsFailed: 0,
      issuesImported: status === 'succeeded' ? 1 : 0,
      reviewTargetsImported: 0,
      commentsImported: 0,
      skipped: 0,
      errorCode: null,
      errorMessage: null,
      createdAt: '2026-05-10T00:00:00Z',
      updatedAt: status === 'succeeded' ? '2026-05-10T00:01:00Z' : '2026-05-10T00:00:30Z',
      startedAt: '2026-05-10T00:00:00Z',
      completedAt: status === 'succeeded' ? '2026-05-10T00:01:00Z' : null,
      projects: [
        {
          projectRunId: 'project-run-1',
          jobId: 'source-job-1',
          provider: 'gitlab',
          sourceProjectKey: 'gitlab:gitlab.example.test/group/project',
          projectPath: 'group/project',
          displayName: 'group/project',
          status,
          phase: status === 'succeeded' ? 'done' : 'importing',
          issuesDiscovered: 1,
          reviewTargetsDiscovered: 0,
          issuesImported: status === 'succeeded' ? 1 : 0,
          reviewTargetsImported: 0,
          commentsImported: 0,
          skipped: 0,
          errorCode: null,
          errorMessage: null,
          createdAt: '2026-05-10T00:00:00Z',
          updatedAt: status === 'succeeded' ? '2026-05-10T00:01:00Z' : '2026-05-10T00:00:30Z',
          startedAt: '2026-05-10T00:00:00Z',
          completedAt: status === 'succeeded' ? '2026-05-10T00:01:00Z' : null,
        },
      ],
    },
  }
}

function taskListRequestCount() {
  return vi.mocked(fetch).mock.calls
    .map(([input]) => String(input))
    .filter((url) => url.includes('/api/v1/tasks?')).length
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

function installAnimationFrameTimers() {
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    writable: true,
    value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 16),
  })
  Object.defineProperty(window, 'cancelAnimationFrame', {
    configurable: true,
    writable: true,
    value: (id: number) => window.clearTimeout(id),
  })
}

function startupFetch({ taskList }: { taskList: Promise<Response> }) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/v1/tasks')) {
      return taskList
    }
    const sourceResponse = sourceApiResponse(url)
    if (sourceResponse) {
      return sourceResponse
    }
    if (url.includes('/api/v1/dotcraft/status')) {
      return jsonResponse({
        configured: true,
        connected: true,
        health: 'connected',
        autoStart: false,
        workspacePath: '',
        endpoint: '',
        approvalPolicy: 'interrupt',
        runTimeoutSeconds: 1800,
        managedWorktreesEnabled: true,
        worktreeRootPolicy: '',
        globalMaxActiveRuns: 1,
        maxActiveRunsPerRepository: 1,
        maxActiveRunsPerSource: 1,
        message: 'ok',
      })
    }
    if (url.includes('/api/v1/dotcraft/app-binding/status')) {
      return jsonResponse(dotCraftAppBindingStatusResponse())
    }

    return jsonResponse(detailResponse('item-1', 'DEF-1', 'Loaded task'))
  })
}

function desktopServerStatus(
  state: 'stopped' | 'starting' | 'running' | 'error',
  overrides: Partial<{
    serverUrl: string | null
    reusedExistingServer: boolean
    pid: number | null
    errorMessage: string | null
  }> = {},
) {
  return {
    state,
    serverUrl: state === 'running' ? 'http://127.0.0.1:5087' : null,
    reusedExistingServer: false,
    pid: null,
    errorMessage: null,
    ...overrides,
  }
}

function makeDesktopApi(overrides: Partial<Record<string, unknown>> = {}) {
  const windowState = {
    isMaximized: false,
    isFullScreen: false,
    canGoBack: false,
    canGoForward: false,
  }

  return {
    getStatus: vi.fn(async () => ({ appVersion: 'test', platform: 'win32', server: null })),
    restartServer: vi.fn(async () => ({
      state: 'running',
      serverUrl: 'http://127.0.0.1:5087',
      reusedExistingServer: true,
      pid: null,
      errorMessage: null,
    })),
    getTheme: vi.fn(async () => null),
    setTheme: vi.fn(async () => undefined),
    getWindowCloseBehavior: vi.fn(async () => 'minimizeToTray' as const),
    setWindowCloseBehavior: vi.fn(async () => undefined),
    minimizeWindow: vi.fn(async () => undefined),
    toggleMaximizeWindow: vi.fn(async () => windowState),
    closeWindow: vi.fn(async () => undefined),
    getWindowState: vi.fn(async () => windowState),
    onWindowStateChanged: vi.fn(() => vi.fn()),
    onServerStatusChanged: vi.fn(() => vi.fn()),
    goBack: vi.fn(async () => windowState),
    goForward: vi.fn(async () => windowState),
    reload: vi.fn(async () => undefined),
    forceReload: vi.fn(async () => undefined),
    toggleDevTools: vi.fn(async () => undefined),
    resetZoom: vi.fn(async () => undefined),
    zoomIn: vi.fn(async () => undefined),
    zoomOut: vi.fn(async () => undefined),
    toggleFullScreen: vi.fn(async () => windowState),
    onAppBindingHandoff: vi.fn(async () => vi.fn()),
    ...overrides,
  }
}
