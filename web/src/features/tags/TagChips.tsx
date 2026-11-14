import type { components } from '@/api/schema'
import { TagDot } from '@/features/tags/TagDot'
import { aToZ } from '@/lib/tagOrder'

type TagChip = components['schemas']['TagChip']

const chipClass =
  'inline-flex min-h-[26px] items-center gap-1.5 rounded-full bg-surface-2 px-2.5 text-[13px] font-semibold whitespace-nowrap'

// A transaction's tags, every one, A–Z.
export function TagChips({ tags }: { tags: TagChip[] }) {
  return (
    <ul aria-label="Tags" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
      {aToZ(tags).map((tag) => (
        <li key={tag.id} className={chipClass}>
          <TagDot colour={tag.colour} />
          {tag.name}
        </li>
      ))}
    </ul>
  )
}

const phoneShown = 2

// A phone row's tags: the first two A–Z, then a count naming the rest. Spans, as it sits in the row's button.
export function TagChipsPreview({ tags }: { tags: TagChip[] }) {
  const sorted = aToZ(tags)
  const rest = sorted.slice(phoneShown)
  if (sorted.length === 0)
    return <span className="text-[13px] text-text-muted">No tags</span>
  return (
    <span className="flex flex-nowrap gap-1.5 overflow-hidden">
      {sorted.slice(0, phoneShown).map((tag) => (
        <span key={tag.id} className={chipClass}>
          <TagDot colour={tag.colour} />
          {tag.name}
        </span>
      ))}
      {rest.length > 0 && (
        <span className={`${chipClass} text-text-muted`}>
          <span aria-hidden="true">+{rest.length}</span>
          <span className="sr-only">
            {rest.length} more: {rest.map((tag) => tag.name).join(', ')}
          </span>
        </span>
      )}
    </span>
  )
}
