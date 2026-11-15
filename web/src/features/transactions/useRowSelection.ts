import { useState } from 'react'
import { useLocation } from 'react-router'

// Rows picked on the page shown. Any move of the address (page, filters, Back) starts it empty,
// and only rows on the page count, so a row that left the list drops out.
export function useRowSelection(pageIds: number[]) {
  const { search } = useLocation()
  const [selection, setSelection] = useState({ search, ids: [] as number[] })
  // Reset while rendering, not in an effect, so no frame shows the last page's selection.
  if (selection.search !== search) setSelection({ search, ids: [] })
  const selected =
    selection.search === search
      ? pageIds.filter((id) => selection.ids.includes(id))
      : []
  const select = (ids: number[]) => {
    setSelection({ search, ids })
  }
  return { selected, select }
}
