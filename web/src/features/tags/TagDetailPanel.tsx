import { useQuery } from '@tanstack/react-query'
import { useId, useRef } from 'react'
import { Link, Navigate } from 'react-router'
import { isNotFound } from '@/api/client'
import type { components } from '@/api/schema'
import { RetryAlert } from '@/components/ui/RetryAlert'
import { useModal } from '@/components/ui/useModal'
import { GroupDialog } from '@/features/tags/GroupDialog'
import { TagDot } from '@/features/tags/TagDot'
import { tagsPageSearch } from '@/features/tags/tagsAddress'
import { type TagPeriod, tagPeriods } from '@/features/tags/tagPeriods'
import { tagQueries } from '@/features/tags/tagQueries'
import { useMoveTag } from '@/features/tags/useMoveTag'
import { filterSearch } from '@/features/transactions/transactionFilters'
import { countOf } from '@/lib/countOf'
import {
  formatCalendarDay,
  formatCalendarMonth,
  formatShortMonth,
} from '@/lib/dates'
import { formatAmount } from '@/lib/money'
import { aToZ } from '@/lib/tagOrder'

type Currency = components['schemas']['Currency']
type Tag = components['schemas']['Tag']
type TagGroup = components['schemas']['TagGroup']
type TagDetail = components['schemas']['TagDetail']

const panelClass =
  'flex min-w-0 flex-[1_1_360px] flex-col gap-5 rounded-3xl bg-surface px-8 py-6 max-md:px-6'
const captionClass = 'text-[13px] font-semibold text-text-muted'

// The selected tag's details beside the list: its group, last 6 months, the tags it is often with, and its newest transactions.
// Name, colour and group come from the list, so the heading and Group stay up while the rest loads.
export function TagDetailPanel({
  tag,
  groups,
  period,
  currency,
}: {
  tag: Tag
  // A–Z, as the tags list sends them.
  groups: TagGroup[]
  period: TagPeriod
  currency: Currency
}) {
  const detail = useQuery(tagQueries.detail(tag.id, period))
  const label = `Tag details: ${tag.name}`
  const heading = (
    <h2 className="m-0 flex items-center gap-2.5 text-[28px] leading-[1.14] font-[650] tracking-[-0.018em] wrap-anywhere">
      <TagDot colour={tag.colour} size="size-3.5" />
      {tag.name}
    </h2>
  )

  // Deleted elsewhere: the details close and the tag drops from the address.
  if (isNotFound(detail.error))
    return <Navigate replace to={{ search: tagsPageSearch(period) }} />
  if (detail.isPending)
    return (
      <aside aria-label={label} aria-busy="true" className={panelClass}>
        {heading}
        <span className="sr-only">Loading details for {tag.name}</span>
        <div
          aria-hidden="true"
          className="grid h-[100px] grid-cols-6 items-end justify-items-center border-b border-white/12"
        >
          {[40, 55, 50, 62, 66, 70].map((height) => (
            <span
              key={height}
              style={{ height: `${String(height)}%` }}
              className="w-[44%] max-w-8 rounded-t bg-white/7"
            />
          ))}
        </div>
        <span
          aria-hidden="true"
          className="h-3.5 w-[70%] rounded-[7px] bg-white/7"
        />
        <span
          aria-hidden="true"
          className="h-3.5 w-[55%] rounded-[7px] bg-white/7"
        />
      </aside>
    )
  if (detail.isError)
    return (
      <aside aria-label={label} className={panelClass}>
        {heading}
        <RetryAlert onRetry={() => void detail.refetch()}>
          Couldn’t load {tag.name}’s details.
        </RetryAlert>
      </aside>
    )
  return (
    <aside aria-label={label} className={panelClass}>
      {heading}
      <GroupSelect tag={tag} groups={groups} />
      <MonthChart tag={tag} months={detail.data.months} currency={currency} />
      <OftenWith companions={detail.data.often_with} period={period} />
      <Recent tag={tag} detail={detail.data} currency={currency} />
    </aside>
  )
}

const newGroupOption = 'new'

// The board's order: the groups, No group, then New group…, which creates one and moves the tag into it.
function GroupSelect({ tag, groups }: { tag: Tag; groups: TagGroup[] }) {
  const moveTag = useMoveTag(tag.id)
  const selectId = useId()
  const newGroupRef = useRef<HTMLDialogElement>(null)
  const newGroup = useModal(newGroupRef, 'detail-new-group')
  // The group picked shows while it saves; a group gone from the list is No group.
  const groupId = moveTag.isPending ? moveTag.variables : tag.group_id
  const shown = groups.some((group) => group.id === groupId) ? groupId : null

  const pickedName = (groupId: number | null | undefined) =>
    groups.find((group) => group.id === groupId)?.name ?? 'No group'

  return (
    <div className="flex flex-col gap-2">
      {moveTag.isError && (
        <RetryAlert
          onRetry={() => {
            moveTag.mutate(moveTag.variables ?? null)
          }}
        >
          Couldn’t move {tag.name} to {pickedName(moveTag.variables)}.
        </RetryAlert>
      )}
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={selectId} className={captionClass}>
          Group
        </label>
        <select
          id={selectId}
          value={shown === null ? '' : String(shown)}
          onChange={(event) => {
            const picked = event.target.value
            if (picked === newGroupOption) {
              newGroup.open()
              return
            }
            moveTag.mutate(picked === '' ? null : Number(picked))
          }}
          className="min-h-11 min-w-0 rounded-xl border border-transparent bg-surface-2 px-3 text-text field max-md:text-base"
        >
          {groups.map((group) => (
            <option key={group.id} value={String(group.id)}>
              {group.name}
            </option>
          ))}
          <option value="">No group</option>
          <option value={newGroupOption}>New group…</option>
        </select>
        <GroupDialog
          key={newGroup.key}
          ref={newGroupRef}
          onSaved={(group) => {
            moveTag.mutate(group.id)
          }}
        />
      </div>
    </div>
  )
}

// Expense and income side by side per month, each bar scaled to the six months' largest amount.
function MonthChart({
  tag,
  months,
  currency,
}: {
  tag: Tag
  months: TagDetail['months']
  currency: Currency
}) {
  const largest = Math.max(
    ...months.flatMap(({ expense, income }) => [expense, income]),
  )
  const height = (amount: number) =>
    `${String(largest === 0 ? 0 : (amount / largest) * 100)}%`
  const spoken = months
    .map(
      ({ month, expense, income }) =>
        `${formatCalendarMonth(month)}: ${formatAmount(expense, currency)} spent, ${formatAmount(income, currency)} earned`,
    )
    .join('; ')

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className={captionClass}>Last 6 months</span>
        <span
          aria-hidden="true"
          className="inline-flex items-center gap-3 text-xs text-text-muted"
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-accent" />
            Spent
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-income" />
            Earned
          </span>
        </span>
      </div>
      <div
        role="img"
        aria-label={`Monthly totals tagged ${tag.name}: ${spoken}`}
        className="mt-3 grid h-[120px] grid-cols-6 items-end border-b border-white/22"
      >
        {months.map(({ month, expense, income }) => (
          <div
            key={month}
            className="flex h-full items-end justify-center gap-1"
          >
            <span
              style={{ height: height(expense) }}
              className="w-[22%] max-w-4 rounded-t bg-accent"
            />
            <span
              style={{ height: height(income) }}
              className="w-[22%] max-w-4 rounded-t bg-income"
            />
          </div>
        ))}
      </div>
      <div
        aria-hidden="true"
        className="-mt-1 grid grid-cols-6 text-center text-xs text-text-muted"
      >
        {months.map(({ month }) => (
          <span key={month}>{formatShortMonth(month)}</span>
        ))}
      </div>
    </div>
  )
}

// Each chip selects that tag, keeping the period.
function OftenWith({
  companions,
  period,
}: {
  companions: TagDetail['often_with']
  period: TagPeriod
}) {
  const phrase =
    tagPeriods.find((option) => option.period === period)?.phrase ?? ''
  return (
    <div className="flex flex-col gap-2">
      <span className={captionClass}>Often with</span>
      {companions.length === 0 ? (
        <p className="m-0 text-sm text-text-muted">
          No other tags on its transactions {phrase}.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {companions.map((companion) => (
            <li key={companion.id}>
              <Link
                to={{ search: tagsPageSearch(period, companion.id) }}
                aria-label={`${companion.name}, ${countOf(companion.transaction_count, 'transaction', 'shared')}`}
                className="inline-flex min-h-9 items-center gap-2 rounded-full bg-surface-2 px-3 text-sm text-text no-underline"
              >
                <TagDot colour={companion.colour} size="size-2" />
                {companion.name}
                <span className="text-text-muted tabular-nums">
                  {companion.transaction_count}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// The 3 newest, each naming its other tags; View all opens every one, all time.
function Recent({
  tag,
  detail,
  currency,
}: {
  tag: Tag
  detail: TagDetail
  currency: Currency
}) {
  const viewAll = filterSearch({
    period: 'all',
    tags: [tag.id],
    q: '',
    page: 1,
  }).toString()
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between pb-1">
        <span className={captionClass}>Recent</span>
        {detail.transaction_count > 0 && (
          <Link
            to={{ pathname: '/transactions', search: viewAll }}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-accent no-underline"
          >
            View all {detail.transaction_count}
          </Link>
        )}
      </div>
      {detail.recent.length === 0 ? (
        <p className="m-0 text-sm text-text-muted">No transactions yet.</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {detail.recent.map((transaction) => (
            <li
              key={transaction.id}
              className="flex items-baseline justify-between gap-3 border-t border-divider py-2.5 first:border-t-0"
            >
              <span className="flex min-w-0 flex-col">
                {transaction.description && (
                  <span className="font-medium wrap-anywhere">
                    {transaction.description}
                  </span>
                )}
                <span className="text-[13px] text-text-muted">
                  {[
                    ...aToZ(
                      transaction.tags.filter((other) => other.id !== tag.id),
                    ).map((other) => other.name),
                    formatCalendarDay(transaction.date),
                  ].join(' · ')}
                </span>
              </span>
              <span
                className={`whitespace-nowrap tabular-nums ${transaction.kind === 'income' ? 'text-income' : ''}`}
              >
                {formatAmount(transaction.amount, currency, transaction.kind)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
