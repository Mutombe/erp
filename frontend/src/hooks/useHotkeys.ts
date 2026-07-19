import { useEffect, useRef, useCallback } from 'react'

export interface HotkeyConfig {
  key: string
  modifier?: 'ctrl' | 'shift' | 'ctrl+shift'
  handler: (e: KeyboardEvent) => void
  enabled?: boolean
}

export interface SequenceConfig {
  keys: string[]
  handler: () => void
  enabled?: boolean
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
export const modKey = isMac ? '⌘' : 'Ctrl'

function isInputElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

export function useHotkeys(hotkeys: HotkeyConfig[], sequences?: SequenceConfig[]): void {
  const sequenceBuffer = useRef<string[]>([])
  const sequenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hotkeysRef = useRef(hotkeys)
  hotkeysRef.current = hotkeys

  const sequencesRef = useRef(sequences)
  sequencesRef.current = sequences

  const resetSequence = useCallback(() => {
    sequenceBuffer.current = []
    if (sequenceTimer.current) {
      clearTimeout(sequenceTimer.current)
      sequenceTimer.current = null
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const hasModifier = e.metaKey || e.ctrlKey
      const hasShift = e.shiftKey
      const inInput = isInputElement(e.target)
      const key = e.key.toLowerCase()

      // Check modifier hotkeys first (always fire, even in inputs)
      for (const hk of hotkeysRef.current) {
        if (hk.enabled === false) continue
        if (!hk.modifier) continue

        const wantCtrl = hk.modifier === 'ctrl' || hk.modifier === 'ctrl+shift'
        const wantShift = hk.modifier === 'shift' || hk.modifier === 'ctrl+shift'

        const ctrlMatch = wantCtrl && (e.metaKey || e.ctrlKey)
        const shiftMatch = wantShift ? e.shiftKey : !e.shiftKey

        if (ctrlMatch && shiftMatch && key === hk.key.toLowerCase()) {
          hk.handler(e)
          resetSequence()
          return
        }
      }

      // Skip bare-key shortcuts when typing in inputs
      if (inInput) return

      // Check bare-key hotkeys
      for (const hk of hotkeysRef.current) {
        if (hk.enabled === false) continue
        if (hk.modifier) continue
        if (hasModifier) continue

        if (key === hk.key.toLowerCase()) {
          hk.handler(e)
          resetSequence()
          return
        }
      }

      // Sequence handling
      const seqs = sequencesRef.current
      if (!seqs || seqs.length === 0 || hasModifier) return

      sequenceBuffer.current.push(key)

      // Clear previous timer and set new one
      if (sequenceTimer.current) clearTimeout(sequenceTimer.current)
      sequenceTimer.current = setTimeout(resetSequence, 800)

      // Check for matching sequence
      for (const seq of seqs) {
        if (seq.enabled === false) continue
        const buf = sequenceBuffer.current
        if (buf.length < seq.keys.length) continue

        const tail = buf.slice(buf.length - seq.keys.length)
        const match = tail.every((k, i) => k === seq.keys[i].toLowerCase())

        if (match) {
          seq.handler()
          resetSequence()
          return
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (sequenceTimer.current) clearTimeout(sequenceTimer.current)
    }
  }, [resetSequence])
}
