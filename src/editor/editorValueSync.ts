export interface EditorValueSyncDecision {
  remainingLocalValues: string[]
  applyParentValue: boolean
}

const MAX_PENDING_LOCAL_VALUES = 64

export function recordLocalEditorValue(pendingLocalValues: string[], value: string): void {
  if (pendingLocalValues.at(-1) === value) return
  pendingLocalValues.push(value)
  if (pendingLocalValues.length > MAX_PENDING_LOCAL_VALUES) {
    pendingLocalValues.splice(0, pendingLocalValues.length - MAX_PENDING_LOCAL_VALUES)
  }
}

/**
 * Monaco emits drafts ahead of React. A later parent render can therefore
 * contain an older draft; that is an acknowledgement, not an external edit.
 * Only a value which was never emitted locally may replace the editor model.
 */
export function reconcileEditorValue(
  pendingLocalValues: readonly string[],
  parentValue: string,
  modelValue: string,
): EditorValueSyncDecision {
  let acknowledgedIndex = -1
  for (let index = pendingLocalValues.length - 1; index >= 0; index -= 1) {
    if (pendingLocalValues[index] === parentValue) {
      acknowledgedIndex = index
      break
    }
  }

  if (acknowledgedIndex >= 0) {
    return {
      remainingLocalValues: pendingLocalValues.slice(acknowledgedIndex + 1),
      applyParentValue: false,
    }
  }

  return {
    remainingLocalValues: [...pendingLocalValues],
    applyParentValue: parentValue !== modelValue,
  }
}
