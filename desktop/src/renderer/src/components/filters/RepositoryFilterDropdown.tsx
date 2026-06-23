import { useMemo } from 'react'
import { ListFilter } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DropdownSelect, type DropdownSelectOption } from '../primitives/DropdownSelect'
import { buildSourceProjectFilterOptions, sourceProjectValuesEquivalent } from '../../lib/sourceProjects'

type RepositoryFilterDropdownProps = {
  value: string
  repositories: string[]
  onChange: (value: string) => void
}

type FilterDropdownProps = {
  label: string
  value: string
  options: DropdownSelectOption[]
  onChange: (value: string) => void
}

export function RepositoryFilterDropdown({ value, repositories, onChange }: RepositoryFilterDropdownProps) {
  const { t } = useTranslation('board')
  const repositoryOptions = useMemo(
    () => buildSourceProjectFilterOptions(repositories),
    [repositories],
  )
  const selectedRepositoryOption = useMemo(
    () => value === 'all'
      ? null
      : repositoryOptions.find((option) => sourceProjectValuesEquivalent(option.value, value)),
    [repositoryOptions, value],
  )
  const options = useMemo<DropdownSelectOption[]>(
    () => [{ value: 'all', label: t('filters.allRepositories') }, ...repositoryOptions],
    [repositoryOptions, t],
  )
  const dropdownValue = value === 'all' ? value : selectedRepositoryOption?.value ?? value
  const dropdownOptions = useMemo<DropdownSelectOption[]>(
    () => dropdownValue === 'all' || options.some((option) => option.value === dropdownValue)
      ? options
      : [...options, { value: dropdownValue, label: dropdownValue }],
    [dropdownValue, options],
  )

  return <FilterDropdown label={t('filters.repositoryFilter')} value={dropdownValue} options={dropdownOptions} onChange={onChange} />
}

export function FilterDropdown({ label, value, options, onChange }: FilterDropdownProps) {
  return <DropdownSelect label={label} value={value} options={options} onChange={onChange} icon={<ListFilter size={15} />} />
}
