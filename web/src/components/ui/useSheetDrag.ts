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
const settle = { duration: 350, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' }

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

// Drag to dismiss and tap-outside for a <dialog> shown as a bottom sheet.
// Both act only while the grabber shows, so the centred dialog from md up is left alone.
export function useSheetDrag(sheetRef: RefObject<HTMLDialogElement | null>) {
  const grabberRef = useRef<HTMLSpanElement>(null)
  const drag = useRef<Drag | null>(null)
  // A click's target is where the press and release meet, so a press in a field released outside lands on the <dialog>.
  const pressedBackdrop = useRef(false)

  const isSheet = () =>
    grabberRef.current !== null &&
    getComputedStyle(grabberRef.current).display !== 'none'

  const release = (sheet: HTMLDialogElement, from: number, close: boolean) => {
    drag.current = null
    sheet.style.transform = ''
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (close) sheet.close()
      return
    }
    const animation = sheet.animate(
      [
        { transform: `translateY(${String(from)}px)` },
        { transform: close ? 'translateY(100%)' : 'translateY(0)' },
      ],
      { ...settle, fill: close ? 'forwards' : 'none' },
    )
    if (close)
      void animation.finished.then(() => {
        sheet.close()
        animation.cancel()
      })
  }

  const offset = (current: Drag, clientY: number) =>
    Math.max(0, clientY - current.startY)

  return {
    grabberRef,
    handle: {
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        const onButton =
          event.target instanceof Element && event.target.closest('button')
        if (!isSheet() || onButton) return
        drag.current = {
          pointerId: event.pointerId,
          startY: event.clientY,
          samples: [{ at: performance.now(), y: 0 }],
        }
        event.currentTarget.setPointerCapture(event.pointerId)
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        const current = drag.current
        const sheet = sheetRef.current
        if (!current || !sheet || event.pointerId !== current.pointerId) return
        const y = offset(current, event.clientY)
        current.samples = [
          ...current.samples.slice(-7),
          { at: performance.now(), y },
        ]
        sheet.style.transform = `translateY(${String(y)}px)`
      },
      onPointerUp: (event: PointerEvent<HTMLElement>) => {
        const current = drag.current
        const sheet = sheetRef.current
        if (!current || !sheet || event.pointerId !== current.pointerId) return
        const now = performance.now()
        const recent = current.samples.filter((s) => now - s.at <= 100)
        const first = recent[0]
        const last = recent.at(-1)
        const velocity =
          first && last && last.at > first.at
            ? (last.y - first.y) / ((last.at - first.at) / 1000)
            : 0
        const distance = offset(current, event.clientY)
        release(
          sheet,
          distance,
          dismissesSheet({ distance, velocity, height: sheet.offsetHeight }),
        )
      },
      onPointerCancel: (event: PointerEvent<HTMLElement>) => {
        const current = drag.current
        const sheet = sheetRef.current
        if (!current || !sheet) return
        release(sheet, offset(current, event.clientY), false)
      },
    },
    // Only the <dialog> itself, not its content, sits over the backdrop.
    backdropProps: {
      onPointerDown: (event: PointerEvent<HTMLDialogElement>) => {
        pressedBackdrop.current = event.target === event.currentTarget
      },
      onClick: (event: MouseEvent<HTMLDialogElement>) => {
        if (
          pressedBackdrop.current &&
          event.target === event.currentTarget &&
          isSheet()
        )
          event.currentTarget.close()
      },
    },
  }
}
