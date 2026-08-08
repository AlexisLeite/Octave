import { describe, expect, it } from 'vitest'
import { defaultMarkdownSerializer, schema } from 'prosemirror-markdown'
import { EditorState, TextSelection } from 'prosemirror-state'

import { markdownBlockShortcut, markdownHeadingOnEnter } from './MarkdownEditor'

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

function stateSelectionAtEnd(doc: ReturnType<typeof schema.node>) {
  return TextSelection.near(doc.resolve(doc.content.size - 1))
}
