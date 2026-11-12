import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach } from 'vitest'
import { server } from '@/test/server'

// At module level, not in beforeAll: the API client captures fetch when test files import it.
server.listen({ onUnhandledFrame: 'error' })

afterEach(() => {
  cleanup()
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})

// jsdom has no modal dialogs. This stands in for the browser's: open, focus the first
// control, Escape closes, focus returns to the opener. The real focus trap is checked in the browser.
if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
  const openers = new WeakMap<HTMLDialogElement, Element | null>()

  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    openers.set(this, document.activeElement)
    this.open = true
    this.querySelector<HTMLElement>('a[href], button:not(:disabled)')?.focus()
  }

  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.open) return
    this.open = false
    const opener = openers.get(this)
    if (opener instanceof HTMLElement) opener.focus()
    this.dispatchEvent(new Event('close'))
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    const dialogs = document.querySelectorAll<HTMLDialogElement>('dialog[open]')
    dialogs[dialogs.length - 1]?.close()
  })
}
