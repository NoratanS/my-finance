import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useSearchParams } from 'react-router'
import type { components } from '@/api/schema'
import {
  primaryButtonClass,
  tintedButtonClass,
} from '@/components/ui/buttonStyles'
import { PageTitle } from '@/components/ui/PageTitle'
import { RetryAlert } from '@/components/ui/RetryAlert'
import { sectionTitleClass } from '@/components/ui/textStyles'
import { sessionQueries } from '@/features/auth/sessionQueries'
import { NewTagDialog } from '@/features/tags/NewTagDialog'
import { TagCard } from '@/features/tags/TagCard'
import {
  readTagPeriod,
  type TagPeriod,
  tagPeriodSearch,
  tagPeriods,
} from '@/features/tags/tagPeriods'
import { tagQueries } from '@/features/tags/tagQueries'
import { matchesSearch } from '@/lib/search'

type Currency = components['schemas']['Currency']
type Tag = components['schemas']['Tag']

const tagCount = (count: number) =>
  `${String(count)} ${count === 1 ? 'tag' : 'tags'}`

export function TagsPage() {
  const { data: session } = useSuspenseQuery(sessionQueries.current())
  const [searchParams, setSearchParams] = useSearchParams()
  const period = readTagPeriod(searchParams)
  const list = useQuery(tagQueries.list(period))
  const tags = list.data?.data
  // Typed into the box only, not the address: the whole list is loaded, so it filters as you type.
  const [search, setSearch] = useState('')
  // In the API's order: most spent first, income-only tags last.
  const shown = tags?.filter((tag) => matchesSearch(tag.name, search))
  const dialogRef = useRef<HTMLDialogElement>(null)
  // A new key per opening: a fresh form, with no refusal left from the last one.
  const [dialogKey, setDialogKey] = useState(0)
  const openDialog = () => {
    flushSync(() => {
      setDialogKey((count) => count + 1)
    })
    dialogRef.current?.showModal()
  }

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="text-[13px] font-semibold tracking-[0.01em] text-text-muted">
            {tags
              ? tags.length > 0
                ? tagCount(tags.length)
                : 'No tags yet'
              : '\u00a0'}
          </div>
          <PageTitle>Tags</PageTitle>
        </div>
        {/* The empty state offers New tag itself; loading or failed, it stays up here. */}
        {tags?.length !== 0 && (
          <div className="flex flex-wrap items-center gap-3 max-md:w-full">
            <PeriodSwitch
              value={period}
              onChange={(next) => {
                setSearchParams(tagPeriodSearch(next))
              }}
            />
            {tags && <SearchBox value={search} onChange={setSearch} />}
            <button
              type="button"
              onClick={openDialog}
              className={`${tintedButtonClass} inline-flex items-center gap-2`}
            >
              {plusIcon}
              New tag
            </button>
          </div>
        )}
      </header>
      {list.isPending ? (
        <TagsLoading />
      ) : list.isError ? (
        <div className="flex flex-col gap-2.5 rounded-3xl bg-surface p-6">
          <RetryAlert onRetry={() => void list.refetch()}>
            Couldn’t load your tags.
          </RetryAlert>
          <p className="m-0 text-[13px] text-text-muted">
            New tag stays available; the list fills in once it loads.
          </p>
        </div>
      ) : list.data.data.length === 0 ? (
        <NoTags onNewTag={openDialog} />
      ) : shown && shown.length > 0 ? (
        <NoGroup tags={shown} currency={session.currency} />
      ) : (
        <p className="m-0 px-2 text-text-muted">
          No tags match “{search.trim()}”.
        </p>
      )}
      <NewTagDialog key={dialogKey} ref={dialogRef} />
    </>
  )
}

function NoGroup({ tags, currency }: { tags: Tag[]; currency: Currency }) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2.5 px-2">
        <h2 id={titleId} className={sectionTitleClass}>
          No group
        </h2>
        <span className="text-[13px] text-text-muted">
          {tagCount(tags.length)}
        </span>
      </div>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,168px),1fr))] gap-3 p-0">
        {tags.map((tag) => (
          <TagCard key={tag.id} tag={tag} currency={currency} />
        ))}
      </ul>
    </section>
  )
}

const periodButtonClass =
  'min-h-[38px] cursor-pointer rounded-[9px] border-0 bg-transparent px-3.5 text-sm font-medium text-text-muted aria-pressed:bg-[#4a4a52] aria-pressed:font-semibold aria-pressed:text-text aria-pressed:shadow-[0_1px_3px_rgba(0,0,0,0.4)] max-md:min-h-10'

function PeriodSwitch({
  value,
  onChange,
}: {
  value: TagPeriod
  onChange: (period: TagPeriod) => void
}) {
  return (
    <div
      role="group"
      aria-label="Period for amounts"
      className="inline-flex rounded-xl bg-surface p-[3px] max-md:grid max-md:w-full max-md:grid-cols-3"
    >
      {tagPeriods.map(({ period, label }) => (
        <button
          key={period}
          type="button"
          aria-pressed={value === period}
          onClick={() => {
            onChange(period)
          }}
          className={periodButtonClass}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function SearchBox({
  value,
  onChange,
}: {
  value: string
  onChange: (search: string) => void
}) {
  return (
    <div className="relative w-full min-w-0 md:w-[200px]">
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
        type="search"
        aria-label="Search tags"
        placeholder="Search tags"
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
        }}
        className="box-border min-h-11 w-full rounded-xl border border-transparent bg-surface pr-3.5 pl-10 text-text field max-md:text-base"
      />
    </div>
  )
}

function NoTags({ onNewTag }: { onNewTag: () => void }) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col items-center gap-3 rounded-3xl bg-surface p-8 text-center"
    >
      <h2 id={titleId} className={sectionTitleClass}>
        Build your own set of tags
      </h2>
      <p className="m-0 max-w-[340px] text-text-muted">
        A tag is any label you want to total up later: a topic, a shop, an
        occasion. Transactions can wait untagged until you’ve decided.
      </p>
      <button
        type="button"
        onClick={onNewTag}
        className={`${primaryButtonClass} mt-1 inline-flex min-h-11 items-center justify-center gap-2 px-5 text-sm`}
      >
        {plusIcon}
        New tag
      </button>
    </section>
  )
}

// The board's skeleton keeps the layout; no spinner.
function TagsLoading() {
  return (
    <section aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">Loading tags</span>
      <span
        aria-hidden="true"
        className="h-4 w-[30%] rounded-[7px] bg-white/7"
      />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,168px),1fr))] gap-3">
        {[0, 1, 2, 3].map((card) => (
          <div
            key={card}
            aria-hidden="true"
            className="rounded-[20px] bg-surface px-5 py-4"
          >
            <span className="block h-4.5 w-[70%] rounded-[7px] bg-white/7" />
          </div>
        ))}
      </div>
    </section>
  )
}

const plusIcon = (
  <svg
    aria-hidden="true"
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <path d="M7 2v10M2 7h10" />
  </svg>
)
