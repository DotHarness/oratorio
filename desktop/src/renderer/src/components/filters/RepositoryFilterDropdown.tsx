import { useMemo } from 'react'
import { ListFilter } from 'lucide-react'
import { DropdownSelect } from '../primitives/DropdownSelect'

type RepositoryFilterDropdownProps = {
  value: string
  repositories: string[]
  onChange: (value: string) => void
}

type FilterDropdownProps = {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}

export function RepositoryFilterDropdown({ value, repositories, onChange }: RepositoryFilterDropdownProps) {
  const options = useMemo(
    () => [{ value: 'all', label: 'All repositories' }, ...repositories.map((repository) => ({ value: repository, label: repository }))],
    [repositories],
  )

  return <FilterDropdown label="Repository filter" value={value} options={options} onChange={onChange} />
}

export function FilterDropdown({ label, value, options, onChange }: FilterDropdownProps) {
  return <DropdownSelect label={label} value={value} options={options} onChange={onChange} icon={<ListFilter size={15} />} />
}
