import { useQuery } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { components } from '@/api/schema'
import { PageTitle } from '@/components/ui/PageTitle'
import { RetryAlert } from '@/components/ui/RetryAlert'
import { NewTagDialog } from '@/features/tags/NewTagDialog'
import { TagDot } from '@/features/tags/TagDot'
import { tagQueries } from '@/features/tags/tagQueries'
import { matchesSearch } from '@/lib/search'

type Tag = components['schemas']['Tag']

const tagCount = (count: number) =>
  `${String(count)} ${count === 1 ? 'tag' : 'tags'}`

export function TagsPage() {
  const list = useQuery(tagQueries.list())
  // Typed into the box only, not the address: the whole list is loaded, so it filters as you type.
  const [search, setSearch] = useState('')
  const shown = list.data?.filter((tag) => matchesSearch(tag.name, search))
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
            {list.data ? tagCount(list.data.length) : '\u00a0'}
          </div>
          <PageTitle>Tags</PageTitle>
        </div>
        {/* The empty state offers New tag itself; loading or failed, it stays up here. */}
        {list.data?.length !== 0 && (
          <div className="flex flex-wrap items-center gap-3 max-md:w-full">
            {list.data && <SearchBox value={search} onChange={setSearch} />}
            <button
              type="button"
              onClick={openDialog}
              className={`${newTagButtonClass} bg-accent-tint px-[18px] text-accent`}
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
      ) : list.data.length === 0 ? (
        <NoTags onNewTag={openDialog} />
      ) : shown && shown.length > 0 ? (
        <NoGroup tags={shown} />
      ) : (
        <p className="m-0 px-2 text-text-muted">
          No tags match “{search.trim()}”.
        </p>
      )}
      <NewTagDialog key={dialogKey} ref={dialogRef} />
    </>
  )
}

function NoGroup({ tags }: { tags: Tag[] }) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2.5 px-2">
        <h2
          id={titleId}
          className="m-0 text-[20px] leading-[1.2] font-[650] tracking-[-0.012em]"
        >
          No group
        </h2>
        <span className="text-[13px] text-text-muted">
          {tagCount(tags.length)}
        </span>
      </div>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,168px),1fr))] gap-3 p-0">
        {tags.map((tag) => (
          <li
            key={tag.id}
            className="flex items-center gap-2.5 rounded-[20px] bg-surface px-5 py-4 font-semibold wrap-anywhere"
          >
            <TagDot colour={tag.colour} />
            {tag.name}
          </li>
        ))}
      </ul>
    </section>
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
      <h2
        id={titleId}
        className="m-0 text-[20px] leading-[1.2] font-[650] tracking-[-0.012em]"
      >
        Build your own set of tags
      </h2>
      <p className="m-0 max-w-[340px] text-text-muted">
        A tag is any label you want to total up later: a topic, a shop, an
        occasion. Transactions can wait untagged until you’ve decided.
      </p>
      <button
        type="button"
        onClick={onNewTag}
        className={`${newTagButtonClass} mt-1 bg-accent text-accent-ink`}
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

const newTagButtonClass =
  'inline-flex min-h-11 press cursor-pointer items-center justify-center gap-2 rounded-full border-0 px-5 text-sm font-[650]'

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
