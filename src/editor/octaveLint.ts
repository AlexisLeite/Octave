import type { editor, MarkerSeverity } from 'monaco-editor';

type Monaco = typeof import('monaco-editor');

export type OctaveDiagnostic = {
  line: number;
  column?: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
};

type Delimiter = { char: '(' | '[' | '{'; line: number; column: number };
type Block = { kind: string; line: number; column: number };

const openerToCloser: Record<string, string> = {
  if: 'endif',
  for: 'endfor',
  parfor: 'endparfor',
  while: 'endwhile',
  switch: 'endswitch',
  try: 'end_try_catch',
  unwind_protect: 'end_unwind_protect',
  function: 'endfunction',
  classdef: 'endclassdef',
  properties: 'endproperties',
  methods: 'endmethods',
  events: 'endevents',
  enumeration: 'endenumeration',
  do: 'until',
};

const closerToOpener = Object.fromEntries(
  Object.entries(openerToCloser).map(([open, close]) => [close, open]),
) as Record<string, string>;

function withoutStringsAndComments(line: string, inBlockComment: boolean): [string, boolean] {
  let result = '';
  let quote: "'" | '"' | undefined;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (inBlockComment) {
      if ((char === '%' || char === '#') && next === '}') {
        inBlockComment = false;
        result += '  ';
        index += 1;
      } else {
        result += ' ';
      }
      continue;
    }

    if (!quote && (char === '%' || char === '#') && next === '{') {
      inBlockComment = true;
      result += '  ';
      index += 1;
      continue;
    }

    if (!quote && (char === '%' || char === '#')) {
      result += ' '.repeat(line.length - index);
      break;
    }

    if (quote) {
      result += ' ';
      if (char === quote) {
        if (line[index + 1] === quote) {
          result += ' ';
          index += 1;
        } else if (quote === '"' && line[index - 1] === '\\') {
          // Escaped double quote.
        } else {
          quote = undefined;
        }
      }
      continue;
    }

    if (char === "'" || char === '"') {
      // A quote immediately after an identifier or closing delimiter is transpose.
      const previous = result.slice(-1);
      if (char === "'" && /[\w)\]}]/.test(previous)) result += char;
      else {
        quote = char;
        result += ' ';
      }
      continue;
    }
    result += char;
  }
  return [result.padEnd(line.length, ' '), inBlockComment];
}

function columnForLine(line: string): number {
  return Math.max(1, line.search(/\S/) + 1);
}

export function lintOctave(source: string): OctaveDiagnostic[] {
  const diagnostics: OctaveDiagnostic[] = [];
  const delimiters: Delimiter[] = [];
  const blocks: Block[] = [];
  const lines = source.split(/\r?\n/);
  let inBlockComment = false;
  let blockCommentStart: { line: number; column: number } | undefined;

  lines.forEach((original, lineIndex) => {
    const lineNumber = lineIndex + 1;
    const wasInBlockComment = inBlockComment;
    const [line, nextBlockComment] = withoutStringsAndComments(original, inBlockComment);
    inBlockComment = nextBlockComment;
    if (!wasInBlockComment && inBlockComment) {
      const commentColumn = original.search(/(?:%|#)\{/) + 1;
      blockCommentStart = { line: lineNumber, column: Math.max(1, commentColumn) };
    } else if (wasInBlockComment && !inBlockComment) {
      blockCommentStart = undefined;
    }

    const trailing = original.match(/[ \t]+$/);
    if (trailing && original.trim()) {
      diagnostics.push({
        line: lineNumber,
        column: original.length - trailing[0].length + 1,
        severity: 'info',
        message: 'Espacio en blanco al final de la línea.',
      });
    }

    const doubleSeparator = line.match(/[,;]\s*[,;]/);
    if (doubleSeparator) {
      diagnostics.push({
        line: lineNumber,
        column: doubleSeparator.index! + 1,
        severity: 'warning',
        message: 'Separadores consecutivos; puede faltar una expresión.',
      });
    }

    for (let columnIndex = 0; columnIndex < line.length; columnIndex += 1) {
      const char = line[columnIndex];
      if (char === '(' || char === '[' || char === '{') {
        delimiters.push({ char, line: lineNumber, column: columnIndex + 1 });
      } else if (char === ')' || char === ']' || char === '}') {
        const expected = char === ')' ? '(' : char === ']' ? '[' : '{';
        const open = delimiters.at(-1);
        if (!open || open.char !== expected) {
          diagnostics.push({
            line: lineNumber,
            column: columnIndex + 1,
            severity: 'error',
            message: `Delimitador «${char}» sin apertura compatible.`,
          });
        } else {
          delimiters.pop();
        }
      }
    }

    const trimmed = line.trim();
    const firstWord = trimmed.match(/^([A-Za-z_]\w*)\b/)?.[1]?.toLowerCase();
    if (!firstWord) return;

    if (Object.hasOwn(openerToCloser, firstWord)) {
      blocks.push({ kind: firstWord, line: lineNumber, column: columnForLine(line) });
      return;
    }

    if (firstWord === 'end') {
      if (blocks.length) blocks.pop();
      else diagnostics.push({
        line: lineNumber,
        column: columnForLine(line),
        severity: 'error',
        message: '«end» no tiene un bloque de apertura.',
      });
      return;
    }

    const expectedOpener = closerToOpener[firstWord];
    if (expectedOpener) {
      const open = blocks.at(-1);
      if (!open) {
        diagnostics.push({
          line: lineNumber,
          column: columnForLine(line),
          severity: 'error',
          message: `«${firstWord}» no tiene un bloque de apertura.`,
        });
      } else if (open.kind !== expectedOpener) {
        diagnostics.push({
          line: lineNumber,
          column: columnForLine(line),
          severity: 'error',
          message: `«${firstWord}» cierra «${expectedOpener}», pero el bloque abierto es «${open.kind}».`,
        });
      } else {
        blocks.pop();
      }
    }
  });

  delimiters.forEach((open) => diagnostics.push({
    line: open.line,
    column: open.column,
    severity: 'error',
    message: `Delimitador «${open.char}» sin cerrar.`,
  }));

  blocks.forEach((open) => diagnostics.push({
    line: open.line,
    column: open.column,
    severity: 'warning',
    message: `Bloque «${open.kind}» sin cerrar; se esperaba «${openerToCloser[open.kind]}» o «end».`,
  }));

  if (inBlockComment && blockCommentStart) diagnostics.push({
    line: blockCommentStart.line,
    column: blockCommentStart.column,
    severity: 'error',
    message: 'Comentario de bloque sin cerrar.',
  });

  return diagnostics;
}

function severityValue(monaco: Monaco, severity: OctaveDiagnostic['severity']): MarkerSeverity {
  if (severity === 'error') return monaco.MarkerSeverity.Error;
  if (severity === 'warning') return monaco.MarkerSeverity.Warning;
  return monaco.MarkerSeverity.Info;
}

export function toMonacoMarkers(
  monaco: Monaco,
  model: editor.ITextModel,
  diagnostics: OctaveDiagnostic[],
): editor.IMarkerData[] {
  return diagnostics.map((diagnostic) => {
    const line = Math.min(Math.max(1, diagnostic.line), model.getLineCount());
    const maxColumn = model.getLineMaxColumn(line);
    const column = Math.min(Math.max(1, diagnostic.column ?? 1), maxColumn);
    return {
      startLineNumber: line,
      endLineNumber: line,
      startColumn: column,
      endColumn: Math.min(maxColumn, column + 1),
      severity: severityValue(monaco, diagnostic.severity),
      message: diagnostic.message,
      source: 'Octave',
    };
  });
}
