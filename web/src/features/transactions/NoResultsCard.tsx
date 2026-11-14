import { useId } from 'react'
import {
  ghostButtonClass,
  tintedButtonClass,
} from '@/components/ui/buttonStyles'

// The board's "no results": the filters left nothing, and only the ways out that would change something.
export function NoResultsCard({
  allTime,
  onClear,
  onShowAllTime,
}: {
  allTime: boolean
  onClear: (() => void) | undefined
  onShowAllTime: () => void
}) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      className="flex min-h-[200px] flex-col items-center justify-center gap-2.5 rounded-3xl bg-surface p-7 text-center"
    >
      <h2 id={titleId} className="m-0 text-[17px] leading-[1.25] font-[650]">
        No transactions match these filters
      </h2>
      <p className="m-0 max-w-[340px] text-sm text-text-muted">
        {allTime
          ? 'Try a different search or type.'
          : 'Try another month or All time.'}
      </p>
      <div className="mt-1 flex flex-wrap justify-center gap-2.5">
        {onClear && (
          <button type="button" onClick={onClear} className={ghostButtonClass}>
            Clear filters
          </button>
        )}
        {!allTime && (
          <button
            type="button"
            onClick={onShowAllTime}
            className={tintedButtonClass}
          >
            Show All time
          </button>
        )}
      </div>
    </section>
  )
}
