/** FLIP-style transitions for cards that change DOM position between renders. */

const SELECTOR = '[data-card-instance]'

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function captureCardRects(root: HTMLElement): Map<string, DOMRect> {
  const map = new Map<string, DOMRect>()
  for (const el of root.querySelectorAll(SELECTOR)) {
    const id = el.getAttribute('data-card-instance')
    if (!id) continue
    map.set(id, el.getBoundingClientRect())
  }
  return map
}

const DURATION_MS = 420

export function playCardLayoutFlip(root: HTMLElement, before: Map<string, DOMRect>): void {
  if (before.size === 0) return
  const afterEls = new Map<string, HTMLElement>()
  for (const el of root.querySelectorAll(SELECTOR)) {
    const id = el.getAttribute('data-card-instance')
    if (!id) continue
    afterEls.set(id, el as HTMLElement)
  }
  const reduce = prefersReducedMotion()

  for (const [id, el] of afterEls) {
    const a = before.get(id)
    if (!a) continue
    const b = el.getBoundingClientRect()
    const dx = a.left - b.left
    const dy = a.top - b.top
    const w0 = a.width
    const w1 = b.width
    const scale = w1 > 0.5 ? w0 / w1 : 1
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(scale - 1) < 0.02) continue

    if (reduce) {
      el.style.transition = ''
      el.style.transform = ''
      continue
    }

    el.style.transition = 'none'
    el.style.transformOrigin = 'center center'
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = `transform ${DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
        el.style.transform = ''
        const done = () => {
          el.removeEventListener('transitionend', done)
          el.style.transition = ''
          el.style.transformOrigin = ''
        }
        el.addEventListener('transitionend', done, { once: true })
        window.setTimeout(done, DURATION_MS + 80)
      })
    })
  }
}
