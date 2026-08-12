import { useEffect, useMemo, useRef, useState } from 'react'
import { outputLines } from '../editor/outputTail'

interface NumberedOutputProps {
  value: string
}

const OUTPUT_ROW_HEIGHT = 19
const OUTPUT_OVERSCAN = 12

export function virtualOutputRange(lineCount: number, visibleTop: number, visibleHeight: number, rowHeight = OUTPUT_ROW_HEIGHT, overscan = OUTPUT_OVERSCAN) {
  if (!lineCount || visibleHeight <= 0) return { start: 0, end: 0 }
  const start = Math.max(0, Math.floor(visibleTop / rowHeight) - overscan)
  const end = Math.min(lineCount, Math.ceil((visibleTop + visibleHeight) / rowHeight) + overscan)
  return { start, end }
}

export function NumberedOutput({ value }: NumberedOutputProps) {
  const lines = useMemo(() => outputLines(value), [value])
  const rootRef = useRef<HTMLDivElement>(null)
  const [range, setRange] = useState(() => ({ start: Math.max(0, lines.length - 50), end: lines.length }))

  useEffect(() => {
    const root = rootRef.current
    const viewport = root?.closest<HTMLElement>('.cell-output-content')
    if (!root || !viewport) return

    let frame = 0
    const update = () => {
      frame = 0
      const rootRect = root.getBoundingClientRect()
      const viewportRect = viewport.getBoundingClientRect()
      const intersectionTop = Math.max(rootRect.top, viewportRect.top)
      const intersectionBottom = Math.min(rootRect.bottom, viewportRect.bottom)
      const next = intersectionBottom <= intersectionTop
        ? { start: 0, end: 0 }
        : virtualOutputRange(lines.length, intersectionTop - rootRect.top, intersectionBottom - intersectionTop)
      setRange((current) => current.start === next.start && current.end === next.end ? current : next)
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(root)
    observer.observe(viewport)
    viewport.addEventListener('scroll', schedule, { passive: true })
    schedule()

    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      viewport.removeEventListener('scroll', schedule)
    }
  }, [lines.length])

  if (!lines.length) return null
  const visibleLines = lines.slice(range.start, range.end)
  return (
    <div
      ref={rootRef}
      className="numbered-output"
      style={{ height: lines.length * OUTPUT_ROW_HEIGHT }}
    >
      {visibleLines.map((line) => (
        <div
          className="numbered-output-line"
          key={line.number}
          style={{ transform: `translateY(${(line.number - 1) * OUTPUT_ROW_HEIGHT}px)` }}
        >
          <span aria-hidden="true">{line.number}</span>
          <code>{line.text || '\u00a0'}</code>
        </div>
      ))}
    </div>
  )
}
