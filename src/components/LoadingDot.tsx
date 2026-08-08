import { useEffect, useState } from 'react'

interface LoadingDotProps {
  active: boolean
  className?: string
}

export function LoadingDot({ active, className = '' }: LoadingDotProps) {
  const [on, setOn] = useState(true)

  useEffect(() => {
    if (!active) {
      setOn(true)
      return
    }
    setOn(true)
    const timer = window.setInterval(() => setOn((current) => !current), 480)
    return () => window.clearInterval(timer)
  }, [active])

  return (
    <span
      className={`loading-dot${active ? ` active ${on ? 'on' : 'off'}` : ''}${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    />
  )
}
