import { Bot, DatabaseZap, GitBranch, GitPullRequest, KeyRound, Settings, type LucideIcon } from 'lucide-react'

export type SettingsSection = 'general' | 'sources' | 'projects' | 'credentials' | 'agents' | 'worktree' | 'review'

export const settingsSections: Array<{ id: SettingsSection; label: string; description: string; icon: LucideIcon }> = [
  { id: 'general', label: 'General', description: 'Local preferences', icon: Settings },
  { id: 'sources', label: 'Sources', description: 'Provider sync and status', icon: DatabaseZap },
  { id: 'projects', label: 'Projects', description: 'Project workspace routing', icon: GitPullRequest },
  { id: 'credentials', label: 'Credentials', description: 'Source auth presence', icon: KeyRound },
  { id: 'agents', label: 'Agents', description: 'AppServer connection', icon: Bot },
  { id: 'worktree', label: 'Worktree', description: 'Dispatch and cleanup', icon: GitBranch },
  { id: 'review', label: 'Review', description: 'PR/MR review policy', icon: GitPullRequest },
]

export function normalizeSettingsSection(value: string | undefined): SettingsSection {
  if (value === 'advanced') return 'agents'
  if (value === 'diagnostics') return 'general'
  if (value === 'repositories') return 'projects'
  return settingsSections.some((candidate) => candidate.id === value) ? value as SettingsSection : 'general'
}
