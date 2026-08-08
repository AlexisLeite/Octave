const OPENERS = new Set([
  'classdef', 'do', 'enumeration', 'events', 'for', 'function', 'if', 'methods',
  'parfor', 'properties', 'switch', 'try', 'unwind_protect', 'while',
])

const CLOSERS = new Set([
  'end', 'end_try_catch', 'end_unwind_protect', 'endclassdef', 'endenumeration',
  'endevents', 'endfor', 'endfunction', 'endif', 'endmethods', 'endparfor',
  'endproperties', 'endswitch', 'endwhile', 'until',
])

const BRANCHES = new Set(['else', 'elseif', 'catch', 'unwind_protect_cleanup'])
const CASES = new Set(['case', 'otherwise'])
const CONTROL_WORDS = new Set(['catch', 'for', 'if', 'parfor', 'switch', 'while'])
const NO_BLANK_AFTER = new Set(['for', 'function', 'if', 'elseif', 'while'])

type LineAnalysis = {
  code: string
  matrixDepthBefore: number
  matrixDepthAfter: number
  matrixProtected: boolean
}

function firstToken(line: string): string {
  const match = /^\s*([A-Za-z_]\w*)/.exec(line)
  return match?.[1].toLowerCase() ?? ''
}

function structuralTokens(line: string, incomingDepth = 0): string[] {
  const result: string[] = []
  let depth = incomingDepth
  let expectsWord = depth === 0

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '(' || character === '[' || character === '{') {
      depth += 1
      expectsWord = false
      continue
    }
    if (character === ')' || character === ']' || character === '}') {
      depth = Math.max(0, depth - 1)
      continue
    }
    if (depth === 0 && (character === ',' || character === ';')) {
      expectsWord = true
      continue
    }
    if (!expectsWord || depth !== 0 || /\s/.test(character)) continue
    const match = /^[A-Za-z_]\w*/.exec(line.slice(index))
    if (match) {
      result.push(match[0].toLowerCase())
      index += match[0].length - 1
    }
    expectsWord = false
  }
  return result
}

function leadingWidth(line: string): number {
  return /^\s*/.exec(line)?.[0].replace(/\t/g, '  ').length ?? 0
}

function consumeQuoted(line: string, start: number, quote: "'" | '"'): number {
  for (let index = start + 1; index < line.length; index += 1) {
    if (quote === "'" && line[index] === "'" && line[index + 1] === "'") {
      index += 1
      continue
    }
    if (quote === '"' && line[index] === '\\') {
      index += 1
      continue
    }
    if (line[index] === quote) return index
  }
  return line.length - 1
}

function analyzeLines(lines: string[]): LineAnalysis[] {
  let matrixDepth = 0
  let blockComment = false

  return lines.map((line) => {
    const matrixDepthBefore = matrixDepth
    const trimmed = line.trimStart()
    const startsBlockComment = /^(?:%\{|#\{)\s*$/.test(trimmed)
    const endsBlockComment = /^(?:%\}|#\})\s*$/.test(trimmed)
    let code = ''
    let expectOperand = true

    if (blockComment || startsBlockComment) {
      code = ' '.repeat(line.length)
    } else {
      for (let index = 0; index < line.length; index += 1) {
        const character = line[index]

        if (character === '%' || character === '#') {
          code += ' '.repeat(line.length - index)
          break
        }
        if (character === '"') {
          const end = consumeQuoted(line, index, '"')
          code += ' '.repeat(end - index + 1)
          index = end
          expectOperand = false
          continue
        }
        if (character === "'") {
          if (expectOperand) {
            const end = consumeQuoted(line, index, "'")
            code += ' '.repeat(end - index + 1)
            index = end
          } else {
            code += character // transpose, not a string delimiter
          }
          expectOperand = false
          continue
        }
        if (/[A-Za-z_]/.test(character)) {
          const match = /^[A-Za-z_]\w*/.exec(line.slice(index))?.[0] ?? character
          code += match
          index += match.length - 1
          expectOperand = false
          continue
        }
        if (/\d/.test(character)) {
          const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eEdD][+-]?\d+)?/.exec(line.slice(index))?.[0] ?? character
          code += match
          index += match.length - 1
          expectOperand = false
          continue
        }

        code += character
        if (character === '[') {
          matrixDepth += 1
          expectOperand = true
        } else if (character === ']') {
          matrixDepth = Math.max(0, matrixDepth - 1)
          expectOperand = false
        } else if (character === ')' || character === '}') {
          expectOperand = false
        } else if (character === '(' || character === '{' || character === ',' || character === ';' || /=|\+|-|\*|\/|\\|\^|&|\||~|:/.test(character)) {
          expectOperand = true
        }
      }
    }

    if (startsBlockComment) blockComment = true
    if (endsBlockComment) blockComment = false
    const matrixDepthAfter = matrixDepth
    return {
      code,
      matrixDepthBefore,
      matrixDepthAfter,
      matrixProtected: matrixDepthBefore > 0 || matrixDepthAfter > 0,
    }
  })
}

function normalizeCallSpacing(line: string): string {
  let result = ''
  let expectOperand = true
  const callStack: boolean[] = []

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '%' || character === '#') {
      result += line.slice(index)
      break
    }
    if (character === '"' || (character === "'" && expectOperand)) {
      const end = consumeQuoted(line, index, character as "'" | '"')
      result += line.slice(index, end + 1)
      index = end
      expectOperand = false
      continue
    }
    if (character === "'") {
      result += character
      expectOperand = false
      continue
    }
    if (/[A-Za-z_]/.test(character)) {
      const match = /^[A-Za-z_]\w*/.exec(line.slice(index))?.[0] ?? character
      result += match
      index += match.length - 1
      expectOperand = false
      continue
    }
    if (/\d/.test(character)) {
      const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eEdD][+-]?\d+)?/.exec(line.slice(index))?.[0] ?? character
      result += match
      index += match.length - 1
      expectOperand = false
      continue
    }
    if (character === '(') {
      const identifier = /([A-Za-z_]\w*)\s*$/.exec(result)?.[1]
      const isCall = Boolean(identifier && !CONTROL_WORDS.has(identifier.toLowerCase()))
      if (isCall) result = result.replace(/[ \t]+$/g, '')
      result += character
      callStack.push(isCall)
      if (isCall) while (line[index + 1] === ' ' || line[index + 1] === '\t') index += 1
      expectOperand = true
      continue
    }
    if (character === ')') {
      if (callStack.at(-1)) result = result.replace(/[ \t]+$/g, '')
      result += character
      callStack.pop()
      expectOperand = false
      continue
    }
    if (character === ',' && callStack.at(-1)) {
      result = `${result.replace(/[ \t]+$/g, '')},`
      while (line[index + 1] === ' ' || line[index + 1] === '\t') index += 1
      if (line[index + 1] && line[index + 1] !== ')') result += ' '
      expectOperand = true
      continue
    }

    result += character
    if (character === '[' || character === '{' || character === ',' || character === ';' || /=|\+|-|\*|\/|\\|\^|&|\||~|:/.test(character)) expectOperand = true
    else if (character === ']' || character === '}') expectOperand = false
  }
  return result
}

const SPACED_OPERATOR = /[ \t]*(\.\*\*=|\.\*=|\.\/=|\.\\=|\.\^=|\*\*=|\+=|-=|\*=|\/=|\\=|\^=|&=|\|=|==|!=|~=|<=|>=|&&|\|\||\.\*|\.\/|\.\\|\.\^|\*\*|=|<|>|\*|\/|\\|\^|&|\|)[ \t]*/g

function normalizeOperators(line: string): string {
  let result = ''
  let code = ''
  let expectOperand = true
  const flush = () => {
    result += code
      .replace(/(@\([^()]*\))[ \t]*(?=\S)/g, '$1 ')
      .replace(SPACED_OPERATOR, ' $1 ')
    code = ''
  }

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '%' || character === '#') {
      flush()
      result += line.slice(index)
      return result.trimEnd()
    }
    if (character === '"' || (character === "'" && expectOperand)) {
      flush()
      const end = consumeQuoted(line, index, character as "'" | '"')
      result += line.slice(index, end + 1)
      index = end
      expectOperand = false
      continue
    }
    if (character === "'") {
      code += character
      expectOperand = false
      continue
    }
    if (/[A-Za-z_]/.test(character)) {
      const match = /^[A-Za-z_]\w*/.exec(line.slice(index))?.[0] ?? character
      code += match
      index += match.length - 1
      expectOperand = false
      continue
    }
    if (/\d/.test(character)) {
      const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eEdD][+-]?\d+)?/.exec(line.slice(index))?.[0] ?? character
      code += match
      index += match.length - 1
      expectOperand = false
      continue
    }

    code += character
    if (character === ')' || character === ']' || character === '}') expectOperand = false
    else if (!/\s/.test(character)) expectOperand = true
  }
  flush()
  return result.trimEnd()
}

/**
 * Conservative Octave formatter. It only changes block indentation, call
 * spacing, blank lines and trailing whitespace. Strings, comments and
 * transpose operators are lexically protected; multiline matrices retain
 * their internal alignment when their enclosing block moves.
 */
export function formatOctaveCode(source: string, indent = '  '): string {
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const analyses = analyzeLines(lines)
  const stack: string[] = []
  let continuation = false
  let matrixIndentShift: number | null = null

  const formatted = lines.map((rawLine, index) => {
    const analysis = analyses[index]
    const line = rawLine.replace(/[ \t]+$/g, '')
    if (!line.trim()) {
      continuation = false
      return { text: '', preserveBlank: analysis.matrixProtected }
    }

    const trimmed = line.trimStart()
    const lineTokens = analysis.matrixDepthBefore > 0
      ? []
      : structuralTokens(analysis.code, analysis.matrixDepthBefore)
    const token = lineTokens[0] ?? ''
    if (CLOSERS.has(token)) {
      if (stack.at(-1) === 'case') stack.pop()
      if (stack.length) stack.pop()
    } else if (CASES.has(token)) {
      if (stack.at(-1) === 'case') stack.pop()
    }

    let depth = stack.length
    if (BRANCHES.has(token)) depth = Math.max(0, depth - 1)
    if (continuation && !CLOSERS.has(token) && !BRANCHES.has(token) && !CASES.has(token)) depth += 1

    let text: string
    if (analysis.matrixProtected) {
      if (analysis.matrixDepthBefore === 0) matrixIndentShift = depth * indent.length - leadingWidth(line)
      const width = Math.max(0, leadingWidth(line) + (matrixIndentShift ?? 0))
      text = `${' '.repeat(width)}${trimmed}`
    } else {
      text = `${indent.repeat(depth)}${normalizeOperators(normalizeCallSpacing(trimmed))}`
    }

    if (CASES.has(token)) stack.push('case')
    else if (OPENERS.has(token)) stack.push(token)

    // Octave permits several statements on one physical line. Apply the
    // remaining structural tokens so `if cond, a=1; else, a=2; endif` has no
    // effect on the indentation of the following line.
    for (const inlineToken of lineTokens.slice(1)) {
      if (CLOSERS.has(inlineToken)) {
        if (stack.at(-1) === 'case') stack.pop()
        if (stack.length) stack.pop()
      } else if (CASES.has(inlineToken)) {
        if (stack.at(-1) === 'case') stack.pop()
        stack.push('case')
      } else if (OPENERS.has(inlineToken)) {
        stack.push(inlineToken)
      }
    }

    continuation = /\.\.\.\s*$/.test(analysis.code)
    if (analysis.matrixDepthBefore > 0 && analysis.matrixDepthAfter === 0) matrixIndentShift = null
    return { text, preserveBlank: analysis.matrixProtected }
  })

  while (formatted[0]?.text === '') formatted.shift()
  while (formatted.at(-1)?.text === '') formatted.pop()

  const compact: typeof formatted = []
  for (const entry of formatted) {
    const previous = compact.at(-1)
    if (entry.text === '' && NO_BLANK_AFTER.has(firstToken(previous?.text ?? ''))) continue
    if (entry.text === '' && previous?.text === '' && !entry.preserveBlank && !previous.preserveBlank) continue
    compact.push(entry)
  }
  return compact.map((entry) => entry.text).join(newline)
}
