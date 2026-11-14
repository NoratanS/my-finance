import { type ReactNode, useId } from 'react'
import type { components } from '@/api/schema'
import { Menu, menuItemClass, menuItemProps } from '@/components/ui/Menu'
import { sectionTitleClass } from '@/components/ui/textStyles'
import { TagCard } from '@/features/tags/TagCard'
import { tagPeriods } from '@/features/tags/tagPeriods'
import { formatAmount } from '@/lib/money'
import { matchesSearch } from '@/lib/search'

type Currency = components['schemas']['Currency']
type Tag = components['schemas']['Tag']
type TagList = components['schemas']['TagList']
type TagGroupSummary = components['schemas']['TagGroupSummary']

export const tagCount = (count: number) =>
  `${String(count)} ${count === 1 ? 'tag' : 'tags'}`

// No group first, then the groups A–Z as the API sends them; a tag whose group is gone counts as No group.
export function TagSections({
  list: { data: tags, groups, meta },
  search,
  currency,
  stale,
  onRename,
  onDelete,
}: {
  list: TagList
  search: string
  currency: Currency
  stale: boolean
  onRename: (group: TagGroupSummary) => void
  onDelete: (group: TagGroupSummary) => void
}) {
  const searching = search.trim() !== ''
  const known = new Set(groups.map((group) => group.id))
  const groupOf = (tag: Tag) =>
    tag.group_id !== null && known.has(tag.group_id) ? tag.group_id : null
  // In the API's order: most spent first, income-only tags last.
  const tagsIn = (groupId: number | null) =>
    tags.filter((tag) => groupOf(tag) === groupId)
  const phrase =
    tagPeriods.find(({ period }) => period === meta.period)?.phrase ?? ''
  const sections = [
    { key: 'none', title: 'No group', all: tagsIn(null), group: undefined },
    ...groups.map((group) => ({
      key: String(group.id),
      title: group.name,
      all: tagsIn(group.id),
      group,
    })),
  ]
    .map((section) => ({
      ...section,
      shown: section.all.filter((tag) => matchesSearch(tag.name, search)),
    }))
    // Searching, a section shows only for a match; otherwise every group shows, empty ones too.
    .filter(({ all, shown, group }) =>
      searching ? shown.length > 0 : group !== undefined || all.length > 0,
    )

  if (sections.length === 0)
    return (
      <p className="m-0 px-2 text-text-muted">
        No tags match “{search.trim()}”.
      </p>
    )
  return sections.map(({ key, title, all, shown, group }) => (
    <TagSection
      key={key}
      title={title}
      summary={
        group
          ? groupSummary(group, all.length, currency, phrase)
          : tagCount(all.length)
      }
      actions={
        group && (
          <GroupMenu
            group={group}
            onRename={() => {
              onRename(group)
            }}
            onDelete={() => {
              onDelete(group)
            }}
          />
        )
      }
      tags={shown}
      currency={currency}
      stale={stale}
    />
  ))
}

// What the header says: its tags and what they cost over the period, each transaction once.
function groupSummary(
  group: TagGroupSummary,
  count: number,
  currency: Currency,
  phrase: string,
) {
  if (count === 0) return 'No tags'
  const amount =
    group.expense === 0 && group.income > 0
      ? formatAmount(group.income, currency, 'income')
      : formatAmount(group.expense, currency)
  return `${tagCount(count)} · ${amount} ${phrase}`
}

function GroupMenu({
  group,
  onRename,
  onDelete,
}: {
  group: TagGroupSummary
  onRename: () => void
  onDelete: () => void
}) {
  return (
    <Menu
      label={`Group ${group.name}`}
      triggerLabel={`More actions for group ${group.name}: rename, delete group`}
      triggerClassName="inline-flex size-11 flex-none press cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-text-muted aria-expanded:bg-white/10"
      trigger={
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <circle cx="3" cy="8" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="13" cy="8" r="1.4" />
        </svg>
      }
      panelClassName="absolute top-[calc(100%+4px)] right-0 z-20 box-border w-[200px] rounded-2xl border border-white/14 bg-popover p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
    >
      {(close) => (
        <>
          <button
            {...menuItemProps}
            type="button"
            onClick={() => {
              close()
              onRename()
            }}
            className={`${menuItemClass} text-text`}
          >
            Rename group
          </button>
          <button
            {...menuItemProps}
            type="button"
            onClick={() => {
              close()
              onDelete()
            }}
            className={`${menuItemClass} text-danger`}
          >
            Delete group
          </button>
        </>
      )}
    </Menu>
  )
}

// One section of the Tags page: No group or a tag group, its header, and its cards or what fills it.
function TagSection({
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
