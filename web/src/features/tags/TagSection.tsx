import { type ReactNode, useId } from 'react'
import type { components } from '@/api/schema'
import { sectionTitleClass } from '@/components/ui/textStyles'
import { TagCard } from '@/features/tags/TagCard'

type Currency = components['schemas']['Currency']
type Tag = components['schemas']['Tag']

export const tagCount = (count: number) =>
  `${String(count)} ${count === 1 ? 'tag' : 'tags'}`

// One section of the Tags page: No group or a tag group, its header, and its cards or what fills it.
export function TagSection({
  title,
  summary,
  actions,
  tags,
  currency,
  stale,
}: {
  title: string
  summary: string
  actions?: ReactNode
  // The cards shown, in the API's order; none is an empty group.
  tags: Tag[]
  currency: Currency
  // The last period's totals, kept up while the next one loads.
  stale: boolean
}) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      aria-busy={stale || undefined}
      className="flex flex-col gap-3"
    >
      <div className="flex min-h-11 items-center gap-2.5 px-2">
        <h2 id={titleId} className={`${sectionTitleClass} wrap-anywhere`}>
          {title}
        </h2>
        <span className="flex-auto text-[13px] text-text-muted">{summary}</span>
        {actions}
      </div>
      {tags.length > 0 ? (
        <ul
          className={`m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,168px),1fr))] gap-3 p-0 transition-opacity motion-reduce:transition-none ${stale ? 'opacity-60' : ''}`}
        >
          {tags.map((tag) => (
            <TagCard key={tag.id} tag={tag} currency={currency} />
          ))}
        </ul>
      ) : (
        <p className="m-0 flex min-h-19 items-center justify-center rounded-[20px] border border-dashed border-white/22 px-4 py-3 text-center text-[13px] text-text-muted">
          No tags yet. Set a tag’s group in its details.
        </p>
      )}
    </section>
  )
}
