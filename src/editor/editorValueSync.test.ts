import { describe, expect, it } from 'vitest'
import { reconcileEditorValue, recordLocalEditorValue } from './editorValueSync'

describe('reconcileEditorValue', () => {
  it('does not replace a newer Monaco draft with an older React acknowledgement', () => {
    const decision = reconcileEditorValue(
      ['S', 'Su', 'Suc', 'Suce'],
      'Su',
      'Suce',
    )

    expect(decision).toEqual({
      remainingLocalValues: ['Suc', 'Suce'],
      applyParentValue: false,
    })
  })

  it('clears acknowledged drafts when React reaches the current model', () => {
    const decision = reconcileEditorValue(['Suc', 'Suce'], 'Suce', 'Suce')

    expect(decision).toEqual({
      remainingLocalValues: [],
      applyParentValue: false,
    })
  })

  it('applies formatting and other values not emitted by Monaco', () => {
    const decision = reconcileEditorValue([], 'i = 0;', 'i=0;')

    expect(decision.applyParentValue).toBe(true)
  })

  it('can apply an older value after all local drafts were acknowledged', () => {
    const decision = reconcileEditorValue([], 'antes', 'después')

    expect(decision.applyParentValue).toBe(true)
  })

  it('bounds retained drafts while preserving the newest acknowledgement', () => {
    const pending: string[] = []
    for (let index = 0; index < 100; index += 1) recordLocalEditorValue(pending, `draft-${index}`)

    expect(pending).toHaveLength(64)
    expect(pending.at(-1)).toBe('draft-99')
    expect(reconcileEditorValue(pending, 'draft-99', 'draft-99').remainingLocalValues).toEqual([])
  })
})
