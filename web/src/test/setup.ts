import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterAll, afterEach } from 'vitest'
import { server } from '@/test/server'

// At module level, not in beforeAll: the API client captures fetch when test files import it.
server.listen({ onUnhandledFrame: 'error' })

// findBy… and waitFor give up after 1 s by default, too soon when the suite runs under load.
configure({ asyncUtilTimeout: 3000 })

afterEach(() => {
  cleanup()
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})

// jsdom has no showModal/close; the real modal behaviour is checked in the browser.
if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
  const modals: HTMLDialogElement[] = []
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true
    modals.push(this)
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.open) return
    this.open = false
    if (modals.includes(this)) modals.splice(modals.indexOf(this), 1)
    this.dispatchEvent(new Event('close'))
  }
  // Like the browser: once the keydown has been handled, Escape cancels the top modal, unless it was prevented.
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape') return
      queueMicrotask(() => {
        const top = modals.findLast((modal) => modal.isConnected && modal.open)
        if (event.defaultPrevented || !top) return
        if (top.dispatchEvent(new Event('cancel', { cancelable: true })))
          top.close()
      })
    },
    { capture: true },
  )
}

// jsdom has no pointer capture; the sheet drag is checked in the browser.
if (typeof Element.prototype.setPointerCapture !== 'function') {
  Element.prototype.setPointerCapture = () => undefined
  Element.prototype.releasePointerCapture = () => undefined
}

// jsdom lays nothing out, so it has no scrolling; Show them's scroll is checked in the browser.
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => undefined
}

// jsdom has no scrolling; opening a tag's details at the top is checked in the browser.
window.scrollTo = () => undefined
