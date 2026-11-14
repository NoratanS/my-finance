// The boards' secondary button: a quiet outlined pill beside a primary one (Cancel, Try again).
export const ghostButtonClass =
  'min-h-11 press cursor-pointer rounded-full border border-divider bg-white/6 px-[18px] text-sm font-semibold text-text'

// The boards' primary button: the accent pill; each caller sets its height and padding.
export const primaryButtonClass =
  'press cursor-pointer rounded-full border-0 bg-accent font-[650] text-accent-ink'

// One segment of the boards' segmented control (Type, the tag period); pressed, it lifts. Callers set padding and phone height.
export const segmentButtonClass =
  'min-h-[38px] cursor-pointer rounded-[9px] border-0 bg-transparent text-sm font-medium text-text-muted aria-pressed:bg-segment aria-pressed:font-semibold aria-pressed:text-text aria-pressed:shadow-[0_1px_3px_rgba(0,0,0,0.4)]'

// The boards' tinted button: a filled pill in the accent tint (Show All time, Send invite, Copy link).
const tintedShape =
  'min-h-11 press cursor-pointer rounded-full border-0 px-[18px] text-sm font-[650]'
export const tintedButtonClass = `${tintedShape} bg-accent-tint text-accent`
// The same pill once its action is done (Copied).
export const doneButtonClass = `${tintedShape} bg-income/16 text-income`
