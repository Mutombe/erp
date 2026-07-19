import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/utils'

interface TooltipProps {
  content: React.ReactNode
  children: React.ReactElement
  side?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
  className?: string
}

export function Tooltip({ content, children, side = 'top', delay = 200, className }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState({ x: 0, y: 0 })
  const triggerRef = useRef<HTMLDivElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()

  const show = () => {
    timeoutRef.current = setTimeout(() => {
      if (!triggerRef.current) return
      const rect = triggerRef.current.getBoundingClientRect()
      const scrollX = window.scrollX
      const scrollY = window.scrollY

      let x = 0, y = 0
      switch (side) {
        case 'top':
          x = rect.left + scrollX + rect.width / 2
          y = rect.top + scrollY - 8
          break
        case 'bottom':
          x = rect.left + scrollX + rect.width / 2
          y = rect.bottom + scrollY + 8
          break
        case 'left':
          x = rect.left + scrollX - 8
          y = rect.top + scrollY + rect.height / 2
          break
        case 'right':
          x = rect.right + scrollX + 8
          y = rect.top + scrollY + rect.height / 2
          break
      }
      setCoords({ x, y })
      setVisible(true)
    }, delay)
  }

  const hide = () => {
    clearTimeout(timeoutRef.current)
    setVisible(false)
  }

  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  const positionStyle: React.CSSProperties = (() => {
    switch (side) {
      case 'top':
        return { left: coords.x, top: coords.y, transform: 'translate(-50%, -100%)' }
      case 'bottom':
        return { left: coords.x, top: coords.y, transform: 'translate(-50%, 0)' }
      case 'left':
        return { left: coords.x, top: coords.y, transform: 'translate(-100%, -50%)' }
      case 'right':
        return { left: coords.x, top: coords.y, transform: 'translate(0, -50%)' }
    }
  })()

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className="inline-flex"
      >
        {children}
      </div>
      {visible && content && createPortal(
        <div
          style={{ ...positionStyle, position: 'absolute', zIndex: 9999 }}
          className={cn(
            'px-2.5 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-lg shadow-lg pointer-events-none max-w-xs whitespace-pre-line',
            className
          )}
          role="tooltip"
        >
          {content}
        </div>,
        document.body
      )}
    </>
  )
}
