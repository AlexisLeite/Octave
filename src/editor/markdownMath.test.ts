import { describe, expect, it } from 'vitest'

import {
  markdownSchema,
  parseMarkdown,
  renderLatexHtml,
  serializeMarkdown,
  splitMarkdownDocument,
} from './markdownMath'

describe('Markdown math', () => {
  it('does not leave a blank line after splitting the final paragraph', () => {
    const doc = parseMarkdown('Texto original\n\nTexto seleccionado')
    const finalParagraphStart = doc.child(0).nodeSize
    const split = splitMarkdownDocument(doc, finalParagraphStart + 1, doc.content.size - 1)

    expect(split?.extracted).toBe('Texto seleccionado')
    expect(split?.remaining).toBe('Texto original')
    expect(serializeMarkdown(split!.document)).toBe('Texto original')
  })

  it('does not leave a leading blank line after splitting the first paragraph', () => {
    const doc = parseMarkdown('Texto seleccionado\n\nTexto restante')
    const split = splitMarkdownDocument(doc, 1, doc.child(0).content.size + 1)

    expect(split?.extracted).toBe('Texto seleccionado')
    expect(split?.remaining).toBe('Texto restante')
  })

  it('parses and preserves inline LaTeX source', () => {
    const source = 'La recurrencia $T_n = T_{n-1} + n$ termina.'
    const doc = parseMarkdown(source)
    const math = doc.firstChild?.child(1)

    expect(math?.type).toBe(markdownSchema.nodes.math_inline)
    expect(math?.attrs.latex).toBe('T_n = T_{n-1} + n')
    expect(serializeMarkdown(doc)).toBe(source)
  })

  it.each([
    String.raw`\sum_{n=0}^{N} f(n)`,
    String.raw`\frac{-b \pm \sqrt{b^2-4ac}}{2a}`,
    String.raw`\lim_{n \to \infty} a_n = 0`,
    String.raw`n \in \mathbb{N},\; \forall n`,
    String.raw`A = \begin{bmatrix}1 & 2 \\ 3 & 4\end{bmatrix}`,
    String.raw`f(x)=\begin{cases}x^2 & x\ge0 \\ -x & x<0\end{cases}`,
    String.raw`\begin{aligned}x+y&=3 \\ 2x-y&=0\end{aligned}`,
  ])('round-trips and renders display math: %s', (latex) => {
    const source = `$$\n${latex}\n$$`
    const doc = parseMarkdown(source)

    expect(doc.firstChild?.type).toBe(markdownSchema.nodes.math_block)
    expect(doc.firstChild?.attrs.latex).toBe(latex)
    expect(serializeMarkdown(doc).trim()).toBe(source)
    expect(renderLatexHtml(latex, true)).toContain('katex-display')
  })

  it('supports a same-line display expression and serializes canonically', () => {
    const doc = parseMarkdown(String.raw`$$\sum_{n=0}^{N} f(n)$$`)

    expect(doc.firstChild?.attrs.latex).toBe(String.raw`\sum_{n=0}^{N} f(n)`)
    expect(serializeMarkdown(doc).trim()).toBe('$$\n\\sum_{n=0}^{N} f(n)\n$$')
  })

  it('does not interpret escaped dollars or currency as math', () => {
    const doc = parseMarkdown(String.raw`Costo: \$10 y $ 20.`)

    expect(doc.descendants((node) => {
      expect(node.type).not.toBe(markdownSchema.nodes.math_inline)
    })).toBeUndefined()
  })
})
