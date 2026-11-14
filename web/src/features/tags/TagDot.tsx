import { type TagColour, tagColours } from '@/features/tags/tagColours'

// A tag's colour beside its name; no colour is the picker's dashed ring, small.
export function TagDot({ colour }: { colour: TagColour | null }) {
  return colour ? (
    <span
      aria-hidden="true"
      style={{ backgroundColor: tagColours[colour].hex }}
      className="size-2.5 flex-none rounded-full"
    />
  ) : (
    <span
      aria-hidden="true"
      className="box-border size-2.5 flex-none rounded-full border-[1.5px] border-dashed border-text-muted"
    />
  )
}
