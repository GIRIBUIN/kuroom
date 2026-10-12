import type { Room } from './data'

export function buildingAnchors(rooms: Room[]): { building: string; roomId: string }[] {
  const first = new Map<string, string>()
  for (const room of rooms) if (!first.has(room.building)) first.set(room.building, room.id)
  return Array.from(first, ([building, roomId]) => ({ building, roomId }))
}

/** Navigation only: preserve the result array, DOM order and filter state. */
export function renderBuildingIndex(index: HTMLElement, list: HTMLElement, rooms: Room[], onNavigate?: (row: HTMLElement) => void) {
  const anchors = buildingAnchors(rooms)
  index.hidden = anchors.length === 0
  index.replaceChildren(...anchors.map(({ building, roomId }) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = building
    button.setAttribute('aria-label', `${building} 첫 강의실로 이동`)
    button.addEventListener('click', () => {
      const row = Array.from(list.children).find(row => row instanceof HTMLElement && row.dataset.roomId === roomId)
      if (row instanceof HTMLElement) {
        row.scrollIntoView({ block: 'start', behavior: 'auto' })
        onNavigate?.(row)
      }
    })
    return button
  }))
}

/** Compact navigation only: no result rendering, filter changes or scroll spy. */
export function mountBuildingQuickNavigation(index: HTMLElement, section: HTMLElement, controls: HTMLElement) {
  const compact = window.matchMedia('(max-width: 900px)')
  let frame: number | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let visible = false
  let hovering = false
  let revealOnFrame = false
  const pointers = new Set<number>()
  const focused = () => index.contains(document.activeElement)
  const available = () => !section.hidden && !index.hidden && index.children.length > 0
    && !document.querySelector('dialog[open]')

  function clearTimer() {
    clearTimeout(timer)
    timer = undefined
  }
  function setVisible(value: boolean) {
    if (visible !== value) index.dataset.overlayVisible = String(value)
    visible = value
    const inert = compact.matches && !value
    if (index.inert !== inert) index.inert = inert
  }
  function reset() {
    clearTimer()
    if (frame !== undefined) cancelAnimationFrame(frame)
    frame = undefined
    revealOnFrame = false
    hovering = false
    pointers.clear()
    setVisible(false)
  }
  function scheduleHide() {
    clearTimer()
    if (!visible || hovering || pointers.size || focused()) return
    timer = setTimeout(() => setVisible(false), 1200)
  }
  function positionOverlay() {
    const bounds = section.getBoundingClientRect()
    const top = Math.max(8, controls.getBoundingClientRect().bottom + 8, bounds.top)
    const height = Math.min(window.innerHeight, bounds.bottom) - top - 8
    if (height <= 0) return false
    index.style.setProperty('--quick-index-top', `${top}px`)
    index.style.setProperty('--quick-index-height', `${height}px`)
    return true
  }
  function reveal() {
    if (!compact.matches) return
    if (!available() || !positionOverlay()) { reset(); return }
    setVisible(true)
    scheduleHide()
  }
  function queuePosition(revealAfterScroll: boolean) {
    if (!compact.matches) return
    revealOnFrame ||= revealAfterScroll
    if (frame !== undefined) return
    frame = requestAnimationFrame(() => {
      frame = undefined
      const shouldReveal = revealOnFrame
      revealOnFrame = false
      if (shouldReveal) reveal()
      else if (visible && (!available() || !positionOverlay())) reset()
    })
  }
  function onScroll() { queuePosition(true) }
  function onResize() { if (visible) queuePosition(false) }
  function onEnter(event: PointerEvent) {
    if (event.pointerType !== 'touch') hovering = true
    if (visible) scheduleHide()
  }
  function onLeave() { hovering = false; scheduleHide() }
  function onDown(event: PointerEvent) { pointers.add(event.pointerId); clearTimer() }
  function onUp(event: PointerEvent) { if (pointers.delete(event.pointerId)) scheduleHide() }
  function onFocus() { if (compact.matches) reveal() }
  function onBlur() { queueMicrotask(scheduleHide) }
  function onMediaChange() {
    const keepFocused = compact.matches && available() && focused()
    reset()
    if (keepFocused) reveal()
  }
  function onNavigate(row: HTMLElement) {
    if (!compact.matches) return
    // Transfer keyboard focus to the destination so a selected nav button
    // does not keep the overlay open indefinitely after touch/keyboard use.
    row.querySelector<HTMLButtonElement>('.room-row')?.focus({ preventScroll: true })
    reveal()
  }

  index.dataset.overlayVisible = 'false'
  reset()
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : undefined
  observer?.observe(controls)
  observer?.observe(section)
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onResize)
  index.addEventListener('scroll', onScroll, { passive: true })
  index.addEventListener('pointerenter', onEnter)
  index.addEventListener('pointerleave', onLeave)
  index.addEventListener('pointerdown', onDown)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
  index.addEventListener('focusin', onFocus)
  index.addEventListener('focusout', onBlur)
  compact.addEventListener('change', onMediaChange)
  return {
    reset,
    onNavigate,
    destroy() {
      reset()
      observer?.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      index.removeEventListener('scroll', onScroll)
      index.removeEventListener('pointerenter', onEnter)
      index.removeEventListener('pointerleave', onLeave)
      index.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      index.removeEventListener('focusin', onFocus)
      index.removeEventListener('focusout', onBlur)
      compact.removeEventListener('change', onMediaChange)
    },
  }
}
