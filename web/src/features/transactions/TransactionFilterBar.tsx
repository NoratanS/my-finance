import { useId } from 'react'
import type { components } from '@/api/schema'
import { TagFilterPicker } from '@/features/tags/TagFilterPicker'
import {
  formatPeriod,
  kindFilters,
  type Period,
  tagFilterLimit,
  type TransactionFilters,
} from '@/features/transactions/transactionFilters'

type Kind = components['schemas']['Kind']
type Tag = components['schemas']['Tag']

const types: { label: string; kind?: Kind }[] = [
  { label: 'All' },
  ...Object.entries(kindFilters).map(([kind, { label }]) => ({
    label,
    kind: kind as Kind,
  })),
]

const typeButtonClass =
  'min-h-[38px] cursor-pointer rounded-[9px] border-0 bg-transparent px-3.5 text-sm font-medium text-text-muted aria-pressed:bg-[#4a4a52] aria-pressed:font-semibold aria-pressed:text-text aria-pressed:shadow-[0_1px_3px_rgba(0,0,0,0.4)] max-md:min-h-10 lg:px-4'

// The board's search, type, period and tag controls; the search box keeps what is typed, the address what is applied.
export function TransactionFilterBar({
  filters,
  period,
  months,
  tags,
  untaggedCount,
  searchKey,
  onSearch,
  onChange,
}: {
  filters: TransactionFilters
  period: Period | undefined
  months: string[]
  tags: Tag[]
  // Over the whole ledger; unknown until the list answers.
  untaggedCount: number | undefined
  searchKey: string
  onSearch: (q: string) => void
  onChange: (next: Partial<TransactionFilters>) => void
}) {
  const untaggedHintId = useId()
  // The chosen month stays offered even if the list of months hasn't loaded or lacks it.
  const periods = [
    ...new Set([...months, ...(period && period !== 'all' ? [period] : [])]),
  ]
    .sort()
    .reverse()

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-full min-w-0 lg:w-auto lg:flex-[1_1_260px]">
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          className="pointer-events-none absolute top-3.5 left-3.5 text-text-muted"
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="m10.5 10.5 3 3" />
        </svg>
        <input
          key={searchKey}
          type="search"
          aria-label="Search descriptions"
          placeholder="Search descriptions"
          defaultValue={filters.q}
          onChange={(event) => {
            onSearch(event.target.value)
          }}
          className="box-border min-h-11 w-full rounded-xl border border-transparent bg-surface pr-3.5 pl-10 text-text field max-md:text-base"
        />
      </div>
      <div
        role="group"
        aria-label="Type"
        className="inline-flex rounded-xl bg-surface p-[3px] max-md:grid max-md:w-full max-md:grid-cols-3"
      >
        {types.map(({ label, kind }) => (
          <button
            key={label}
            type="button"
            aria-pressed={filters.kind === kind}
            onClick={() => {
              onChange({ kind })
            }}
            className={typeButtonClass}
          >
            {label}
          </button>
        ))}
      </div>
      <span className="relative inline-flex">
        <select
          aria-label="Time period"
          value={period ?? ''}
          disabled={period === undefined}
          onChange={(event) => {
            onChange({ period: event.target.value })
          }}
          className="min-h-11 cursor-pointer rounded-xl border border-transparent bg-surface px-3 text-text field disabled:cursor-wait max-md:appearance-none max-md:rounded-full max-md:pr-8 max-md:pl-3.5 max-md:text-[15px]"
        >
          {periods.map((month) => (
            <option key={month} value={month}>
              {formatPeriod(month)}
            </option>
          ))}
          <option value="all">All time</option>
        </select>
        <svg
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none absolute top-4 right-3.5 md:hidden"
        >
          <path d="M3 4.5 6 7.5l3-3" />
        </svg>
      </span>
      {/* Tags and Untagged exclude each other: each is off while the other is on. */}
      <div
        role="group"
        aria-label="Tag filter"
        className="flex w-full flex-wrap items-center gap-2"
      >
        <span className="mr-1 text-[13px] font-semibold text-text-muted max-md:hidden">
          Tags
        </span>
        <TagFilterPicker
          tags={tags}
          value={filters.tagIds}
          limit={tagFilterLimit}
          onChange={(tagIds) => {
            onChange({ tagIds })
          }}
          disabled={filters.untagged}
          describedBy={filters.untagged ? untaggedHintId : undefined}
        />
        <button
          type="button"
          aria-pressed={filters.untagged}
          disabled={filters.tagIds.length > 0}
          onClick={() => {
            onChange({ untagged: !filters.untagged })
          }}
          className="inline-flex min-h-11 press cursor-pointer items-center rounded-full border-0 bg-surface px-3.5 text-sm text-text-muted disabled:cursor-not-allowed disabled:opacity-50 aria-pressed:bg-accent-tint aria-pressed:font-semibold aria-pressed:text-text"
        >
          Untagged
          {untaggedCount !== undefined && ` · ${String(untaggedCount)}`}
        </button>
        {filters.untagged && (
          <span
            id={untaggedHintId}
            className="basis-full text-[13px] text-text-muted"
          >
            Turn off Untagged to filter by tag.
          </span>
        )}
      </div>
    </div>
  )
}
