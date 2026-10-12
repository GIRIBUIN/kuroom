import { normalizeTimeSegments, parseTimePaste, sanitizeNumericInput } from './time-input'

/** Two native text inputs: editing stays local until a commit or a full paste. */
export function mountTimeInput(group: HTMLElement, onCommit: (value: string | null) => void) {
  const hour = group.querySelector<HTMLInputElement>('#time-hour')!
  const minute = group.querySelector<HTMLInputElement>('#time-minute')!
  let composing = false

  function setValue(value: string) {
    const [hh = '', mm = ''] = value.split(':')
    hour.value = hh
    minute.value = mm
    for (const node of [group, hour, minute]) node.removeAttribute('aria-invalid')
  }
  function commit() {
    if (composing) return
    const value = normalizeTimeSegments(hour.value, minute.value)
    if (value !== null) setValue(value)
    else for (const node of [group, hour, minute]) node.setAttribute('aria-invalid', 'true')
    onCommit(value)
  }
  function edit(input: HTMLInputElement) {
    input.value = sanitizeNumericInput(input.value).slice(0, 2)
    if (input === hour && input.value.length === 2) minute.focus()
  }
  for (const input of [hour, minute]) {
    input.addEventListener('focus', () => input.select())
    input.addEventListener('compositionstart', () => { composing = true })
    input.addEventListener('compositionend', () => { composing = false; edit(input) })
    input.addEventListener('beforeinput', event => {
      if (!event.isComposing && !composing && event.inputType === 'insertText' && event.data && /[^0-9]/.test(event.data)) event.preventDefault()
    })
    input.addEventListener('input', event => {
      if (composing || (event instanceof InputEvent && event.isComposing)) return
      edit(input)
    })
    input.addEventListener('keydown', event => {
      if (composing || event.isComposing || event.keyCode === 229) return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key === 'Enter') { event.preventDefault(); commit() }
      else if (event.key === 'Backspace' && input === minute && !minute.value) {
        event.preventDefault()
        hour.focus()
      } else if (event.key.length === 1 && !/^[0-9]$/.test(event.key)) event.preventDefault()
    })
    input.addEventListener('blur', event => {
      if (event.relatedTarget instanceof Node && group.contains(event.relatedTarget)) return
      commit()
    })
    input.addEventListener('paste', event => {
      if (composing) return
      event.preventDefault()
      const text = event.clipboardData?.getData('text') ?? ''
      const digits = sanitizeNumericInput(text)
      if (!digits) return
      const value = input === minute && digits.length <= 2 && !text.includes(':')
        ? normalizeTimeSegments(hour.value, digits) : parseTimePaste(text)
      if (value === null) return
      setValue(value)
      onCommit(value)
      minute.focus()
    })
  }
  return { setValue, commit }
}
