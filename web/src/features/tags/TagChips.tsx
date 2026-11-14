import type { components } from '@/api/schema'
import { TagDot } from '@/features/tags/TagDot'
import { aToZ } from '@/lib/tagOrder'

type TagChip = components['schemas']['TagChip']

const chipClass =
  'inline-flex min-h-[26px] items-center gap-1.5 rounded-full bg-surface-2 px-2.5 text-[13px] font-semibold whitespace-nowrap'

// A list, so a screen reader announces how many tags a row has; named "Tags" unless labelled by a visible caption.
export function TagChips({
  tags,
  labelledBy,
}: {
  tags: TagChip[]
  labelledBy?: string
}) {
  return (
    <ul
      aria-label={labelledBy ? undefined : 'Tags'}
      aria-labelledby={labelledBy}
      className="m-0 flex list-none flex-wrap gap-1.5 p-0"
    >
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

// Spans, not a list: it sits inside the row's button, which takes phrasing content only.
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
