import { useEffect, useRef, RefObject } from 'react'

/**
 * Traps focus within a container element.
 * When Tab key is pressed, focus cycles through focusable elements inside the container.
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, enabled: boolean = true) {
  const previousActiveElement = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!enabled || !containerRef.current) return

    // Save the currently focused element to restore later
    previousActiveElement.current = document.activeElement as HTMLElement

    const container = containerRef.current

    const getFocusableElements = (): HTMLElement[] => {
      const selectors = [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled]):not([type="hidden"])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
      ].join(', ')
      return Array.from(container.querySelectorAll(selectors)) as HTMLElement[]
    }

    // Focus the first focusable element
    const focusable = getFocusableElements()
    if (focusable.length > 0) {
      // Focus the first input or the first focusable element
      const firstInput = focusable.find(el => el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')
      ;(firstInput || focusable[0]).focus()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      const elements = getFocusableElements()
      if (elements.length === 0) return

      const firstElement = elements[0]
      const lastElement = elements[elements.length - 1]

      if (e.shiftKey) {
        // Shift+Tab: if at first element, wrap to last
        if (document.activeElement === firstElement) {
          e.preventDefault()
          lastElement.focus()
        }
      } else {
        // Tab: if at last element, wrap to first
        if (document.activeElement === lastElement) {
          e.preventDefault()
          firstElement.focus()
        }
      }
    }

    container.addEventListener('keydown', handleKeyDown)

    return () => {
      container.removeEventListener('keydown', handleKeyDown)
      // Restore focus to the previously focused element
      if (previousActiveElement.current && previousActiveElement.current.focus) {
        previousActiveElement.current.focus()
      }
    }
  }, [containerRef, enabled])
}
