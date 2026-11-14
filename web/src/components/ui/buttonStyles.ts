// The boards' secondary button: a quiet outlined pill beside a primary one (Cancel, Try again).
export const ghostButtonClass =
  'min-h-11 press cursor-pointer rounded-full border border-divider bg-white/6 px-[18px] text-sm font-semibold text-text'

// The boards' tinted button: a filled pill in the accent tint (Show All time, Send invite, Copy link).
const tintedShape =
  'min-h-11 press cursor-pointer rounded-full border-0 px-[18px] text-sm font-[650]'
export const tintedButtonClass = `${tintedShape} bg-accent-tint text-accent`
// The same pill once its action is done (Copied).
export const doneButtonClass = `${tintedShape} bg-income/16 text-income`
