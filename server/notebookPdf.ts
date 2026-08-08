import { mathjax } from '@mathjax/src/js/mathjax.js'
import '@mathjax/src/js/util/asyncLoad/esm.js'
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js'
import { RegisterHTMLHandler } from '@mathjax/src/js/handlers/html.js'
import { TeX } from '@mathjax/src/js/input/tex.js'
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js'
import { SVG } from '@mathjax/src/js/output/svg.js'
import PDFDocument from 'pdfkit'
import SVGtoPDF from 'svg-to-pdfkit'

interface ExecutionResult {
  stdout: string
  stderr: string
  error: { message: string; line: number | null; column: number | null } | null
}

interface NotebookDocument {
  title: string
  cells: Array<{ id: string; kind: 'code' | 'markdown'; source: string }>
  outputs?: Record<string, ExecutionResult>
}

interface MathGraphic {
  svg: string
  width: number
  height: number
  fallback?: string
}

interface FlowOptions {
  x?: number
  width?: number
  font?: string
  fontSize?: number
  color?: string
  lineGap?: number
}

export type PdfCodeTokenKind = 'plain' | 'keyword' | 'builtin' | 'constant' | 'number' | 'string' | 'comment' | 'operator'

export interface PdfCodeToken {
  text: string
  kind: PdfCodeTokenKind
}

const PAGE_MARGIN = 72
const PAGE_WIDTH = 595.28
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2
const BODY_SIZE = 10.5
const BODY_LINE_GAP = 4

const OCTAVE_KEYWORDS = new Set([
  'break', 'case', 'catch', 'classdef', 'continue', 'do', 'else', 'elseif', 'end',
  'end_try_catch', 'end_unwind_protect', 'endclassdef', 'endenumeration', 'endevents',
  'endfor', 'endfunction', 'endif', 'endmethods', 'endparfor', 'endproperties',
  'endswitch', 'endwhile', 'enumeration', 'events', 'for', 'function', 'get', 'global',
  'if', 'methods', 'otherwise', 'parfor', 'persistent', 'properties', 'return', 'set',
  'static', 'switch', 'try', 'until', 'unwind_protect', 'unwind_protect_cleanup', 'while',
])

const OCTAVE_BUILTINS = new Set([
  'abs', 'all', 'any', 'assert', 'class', 'clear', 'close', 'columns', 'cos', 'det',
  'diag', 'disp', 'eig', 'error', 'exist', 'exp', 'eye', 'find', 'fprintf', 'help',
  'hist', 'inv', 'isempty', 'isequal', 'isfinite', 'isinf', 'isnan', 'length', 'linspace',
  'log', 'max', 'mean', 'min', 'mod', 'ndims', 'nnz', 'norm', 'numel', 'ones', 'plot',
  'printf', 'prod', 'rand', 'randn', 'rank', 'reshape', 'rows', 'sin', 'size', 'sort',
  'sprintf', 'sqrt', 'std', 'sum', 'svd', 'warning', 'whos', 'zeros',
])

const OCTAVE_CONSTANTS = new Set([
  'e', 'eps', 'false', 'flintmax', 'i', 'Inf', 'intmax', 'intmin', 'j', 'NaN',
  'pi', 'realmax', 'realmin', 'true',
])

const CODE_STYLE: Record<PdfCodeTokenKind, { color: string; font: string }> = {
  plain: { color: '#17202a', font: 'Courier' },
  keyword: { color: '#7e22ce', font: 'Courier-Bold' },
  builtin: { color: '#007c73', font: 'Courier' },
  constant: { color: '#a5144e', font: 'Courier-Bold' },
  number: { color: '#a84400', font: 'Courier' },
  string: { color: '#357a20', font: 'Courier' },
  comment: { color: '#56665e', font: 'Courier-Oblique' },
  operator: { color: '#006f9a', font: 'Courier' },
}

const mathAdaptor = liteAdaptor()
RegisterHTMLHandler(mathAdaptor)
const mathDocument = mathjax.document('', {
  InputJax: new TeX({ packages: ['base', 'ams'] }),
  OutputJax: new SVG({ fontCache: 'none', linebreaks: { inline: false } }),
})

function printable(value: string) {
  return value
    .replaceAll('\t', '  ')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
}

function trimOuterBlankLines(value: string) {
  return printable(value)
    .replace(/^(?:[ \t]*\n)+/, '')
    .replace(/(?:\n[ \t]*)+$/, '')
}

function plainMarkdown(value: string) {
  return printable(value)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/(`{1,2})(.*?)\1/g, '$2')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
}

function ensureSpace(pdf: PDFKit.PDFDocument, height: number) {
  if (pdf.y + height > pdf.page.height - PAGE_MARGIN) pdf.addPage()
}

function addGap(pdf: PDFKit.PDFDocument, height: number) {
  ensureSpace(pdf, height)
  pdf.y += height
}

function mathGraphic(source: string, fontSize: number, display: boolean): MathGraphic {
  try {
    const container = mathDocument.convert(source, { display })
    const serialized = mathAdaptor.outerHTML(container)
    if (/data-mjx-error=|data-mml-node="merror"/.test(serialized)) {
      throw new Error('MathJax no pudo interpretar la fórmula')
    }
    const start = serialized.indexOf('<svg')
    const end = serialized.lastIndexOf('</svg>')
    if (start < 0 || end < 0) throw new Error('MathJax no produjo un SVG')
    const svg = serialized.slice(start, end + 6)
    const viewBox = svg.match(/viewBox="[^" ]+ [^" ]+ ([\d.]+) ([\d.]+)"/)
    if (!viewBox) throw new Error('SVG matemático sin viewBox')
    const viewWidth = Number(viewBox[1])
    const viewHeight = Number(viewBox[2])
    let height = viewHeight / 1000 * fontSize
    let width = viewWidth / viewHeight * height
    const maxWidth = display ? CONTENT_WIDTH - 36 : CONTENT_WIDTH * 0.82
    if (width > maxWidth) {
      height *= maxWidth / width
      width = maxWidth
    }
    return { svg, width, height }
  } catch {
    const fallback = 'Expresión matemática no disponible'
    return { svg: '', width: Math.max(18, fallback.length * fontSize * 0.52), height: fontSize * 1.25, fallback }
  }
}

function inlineParts(value: string) {
  const parts: Array<{ kind: 'text' | 'math'; value: string }> = []
  let text = ''
  for (let index = 0; index < value.length;) {
    if (value[index] === '\\' && value[index + 1] === '$') {
      text += '$'
      index += 2
      continue
    }
    if (value[index] !== '$' || value[index + 1] === '$') {
      text += value[index]
      index += 1
      continue
    }
    let end = index + 1
    while (end < value.length && (value[end] !== '$' || value[end - 1] === '\\')) end += 1
    if (end >= value.length) {
      text += value[index]
      index += 1
      continue
    }
    if (text) parts.push({ kind: 'text', value: plainMarkdown(text) })
    parts.push({ kind: 'math', value: value.slice(index + 1, end) })
    text = ''
    index = end + 1
  }
  if (text) parts.push({ kind: 'text', value: plainMarkdown(text) })
  return parts
}

function writeInlineFlow(pdf: PDFKit.PDFDocument, value: string, options: FlowOptions = {}) {
  const x = options.x ?? PAGE_MARGIN
  const width = options.width ?? CONTENT_WIDTH
  const font = options.font ?? 'Helvetica'
  const fontSize = options.fontSize ?? BODY_SIZE
  const color = options.color ?? '#1f2937'
  const lineGap = options.lineGap ?? BODY_LINE_GAP
  const spaceWidth = pdf.font(font).fontSize(fontSize).widthOfString(' ')
  const tokens: Array<{ kind: 'text' | 'math'; value: string; width: number; graphic?: MathGraphic }> = []

  for (const part of inlineParts(value)) {
    if (part.kind === 'math') {
      const graphic = mathGraphic(part.value, fontSize, false)
      tokens.push({ kind: 'math', value: part.value, width: graphic.width, graphic })
    } else {
      for (const word of part.value.trim().split(/\s+/).filter(Boolean)) {
        tokens.push({ kind: 'text', value: word, width: pdf.font(font).fontSize(fontSize).widthOfString(word) })
      }
    }
  }

  if (!tokens.length) return
  let line: typeof tokens = []
  let lineWidth = 0
  const lines: Array<typeof tokens> = []
  for (const token of tokens) {
    const gap = line.length ? spaceWidth : 0
    if (line.length && lineWidth + gap + token.width > width) {
      lines.push(line)
      line = []
      lineWidth = 0
    }
    line.push(token)
    lineWidth += (line.length > 1 ? spaceWidth : 0) + token.width
  }
  if (line.length) lines.push(line)

  for (const row of lines) {
    const rowHeight = Math.max(fontSize * 1.25, ...row.map((token) => token.graphic?.height ?? 0)) + lineGap
    ensureSpace(pdf, rowHeight)
    const top = pdf.y
    let cursorX = x
    for (const token of row) {
      if (cursorX > x) cursorX += spaceWidth
      if (token.kind === 'text') {
        const textY = top + (rowHeight - lineGap - fontSize * 1.16) / 2
        pdf.fillColor(color).font(font).fontSize(fontSize).text(token.value, cursorX, textY, { lineBreak: false })
      } else if (token.graphic?.fallback) {
        const textY = top + (rowHeight - lineGap - fontSize * 1.16) / 2
        pdf.fillColor(color).font('Helvetica-Oblique').fontSize(fontSize).text(token.graphic.fallback, cursorX, textY, { lineBreak: false })
      } else if (token.graphic) {
        const graphicY = top + (rowHeight - lineGap - token.graphic.height) / 2
        SVGtoPDF(pdf as unknown as typeof PDFDocument, token.graphic.svg, cursorX, graphicY, {
          width: token.graphic.width,
          height: token.graphic.height,
          preserveAspectRatio: 'xMinYMid meet',
          warningCallback: () => undefined,
        })
      }
      cursorX += token.width
    }
    pdf.y = top + rowHeight
  }
}

function writeDisplayMath(pdf: PDFKit.PDFDocument, source: string) {
  const graphic = mathGraphic(source, 12, true)
  const verticalPadding = 8
  ensureSpace(pdf, graphic.height + verticalPadding * 2)
  const top = pdf.y + verticalPadding
  const x = PAGE_MARGIN + (CONTENT_WIDTH - graphic.width) / 2
  if (graphic.fallback) {
    pdf.fillColor('#111827').font('Helvetica-Oblique').fontSize(11).text(graphic.fallback, x, top, {
      width: graphic.width,
      align: 'center',
    })
  } else {
    SVGtoPDF(pdf as unknown as typeof PDFDocument, graphic.svg, x, top, {
      width: graphic.width,
      height: graphic.height,
      preserveAspectRatio: 'xMidYMid meet',
      warningCallback: () => undefined,
    })
  }
  pdf.y = top + graphic.height + verticalPadding
}

function tokenizeOctaveLine(line: string, blockComment: { marker: '%' | '#' | null }): PdfCodeToken[] {
  const result: PdfCodeToken[] = []
  let index = 0
  let expectOperand = true
  const push = (text: string, kind: PdfCodeTokenKind) => {
    if (!text) return
    const previous = result.at(-1)
    if (previous?.kind === kind) previous.text += text
    else result.push({ text, kind })
  }

  while (index < line.length) {
    if (blockComment.marker) {
      const closer = `${blockComment.marker}}`
      const end = line.indexOf(closer, index)
      if (end < 0) {
        push(line.slice(index), 'comment')
        break
      }
      push(line.slice(index, end + closer.length), 'comment')
      index = end + closer.length
      blockComment.marker = null
      continue
    }

    const character = line[index]
    if (/\s/.test(character)) {
      const start = index++
      while (index < line.length && /\s/.test(line[index])) index += 1
      push(line.slice(start, index), 'plain')
      continue
    }

    if ((character === '%' || character === '#') && line[index + 1] === '{') {
      blockComment.marker = character
      push(line.slice(index), 'comment')
      break
    }
    if (character === '%' || character === '#') {
      push(line.slice(index), 'comment')
      break
    }

    if (character === '"' || (character === "'" && expectOperand)) {
      const quote = character
      const start = index++
      while (index < line.length) {
        if (line[index] === '\\' && quote === '"' && index + 1 < line.length) {
          index += 2
          continue
        }
        if (line[index] === quote) {
          if (line[index + 1] === quote) {
            index += 2
            continue
          }
          index += 1
          break
        }
        index += 1
      }
      push(line.slice(start, index), 'string')
      expectOperand = false
      continue
    }

    if (character === "'") {
      push(character, 'operator')
      index += 1
      expectOperand = false
      continue
    }

    const rest = line.slice(index)
    const number = rest.match(/^(?:0[xX][0-9a-fA-F]+|0[bB][01]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eEdD][+-]?\d+)?)[ij]?/)
    if (number) {
      push(number[0], 'number')
      index += number[0].length
      expectOperand = false
      continue
    }

    const identifier = rest.match(/^[A-Za-z_]\w*/)
    if (identifier) {
      const value = identifier[0]
      const kind = OCTAVE_KEYWORDS.has(value)
        ? 'keyword'
        : OCTAVE_CONSTANTS.has(value)
          ? 'constant'
          : OCTAVE_BUILTINS.has(value)
            ? 'builtin'
            : 'plain'
      push(value, kind)
      index += value.length
      expectOperand = OCTAVE_KEYWORDS.has(value)
      continue
    }

    const operator = rest.match(/^(?:\.\*|\.\/|\.\\|\.\^|\+\+|--|==|~=|!=|<=|>=|&&|\|\||\+=|-=|\*=|\/=|\\=|\^=|\*|\/|\\|\^|\+|-|=|<|>|&|\||~|!|:)/)
    if (operator) {
      push(operator[0], 'operator')
      index += operator[0].length
      expectOperand = true
      continue
    }

    push(character, 'plain')
    index += 1
    expectOperand = !/[\]\)}]/.test(character)
  }

  return result
}

/** Tokenización ligera usada por el PDF; se exporta para probar el contrato visual. */
export function tokenizeOctaveForPdf(value: string): PdfCodeToken[][] {
  const blockComment: { marker: '%' | '#' | null } = { marker: null }
  return printable(value).split('\n').map((line) => tokenizeOctaveLine(line, blockComment))
}

function wrapCodeTokens(tokens: PdfCodeToken[], maxCharacters: number): PdfCodeToken[][] {
  if (!tokens.length) return [[]]
  const rows: PdfCodeToken[][] = []
  let row: PdfCodeToken[] = []
  let remaining = maxCharacters

  for (const token of tokens) {
    let value = token.text
    while (value.length) {
      const count = Math.min(remaining, value.length)
      const part = value.slice(0, count)
      const previous = row.at(-1)
      if (previous?.kind === token.kind) previous.text += part
      else row.push({ text: part, kind: token.kind })
      value = value.slice(count)
      remaining -= count
      if (remaining === 0) {
        rows.push(row)
        row = []
        remaining = maxCharacters
      }
    }
  }
  if (row.length) rows.push(row)
  return rows
}

function writeHighlightedPreformatted(pdf: PDFKit.PDFDocument, value: string) {
  const content = trimOuterBlankLines(value) || ' '
  const innerWidth = CONTENT_WIDTH - 20
  const fontSize = 8.75
  const lineGap = 3
  const lineHeight = fontSize * 1.15 + lineGap
  const characterWidth = pdf.font('Courier').fontSize(fontSize).widthOfString('M')
  const maxCharacters = Math.max(1, Math.floor(innerWidth / characterWidth))
  const visualLines = tokenizeOctaveForPdf(content).flatMap((line) => wrapCodeTokens(line, maxCharacters))
  let offset = 0

  while (offset < visualLines.length) {
    ensureSpace(pdf, 28)
    const top = pdf.y
    const available = pdf.page.height - PAGE_MARGIN - top
    const count = Math.max(1, Math.min(visualLines.length - offset, Math.floor((available - 12) / lineHeight)))
    const height = count * lineHeight + 12
    pdf.save().roundedRect(PAGE_MARGIN, top, CONTENT_WIDTH, height, 4).fill('#f3f5f7').restore()

    for (let rowIndex = 0; rowIndex < count; rowIndex += 1) {
      let cursorX = PAGE_MARGIN + 10
      const cursorY = top + 6 + rowIndex * lineHeight
      for (const token of visualLines[offset + rowIndex]) {
        const style = CODE_STYLE[token.kind]
        pdf.fillColor(style.color).font(style.font).fontSize(fontSize).text(token.text, cursorX, cursorY, { lineBreak: false })
        cursorX += pdf.font(style.font).fontSize(fontSize).widthOfString(token.text)
      }
    }

    pdf.y = top + height
    offset += count
    if (offset < visualLines.length) pdf.addPage()
  }
}

function writePreformatted(pdf: PDFKit.PDFDocument, value: string, color = '#17202a') {
  const content = trimOuterBlankLines(value) || ' '
  const lines = content.split('\n')
  const innerWidth = CONTENT_WIDTH - 20
  const fontSize = 8.75
  const lineGap = 3
  let offset = 0

  while (offset < lines.length) {
    ensureSpace(pdf, 28)
    const top = pdf.y
    const available = pdf.page.height - PAGE_MARGIN - top
    let end = offset
    let textHeight = 0
    while (end < lines.length) {
      const candidate = lines.slice(offset, end + 1).join('\n') || ' '
      const candidateHeight = pdf.font('Courier').fontSize(fontSize).heightOfString(candidate, { width: innerWidth, lineGap })
      if (candidateHeight + 12 > available && end > offset) break
      textHeight = candidateHeight
      end += 1
      if (candidateHeight + 12 > available) break
    }
    const segment = lines.slice(offset, end).join('\n') || ' '
    const height = textHeight + 12
    pdf.save().roundedRect(PAGE_MARGIN, top, CONTENT_WIDTH, height, 4).fill('#f3f5f7').restore()
    pdf.fillColor(color).font('Courier').fontSize(fontSize).text(segment, PAGE_MARGIN + 10, top + 6, {
      width: innerWidth,
      lineGap,
    })
    pdf.y = top + height
    offset = end
    if (offset < lines.length) pdf.addPage()
  }
}

function isSpecialMarkdownLine(line: string) {
  return /^\s*(?:#{1,6}\s+|```|>\s?|[-*+]\s+|\d+[.)]\s+|\$\$)/.test(line)
}

function writeMarkdown(pdf: PDFKit.PDFDocument, source: string) {
  const lines = printable(source).split('\n')
  for (let index = 0; index < lines.length;) {
    const rawLine = lines[index]
    if (!rawLine.trim()) {
      addGap(pdf, 7)
      index += 1
      continue
    }

    if (/^\s*```/.test(rawLine)) {
      const code: string[] = []
      index += 1
      while (index < lines.length && !/^\s*```/.test(lines[index])) code.push(lines[index++])
      if (index < lines.length) index += 1
      writeHighlightedPreformatted(pdf, code.join('\n'))
      addGap(pdf, 7)
      continue
    }

    if (/^\s*\$\$/.test(rawLine)) {
      let formula = rawLine.replace(/^\s*\$\$/, '')
      if (/\$\$\s*$/.test(formula)) {
        formula = formula.replace(/\$\$\s*$/, '')
        index += 1
      } else {
        index += 1
        const formulaLines = [formula]
        while (index < lines.length && !/\$\$\s*$/.test(lines[index])) formulaLines.push(lines[index++])
        if (index < lines.length) {
          formulaLines.push(lines[index].replace(/\$\$\s*$/, ''))
          index += 1
        }
        formula = formulaLines.join('\n')
      }
      writeDisplayMath(pdf, formula)
      continue
    }

    const heading = rawLine.match(/^\s*(#{1,6})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      const sizes = [18, 15, 13, 11.5, 10.75, 10.5]
      const before = level === 1 ? 16 : level === 2 ? 13 : 10
      const after = level <= 2 ? 6 : 4
      ensureSpace(pdf, before + sizes[level - 1] * 2.5)
      pdf.y += before
      writeInlineFlow(pdf, heading[2], {
        font: 'Helvetica-Bold',
        fontSize: sizes[level - 1],
        color: '#111827',
        lineGap: 3,
      })
      addGap(pdf, after)
      index += 1
      continue
    }

    const bullet = rawLine.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/)
    if (bullet) {
      ensureSpace(pdf, 22)
      const top = pdf.y
      pdf.fillColor('#1f2937').font('Helvetica').fontSize(BODY_SIZE).text(bullet[1].match(/^\d/) ? bullet[1] : '-', PAGE_MARGIN + 6, top, { lineBreak: false })
      pdf.y = top
      writeInlineFlow(pdf, bullet[2], { x: PAGE_MARGIN + 24, width: CONTENT_WIDTH - 24 })
      addGap(pdf, 3)
      index += 1
      continue
    }

    const quote = rawLine.match(/^\s*>\s?(.*)$/)
    if (quote) {
      const top = pdf.y
      writeInlineFlow(pdf, quote[1], {
        x: PAGE_MARGIN + 16,
        width: CONTENT_WIDTH - 16,
        font: 'Helvetica-Oblique',
        color: '#4b5563',
      })
      pdf.save().strokeColor('#94a3b8').lineWidth(1.5).moveTo(PAGE_MARGIN + 5, top).lineTo(PAGE_MARGIN + 5, pdf.y - 3).stroke().restore()
      addGap(pdf, 6)
      index += 1
      continue
    }

    const paragraph = [rawLine.trim()]
    index += 1
    while (index < lines.length && lines[index].trim() && !isSpecialMarkdownLine(lines[index])) paragraph.push(lines[index++].trim())
    writeInlineFlow(pdf, paragraph.join(' '))
    addGap(pdf, 7)
  }
}

function outputText(output: ExecutionResult) {
  const pieces: Array<{ label: string; text: string; color?: string }> = []
  if (output.stdout) pieces.push({ label: 'Salida', text: output.stdout })
  if (output.stderr) pieces.push({ label: 'Advertencias', text: output.stderr, color: '#8a4b08' })
  if (output.error) {
    const location = output.error.line
      ? ` - línea ${output.error.line}${output.error.column ? `, columna ${output.error.column}` : ''}`
      : ''
    pieces.push({ label: `Error${location}`, text: output.error.message, color: '#9f1239' })
  }
  return pieces
}

async function preloadDocumentMath(document: NotebookDocument) {
  const formulas: Array<{ source: string; display: boolean }> = []
  for (const cell of document.cells) {
    if (cell.kind !== 'markdown') continue
    const pattern = /\$\$([\s\S]*?)\$\$|(?<!\\)\$([^$\n]+?)(?<!\\)\$/g
    for (const match of cell.source.matchAll(pattern)) {
      formulas.push({ source: (match[1] ?? match[2]).trim(), display: match[1] !== undefined })
    }
  }
  for (const formula of formulas) {
    await mathjax.handleRetriesFor(() => mathDocument.convert(formula.source, { display: formula.display })).catch(() => undefined)
  }
}

export async function renderNotebookPdf(document: NotebookDocument): Promise<Buffer> {
  await preloadDocumentMath(document)
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: 'A4',
      margins: { top: PAGE_MARGIN, right: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN },
      info: {},
    })
    delete pdf.info.Title
    delete pdf.info.Author
    delete pdf.info.Subject
    delete pdf.info.Creator
    delete pdf.info.Producer
    delete pdf.info.ModDate

    const chunks: Buffer[] = []
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk))
    pdf.once('error', reject)
    pdf.once('end', () => resolve(Buffer.concat(chunks)))

    document.cells.forEach((cell, index) => {
      if (cell.kind === 'markdown') writeMarkdown(pdf, cell.source)
      else {
        writeHighlightedPreformatted(pdf, cell.source)
        const output = document.outputs?.[cell.id]
        if (output) {
          for (const part of outputText(output)) {
            addGap(pdf, 9)
            ensureSpace(pdf, 25)
            const labelTop = pdf.y
            pdf.fillColor(part.color || '#475569').font('Helvetica-Bold').fontSize(9).text(part.label, PAGE_MARGIN, labelTop, {
              width: CONTENT_WIDTH,
              lineGap: 2,
              align: 'left',
            })
            addGap(pdf, 4)
            writePreformatted(pdf, part.text, part.color)
          }
        }
        addGap(pdf, 13)
      }
      if (index < document.cells.length - 1 && cell.kind === 'markdown') addGap(pdf, 4)
    })

    pdf.end()
  })
}
