import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { type ReactNode, type RefObject, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link, useSearchParams } from 'react-router'
import type { components } from '@/api/schema'
import {
  ghostButtonClass,
  primaryButtonClass,
  segmentButtonClass,
  tintedButtonClass,
} from '@/components/ui/buttonStyles'
import { PageTitle } from '@/components/ui/PageTitle'
import { RetryAlert } from '@/components/ui/RetryAlert'
import { sectionTitleClass } from '@/components/ui/textStyles'
import { sessionQueries } from '@/features/auth/sessionQueries'
import { NewTagDialog } from '@/features/tags/NewTagDialog'
import { DeleteGroupDialog } from '@/features/tags/DeleteGroupDialog'
import { GroupDialog } from '@/features/tags/GroupDialog'
import { tagCount, TagSections } from '@/features/tags/TagSections'
import {
  readTagPeriod,
  type TagPeriod,
  tagPeriodQuery,
  tagPeriods,
} from '@/features/tags/tagPeriods'
import { tagQueries } from '@/features/tags/tagQueries'
import { filterSearch } from '@/features/transactions/transactionFilters'
import { transactionCount } from '@/lib/transactionCount'

type TagGroupSummary = components['schemas']['TagGroupSummary']

const groupCount = (count: number) =>
  `${String(count)} ${count === 1 ? 'group' : 'groups'}`

export function TagsPage() {
  const { data: session } = useSuspenseQuery(sessionQueries.current())
  const [searchParams, setSearchParams] = useSearchParams()
  const period = readTagPeriod(searchParams)
  const list = useQuery(tagQueries.list(period))
  const tags = list.data?.data
  const groups = list.data?.groups
  // Nothing made yet: the page invites a first tag instead.
  const empty = tags?.length === 0 && groups?.length === 0
  // Typed into the box only, not the address: the whole list is loaded, so it filters as you type.
  const [search, setSearch] = useState('')
  const newTagRef = useRef<HTMLDialogElement>(null)
  const newTag = useModal(newTagRef)
  const groupDialogRef = useRef<HTMLDialogElement>(null)
  const groupDialog = useModal(groupDialogRef)
  // The group Rename group is for; none is New group.
  const [renaming, setRenaming] = useState<TagGroupSummary>()
  const deleteDialogRef = useRef<HTMLDialogElement>(null)
  const deleteDialog = useModal(deleteDialogRef)
  const [deleting, setDeleting] = useState<TagGroupSummary>()

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="text-[13px] font-semibold tracking-[0.01em] text-text-muted">
            {tags && groups
              ? empty
                ? 'No tags yet'
                : [
                    tagCount(tags.length),
                    groups.length > 0 && groupCount(groups.length),
                  ]
                    .filter(Boolean)
                    .join(' · ')
              : '\u00a0'}
          </div>
          <PageTitle>Tags</PageTitle>
        </div>
        {/* The empty state offers New tag itself; loading or failed, it stays up here. */}
        {!empty && (
          <div className="flex flex-wrap items-center gap-3 max-md:w-full">
            <PeriodSwitch
              value={period}
              onChange={(next) => {
                setSearchParams(tagPeriodQuery(next))
              }}
            />
            {tags && <SearchBox value={search} onChange={setSearch} />}
            <button
              type="button"
              onClick={() => {
                groupDialog.open(() => {
                  setRenaming(undefined)
                })
              }}
              className={ghostButtonClass}
            >
              New group
            </button>
            <button
              type="button"
              onClick={() => {
                newTag.open()
              }}
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
      ) : empty ? (
        <NoTags
          onNewTag={() => {
            newTag.open()
          }}
          untaggedCount={list.data.meta.untagged_count}
        />
      ) : (
        <>
          <TagSections
            list={list.data}
            search={search}
            currency={session.currency}
            stale={list.isPlaceholderData}
            onRename={(group) => {
              groupDialog.open(() => {
                setRenaming(group)
              })
            }}
            onDelete={(group) => {
              deleteDialog.open(() => {
                setDeleting(group)
              })
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-2 text-[13px] text-text-muted">
            <span>
              {list.data.groups.length > 0
                ? 'A tag belongs to one group at most. Amounts overlap between tags; a group’s total counts each transaction once.'
                : 'Amounts overlap between tags.'}
            </span>
            {list.data.meta.untagged_count > 0 && (
              <UntaggedLink>
                Review{' '}
                {transactionCount(list.data.meta.untagged_count, 'untagged')}
              </UntaggedLink>
            )}
          </div>
        </>
      )}
      <NewTagDialog key={newTag.key} ref={newTagRef} />
      <GroupDialog
        key={groupDialog.key}
        ref={groupDialogRef}
        group={renaming}
      />
      <DeleteGroupDialog
        key={deleteDialog.key}
        ref={deleteDialogRef}
        group={deleting}
        tags={tags?.filter((tag) => tag.group_id === deleting?.id) ?? []}
      />
    </>
  )
}

// A page dialog: a new key per opening gives a fresh form, with no refusal left from the last one.
function useModal(ref: RefObject<HTMLDialogElement | null>) {
  const [key, setKey] = useState(0)
  // prepare sets what the dialog is for, in the same render as its new key.
  const open = (prepare?: () => void) => {
    flushSync(() => {
      prepare?.()
      setKey((count) => count + 1)
    })
    ref.current?.showModal()
  }
  return { key, open }
}

const periodButtonClass = `${segmentButtonClass} px-3.5 max-md:min-h-10`

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

// Every untagged transaction, all time, whatever span the cards total.
const untaggedSearch = filterSearch({
  period: 'all',
  tags: 'untagged',
  q: '',
  page: 1,
}).toString()

function UntaggedLink({ children }: { children: ReactNode }) {
  return (
    <Link
      to={{ pathname: '/transactions', search: untaggedSearch }}
      className="inline-flex min-h-11 items-center text-sm font-semibold text-accent no-underline"
    >
      {children}
    </Link>
  )
}

function NoTags({
  onNewTag,
  untaggedCount,
}: {
  onNewTag: () => void
  untaggedCount: number
}) {
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
      {untaggedCount > 0 && (
        <UntaggedLink>
          Look through {transactionCount(untaggedCount, 'untagged')} first
        </UntaggedLink>
      )}
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
