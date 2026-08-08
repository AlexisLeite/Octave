import { describe, expect, it } from 'vitest'
import { defaultMarkdownSerializer, schema } from 'prosemirror-markdown'
import { EditorState, TextSelection } from 'prosemirror-state'

import {
  markdownBlockShortcut,
  markdownHeadingOnEnter,
  plainTextPasteSlice,
} from '../editor/markdownEditing'

function typeBlockPrefix(prefix: string) {
  const doc = schema.node('doc', null, [
    schema.node('paragraph', null, prefix ? [schema.text(prefix)] : undefined),
  ])
  const state = EditorState.create({ doc })
  const transaction = markdownBlockShortcut(state, prefix.length + 1, prefix.length + 1, ' ')
  return transaction ? state.apply(transaction) : state
}

describe('MarkdownEditor block shortcuts', () => {
  it.each([1, 2, 3, 4, 5, 6])('turns %s hash marks into the matching heading', (level) => {
    const state = typeBlockPrefix('#'.repeat(level))

    expect(state.doc.firstChild?.type).toBe(schema.nodes.heading)
    expect(state.doc.firstChild?.attrs.level).toBe(level)
    expect(defaultMarkdownSerializer.serialize(state.doc)).toBe(`${'#'.repeat(level)} `)
  })

  it('does not turn seven hash marks into a heading', () => {
    const state = typeBlockPrefix('#######')

    expect(state.doc.firstChild?.type).toBe(schema.nodes.paragraph)
  })

  it.each([
    ['>', 'blockquote'],
    ['-', 'bullet_list'],
    ['*', 'bullet_list'],
    ['1.', 'ordered_list'],
    ['```', 'code_block'],
  ])('supports the %s block prefix', (prefix, nodeName) => {
    const state = typeBlockPrefix(prefix)

    expect(state.doc.firstChild?.type.name).toBe(nodeName)
  })

  it.each([1, 2, 3, 4, 5, 6])('converts a complete level %s heading on Enter', (level) => {
    const source = `${'#'.repeat(level)} Hola`
    const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text(source)])])
    const state = EditorState.create({ doc, selection: stateSelectionAtEnd(doc) })
    let next = state

    expect(markdownHeadingOnEnter(state, (transaction) => { next = state.apply(transaction) })).toBe(true)
    expect(next.doc.child(0).type).toBe(schema.nodes.heading)
    expect(next.doc.child(0).attrs.level).toBe(level)
    expect(next.doc.child(0).textContent).toBe('Hola')
    expect(next.doc.child(1).type).toBe(schema.nodes.paragraph)
    expect(next.selection.$from.parent.type).toBe(schema.nodes.paragraph)
  })
})

describe('MarkdownEditor PDF plain-text paste', () => {
  it('preserves blank-line paragraphs and visual line breaks', () => {
    const slice = plainTextPasteSlice('Primera línea\nsegunda línea\n\nOtro párrafo')
    const doc = schema.nodes.doc.create(null, slice.content)

    expect(doc.childCount).toBe(2)
    expect(doc.child(0).type).toBe(schema.nodes.paragraph)
    expect(doc.child(0).child(1).type).toBe(schema.nodes.hard_break)
    expect(doc.child(1).textContent).toBe('Otro párrafo')
    expect(defaultMarkdownSerializer.serialize(doc)).toBe(
      'Primera línea\\\nsegunda línea\n\nOtro párrafo',
    )
  })

  it('recognizes PDF bullet glyphs and keeps wrapped item lines', () => {
    const slice = plainTextPasteSlice('• Primer punto\ncontinuación\n◦ Segundo punto')
    const doc = schema.nodes.doc.create(null, slice.content)
    const list = doc.firstChild!

    expect(list.type).toBe(schema.nodes.bullet_list)
    expect(list.childCount).toBe(2)
    expect(list.child(0).textContent).toBe('Primer puntocontinuación')
    expect(list.child(0).firstChild?.child(1).type).toBe(schema.nodes.hard_break)
    expect(list.child(1).textContent).toBe('Segundo punto')
  })

  it('recognizes numbered lists and their starting number', () => {
    const slice = plainTextPasteSlice('3. Tercero\n4) Cuarto')
    const doc = schema.nodes.doc.create(null, slice.content)
    const list = doc.firstChild!

    expect(list.type).toBe(schema.nodes.ordered_list)
    expect(list.attrs.order).toBe(3)
    expect(list.childCount).toBe(2)
  })

  it('only creates headings from explicit Markdown heading markers', () => {
    const slice = plainTextPasteSlice('# Encabezado\nTexto normal')
    const doc = schema.nodes.doc.create(null, slice.content)

    expect(doc.child(0).type).toBe(schema.nodes.heading)
    expect(doc.child(0).attrs.level).toBe(1)
    expect(doc.child(1).type).toBe(schema.nodes.paragraph)
  })

  it('keeps UTF-8 characters intact', () => {
    const slice = plainTextPasteSlice('▪ Álgebra y eliminación\nseñal: ñ, π, λ')
    const doc = schema.nodes.doc.create(null, slice.content)

    expect(doc.textContent).toBe('Álgebra y eliminaciónseñal: ñ, π, λ')
  })
})

function stateSelectionAtEnd(doc: ReturnType<typeof schema.node>) {
  return TextSelection.near(doc.resolve(doc.content.size - 1))
}
