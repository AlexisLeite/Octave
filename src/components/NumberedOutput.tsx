import { outputTail } from '../editor/outputTail'

interface NumberedOutputProps {
  value: string
  limit?: number
}

export function NumberedOutput({ value, limit = 200 }: NumberedOutputProps) {
  const lines = outputTail(value, limit)
  if (!lines.length) return null
  return (
    <div className="numbered-output">
      {lines.map((line) => (
        <div className="numbered-output-line" key={line.number}>
          <span aria-hidden="true">{line.number}</span>
          <code>{line.text || '\u00a0'}</code>
        </div>
      ))}
    </div>
  )
}
