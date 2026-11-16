import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useEffect, useEffectEvent, useId, useRef } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { isNotFound } from '@/api/client'
import type { components } from '@/api/schema'
import { RetryAlert } from '@/components/ui/RetryAlert'
import { useModal } from '@/components/ui/useModal'
import { GroupDialog } from '@/features/tags/GroupDialog'
import { TagActions } from '@/features/tags/TagActions'
import { TagDot } from '@/features/tags/TagDot'
import { tagsPageSearch } from '@/features/tags/tagsAddress'
import { periodPhrase, type TagPeriod } from '@/features/tags/tagPeriods'
import { tagQueries } from '@/features/tags/tagQueries'
import { useEditTag } from '@/features/tags/useEditTag'
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

// Beside the list on a desktop; on a tablet, a sheet over it from the right, below the top bar (57px there); on a phone, the page itself.
const panelClass = [
  'box-border flex min-w-0 flex-[1_1_360px] flex-col gap-5 rounded-3xl bg-surface px-8 py-6 max-md:rounded-none max-md:bg-transparent max-md:p-0',
  'md:max-lg:fixed md:max-lg:top-[57px] md:max-lg:right-0 md:max-lg:bottom-0 md:max-lg:z-[5] md:max-lg:w-[400px] md:max-lg:overflow-y-auto',
  'md:max-lg:rounded-none md:max-lg:border-l md:max-lg:border-white/10 md:max-lg:bg-dialog md:max-lg:px-7 md:max-lg:pt-5 md:max-lg:pb-8 md:max-lg:shadow-[-24px_0_80px_rgba(0,0,0,0.55)]',
].join(' ')
const captionClass = 'text-[13px] font-semibold text-text-muted'
// On a phone, with no panel around them, the group, chart and recent list each sit on a card of their own.
const phoneCardClass = 'max-md:rounded-[20px] max-md:bg-surface'

// The selected tag's details beside the list: its group, last 6 months, the tags it is often with, and its newest transactions.
// Name and colour come from the list, so the heading stays up while the details load or fail.
export function TagDetailPanel({
  tag,
  tags,
  groups,
  period,
  currency,
}: {
  tag: Tag
  // Every tag in the list, for Merge into… and a rename to a taken name.
  tags: Tag[]
  // A–Z, as the tags list sends them.
  groups: TagGroup[]
  period: TagPeriod
  currency: Currency
}) {
  const detail = useQuery(tagQueries.detail(tag.id, period))

  // Deleted elsewhere: the details close and the tag drops from the address.
  if (isNotFound(detail.error))
    return <Navigate replace to={{ search: tagsPageSearch(period) }} />
  if (detail.isPending)
    return (
      <DetailFrame tag={tag} period={period} currency={currency} busy>
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
      </DetailFrame>
    )
  if (detail.isError)
    return (
      <DetailFrame tag={tag} period={period} currency={currency}>
        <RetryAlert onRetry={() => void detail.refetch()}>
          Couldn’t load {tag.name}’s details.
        </RetryAlert>
      </DetailFrame>
    )
  return (
    <DetailFrame
      tag={tag}
      period={period}
      currency={currency}
      actions={
        <TagActions
          tag={tag}
          tags={tags}
          transactionCount={detail.data.transaction_count}
          period={period}
        />
      }
    >
      <GroupSelect tag={tag} groups={groups} />
      <MonthChart tag={tag} months={detail.data.months} currency={currency} />
      <OftenWith oftenWith={detail.data.often_with} period={period} />
      <Recent tag={tag} detail={detail.data} currency={currency} />
    </DetailFrame>
  )
}

// What every state of the details shares: the heading and the ways out. Desktop shows it beside the list;
// a tablet slides it over the list as a sheet.
function DetailFrame({
  tag,
  period,
  currency,
  busy,
  actions,
  children,
}: {
  tag: Tag
  period: TagPeriod
  currency: Currency
  busy?: boolean
  // The ⋯ menu, once the details are in.
  actions?: ReactNode
  children: ReactNode
}) {
  const navigate = useNavigate()
  const closed = { search: tagsPageSearch(period) }
  const backRef = useRef<HTMLAnchorElement>(null)
  // On a phone the details replace the list, so they open at the top, wherever the list was scrolled to.
  useEffect(() => {
    if (backRef.current && getComputedStyle(backRef.current).display !== 'none')
      window.scrollTo(0, 0)
  }, [])
  // Escape closes the details, unless it is closing a menu or dialog opened from them.
  const closeOnEscape = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    if (document.querySelector('dialog[open], [role="menu"]')) return
    void navigate(closed)
  })
  useEffect(() => {
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])
  return (
    <>
      {/* Tablet only: pressing beside the sheet closes it. A pointer target, so it stays out of Tab and the tree. */}
      <Link
        to={closed}
        aria-hidden="true"
        tabIndex={-1}
        className="hidden md:max-lg:fixed md:max-lg:inset-x-0 md:max-lg:top-[57px] md:max-lg:bottom-0 md:max-lg:z-[5] md:max-lg:block md:max-lg:bg-black/50"
      />
      <aside
        aria-label={`Tag details: ${tag.name}`}
        aria-busy={busy}
        className={panelClass}
      >
        <div className="flex items-center gap-2">
          <Link
            ref={backRef}
            to={closed}
            className="me-auto inline-flex min-h-11 press items-center gap-1 pr-2 pl-0.5 text-base text-accent no-underline md:hidden"
          >
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
            >
              <path d="M7.5 3 4.5 6l3 3" />
            </svg>
            Tags
          </Link>
          <h2 className="m-0 flex flex-auto items-center gap-2.5 text-[28px] leading-[1.14] font-[650] tracking-[-0.018em] wrap-anywhere max-md:hidden">
            <TagDot colour={tag.colour} size="size-3.5" />
            {tag.name}
          </h2>
          {actions}
          <button
            type="button"
            aria-label="Close details"
            onClick={() => void navigate(closed)}
            className="hidden size-11 flex-none press cursor-pointer items-center justify-center rounded-full border-0 bg-white/6 text-text-muted md:max-lg:inline-flex"
          >
            <svg
              aria-hidden="true"
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            >
              <path d="M2 2l6 6M8 2 2 8" />
            </svg>
          </button>
        </div>
        {/* The phone's own screen gets the page heading, and the card's sums under it. */}
        <div className="flex flex-col gap-1 px-1 md:hidden">
          <h1 className="m-0 flex items-center gap-2.5 text-[32px] leading-[1.1] font-bold tracking-[-0.022em] wrap-anywhere">
            <TagDot colour={tag.colour} size="size-3.5" />
            {tag.name}
          </h1>
          <TagSummary tag={tag} period={period} currency={currency} />
        </div>
        {children}
      </aside>
    </>
  )
}

// The tag card's rules: an income-only tag shows what it earned; otherwise what it cost, then any income.
function TagSummary({
  tag,
  period,
  currency,
}: {
  tag: Tag
  period: TagPeriod
  currency: Currency
}) {
  const amountClass = 'font-semibold whitespace-nowrap tabular-nums'
  const expense = (
    <span className={`${amountClass} text-text`}>
      {formatAmount(tag.expense, currency)}
    </span>
  )
  const income = (
    <span className={`${amountClass} text-income`}>
      {formatAmount(tag.income, currency, 'income')}
    </span>
  )
  const incomeOnly = tag.expense === 0 && tag.income > 0
  return (
    <p className="m-0 text-text-muted">
      {incomeOnly ? (
        income
      ) : tag.income > 0 ? (
        <>
          {expense} · {income}
        </>
      ) : (
        expense
      )}{' '}
      · {countOf(tag.transaction_count, 'transaction')} {periodPhrase(period)}
    </p>
  )
}

const newGroupOption = 'new'

// The board's order: the groups, No group, then New group…, which creates one and moves the tag into it.
function GroupSelect({ tag, groups }: { tag: Tag; groups: TagGroup[] }) {
  const editTag = useEditTag(tag.id)
  const selectId = useId()
  const newGroupRef = useRef<HTMLDialogElement>(null)
  const newGroup = useModal(newGroupRef, 'detail-new-group')
  // The group picked shows while it saves; a group gone from the list is No group.
  const groupId = editTag.isPending ? editTag.variables.group_id : tag.group_id
  const shown = groups.some((group) => group.id === groupId) ? groupId : null

  const pickedName = (groupId: number | null | undefined) =>
    groups.find((group) => group.id === groupId)?.name ?? 'No group'

  return (
    <div
      className={`flex flex-col gap-2 ${phoneCardClass} max-md:px-4 max-md:py-1.5`}
    >
      {editTag.isError && (
        <RetryAlert
          onRetry={() => {
            editTag.mutate(editTag.variables)
          }}
        >
          Couldn’t move {tag.name} to {pickedName(editTag.variables.group_id)}.
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
            editTag.mutate({ group_id: picked === '' ? null : Number(picked) })
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
            editTag.mutate({ group_id: group.id })
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
    <div
      className={`flex flex-col gap-3 ${phoneCardClass} max-md:px-5 max-md:py-4`}
    >
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
  oftenWith,
  period,
}: {
  oftenWith: TagDetail['often_with']
  period: TagPeriod
}) {
  const phrase = periodPhrase(period)
  return (
    <div className="flex flex-col gap-2 max-md:px-1">
      <span className={captionClass}>Often with</span>
      {oftenWith.length === 0 ? (
        <p className="m-0 text-sm text-text-muted">
          No other tags on its transactions {phrase}.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {oftenWith.map((companion) => (
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
    <div
      className={`flex flex-col ${phoneCardClass} max-md:px-4 max-md:pt-1 max-md:pb-2`}
    >
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
