import {
  useRef,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from 'react'

// How long a flick keeps gliding after release, in seconds (the board's deceleration).
const glide = 0.5
// Below this a drag reads as a twitch, however short the sheet.
const minDismissDistance = 96

// Where the flick would come to rest decides: past half the sheet, it closes.
export function dismissesSheet({
  distance,
  velocity,
  height,
}: {
  distance: number
  velocity: number
  height: number
}) {
  return distance + velocity * glide > Math.max(height / 2, minDismissDistance)
}

type Drag = { pointerId: number; startY: number; samples: Sample[] }
type Sample = { at: number; y: number }

// Phone-only behaviour keys off an element the CSS hides from md up, so layout stays in CSS.
const isShown = (element: HTMLElement | null) =>
  element !== null && getComputedStyle(element).display !== 'none'

// Tap-outside for a <dialog>, while phoneOnlyRef's element shows.
export function useBackdropClose(phoneOnlyRef: RefObject<HTMLElement | null>) {
  // A click lands where press and release meet: a press in a field released outside hits the <dialog>.
  const pressedBackdrop = useRef(false)
  return {
    onPointerDown: (event: PointerEvent<HTMLDialogElement>) => {
      pressedBackdrop.current = event.target === event.currentTarget
    },
    onClick: (event: MouseEvent<HTMLDialogElement>) => {
      if (
        pressedBackdrop.current &&
        event.target === event.currentTarget &&
        isShown(phoneOnlyRef.current)
      )
        event.currentTarget.close()
    },
  }
}

// Drag to dismiss and tap-outside for a <dialog> shown as a bottom sheet while its grabber shows.
export function useSheetDrag(sheetRef: RefObject<HTMLDialogElement | null>) {
  const grabberRef = useRef<HTMLSpanElement>(null)
  const drag = useRef<Drag | null>(null)
  const backdropProps = useBackdropClose(grabberRef)

  // The drag in progress for this pointer, with its sheet.
  const dragging = (event: PointerEvent<HTMLElement>) => {
    const current = drag.current
    const sheet = sheetRef.current
    if (!current || !sheet || event.pointerId !== current.pointerId) return
    return { current, sheet, y: Math.max(0, event.clientY - current.startY) }
  }

  // The sheet-motion CSS slides it home or away; the drag only switches it off while the finger leads.
  const release = (sheet: HTMLDialogElement, close: boolean) => {
    drag.current = null
    sheet.style.transition = ''
    sheet.style.transform = ''
    if (close) sheet.close()
  }

  return {
    grabberRef,
    backdropProps,
    dragHandleProps: {
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        const onButton =
          event.target instanceof Element && event.target.closest('button')
        // Only a finger, pen or the main mouse button drags; a right-button drag would dismiss by accident.
        if (
          !event.isPrimary ||
          event.button !== 0 ||
          !isShown(grabberRef.current) ||
          onButton
        )
          return
        drag.current = {
          pointerId: event.pointerId,
          startY: event.clientY,
          samples: [{ at: performance.now(), y: 0 }],
        }
        event.currentTarget.setPointerCapture(event.pointerId)
        if (sheetRef.current) sheetRef.current.style.transition = 'none'
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        const active = dragging(event)
        if (!active) return
        active.current.samples = [
          ...active.current.samples.slice(-7),
          { at: performance.now(), y: active.y },
        ]
        active.sheet.style.transform = `translateY(${String(active.y)}px)`
      },
      onPointerUp: (event: PointerEvent<HTMLElement>) => {
        const active = dragging(event)
        if (!active) return
        const now = performance.now()
        const recent = active.current.samples.filter((s) => now - s.at <= 100)
        const first = recent[0]
        const last = recent.at(-1)
        const velocity =
          first && last && last.at > first.at
            ? (last.y - first.y) / ((last.at - first.at) / 1000)
            : 0
        release(
          active.sheet,
          dismissesSheet({
            distance: active.y,
            velocity,
            height: active.sheet.offsetHeight,
          }),
        )
      },
      onPointerCancel: (event: PointerEvent<HTMLElement>) => {
        const active = dragging(event)
        if (active) release(active.sheet, false)
      },
    },
  }
}
