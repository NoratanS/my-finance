import { useEffect, useRef, useState } from 'react'
import type { components } from '@/api/schema'
import {
  type RowControl,
  rowControlId,
} from '@/features/transactions/TransactionList'

type Transaction = components['schemas']['Transaction']
type TransactionPage = components['schemas']['TransactionPage']

// Where a delete started: the row, its slot on the page, and the control focus returns to.
type Origin = { id: number; index: number; page: number; control: RowControl }

// A deleted row's control is gone, so focus would fall to the body: it moves to the same control on the row now in
// the slot, or the new last row; with no rows left, to the page title.
export function useFocusAfterDelete(
  shown: TransactionPage | undefined,
  settled: boolean,
) {
  const origin = useRef<Origin>(undefined)
  const [deleted, setDeleted] = useState<Origin>()
  const handled = useRef<Origin>(undefined)
  const [announcement, setAnnouncement] = useState('')
  const titleRef = useRef<HTMLHeadingElement>(null)

  // Focus is outside React; this waits until the list shown has dropped the row.
  useEffect(() => {
    if (!deleted || handled.current === deleted || !settled) return
    const rows = shown?.data ?? []
    if (rows.some(({ id }) => id === deleted.id)) return
    handled.current = deleted
    // An emptied page shows the nearest one, which ends next to it.
    const target =
      shown?.meta.page === deleted.page
        ? rows[Math.min(deleted.index, rows.length - 1)]
        : rows.at(-1)
    const control = target
      ? document.getElementById(rowControlId(deleted.control, target.id))
      : titleRef.current
    control?.focus()
  }, [deleted, shown, settled])

  return {
    titleRef,
    announcement,
    // When the confirmation opens; a new announcement each time, so a second delete is heard too.
    start: (transaction: Transaction, control: RowControl) => {
      origin.current = {
        id: transaction.id,
        index: shown?.data.findIndex(({ id }) => id === transaction.id) ?? 0,
        page: shown?.meta.page ?? 1,
        control,
      }
      setAnnouncement('')
    },
    finish: () => {
      setDeleted(origin.current)
      setAnnouncement('Transaction deleted.')
    },
  }
}
