import type { Dispatch, MouseEvent as ReactMouseEvent, SetStateAction } from 'react'
import { GitBranch, Tag, UserRound, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { LocalTaskForm } from '../lib/types'
import { labelsFromInput } from '../lib/format'
import { ActionIcon } from '../components/primitives/ActionIcon'
import { ComboBoxInput } from '../components/primitives/ComboBoxInput'

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
  const { t } = useTranslation('board')
  const assigneeOptions = taskAssigneeOptions.map((assignee) => ({ value: assignee, label: assignee }))
  const branchOptions = taskBranchOptions.map((branch) => ({ value: branch, label: branch }))
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
                <span className="eyebrow">{t('localTask.eyebrow')}</span>
                <h2 id="local-task-title">{taskFormMode === 'create' ? t('localTask.newTask') : t('localTask.editTask')}</h2>
              </div>
              <ActionIcon label={t('common:close')} onClick={closeLocalTaskForm}>
                <XCircle size={17} />
              </ActionIcon>
            </header>
            <div className="task-form">
              <label className="form-field full">
                <span>{t('localTask.title')}</span>
                <input
                  value={taskForm.title}
                  onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))}
                  autoFocus
                />
              </label>
              <label className="form-field full">
                <span>{t('localTask.description')}</span>
                <textarea
                  value={taskForm.description}
                  onChange={(event) => setTaskForm((current) => ({ ...current, description: event.target.value }))}
                  rows={6}
                />
              </label>
              <label className="form-field">
                <span>{t('localTask.sourceProject')}</span>
                <ComboBoxInput
                  ariaLabel={t('localTask.sourceProject')}
                  value={taskForm.repository}
                  options={taskSourceProjectOptions}
                  onChange={(value) => setTaskForm((current) => ({ ...current, repository: value }))}
                  placeholder={taskSourceProjectOptions[0]?.label ?? t('localTask.sourceProjectPlaceholder')}
                />
              </label>
              <label className="form-field">
                <span>{t('localTask.labels')}</span>
                <input
                  value={taskForm.labels}
                  onChange={(event) => setTaskForm((current) => ({ ...current, labels: event.target.value }))}
                  placeholder={t('localTask.labelsPlaceholder')}
                />
              </label>
              <div className="label-picker full" aria-label={t('localTask.labelPresets')}>
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
              <div className="task-routing-fields full" aria-label={t('localTask.routingFields')}>
                <label className="form-field">
                  <span>{t('localTask.assignee')}</span>
                  <ComboBoxInput
                    id="local-task-assignee"
                    ariaLabel={t('localTask.assignee')}
                    value={taskForm.assignee}
                    options={assigneeOptions}
                    onChange={(value) => setTaskForm((current) => ({ ...current, assignee: value }))}
                    placeholder={t('localTask.assigneePlaceholder')}
                  />
                  {taskAssigneeOptions.length > 0 ? (
                    <div className="field-chip-picker" aria-label={t('localTask.assigneePresets')}>
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
                    <span>{t('localTask.baseBranch')}</span>
                    <small>{t('localTask.baseBranchHint')}</small>
                  </span>
                  <ComboBoxInput
                    id="local-task-branch"
                    ariaLabel={t('localTask.baseBranch')}
                    value={taskForm.branch}
                    options={branchOptions}
                    onChange={(value) => setTaskForm((current) => ({ ...current, branch: value }))}
                    placeholder={t('localTask.baseBranchPlaceholder')}
                  />
                  {taskBranchOptions.length > 0 ? (
                    <div className="field-chip-picker" aria-label={t('localTask.baseBranchPresets')}>
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
                {t('common:cancel')}
              </button>
              <button className="primary-button inline" onClick={submitFromButton} disabled={isBusy}>
                {taskFormMode === 'create' ? t('localTask.create') : t('localTask.saveChanges')}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  )
}
