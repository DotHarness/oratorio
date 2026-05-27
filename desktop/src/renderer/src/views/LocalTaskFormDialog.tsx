import type { Dispatch, MouseEvent as ReactMouseEvent, SetStateAction } from 'react'
import { GitBranch, Tag, UserRound, XCircle } from 'lucide-react'
import type { LocalTaskForm } from '../lib/types'
import { labelsFromInput } from '../lib/format'
import { ActionIcon } from '../components/primitives/ActionIcon'

export type LocalTaskSourceProjectOption = {
  value: string
  label: string
}

type LocalTaskFormDialogProps = {
  taskFormMode: 'create' | 'edit' | null
  closeLocalTaskForm: () => void
  taskForm: LocalTaskForm
  setTaskForm: Dispatch<SetStateAction<LocalTaskForm>>
  taskSourceProjectOptions: LocalTaskSourceProjectOption[]
  taskLabelOptions: string[]
  taskAssigneeOptions: string[]
  taskBranchOptions: string[]
  toggleTaskLabel: (label: string) => void
  taskFormError: string | null
  isBusy: boolean
  onCreateIntent: (origin: { x: number; y: number }) => void
  submitLocalTaskForm: () => Promise<void>
}

export function LocalTaskFormDialog({
  taskFormMode,
  closeLocalTaskForm,
  taskForm,
  setTaskForm,
  taskSourceProjectOptions,
  taskLabelOptions,
  taskAssigneeOptions,
  taskBranchOptions,
  toggleTaskLabel,
  taskFormError,
  isBusy,
  onCreateIntent,
  submitLocalTaskForm,
}: LocalTaskFormDialogProps) {
  const chooseAssignee = (assignee: string) => {
    setTaskForm((current) => ({
      ...current,
      assignee: current.assignee === assignee ? '' : assignee,
    }))
  }
  const chooseBranch = (branch: string) => {
    setTaskForm((current) => ({
      ...current,
      branch: current.branch === branch ? '' : branch,
    }))
  }
  const submitFromButton = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (taskFormMode === 'create') {
      const rect = event.currentTarget.getBoundingClientRect()
      onCreateIntent({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      })
    }

    void submitLocalTaskForm()
  }

  return (
    <>
      {taskFormMode ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeLocalTaskForm}>
          <section
            className="task-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="local-task-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="modal-head">
              <div>
                <span className="eyebrow">Local task</span>
                <h2 id="local-task-title">{taskFormMode === 'create' ? 'New task' : 'Edit task'}</h2>
              </div>
              <ActionIcon label="Close" onClick={closeLocalTaskForm}>
                <XCircle size={17} />
              </ActionIcon>
            </header>
            <div className="task-form">
              <label className="form-field full">
                <span>Title</span>
                <input
                  value={taskForm.title}
                  onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))}
                  autoFocus
                />
              </label>
              <label className="form-field full">
                <span>Description</span>
                <textarea
                  value={taskForm.description}
                  onChange={(event) => setTaskForm((current) => ({ ...current, description: event.target.value }))}
                  rows={6}
                />
              </label>
              <label className="form-field">
                <span>Source project</span>
                <input
                  value={taskForm.repository}
                  list="local-task-source-projects"
                  onChange={(event) => setTaskForm((current) => ({ ...current, repository: event.target.value }))}
                  placeholder={taskSourceProjectOptions[0]?.value ?? 'GitHub/GitLab project or canonical key'}
                />
                <datalist id="local-task-source-projects">
                  {taskSourceProjectOptions.map((project) => (
                    <option key={project.value} value={project.value} label={project.label} />
                  ))}
                </datalist>
              </label>
              <label className="form-field">
                <span>Labels</span>
                <input
                  value={taskForm.labels}
                  onChange={(event) => setTaskForm((current) => ({ ...current, labels: event.target.value }))}
                  placeholder="bug, docs, frontend"
                />
              </label>
              <div className="label-picker full" aria-label="Label presets">
                {taskLabelOptions.map((label) => {
                  const selected = labelsFromInput(taskForm.labels).includes(label)
                  return (
                    <button
                      key={label}
                      className={selected ? 'selected' : ''}
                      type="button"
                      onClick={() => toggleTaskLabel(label)}
                    >
                      <Tag size={12} />
                      {label}
                    </button>
                  )
                })}
              </div>
              <div className="task-routing-fields full" aria-label="Task routing fields">
                <label className="form-field">
                  <span>Assignee</span>
                  <input
                    value={taskForm.assignee}
                    list="local-task-assignees"
                    onChange={(event) => setTaskForm((current) => ({ ...current, assignee: event.target.value }))}
                    placeholder="Pick a recent assignee or leave blank"
                  />
                  <datalist id="local-task-assignees">
                    {taskAssigneeOptions.map((assignee) => (
                      <option key={assignee} value={assignee} />
                    ))}
                  </datalist>
                  {taskAssigneeOptions.length > 0 ? (
                    <div className="field-chip-picker" aria-label="Assignee presets">
                      {taskAssigneeOptions.map((assignee) => (
                        <button
                          key={assignee}
                          className={taskForm.assignee === assignee ? 'selected' : ''}
                          type="button"
                          onClick={() => chooseAssignee(assignee)}
                        >
                          <UserRound size={12} />
                          {assignee}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </label>
                <label className="form-field">
                  <span className="form-field-head">
                    <span>Base branch</span>
                    <small>Optional · used as run base ref</small>
                  </span>
                  <input
                    value={taskForm.branch}
                    list="local-task-branches"
                    onChange={(event) => setTaskForm((current) => ({ ...current, branch: event.target.value }))}
                    placeholder="main"
                  />
                  <datalist id="local-task-branches">
                    {taskBranchOptions.map((branch) => (
                      <option key={branch} value={branch} />
                    ))}
                  </datalist>
                  {taskBranchOptions.length > 0 ? (
                    <div className="field-chip-picker" aria-label="Base branch presets">
                      {taskBranchOptions.map((branch) => (
                        <button
                          key={branch}
                          className={taskForm.branch === branch ? 'selected' : ''}
                          type="button"
                          onClick={() => chooseBranch(branch)}
                        >
                          <GitBranch size={12} />
                          {branch}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </label>
              </div>
            </div>
            {taskFormError ? <p className="action-error">{taskFormError}</p> : null}
            <footer className="modal-actions">
              <button className="secondary-button inline" onClick={closeLocalTaskForm} disabled={isBusy}>
                Cancel
              </button>
              <button className="primary-button inline" onClick={submitFromButton} disabled={isBusy}>
                {taskFormMode === 'create' ? 'Create task' : 'Save changes'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  )
}
