import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalTaskFormDialog } from '../LocalTaskFormDialog'
import { emptyLocalTaskForm, labelsFromInput } from '../../lib/format'
import type { LocalTaskForm } from '../../lib/types'

describe('LocalTaskFormDialog', () => {
  afterEach(cleanup)

  it('shows routing fields directly with clearer placeholders', () => {
    const { container } = renderDialog()

    expect(screen.queryByText('More fields')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Source project')).toBeInTheDocument()
    expect(screen.getByLabelText('Assignee')).toHaveAttribute('placeholder', 'Pick a recent assignee or leave blank')
    expect(screen.getByPlaceholderText('main')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('codex/oratorio-ui')).not.toBeInTheDocument()
    expect(container.querySelector('datalist')).not.toBeInTheDocument()
  })

  it('shows custom routing suggestion menus while keeping manual input free-form', () => {
    renderDialog({ assignees: ['mika'], branches: ['feature/local-task-form', 'main'] })

    const assigneeInput = screen.getByLabelText('Assignee') as HTMLInputElement
    fireEvent.focus(assigneeInput)
    expect(screen.getByRole('option', { name: 'mika' })).toBeInTheDocument()
    fireEvent.change(assigneeInput, { target: { value: 'codex' } })
    expect(assigneeInput).toHaveValue('codex')

    fireEvent.keyDown(assigneeInput, { key: 'Escape' })
    const branchInput = screen.getByLabelText('Base branch') as HTMLInputElement
    fireEvent.focus(branchInput)
    expect(screen.getByRole('option', { name: 'feature/local-task-form' })).toBeInTheDocument()
    fireEvent.change(branchInput, { target: { value: 'release/next' } })
    expect(branchInput).toHaveValue('release/next')
  })

  it('offers canonical source projects while keeping manual input free-form', () => {
    renderDialog()

    const sourceProject = screen.getByLabelText('Source project') as HTMLInputElement
    expect(sourceProject).toHaveValue('GitHub: example-owner/oratorio')
    fireEvent.focus(sourceProject)
    fireEvent.mouseDown(screen.getByRole('option', { name: 'GitLab: group/project' }))
    expect(sourceProject).toHaveValue('GitLab: group/project')
    fireEvent.change(sourceProject, { target: { value: 'group/project' } })
    expect(sourceProject).toHaveValue('group/project')
    expect(screen.getByRole('option', { name: 'GitLab: group/project' })).toBeInTheDocument()
  })

  it('fills and clears assignee and base branch from quick-pick chips', () => {
    renderDialog({ assignees: ['mika'], branches: ['feature/local-task-form', 'main'] })

    const assigneeInput = screen.getByLabelText('Assignee') as HTMLInputElement
    fireEvent.click(screen.getByRole('button', { name: /mika/ }))
    expect(assigneeInput).toHaveValue('mika')
    fireEvent.click(screen.getByRole('button', { name: /mika/ }))
    expect(assigneeInput).toHaveValue('')

    const branchInput = screen.getByPlaceholderText('main') as HTMLInputElement
    fireEvent.click(screen.getByRole('button', { name: /feature\/local-task-form/ }))
    expect(branchInput).toHaveValue('feature/local-task-form')
  })

  it('fires create-intent celebration from the Create task button before submit', () => {
    const onCreateIntent = vi.fn()
    const submitLocalTaskForm = vi.fn(async () => undefined)
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 80,
      y: 160,
      width: 140,
      height: 36,
      top: 160,
      right: 220,
      bottom: 196,
      left: 80,
      toJSON: () => ({}),
    } as DOMRect)
    renderDialog({ onCreateIntent, submitLocalTaskForm })

    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))

    expect(onCreateIntent).toHaveBeenCalledWith({ x: 150, y: 178 })
    expect(submitLocalTaskForm).toHaveBeenCalledOnce()
    expect(onCreateIntent.mock.invocationCallOrder[0]).toBeLessThan(submitLocalTaskForm.mock.invocationCallOrder[0])
    rectSpy.mockRestore()
  })

  it('does not fire create-intent celebration when saving edits', () => {
    const onCreateIntent = vi.fn()
    const submitLocalTaskForm = vi.fn(async () => undefined)
    renderDialog({ mode: 'edit', onCreateIntent, submitLocalTaskForm })

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(onCreateIntent).not.toHaveBeenCalled()
    expect(submitLocalTaskForm).toHaveBeenCalledOnce()
  })
})

function renderDialog(options?: {
  assignees?: string[]
  branches?: string[]
  mode?: 'create' | 'edit'
  onCreateIntent?: (origin: { x: number; y: number }) => void
  submitLocalTaskForm?: () => Promise<void>
}) {
  function Harness() {
    const [taskForm, setTaskForm] = useState<LocalTaskForm>(() => emptyLocalTaskForm('github:github.com/example-owner/oratorio'))
    return (
      <LocalTaskFormDialog
        taskFormMode={options?.mode ?? 'create'}
        closeLocalTaskForm={vi.fn()}
        taskForm={taskForm}
        setTaskForm={setTaskForm}
        taskSourceProjectOptions={[
          { value: 'github:github.com/example-owner/oratorio', label: 'GitHub: example-owner/oratorio' },
          { value: 'gitlab:gitlab.example.test/group/project', label: 'GitLab: group/project' },
        ]}
        taskLabelOptions={['bug', 'frontend']}
        taskAssigneeOptions={options?.assignees ?? ['mika', 'zoe']}
        taskBranchOptions={options?.branches ?? ['main']}
        toggleTaskLabel={(label) => {
          setTaskForm((current) => {
            const labels = labelsFromInput(current.labels)
            const nextLabels = labels.includes(label)
              ? labels.filter((candidate) => candidate !== label)
              : [...labels, label]
            return { ...current, labels: nextLabels.join(', ') }
          })
        }}
        taskFormError={null}
        isBusy={false}
        onCreateIntent={options?.onCreateIntent ?? vi.fn()}
        submitLocalTaskForm={options?.submitLocalTaskForm ?? vi.fn(async () => undefined)}
      />
    )
  }

  return render(<Harness />)
}
