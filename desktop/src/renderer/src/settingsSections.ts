import { Bot, GitBranch, GitPullRequest, Settings, type LucideIcon } from 'lucide-react'
import type { ComponentType } from 'react'
import { GithubGlyph, GitlabGlyph } from './components/primitives/ProviderGlyphs'

export type SettingsSection = 'general' | 'github' | 'gitlab' | 'agents' | 'worktree' | 'review'

type SettingsSectionIcon = LucideIcon | ComponentType<{ size?: number }>

export const settingsSections: Array<{ id: SettingsSection; label: string; description: string; icon: SettingsSectionIcon }> = [
  { id: 'general', label: 'General', description: 'Local preferences', icon: Settings },
  { id: 'github', label: 'GitHub', description: 'Connection, routing, sync', icon: GithubGlyph },
  { id: 'gitlab', label: 'GitLab', description: 'Connection, routing, sync', icon: GitlabGlyph },
  { id: 'agents', label: 'Agents', description: 'AppServer connection', icon: Bot },
  { id: 'worktree', label: 'Worktree', description: 'Dispatch and cleanup', icon: GitBranch },
  { id: 'review', label: 'Review', description: 'PR/MR review policy', icon: GitPullRequest },
]

export function normalizeSettingsSection(value: string | undefined): SettingsSection {
  if (value === 'advanced') return 'agents'
  if (value === 'diagnostics') return 'general'
  // Legacy provider-silo sections fold into the per-provider pages.
  if (value === 'sources' || value === 'credentials' || value === 'projects' || value === 'repositories') {
    return 'github'
  }
  return settingsSections.some((candidate) => candidate.id === value) ? (value as SettingsSection) : 'general'
}
