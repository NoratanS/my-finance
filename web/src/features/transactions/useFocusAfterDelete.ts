import { useEffect, useRef, useState } from 'react'
import type { components } from '@/api/schema'
import {
  type RowControl,
  rowControlId,
} from '@/features/transactions/TransactionList'

type Transaction = components['schemas']['Transaction']
type TransactionPage = components['schemas']['TransactionPage']
// The list query as the page holds it.
type ShownList = {
  data: TransactionPage | undefined
  isPlaceholderData: boolean
  isError: boolean
}

// Where a delete started: the row, its slot on the page, and the control focus returns to.
type Origin = { id: number; index: number; page: number; control: RowControl }

// A deleted row's control is gone, so focus would fall to the body: it moves to the same control on the row now in
// the slot, or the new last row; with no rows left, or no list to show, to the page title.
export function useFocusAfterDelete(list: ShownList) {
  const shown = list.data
  const settled = !list.isPlaceholderData
  const failed = list.isError
  const origin = useRef<Origin>(undefined)
  const [deleted, setDeleted] = useState<Origin>()
  const handled = useRef<Origin>(undefined)
  const [announcement, setAnnouncement] = useState('')
  const titleRef = useRef<HTMLHeadingElement>(null)

  // Focus is outside React; this waits until the list shown has dropped the row.
  useEffect(() => {
    if (!deleted || handled.current === deleted || !settled) return
    // A list that couldn't reload still holds the deleted row; giving up here keeps a later reload from taking focus.
    const rows = failed ? [] : (shown?.data ?? [])
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
  }, [deleted, shown, settled, failed])

  return {
    titleRef,
    deleteAnnouncement: announcement,
    // When the confirmation opens; a new announcement each time, so a second delete is heard too.
    startDelete: (transaction: Transaction, control: RowControl) => {
      origin.current = {
        id: transaction.id,
        // A row a background reload already dropped counts as the first.
        index: Math.max(
          0,
          shown?.data.findIndex(({ id }) => id === transaction.id) ?? 0,
        ),
        page: shown?.meta.page ?? 1,
        control,
      }
      setAnnouncement('')
    },
    finishDelete: () => {
      setDeleted(origin.current)
      setAnnouncement('Transaction deleted.')
    },
  }
}
