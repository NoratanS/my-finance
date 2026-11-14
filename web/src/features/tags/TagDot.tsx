import { type TagColour, tagColours } from '@/features/tags/tagColours'

// A tag's colour beside its name; no colour is the picker's dashed ring. Chip, card and heading sizes.
export function TagDot({
  colour,
  size = 'size-2.5',
}: {
  colour: TagColour | null
  size?: 'size-2' | 'size-2.5' | 'size-3.5'
}) {
  return colour ? (
    <span
      aria-hidden="true"
      style={{ backgroundColor: tagColours[colour].hex }}
      className={`${size} flex-none rounded-full`}
    />
  ) : (
    <span
      aria-hidden="true"
      className={`${size} box-border flex-none rounded-full border-[1.5px] border-dashed border-text-muted`}
    />
  )
}
