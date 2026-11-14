import { useQuery } from '@tanstack/react-query'
import { useId } from 'react'
import type { components } from '@/api/schema'
import { PageTitle } from '@/components/ui/PageTitle'
import { TagDot } from '@/features/tags/TagDot'
import { tagQueries } from '@/features/tags/tagQueries'

type Tag = components['schemas']['Tag']

const tagCount = (count: number) =>
  `${String(count)} ${count === 1 ? 'tag' : 'tags'}`

export function TagsPage() {
  const list = useQuery(tagQueries.list())

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="text-[13px] font-semibold tracking-[0.01em] text-text-muted">
            {list.data ? tagCount(list.data.length) : ' '}
          </div>
          <PageTitle>Tags</PageTitle>
        </div>
      </header>
      {list.data && <NoGroup tags={list.data} />}
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
