import { primaryButtonClass } from '@/components/ui/buttonStyles'

// The boards' modal dialog card on its dimmed backdrop; each dialog adds its width, padding and phone layout.
export const dialogClass =
  'm-auto box-border max-w-none sheet-motion rounded-[28px] border border-white/10 bg-dialog text-text shadow-[0_24px_80px_rgba(0,0,0,0.6)] backdrop:bg-black/52'
// The boards' small dialog width (tag and group dialogs), leaving a margin on a phone.
export const dialogWidthClass = 'w-[min(440px,calc(100%-2rem))]'
// The boards' dialog title; callers add the gap below it.
export const dialogTitleClass =
  'm-0 text-[22px] leading-[1.2] font-bold tracking-[-0.016em] wrap-anywhere'
// A dialog's primary action when it isn't a form's submit (Continue, Merge tags).
export const dialogActionClass = `${primaryButtonClass} min-h-11 px-[18px] text-sm`
