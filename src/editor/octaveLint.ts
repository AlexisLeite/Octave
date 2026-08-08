import type {
  editor,
  IRange,
  languages,
  MarkerSeverity,
} from 'monaco-editor';

type Monaco = typeof import('monaco-editor');

export type OctaveDiagnostic = {
  line: number;
  column?: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  /** Stable identifier used to offer a matching Monaco quick fix. */
  code?: string;
};

const diagnosticCodes = {
  consecutiveSeparators: 'octave.consecutiveSeparators',
  orphanBlockCloser: 'octave.orphanBlockCloser',
  mismatchedBlockCloser: 'octave.mismatchedBlockCloser',
  unclosedBlock: 'octave.unclosedBlock',
  unmatchedDelimiter: 'octave.unmatchedDelimiter',
  unclosedDelimiter: 'octave.unclosedDelimiter',
  unclosedBlockComment: 'octave.unclosedBlockComment',
} as const;

const QUICK_FIX_KIND = 'quickfix.octave';

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
  let expectOperand = true;
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
          expectOperand = false;
        }
      }
      continue;
    }

    if (char === "'" || char === '"') {
      // A single quote after a complete operand is transpose. Keeping lexical
      // operand state also covers the non-conjugating dot transpose `(1:6).'`
      // and whitespace before transpose, neither of which is a string.
      if (char === "'" && !expectOperand) result += char;
      else {
        quote = char;
        result += ' ';
      }
      continue;
    }
    result += char;
    if (/\s/.test(char)) continue;
    if (/[A-Za-z0-9_]/.test(char) || char === ')' || char === ']' || char === '}') {
      expectOperand = false;
    } else if (char === '.' && next === "'") {
      // Dot transpose preserves the operand state for the following quote.
    } else if (char === '(' || char === '[' || char === '{' || char === ',' || char === ';'
      || /=|\+|-|\*|\/|\\|\^|&|\||~|:|<|>/.test(char)) {
      expectOperand = true;
    }
  }
  return [result.padEnd(line.length, ' '), inBlockComment];
}

function columnForLine(line: string): number {
  return Math.max(1, line.search(/\S/) + 1);
}

type StructuralWord = { word: string; column: number };

/**
 * Return the first word of every top-level statement on a line. Octave allows
 * compact control flow such as `if cond, a = 1; else, a = 2; endif`, so only
 * looking at the first word of the physical line leaves the inner `if` open
 * and makes a following `endwhile` look invalid.
 */
function structuralWords(line: string, incomingDepth: number): StructuralWord[] {
  const words: StructuralWord[] = [];
  let depth = incomingDepth;
  let expectsWord = depth === 0;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '(' || char === '[' || char === '{') {
      depth += 1;
      expectsWord = false;
      continue;
    }
    if (char === ')' || char === ']' || char === '}') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0 && (char === ',' || char === ';')) {
      expectsWord = true;
      continue;
    }
    if (!expectsWord || depth !== 0 || /\s/.test(char)) continue;

    const match = line.slice(index).match(/^([A-Za-z_]\w*)/);
    if (match) {
      words.push({ word: match[1].toLowerCase(), column: index + 1 });
      index += match[1].length - 1;
    }
    expectsWord = false;
  }
  return words;
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

    const statementWords = structuralWords(line, delimiters.length);
    for (let columnIndex = 0; columnIndex < line.length; columnIndex += 1) {
      const char = line[columnIndex];
      const doubleSeparator = (char === ',' || char === ';')
        && delimiters.some((delimiter) => delimiter.char === '[')
        ? line.slice(columnIndex).match(/^[,;]\s*[,;]/)
        : undefined;
      if (doubleSeparator) {
        diagnostics.push({
          line: lineNumber,
          column: columnIndex + 1,
          severity: 'warning',
          message: 'Separadores consecutivos; puede faltar una expresión.',
          code: diagnosticCodes.consecutiveSeparators,
        });
      }
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
            code: `${diagnosticCodes.unmatchedDelimiter}:${char}`,
          });
        } else {
          delimiters.pop();
        }
      }
    }

    statementWords.forEach(({ word: structuralWord, column }) => {
      if (Object.hasOwn(openerToCloser, structuralWord)) {
        blocks.push({ kind: structuralWord, line: lineNumber, column });
        return;
      }

      if (structuralWord === 'end') {
        if (blocks.length) blocks.pop();
        else diagnostics.push({
          line: lineNumber,
          column,
          severity: 'error',
          message: '«end» no tiene un bloque de apertura.',
          code: `${diagnosticCodes.orphanBlockCloser}:end`,
        });
        return;
      }

      const expectedOpener = closerToOpener[structuralWord];
      if (!expectedOpener) return;
      const open = blocks.at(-1);
      if (!open) {
        diagnostics.push({
          line: lineNumber,
          column,
          severity: 'error',
          message: `«${structuralWord}» no tiene un bloque de apertura.`,
          code: `${diagnosticCodes.orphanBlockCloser}:${structuralWord}`,
        });
      } else if (open.kind !== expectedOpener) {
        diagnostics.push({
          line: lineNumber,
          column,
          severity: 'error',
          message: `«${structuralWord}» cierra «${expectedOpener}», pero el bloque abierto es «${open.kind}».`,
          code: `${diagnosticCodes.mismatchedBlockCloser}:${openerToCloser[open.kind]}`,
        });
      } else {
        blocks.pop();
      }
    });
  });

  delimiters.forEach((open, index) => diagnostics.push({
    line: open.line,
    column: open.column,
    severity: 'error',
    message: `Delimitador «${open.char}» sin cerrar.`,
    // Close nested delimiters from the inside out. Offering a fix for an
    // outer delimiter first can create a new mismatch.
    code: index === delimiters.length - 1
      ? `${diagnosticCodes.unclosedDelimiter}:${open.char}`
      : undefined,
  }));

  blocks.forEach((open, index) => diagnostics.push({
    line: open.line,
    column: open.column,
    severity: 'error',
    message: `Bloque «${open.kind}» sin cerrar. Falta «${openerToCloser[open.kind]}» o «end».`,
    code: index === blocks.length - 1
      ? `${diagnosticCodes.unclosedBlock}:${openerToCloser[open.kind]}`
      : undefined,
  }));

  if (inBlockComment && blockCommentStart) diagnostics.push({
    line: blockCommentStart.line,
    column: blockCommentStart.column,
    severity: 'error',
    message: 'Comentario de bloque sin cerrar.',
    code: `${diagnosticCodes.unclosedBlockComment}:${lines[blockCommentStart.line - 1]?.[blockCommentStart.column - 1] ?? '%'}`,
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
    const content = model.getLineContent(line);
    const firstContentColumn = Math.max(1, content.search(/\S/) + 1);
    const column = Math.min(
      Math.max(1, diagnostic.column ?? firstContentColumn),
      maxColumn,
    );
    const token = content.slice(column - 1).match(/^[A-Za-z_]\w*|^\S/);
    const endColumn = Math.min(maxColumn, column + Math.max(1, token?.[0].length ?? 1));
    return {
      startLineNumber: line,
      endLineNumber: line,
      startColumn: column,
      // Keep the squiggle on the relevant token. Extending a marker to the end
      // of the line makes trailing whitespace look like the actual error and
      // leaves the diagnostic hover far away from its cause.
      endColumn,
      severity: severityValue(monaco, diagnostic.severity),
      message: diagnostic.message,
      source: 'Octave',
      code: diagnostic.code,
    };
  });
}

function markerCode(marker: editor.IMarkerData): string | undefined {
  return typeof marker.code === 'string' ? marker.code : marker.code?.value;
}

function textEdit(
  model: editor.ITextModel,
  range: IRange,
  text: string,
) {
  return {
    resource: model.uri,
    versionId: model.getVersionId(),
    textEdit: { range, text },
  };
}

function lineCommentColumn(line: string): number | undefined {
  let quote: "'" | '"' | undefined;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote) {
      if (char !== quote) continue;
      if (line[index + 1] === quote) index += 1;
      else if (quote !== '"' || line[index - 1] !== '\\') quote = undefined;
      continue;
    }
    if (char === "'" || char === '"') {
      // Like the linter, treat an apostrophe after an identifier or closing
      // delimiter as transpose instead of the start of a string.
      if (char === "'" && /[\w)\]}]/.test(line[index - 1] ?? '')) continue;
      quote = char;
    }
    else if (char === '%' || char === '#') return index + 1;
  }
  return undefined;
}

/** Convert local lint markers into conservative, syntax-only Monaco quick fixes. */
export function provideOctaveCodeActions(
  monaco: Monaco,
  model: editor.ITextModel,
  markers: editor.IMarkerData[],
): languages.CodeAction[] {
  const actions: languages.CodeAction[] = [];

  markers.forEach((marker) => {
    if (marker.source !== 'Octave') return;
    const code = markerCode(marker);
    if (!code) return;

    const action = (
      title: string,
      range: IRange,
      text: string,
      preferred = true,
    ) => actions.push({
      title,
      kind: QUICK_FIX_KIND,
      isPreferred: preferred,
      diagnostics: [marker],
      edit: { edits: [textEdit(model, range, text)] },
    });

    if (code === diagnosticCodes.consecutiveSeparators) {
      const line = model.getLineContent(marker.startLineNumber);
      const rest = line.slice(marker.startColumn - 1);
      const duplicate = /[,;]\s*([,;])/.exec(rest);
      if (!duplicate) return;
      if (duplicate[0][0] !== duplicate[1]) return;
      const duplicateColumn = marker.startColumn
        + duplicate.index
        + duplicate[0].lastIndexOf(duplicate[1]);
      action(
        'Quitar el separador duplicado',
        new monaco.Range(marker.startLineNumber, duplicateColumn, marker.startLineNumber, duplicateColumn + 1),
        '',
      );
      return;
    }

    if (code.startsWith(`${diagnosticCodes.unclosedDelimiter}:`)) {
      const opener = code.slice(-1);
      const closer = opener === '(' ? ')' : opener === '[' ? ']' : opener === '{' ? '}' : undefined;
      if (!closer) return;
      const line = model.getLineContent(marker.startLineNumber);
      const commentColumn = lineCommentColumn(line);
      const column = commentColumn ?? model.getLineMaxColumn(marker.startLineNumber);
      action(
        `Insertar «${closer}»`,
        new monaco.Range(marker.startLineNumber, column, marker.startLineNumber, column),
        closer,
      );
      return;
    }

    if (code.startsWith(`${diagnosticCodes.unmatchedDelimiter}:`)
      || code.startsWith(`${diagnosticCodes.orphanBlockCloser}:`)) {
      action(
        'Quitar el cierre sin apertura',
        new monaco.Range(
          marker.startLineNumber,
          marker.startColumn,
          marker.endLineNumber,
          marker.endColumn,
        ),
        '',
      );
      return;
    }

    if (code.startsWith(`${diagnosticCodes.mismatchedBlockCloser}:`)) {
      const closer = code.slice(code.lastIndexOf(':') + 1);
      if (!closer) return;
      action(
        `Cambiar por «${closer}»`,
        new monaco.Range(
          marker.startLineNumber,
          marker.startColumn,
          marker.endLineNumber,
          marker.endColumn,
        ),
        closer,
      );
      return;
    }

    if (code.startsWith(`${diagnosticCodes.unclosedBlock}:`)
      || code.startsWith(`${diagnosticCodes.unclosedBlockComment}:`)) {
      const suffix = code.slice(code.lastIndexOf(':') + 1);
      const closer = code.startsWith(`${diagnosticCodes.unclosedBlockComment}:`)
        ? `${suffix === '#' ? '#' : '%'}}`
        : suffix;
      if (!closer) return;
      const openingLine = model.getLineContent(marker.startLineNumber);
      const indent = openingLine.match(/^\s*/)?.[0] ?? '';
      const lastLine = model.getLineCount();
      const lastColumn = model.getLineMaxColumn(lastLine);
      const needsEol = model.getLineContent(lastLine).length > 0;
      action(
        `Insertar «${closer}»`,
        new monaco.Range(lastLine, lastColumn, lastLine, lastColumn),
        `${needsEol ? model.getEOL() : ''}${indent}${closer}`,
      );
    }
  });

  return actions;
}

const registeredMonacoInstances = new WeakSet<object>();

/** Register once per Monaco runtime so every Octave model exposes VS Code-style fixes. */
export function registerOctaveLintCodeActions(monaco: Monaco): void {
  if (registeredMonacoInstances.has(monaco)) return;
  registeredMonacoInstances.add(monaco);
  monaco.languages.registerCodeActionProvider('octave', {
    provideCodeActions(model, _range, context) {
      if (context.only && !QUICK_FIX_KIND.startsWith(context.only)) {
        return { actions: [], dispose: () => undefined };
      }
      return {
        actions: provideOctaveCodeActions(monaco, model, context.markers),
        dispose: () => undefined,
      };
    },
  }, { providedCodeActionKinds: [QUICK_FIX_KIND] });
}
