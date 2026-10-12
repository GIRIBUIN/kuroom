import type { Room } from './data'
import { addTarget, exactLookupTarget, isLookupMode, lookupCandidates, normalizeLookup, removeTarget, roomLabel } from './lookup'
import type { LookupCandidate, LookupState, LookupTarget } from './lookup'

export function mountLookup(root: HTMLElement, rooms: Room[], onChange: (state: LookupState) => void) {
  const action = root.querySelector<HTMLButtonElement>('#lookup-action')!
  const panel = root.querySelector<HTMLElement>('#lookup-panel')!
  const input = root.querySelector<HTMLInputElement>('#lookup-input')!
  const tokens = root.querySelector<HTMLElement>('#lookup-tokens')!
  const options = root.querySelector<HTMLElement>('#lookup-options')!
  const noMatches = root.querySelector<HTMLElement>('#lookup-no-matches')!
  let state: LookupState = { query: '', targets: [] }
  let candidates: LookupCandidate[] = []
  let active = -1
  let expanded = false
  let composing = false

  const targetLabel = (target: LookupTarget) => target.kind === 'building' ? `건물: ${target.value}`
    : roomLabel(rooms.find(room => room.id === target.value)!)

  function notify() {
    const clear = isLookupMode(state)
    action.dataset.clear = String(clear)
    action.setAttribute('aria-label', clear ? '검색 초기화' : '검색 입력으로 이동 (Q)')
    onChange(state)
  }

  function closeSuggestions() {
    expanded = false
    active = -1
    options.hidden = true
    noMatches.hidden = true
    input.setAttribute('aria-expanded', 'false')
    input.removeAttribute('aria-activedescendant')
  }

  function select(target: LookupTarget) {
    state = { query: '', targets: addTarget(state.targets, { kind: target.kind, value: target.value }) }
    input.value = ''
    closeSuggestions()
    renderTokens()
    notify()
    input.focus()
  }

  function renderTokens() {
    tokens.replaceChildren(...state.targets.map(target => {
      const token = document.createElement('span')
      token.className = 'lookup-token'
      token.append(document.createTextNode(targetLabel(target)))
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.textContent = '×'
      remove.setAttribute('aria-label', `${targetLabel(target)} 삭제`)
      remove.addEventListener('click', () => {
        state = { ...state, targets: removeTarget(state.targets, target) }
        renderTokens()
        renderSuggestions()
        notify()
        input.focus()
      })
      token.append(remove)
      return token
    }))
  }

  function markActive() {
    Array.from(options.children).forEach((option, index) => option.setAttribute('aria-selected', String(index === active)))
    if (active >= 0) input.setAttribute('aria-activedescendant', `lookup-option-${active}`)
    else input.removeAttribute('aria-activedescendant')
  }

  function renderSuggestions() {
    candidates = lookupCandidates(rooms, state.query, state.targets)
    active = -1
    expanded = state.query.trim() !== ''
    options.replaceChildren(...candidates.map((candidate, index) => {
      const option = document.createElement('li')
      option.id = `lookup-option-${index}`
      option.setAttribute('role', 'option')
      option.setAttribute('aria-selected', 'false')
      option.dataset.exact = String(normalizeLookup(candidate.value) === normalizeLookup(state.query)
        || normalizeLookup(candidate.label) === normalizeLookup(state.query))
      const kind = document.createElement('span')
      kind.className = 'candidate-kind'
      kind.textContent = candidate.kind === 'building' ? '건물' : '강의실'
      const label = document.createElement('span')
      label.textContent = candidate.label
      option.append(kind, label)
      if (candidate.kind === 'building') {
        const count = document.createElement('span')
        count.className = 'candidate-count'
        count.textContent = `${candidate.roomCount}개 강의실`
        option.append(count)
      }
      // DOM focus stays on the combobox; the active descendant represents options.
      option.addEventListener('pointerdown', event => event.preventDefault())
      option.addEventListener('click', () => select(candidate))
      return option
    }))
    options.hidden = !expanded || candidates.length === 0
    noMatches.hidden = !expanded || candidates.length > 0
    input.setAttribute('aria-expanded', String(expanded && candidates.length > 0))
    input.removeAttribute('aria-activedescendant')
  }

  function clear() {
    state = { query: '', targets: [] }
    input.value = ''
    renderTokens()
    closeSuggestions()
    notify()
    input.focus()
  }

  function confirm() {
    const target = expanded && active >= 0 ? candidates[active] : exactLookupTarget(rooms, state.query)
    if (target) select(target)
    else renderSuggestions()
  }

  function onInput(event?: InputEvent) {
    const value = input.value
    if (!composing && !event?.isComposing && !event?.inputType?.includes('Composition') && value.includes(',')) {
      const parts = value.split(',')
      const selected = expanded && active >= 0 ? candidates[active] : undefined
      const remaining: string[] = []
      let targets = state.targets
      for (const [index, part] of parts.entries()) {
        if (index === parts.length - 1) { remaining.push(part.trimStart()); break }
        const explicit = index === 0 && normalizeLookup(part) === normalizeLookup(state.query) ? selected : undefined
        const target = explicit ?? exactLookupTarget(rooms, part)
        if (target) targets = addTarget(targets, { kind: target.kind, value: target.value })
        else if (part.trim()) remaining.push(part.trim())
      }
      state = { query: remaining.filter(Boolean).join(' '), targets }
      input.value = state.query
      renderTokens()
    } else state = { ...state, query: value }
    renderSuggestions()
    notify()
  }

  action.disabled = false
  input.disabled = false
  action.addEventListener('click', () => isLookupMode(state) ? clear() : input.focus())
  input.addEventListener('input', event => onInput(event as InputEvent))
  input.addEventListener('compositionstart', () => { composing = true })
  input.addEventListener('compositionend', () => {
    composing = false
    state = { ...state, query: input.value }
    renderSuggestions()
    notify()
  })
  input.addEventListener('focus', renderSuggestions)
  input.addEventListener('keydown', event => {
    if (composing || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!expanded) renderSuggestions()
      if (!candidates.length) return
      event.preventDefault()
      active = event.key === 'ArrowDown' ? (active + 1) % candidates.length
        : (active <= 0 ? candidates.length : active) - 1
      markActive()
      options.children[active].scrollIntoView?.({ block: 'nearest' })
    } else if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      confirm()
    } else if (event.key === 'Backspace' && input.value === '' && state.targets.length) {
      event.preventDefault()
      state = { query: '', targets: state.targets.slice(0, -1) }
      renderTokens()
      closeSuggestions()
      notify()
    }
  })

  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || composing || event.isComposing || event.keyCode === 229) return
    if (event.key === 'Escape') {
      if (expanded) {
        event.preventDefault()
        closeSuggestions()
      }
    } else if (event.key.toLowerCase() === 'q' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.repeat
      && !document.querySelector('dialog[open]')) {
      const focused = document.activeElement
      if (focused instanceof Element && focused.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return
      event.preventDefault()
      input.focus()
    }
  })
  panel.addEventListener('focusout', event => {
    if (!(event.relatedTarget instanceof Node) || !panel.contains(event.relatedTarget)) closeSuggestions()
  })
  document.addEventListener('pointerdown', event => {
    if (event.target instanceof Node && !panel.contains(event.target)) closeSuggestions()
  })
}
