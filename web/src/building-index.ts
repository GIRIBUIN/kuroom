import type { Room } from './data'

export function buildingAnchors(rooms: Room[]): { building: string; roomId: string }[] {
  const first = new Map<string, string>()
  for (const room of rooms) if (!first.has(room.building)) first.set(room.building, room.id)
  return Array.from(first, ([building, roomId]) => ({ building, roomId }))
}

/** Navigation only: preserve the result array, DOM order and filter state. */
export function renderBuildingIndex(index: HTMLElement, list: HTMLElement, rooms: Room[]) {
  const anchors = buildingAnchors(rooms)
  index.hidden = anchors.length === 0
  index.replaceChildren(...anchors.map(({ building, roomId }) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = building
    button.setAttribute('aria-label', `${building} 첫 강의실로 이동`)
    button.addEventListener('click', () => {
      const row = Array.from(list.children).find(row => row instanceof HTMLElement && row.dataset.roomId === roomId)
      row?.scrollIntoView({ block: 'start', behavior: 'auto' })
    })
    return button
  }))
}
