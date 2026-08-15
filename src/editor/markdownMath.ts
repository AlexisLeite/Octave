import katex from 'katex'
import {
  MarkdownParser,
  MarkdownSerializer,
  defaultMarkdownParser,
  defaultMarkdownSerializer,
  schema as baseSchema,
} from 'prosemirror-markdown'
import { Schema, type Node as ProseMirrorNode, type NodeSpec } from 'prosemirror-model'
import { EditorState, Plugin } from 'prosemirror-state'
import type { EditorView, NodeView } from 'prosemirror-view'

const mathInlineSpec: NodeSpec = {
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,
  attrs: { latex: { default: '' } },
  parseDOM: [{
    tag: '[data-math-inline]',
    getAttrs: (dom) => ({ latex: (dom as HTMLElement).dataset.latex ?? dom.textContent ?? '' }),
  }],
  toDOM: (node) => ['span', {
    'data-math-inline': '',
    'data-latex': node.attrs.latex,
    title: node.attrs.latex,
  }, `$${node.attrs.latex}$`],
}

const mathBlockSpec: NodeSpec = {
  group: 'block',
  atom: true,
  selectable: true,
  attrs: { latex: { default: '' } },
  parseDOM: [{
    tag: '[data-math-block]',
    getAttrs: (dom) => ({ latex: (dom as HTMLElement).dataset.latex ?? dom.textContent ?? '' }),
  }],
  toDOM: (node) => ['div', {
    'data-math-block': '',
    'data-latex': node.attrs.latex,
    title: node.attrs.latex,
  }, `$$\n${node.attrs.latex}\n$$`],
}

const headingSpec = { ...baseSchema.nodes.heading.spec, content: 'inline*' }
const imageSpec: NodeSpec = {
  ...baseSchema.nodes.image.spec,
  attrs: { src: {}, alt: { default: null }, title: { default: null }, width: { default: 100 } },
  parseDOM: [{
    tag: 'img[src]',
    getAttrs: (dom) => {
      const image = dom as HTMLImageElement
      return { src: image.src, alt: image.alt || null, title: image.title || null, width: Number(image.dataset.width || 100) }
    },
  }],
  toDOM: (node) => ['img', {
    src: node.attrs.src, alt: node.attrs.alt, title: node.attrs.title,
    'data-width': node.attrs.width, style: `width:${node.attrs.width}%;max-width:100%`,
  }],
}
const nodes = baseSchema.spec.nodes
  .update('heading', headingSpec)
  .update('image', imageSpec)
  .append({ math_inline: mathInlineSpec, math_block: mathBlockSpec })

export const markdownSchema = new Schema({ nodes, marks: baseSchema.spec.marks })

interface MarkdownToken {
  content: string
  markup: string
}

interface InlineState {
  src: string
  pos: number
  posMax: number
  pending: string
  push(type: string, tag: string, nesting: number): MarkdownToken
}

interface BlockState {
  src: string
  bMarks: number[]
  eMarks: number[]
  tShift: number[]
  sCount: number[]
  blkIndent: number
  line: number
  push(type: string, tag: string, nesting: number): MarkdownToken
  getLines(begin: number, end: number, indent: number, keepLastLF: boolean): string
}

type MarkdownTokenizer = typeof defaultMarkdownParser.tokenizer & {
  __octaveMathRules?: boolean
  inline: { ruler: { before(name: string, ruleName: string, rule: (state: InlineState, silent: boolean) => boolean): void } }
  block: { ruler: { before(name: string, ruleName: string, rule: (state: BlockState, start: number, end: number, silent: boolean) => boolean, options: { alt: string[] }): void } }
}

function isEscaped(source: string, position: number) {
  let slashes = 0
  for (let index = position - 1; index >= 0 && source[index] === '\\'; index -= 1) slashes += 1
  return slashes % 2 === 1
}

function inlineMathRule(state: InlineState, silent: boolean) {
  const start = state.pos
  if (state.src[start] !== '$' || state.src[start + 1] === '$' || isEscaped(state.src, start)) return false

  for (let end = start + 1; end < state.posMax; end += 1) {
    if (state.src[end] === '\n') return false
    if (state.src[end] !== '$' || isEscaped(state.src, end)) continue
    if (end === start + 1 || state.src[end - 1] === ' ') return false
    if (!silent) {
      const token = state.push('math_inline', 'math', 0)
      token.content = state.src.slice(start + 1, end)
      token.markup = '$'
    }
    state.pos = end + 1
    return true
  }
  return false
}

function blockMathRule(state: BlockState, startLine: number, endLine: number, silent: boolean) {
  const start = state.bMarks[startLine] + state.tShift[startLine]
  const max = state.eMarks[startLine]
  if (state.sCount[startLine] - state.blkIndent >= 4) return false
  const opening = state.src.slice(start, max)
  if (!opening.startsWith('$$')) return false

  const sameLineEnd = opening.indexOf('$$', 2)
  if (sameLineEnd >= 2 && !opening.slice(sameLineEnd + 2).trim()) {
    if (silent) return true
    const token = state.push('math_block', 'math', 0)
    token.content = opening.slice(2, sameLineEnd).trim()
    token.markup = '$$'
    state.line = startLine + 1
    return true
  }
  if (opening.slice(2).trim()) return false

  let nextLine = startLine + 1
  while (nextLine < endLine) {
    const lineStart = state.bMarks[nextLine] + state.tShift[nextLine]
    const lineEnd = state.eMarks[nextLine]
    if (state.src.slice(lineStart, lineEnd).trim() === '$$') break
    nextLine += 1
  }
  if (nextLine >= endLine) return false
  if (silent) return true

  const token = state.push('math_block', 'math', 0)
  token.content = state.getLines(startLine + 1, nextLine, state.blkIndent, false).trim()
  token.markup = '$$'
  state.line = nextLine + 1
  return true
}

function mathTokenizer() {
  const tokenizer = defaultMarkdownParser.tokenizer as MarkdownTokenizer
  if (!tokenizer.__octaveMathRules) {
    tokenizer.inline.ruler.before('escape', 'math_inline', inlineMathRule)
    tokenizer.block.ruler.before('fence', 'math_block', blockMathRule, {
      alt: ['paragraph', 'reference', 'blockquote', 'list'],
    })
    tokenizer.__octaveMathRules = true
  }
  return tokenizer
}

export const markdownParser = new MarkdownParser(markdownSchema, mathTokenizer(), {
  ...defaultMarkdownParser.tokens,
  image: { node: 'image', getAttrs: (token: any) => {
    const title = token.attrGet('title') as string | null
    const widthMatch = /^octave-width:(\d+)(?:;(.*))?$/.exec(title || '')
    return {
      src: token.attrGet('src'), alt: token.content || null,
      title: widthMatch?.[2] || null, width: widthMatch ? Math.min(100, Math.max(10, Number(widthMatch[1]))) : 100,
    }
  } },
  math_inline: { node: 'math_inline', getAttrs: (token) => ({ latex: token.content }) },
  math_block: { node: 'math_block', getAttrs: (token) => ({ latex: token.content }) },
})

export const markdownSerializer = new MarkdownSerializer({
  ...defaultMarkdownSerializer.nodes,
  image(state, node) {
    const widthTitle = `octave-width:${node.attrs.width || 100}${node.attrs.title ? `;${node.attrs.title}` : ''}`
    const encoded = node.type.create({ ...node.attrs, title: widthTitle })
    defaultMarkdownSerializer.nodes.image(state, encoded, null as never, 0)
  },
  math_inline(state, node) { state.text(`$${node.attrs.latex}$`, false) },
  math_block(state, node) {
    state.write(`$$\n${node.attrs.latex}\n$$`)
    state.closeBlock(node)
  },
}, defaultMarkdownSerializer.marks)

export function parseMarkdown(source: string) {
  return markdownParser.parse(source || '')
}

export function serializeMarkdown(doc: ProseMirrorNode) {
  return markdownSerializer.serialize(doc)
}

export function splitMarkdownDocument(doc: ProseMirrorNode, from: number, to: number) {
  const extracted = markdownSerializer.serialize(doc.cut(from, to)).trim()
  if (!extracted) return null

  // Deleting all text from a block leaves an empty ProseMirror paragraph.
  // Serializing that paragraph produces an otherwise invisible blank line in
  // the original cell. Round-trip the remainder through Markdown so empty
  // boundary blocks disappear while real internal paragraph breaks remain.
  const deleted = EditorState.create({ doc }).tr.delete(from, to).doc
  const remaining = markdownSerializer.serialize(deleted).trim()
  return {
    extracted,
    remaining,
    document: markdownParser.parse(remaining),
  }
}

export function renderLatexHtml(latex: string, displayMode: boolean) {
  return katex.renderToString(latex, {
    displayMode,
    throwOnError: false,
    strict: false,
    output: 'htmlAndMathml',
  })
}

class MathNodeView implements NodeView {
  dom: HTMLElement
  private node: ProseMirrorNode
  private readonly view: EditorView
  private readonly getPos: () => number | undefined
  private readonly displayMode: boolean
  private rendered: HTMLElement
  private editor: HTMLInputElement

  constructor(node: ProseMirrorNode, view: EditorView, getPos: () => number | undefined, displayMode: boolean) {
    this.node = node
    this.view = view
    this.getPos = getPos
    this.displayMode = displayMode
    this.dom = document.createElement(displayMode ? 'div' : 'span')
    this.dom.dataset.math = displayMode ? 'block' : 'inline'
    this.dom.contentEditable = 'false'
    this.dom.title = 'Doble clic para editar LaTeX'
    this.dom.style.cssText = displayMode
      ? 'display:block;text-align:center;margin:.65rem 0;cursor:text;overflow-x:auto;padding:.25rem'
      : 'display:inline-block;vertical-align:middle;cursor:text;padding:0 .08em'

    this.rendered = document.createElement(displayMode ? 'div' : 'span')
    this.editor = document.createElement('input')
    this.editor.type = 'text'
    this.editor.setAttribute('aria-label', 'Fuente LaTeX')
    this.editor.spellcheck = false
    this.editor.style.cssText = 'display:none;width:min(100%,42rem);box-sizing:border-box;font:inherit;font-family:ui-monospace,monospace;color:inherit;background:color-mix(in srgb,currentColor 7%,transparent);border:1px solid currentColor;border-radius:4px;padding:.3rem .45rem;outline:none'
    this.dom.append(this.rendered, this.editor)
    this.render()

    this.dom.addEventListener('dblclick', (event) => {
      event.preventDefault()
      event.stopPropagation()
      this.beginEditing()
    })
    this.editor.addEventListener('blur', () => this.commit())
    this.editor.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); this.commit() }
      if (event.key === 'Escape') { event.preventDefault(); this.cancel() }
    })
  }

  private render() {
    this.rendered.innerHTML = renderLatexHtml(this.node.attrs.latex, this.displayMode)
    this.dom.dataset.latex = this.node.attrs.latex
  }

  private beginEditing() {
    this.editor.value = this.node.attrs.latex
    this.rendered.style.display = 'none'
    this.editor.style.display = 'inline-block'
    this.editor.focus()
    this.editor.select()
  }

  private finishEditing() {
    this.editor.style.display = 'none'
    this.rendered.style.display = ''
  }

  private commit() {
    const latex = this.editor.value.trim()
    const position = this.getPos()
    if (position !== undefined && latex && latex !== this.node.attrs.latex) {
      this.view.dispatch(this.view.state.tr.setNodeMarkup(position, undefined, { latex }))
    }
    this.finishEditing()
  }

  private cancel() {
    this.editor.value = this.node.attrs.latex
    this.finishEditing()
    this.view.focus()
  }

  update(node: ProseMirrorNode) {
    if (node.type !== this.node.type) return false
    this.node = node
    this.render()
    return true
  }

  stopEvent(event: Event) { return event.target === this.editor }
  ignoreMutation() { return true }
}

export const mathNodeViews = {
  math_inline: (node: ProseMirrorNode, view: EditorView, getPos: () => number | undefined) => new MathNodeView(node, view, getPos, false),
  math_block: (node: ProseMirrorNode, view: EditorView, getPos: () => number | undefined) => new MathNodeView(node, view, getPos, true),
}

function openingDollar(text: string) {
  for (let index = text.length - 1; index >= 0; index -= 1) {
    if (text[index] !== '$' || isEscaped(text, index)) continue
    if (text[index - 1] === '$' || text[index + 1] === '$') return -1
    return index
  }
  return -1
}

/** Converts a just-completed `$…$` or `$$…$$` expression while typing. */
export function mathInputPlugin() {
  return new Plugin({
    props: {
      handleTextInput(view, from, to, text) {
        if (text !== '$' || from !== to) return false
        const { $from } = view.state.selection
        if ($from.parent.type !== markdownSchema.nodes.paragraph) return false
        const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc')

        const block = /^\$\$([\s\S]+)\$$/.exec(before)
        if (block) {
          const position = $from.before()
          view.dispatch(view.state.tr.replaceWith(
            position,
            position + $from.parent.nodeSize,
            markdownSchema.nodes.math_block.create({ latex: block[1].trim() }),
          ).scrollIntoView())
          return true
        }

        const start = openingDollar(before)
        if (start < 0) return false
        const latex = before.slice(start + 1)
        if (!latex.trim() || /\n/.test(latex)) return false
        view.dispatch(view.state.tr.replaceWith(
          $from.start() + start,
          from,
          markdownSchema.nodes.math_inline.create({ latex }),
        ).scrollIntoView())
        return true
      },
    },
  })
}

function elementText(element: Element) {
  return (element.textContent ?? '').trim()
}

/** Extracts useful TeX from MathML, preferring its lossless TeX annotation. */
export function mathMlElementToLatex(math: Element): string {
  const annotation = math.querySelector('annotation[encoding="application/x-tex"], annotation[encoding="application/tex"]')
  if (annotation?.textContent?.trim()) return annotation.textContent.trim()

  const convert = (element: Element): string => {
    const children = Array.from(element.children)
    const child = (index: number) => children[index] ? convert(children[index]) : ''
    switch (element.localName.toLowerCase()) {
      case 'math': case 'mrow': case 'semantics': return children.map(convert).join('') || elementText(element)
      case 'mi': case 'mn': case 'mo': case 'mtext': return elementText(element)
      case 'msup': return `{${child(0)}}^{${child(1)}}`
      case 'msub': return `{${child(0)}}_{${child(1)}}`
      case 'msubsup': return `{${child(0)}}_{${child(1)}}^{${child(2)}}`
      case 'mfrac': return `\\frac{${child(0)}}{${child(1)}}`
      case 'msqrt': return `\\sqrt{${children.map(convert).join('')}}`
      case 'mroot': return `\\sqrt[${child(1)}]{${child(0)}}`
      default: return children.map(convert).join('') || elementText(element)
    }
  }
  return convert(math)
}

/** Replaces MathML in clipboard HTML with schema-readable math nodes. */
export function normalizeClipboardMath(root: ParentNode) {
  root.querySelectorAll('math').forEach((math) => {
    if (!math.isConnected) return
    const katexContainer = math.closest('.katex')
    const target = katexContainer ?? math
    const soleParagraph = target.parentElement?.tagName === 'P' && target.parentElement.childNodes.length === 1
    const display = math.getAttribute('display') === 'block'
      || Boolean(math.closest('.katex-display'))
      || soleParagraph
    const replacement = document.createElement(display ? 'div' : 'span')
    const block = display
    replacement.dataset[block ? 'mathBlock' : 'mathInline'] = ''
    replacement.dataset.latex = mathMlElementToLatex(math)
    replacement.textContent = block
      ? `$$\n${replacement.dataset.latex}\n$$`
      : `$${replacement.dataset.latex}$`
    const replacementTarget = soleParagraph ? target.parentElement! : target
    replacementTarget.replaceWith(replacement)
  })

  // PDF/web clipboards sometimes encode simple formulae as x<sub>n</sub>
  // instead of MathML. Fold those runs into one editable math node while
  // leaving unrelated rich HTML (headings, lists, emphasis) untouched.
  root.querySelectorAll('sub, sup').forEach((script) => {
    if (!script.isConnected || script.closest('[data-math-inline], [data-math-block]')) return
    const previous = script.previousSibling
    if (!previous) return

    let base = ''
    if (previous instanceof HTMLElement && previous.dataset.mathInline !== undefined) {
      base = previous.dataset.latex ?? ''
      previous.remove()
    } else if (previous.nodeType === Node.TEXT_NODE) {
      const source = previous.textContent ?? ''
      const match = /([^\s,;:]+)$/.exec(source)
      if (!match) return
      base = match[1]
      previous.textContent = source.slice(0, -base.length)
    } else {
      return
    }

    const latex = script.localName === 'sup'
      ? `{${base}}^{${elementText(script)}}`
      : `{${base}}_{${elementText(script)}}`
    const replacement = document.createElement('span')
    replacement.dataset.mathInline = ''
    replacement.dataset.latex = latex
    replacement.textContent = `$${latex}$`
    script.replaceWith(replacement)
  })
}
