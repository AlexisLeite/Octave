import { useLayoutEffect, useRef } from 'react'
import { DOMSerializer } from 'prosemirror-model'
import 'katex/dist/katex.min.css'
import { markdownParser, markdownSchema, renderLatexHtml } from '../editor/markdownMath'

export interface ReadonlyMarkdownProps {
  source: string
  className?: string
}

/**
 * Static counterpart of MarkdownEditor. It deliberately uses the same parser
 * and schema, but mounts no EditorView: help prose is selectable, never editable.
 */
export function ReadonlyMarkdown({ source, className = '' }: ReadonlyMarkdownProps) {
  const host = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const element = host.current
    if (!element) return
    const documentNode = markdownParser.parse(source)
    const fragment = DOMSerializer.fromSchema(markdownSchema).serializeFragment(documentNode.content)

    fragment.querySelectorAll<HTMLElement>('[data-math-inline], [data-math-block]').forEach((math) => {
      const displayMode = math.dataset.mathBlock !== undefined
      math.innerHTML = renderLatexHtml(math.dataset.latex ?? '', displayMode)
      math.removeAttribute('title')
    })
    element.replaceChildren(fragment)
  }, [source])

  return <div ref={host} className={`readonly-markdown ${className}`.trim()} />
}
