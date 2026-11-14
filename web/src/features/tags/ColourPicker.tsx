import { type TagColour, tagColours } from '@/features/tags/tagColours'

const swatchButtonClass =
  'inline-flex size-11 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0'
// The chosen swatch wears a ring, with the dialog's colour as the gap.
const pickedRingClass =
  'group-aria-pressed:shadow-[0_0_0_3px_var(--color-dialog),0_0_0_5px_var(--color-accent)]'

// No colour, then the 8 palette swatches; each a toggle button, so the choice reads as pressed.
export function ColourPicker({
  labelledBy,
  value,
  onChange,
}: {
  labelledBy: string
  value: TagColour | null
  onChange: (colour: TagColour | null) => void
}) {
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className="-mx-2 flex flex-wrap"
    >
      <button
        type="button"
        aria-label="No colour"
        aria-pressed={value === null}
        onClick={() => {
          onChange(null)
        }}
        className={`group ${swatchButtonClass}`}
      >
        <span
          className={`box-border size-6.5 rounded-full border-2 border-dashed border-text-muted ${pickedRingClass}`}
        />
      </button>
      {Object.entries(tagColours).map(([colour, { label, hex }]) => (
        <button
          key={colour}
          type="button"
          aria-label={label}
          aria-pressed={value === colour}
          onClick={() => {
            onChange(colour as TagColour)
          }}
          className={`group ${swatchButtonClass}`}
        >
          <span
            style={{ backgroundColor: hex }}
            className={`size-6.5 rounded-full ${pickedRingClass}`}
          />
        </button>
      ))}
    </div>
  )
}
