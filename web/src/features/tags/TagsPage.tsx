import { useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'
import type { components } from '@/api/schema'
import { PageTitle } from '@/components/ui/PageTitle'
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

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="text-[13px] font-semibold tracking-[0.01em] text-text-muted">
            {list.data ? tagCount(list.data.length) : ' '}
          </div>
          <PageTitle>Tags</PageTitle>
        </div>
        {list.data && list.data.length > 0 && (
          <SearchBox value={search} onChange={setSearch} />
        )}
      </header>
      {shown &&
        (shown.length > 0 ? (
          <NoGroup tags={shown} />
        ) : (
          <p className="m-0 px-2 text-text-muted">
            No tags match “{search.trim()}”.
          </p>
        ))}
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
