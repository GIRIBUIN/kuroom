import './style.css'
import { DAYS, loadReleaseData } from './data'
import type { Day } from './data'
import { AvailabilityEngine } from './search'
import { createRoomDialog } from './detail'
import { applyNow, availabilityText, defaultFilters, isClockTime, MINUTE_OPTIONS, searchRooms, selectBuildings } from './state'
import type { FilterState } from './state'
import { readFilters, writeFilters } from './url'
import { isLookupMode, lookupRooms, roomLabel } from './lookup'
import { mountLookup } from './lookup-ui'
import { renderBuildingIndex } from './building-index'
import { mountThemeToggle } from './theme'

const root = document.querySelector<HTMLDivElement>('#app')!
root.innerHTML = `
  <main class="app">
    <header class="page-header">
      <h1>kuroom</h1>
      <p>건국대학교 빈 강의실 찾기</p>
      <button id="theme-toggle" class="theme-toggle" type="button" aria-label="테마 전환">
        <svg class="sun-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></svg>
        <svg class="moon-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M20.5 14.1A8.5 8.5 0 0 1 9.9 3.5a8.5 8.5 0 1 0 10.6 10.6Z" /></svg>
      </button>
    </header>

    <div class="sticky-controls">
      <section id="lookup-panel" class="lookup-panel" aria-label="강의실 시간표 조회">
        <label for="lookup-input" class="sr-only">강의실 또는 건물 검색</label>
        <div class="lookup-control">
          <div class="lookup-entry">
            <div id="lookup-tokens" class="lookup-tokens"></div>
            <input id="lookup-input" type="text" placeholder="강의실 또는 건물 검색…" autocomplete="off" spellcheck="false"
              role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="lookup-options" disabled />
          </div>
          <button id="lookup-action" class="lookup-action" type="button" data-clear="false" aria-label="검색 입력으로 이동 (Q)" disabled>
            <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
            <svg class="clear-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <ul id="lookup-options" class="lookup-options" role="listbox" aria-label="검색 후보" hidden></ul>
        <p id="lookup-no-matches" class="lookup-no-matches" role="status" hidden>일치하는 후보가 없습니다.</p>
      </section>

      <form class="filter-panel" aria-label="빈 강의실 검색 조건">
        <fieldset id="filters" disabled>
          <legend class="sr-only">검색 조건</legend>
          <div class="field">
            <label for="day">요일</label>
            <select id="day" name="day"></select>
          </div>
          <div class="field">
            <label for="time">시간</label>
            <div class="time-controls">
              <input id="time" name="time" type="text" inputmode="text" maxlength="5" placeholder="HH:mm"
                pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]" title="24시간 형식 HH:mm (예: 22:20)" autocomplete="off" spellcheck="false" required />
              <button id="now" type="button">지금</button>
            </div>
          </div>
          <div class="field">
            <label for="min">몇 분 이상</label>
            <select id="min" name="min"></select>
          </div>
          <div class="field building-field">
            <span id="building-label" class="field-label">건물</span>
            <details id="building-picker">
              <summary aria-labelledby="building-label building-value" aria-controls="building-panel"><span id="building-value">전체 건물</span></summary>
            </details>
          </div>
        </fieldset>
        <div id="building-panel" class="building-panel" hidden>
          <div class="building-panel-header">
            <span>건물 선택 <span class="muted">· 복수 선택</span></span>
            <button id="all-buildings" type="button" aria-pressed="true">전체 건물</button>
          </div>
          <div id="building-options" role="group" aria-labelledby="building-label"></div>
        </div>
      </form>
    </div>

    <section id="availability-results" class="results-section" aria-labelledby="results-heading" aria-busy="true">
      <div class="results-header">
        <h2 id="results-heading" role="status" aria-live="polite" aria-atomic="true">시간표를 불러오는 중…</h2>
        <p id="result-context"></p>
      </div>
      <p id="empty-state" class="empty-state" hidden></p>
      <div id="load-error" class="empty-state" role="alert" hidden>
        <p>시간표를 불러오지 못했습니다. 다시 시도해 주세요.</p>
        <button id="retry" type="button">다시 불러오기</button>
      </div>
      <div class="availability-body">
        <ul id="results" class="results" aria-label="빈 강의실 목록"></ul>
        <nav id="building-index" class="building-index" aria-label="결과 건물 바로가기" hidden></nav>
      </div>
    </section>
    <section id="lookup-results" class="results-section" aria-labelledby="lookup-heading" hidden>
      <div class="results-header">
        <h2 id="lookup-heading" role="status" aria-live="polite" aria-atomic="true"></h2>
      </div>
      <p id="lookup-empty" class="empty-state" hidden>일치하는 강의실이 없습니다.</p>
      <ul id="lookup-rooms" class="results lookup-rooms" aria-label="강의실 조회 목록"></ul>
    </section>
  </main>
`

const get = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!
mountThemeToggle(get<HTMLButtonElement>('#theme-toggle'))
const form = get<HTMLFormElement>('form')
const fields = get<HTMLFieldSetElement>('#filters')
const dayInput = get<HTMLSelectElement>('#day')
const timeInput = get<HTMLInputElement>('#time')
const minInput = get<HTMLSelectElement>('#min')
const picker = get<HTMLDetailsElement>('#building-picker')
const summary = get<HTMLElement>('#building-value')
const options = get<HTMLDivElement>('#building-options')
const allBuildings = get<HTMLButtonElement>('#all-buildings')
const count = get<HTMLHeadingElement>('#results-heading')
const context = get<HTMLParagraphElement>('#result-context')
const list = get<HTMLUListElement>('#results')
const empty = get<HTMLParagraphElement>('#empty-state')
const section = get<HTMLElement>('#availability-results')
const controls = get<HTMLElement>('.sticky-controls')
const index = get<HTMLElement>('#building-index')
const buildingPanel = get<HTMLElement>('#building-panel')

// Tokens and mobile filters change the sticky height. Use its actual height for
// row scroll margins and rail placement; no scroll spy or active tracking.
if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(() => {
    const height = controls.getBoundingClientRect().height
    if (height > 0) get<HTMLElement>('.app').style.setProperty('--controls-height', `${Math.ceil(height)}px`)
  }).observe(controls)
}
picker.addEventListener('toggle', () => { buildingPanel.hidden = !picker.open })

form.addEventListener('submit', event => event.preventDefault())
get<HTMLButtonElement>('#retry').addEventListener('click', () => window.location.reload())

function option(value: string, label: string): HTMLOptionElement {
  const element = document.createElement('option')
  element.value = value
  element.textContent = label
  return element
}

async function start() {
  try {
    const data = await loadReleaseData()
    const engine = new AvailabilityEngine(data.rooms, data.schedules, data.manifest)
    const showRoom = createRoomDialog(engine)
    const buildings = [...new Set(data.rooms.map(room => room.building))].sort()
    let state: FilterState = readFilters(new URL(window.location.href), defaultFilters(engine), buildings)

    mountLookup(root, data.rooms, lookup => {
      const active = isLookupMode(lookup)
      form.hidden = active
      section.hidden = active
      get<HTMLElement>('#lookup-results').hidden = !active
      if (!active) return
      picker.open = false
      buildingPanel.hidden = true
      const rooms = lookupRooms(data.rooms, lookup)
      get<HTMLElement>('#lookup-heading').textContent = `검색 결과 ${rooms.length}개`
      get<HTMLElement>('#lookup-empty').hidden = rooms.length > 0
      get<HTMLElement>('#lookup-rooms').replaceChildren(...rooms.map(room => {
        const row = document.createElement('li')
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'room-row'
        button.setAttribute('aria-haspopup', 'dialog')
        const name = document.createElement('span')
        name.className = 'room-name'
        name.textContent = roomLabel(room)
        button.append(name)
        button.addEventListener('click', () => {
          // Lookup detail uses the actual current Seoul time, independently of
          // hidden availability filters. Both flows share this dialog instance.
          const instant = new Date()
          showRoom(engine.getCurrentStatus(room.id, instant), defaultFilters(engine, instant))
        })
        row.append(button)
        return row
      }))
    })

    const checkboxes = buildings.map((building, index) => {
      const label = document.createElement('label')
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.name = 'building'
      input.value = building
      input.id = `building-${index}`
      label.htmlFor = input.id
      label.append(input, document.createTextNode(building))
      options.append(label)
      return input
    })

    function syncControls() {
      dayInput.replaceChildren(...DAYS.slice(0, 5).map(day => option(day, day)))
      // Keep the real Seoul weekday on weekends instead of silently searching Monday.
      if (state.day === '토' || state.day === '일') dayInput.add(option(state.day, `${state.day} (주말)`))
      dayInput.value = state.day
      timeInput.value = state.time
      const minutes = MINUTE_OPTIONS.includes(state.minMinutes) ? MINUTE_OPTIONS : [state.minMinutes, ...MINUTE_OPTIONS]
      minInput.replaceChildren(...minutes.map(value => option(String(value), `${value}분`)))
      minInput.value = String(state.minMinutes)
      for (const input of checkboxes) input.checked = state.buildings.includes(input.value)
      summary.textContent = state.buildings.length === 0 ? '전체 건물'
        : state.buildings.length === 1 ? state.buildings[0] : `${state.buildings[0]} 외 ${state.buildings.length - 1}곳`
      summary.title = state.buildings.length ? state.buildings.join(', ') : '전체 건물'
      allBuildings.setAttribute('aria-pressed', String(state.buildings.length === 0))
    }

    function render() {
      timeInput.removeAttribute('aria-invalid')
      const result = searchRooms(engine, state)
      count.textContent = `빈 강의실 ${result.length}개`
      context.textContent = `${state.day}요일 · ${state.time} 기준`
      const rows = result.map(status => {
        const row = document.createElement('li')
        const room = status.room!
        row.dataset.roomId = room.id
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'room-row'
        const title = document.createElement('span')
        title.className = 'room-name'
        title.textContent = [room.building, room.number].filter(Boolean).join(' ')
        const info = document.createElement('span')
        info.className = 'room-info'
        const duration = document.createElement('strong')
        duration.className = 'room-duration'
        duration.textContent = status.state === 'free_all_week' ? '제한 없음' : availabilityText(status)
        info.append(duration)
        button.append(title, info)
        button.setAttribute('aria-haspopup', 'dialog')
        button.addEventListener('click', () => showRoom(status, state))
        row.append(button)
        return row
      })
      list.replaceChildren(...rows)
      renderBuildingIndex(index, list, result.map(status => status.room!))
      get<HTMLElement>('.availability-body').classList.toggle('has-index', result.length > 0)
      empty.hidden = result.length > 0
      empty.textContent = '조건에 맞는 빈 강의실이 없습니다.'
      const url = writeFilters(new URL(window.location.href), state)
      window.history.replaceState(null, '', url)
    }

    function onInput() {
      if (!isClockTime(timeInput.value)) {
        timeInput.setAttribute('aria-invalid', 'true')
        count.textContent = '시간을 입력해 주세요'
        context.textContent = ''
        list.replaceChildren()
        renderBuildingIndex(index, list, [])
        get<HTMLElement>('.availability-body').classList.remove('has-index')
        empty.hidden = false
        empty.textContent = '시각을 HH:mm 형식으로 입력해 주세요.'
        return
      }
      state = {
        day: dayInput.value as Day,
        time: timeInput.value,
        minMinutes: Number(minInput.value),
        buildings: selectBuildings(checkboxes.filter(input => input.checked).map(input => input.value), buildings),
      }
      syncControls()
      render()
    }

    form.addEventListener('input', onInput)
    get<HTMLButtonElement>('#now').addEventListener('click', () => {
      state = applyNow(engine, state)
      syncControls()
      render()
    })
    allBuildings.addEventListener('click', () => {
      for (const input of checkboxes) input.checked = false
      onInput()
    })
    document.addEventListener('click', event => {
      if (event.target instanceof Node && !picker.contains(event.target) && !buildingPanel.contains(event.target)) picker.open = false
    })
    form.addEventListener('keydown', event => {
      if (event.key === 'Escape' && picker.open) {
        event.preventDefault()
        event.stopPropagation()
        picker.open = false
        picker.querySelector('summary')!.focus()
      }
    })
    window.addEventListener('popstate', () => {
      state = readFilters(new URL(window.location.href), defaultFilters(engine), buildings)
      syncControls()
      render()
    })
    syncControls()
    render()
    fields.disabled = false
  } catch (error) {
    console.error('시간표 로딩 또는 초기화 실패', error)
    count.textContent = '시간표를 불러올 수 없습니다'
    get<HTMLElement>('#load-error').hidden = false
  } finally {
    section.setAttribute('aria-busy', 'false')
  }
}

void start()
