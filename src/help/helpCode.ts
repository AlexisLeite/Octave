/**
 * Help examples are intentionally "observable notebooks": every statement
 * leaves its result visible. Semicolons inside strings and comments are data,
 * while executable statement terminators suppress output. Matrix and cell-array
 * row separators are structural and remain intact; only statement terminators
 * become line boundaries.
 */
export function revealHelpCodeResults(source: string): string {
  let result = ''
  let quote: "'" | '"' | undefined
  let inLineComment = false
  let inBlockComment = false
  let expectOperand = true
  const rowContainers: Array<'[' | '{'> = []

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    const next = source[index + 1]

    if (inLineComment) {
      result += character
      if (character === '\n') {
        inLineComment = false
        expectOperand = true
      }
      continue
    }

    if (inBlockComment) {
      result += character
      if ((character === '%' || character === '#') && next === '}') {
        result += next
        index += 1
        inBlockComment = false
      }
      continue
    }

    if (quote) {
      result += character
      if (quote === "'" && character === "'" && next === "'") {
        result += next
        index += 1
      } else if (quote === '"' && character === '"' && next === '"') {
        result += next
        index += 1
      } else if (quote === '"' && character === '\\') {
        if (next !== undefined) {
          result += next
          index += 1
        }
      } else if (character === quote) {
        quote = undefined
        expectOperand = false
      }
      continue
    }

    if ((character === '%' || character === '#') && next === '{') {
      result += character + next
      index += 1
      inBlockComment = true
      continue
    }

    if (character === '%' || character === '#') {
      result += character
      inLineComment = true
      continue
    }

    if (character === '"' || character === "'") {
      // After a complete operand, apostrophe is the transpose operator rather
      // than the beginning of a character string.
      if (character === "'" && !expectOperand) {
        result += character
      } else {
        result += character
        quote = character
      }
      continue
    }

    if (character === ';') {
      // Semicolons between `[`/`]` or `{`/`}` delimit rows. They are syntax,
      // not output suppression, so replacing them would change the example.
      // A stack makes nested matrices/cell arrays explicit and prevents a
      // delimiter in a string or comment from corrupting the nesting state.
      if (rowContainers.length > 0) {
        result += character
        expectOperand = true
        continue
      }

      result = result.replace(/[ \t]+$/u, '')
      if (!result.endsWith('\n')) result += '\n'

      // A continued physical line is unnecessary once the semicolon itself
      // has become a real row/statement boundary.
      let cursor = index + 1
      while (source[cursor] === ' ' || source[cursor] === '\t') cursor += 1
      if (source.slice(cursor, cursor + 3) === '...') {
        cursor += 3
        while (cursor < source.length && source[cursor] !== '\n') cursor += 1
      }
      if (source[cursor] === '\r') cursor += 1
      if (source[cursor] === '\n') cursor += 1
      index = cursor - 1
      expectOperand = true
      continue
    }

    result += character
    if (character === '[' || character === '{') {
      rowContainers.push(character)
    } else if (
      (character === ']' && rowContainers.at(-1) === '[')
      || (character === '}' && rowContainers.at(-1) === '{')
    ) {
      rowContainers.pop()
    }
    if (character === '\n') {
      expectOperand = true
      continue
    }
    if (/\s/u.test(character)) continue
    if (/[A-Za-z0-9_]/u.test(character) || character === ')' || character === ']' || character === '}') {
      expectOperand = false
    } else if (character === '.' && next === "'") {
      // Dot-transpose keeps the preceding operand complete.
    } else if (character === '(' || character === '[' || character === '{' || character === ','
      || /=|\+|-|\*|\/|\\|\^|&|\||~|:|<|>/u.test(character)) {
      expectOperand = true
    }
  }

  return result.replace(/\n[ \t]+\n/gu, '\n\n').trim()
}
