import { describe, expect, it } from 'vitest';

import { lintOctave, provideOctaveCodeActions, toMonacoMarkers } from './octaveLint';

function fakeRuntime(source: string) {
  const lines = source.split('\n');
  const model = {
    uri: { path: '/cell.m' },
    getVersionId: () => 7,
    getEOL: () => '\n',
    getLineCount: () => lines.length,
    getLineMaxColumn: (line: number) => lines[line - 1].length + 1,
    getLineContent: (line: number) => lines[line - 1],
  };
  const monaco = {
    MarkerSeverity: { Error: 8, Warning: 4, Info: 2 },
    Range: class {
      constructor(
        public startLineNumber: number,
        public startColumn: number,
        public endLineNumber: number,
        public endColumn: number,
      ) {}
    },
  };
  return { model, monaco };
}

describe('lintOctave', () => {
  it('accepts balanced Octave blocks, matrices and transpose operators', () => {
    const source = [
      'function y = normalize_rows(A)',
      "  energy = sum(A'.^2, 1);",
      '  if any(energy == 0)',
      "    error('zero row');",
      '  endif',
      '  y = A ./ sqrt(energy);',
      'endfunction',
    ].join('\n');

    expect(lintOctave(source)).toEqual([]);
  });

  it('recognizes conjugate and dot transpose without treating them as strings', () => {
    expect(lintOctave([
      "lineal = (1:6).';",
      "conjugada = A';",
      "separada = A ';",
      "assert(isequal(lineal, (1:6).'));",
    ].join('\n'))).toEqual([]);
  });

  it('accepts a compact if/else/endif nested in a while loop', () => {
    const source = [
      'while (b - a) > tolerancia && iter < 100',
      '  medio = (a + b) / 2;',
      '  if f(a) * f(medio) <= 0, b = medio; else, a = medio; endif',
      '  iter += 1;',
      'endwhile',
      'raiz = (a + b) / 2;',
    ].join('\n');

    expect(lintOctave(source)).toEqual([]);
  });

  it('ignores trailing whitespace', () => {
    expect(lintOctave('x = 1;   \n')).toEqual([]);
  });

  it('does not flag repeated statement separators outside a matrix literal', () => {
    expect(lintOctave('x = 1;;\ny = 2,, z = 3;')).toEqual([]);
    expect(lintOctave('A = [1,, 2];')).toContainEqual(expect.objectContaining({
      code: 'octave.consecutiveSeparators',
      severity: 'warning',
    }));
  });

  it('reports unclosed delimiters and blocks at their opening positions', () => {
    const diagnostics = lintOctave('if (ready\n  values = [1, 2;\n');

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ line: 1, column: 4, severity: 'error' }),
      expect.objectContaining({ line: 2, column: 12, severity: 'error' }),
      expect.objectContaining({
        line: 1,
        column: 1,
        severity: 'error',
        message: 'Bloque «if» sin cerrar. Falta «endif» o «end».',
      }),
    ]));
  });

  it('ignores brackets and block words inside strings and comments', () => {
    const source = [
      '% if ([',
      "message = 'end ) ]';",
      '%{',
      'while {',
      '%}',
    ].join('\n');

    expect(lintOctave(source)).toEqual([]);
  });

  it('detects an incompatible explicit block closer', () => {
    const diagnostics = lintOctave('for i = 1:3\n  disp(i);\nendif');

    expect(diagnostics.some((diagnostic) => diagnostic.message.includes('cierra «if»'))).toBe(true);
  });

  it('reports a function without endfunction as an actionable error on its declaration', () => {
    const source = [
      'function norma = norma(v)',
      '  norma = 1',
      '',
      'disp(norma(3))',
    ].join('\n');

    expect(lintOctave(source)).toContainEqual(expect.objectContaining({
      line: 1,
      column: 1,
      severity: 'error',
      message: 'Bloque «function» sin cerrar. Falta «endfunction» o «end».',
    }));
  });

  it('keeps a marker on the offending token instead of trailing whitespace', () => {
    const source = 'function norma = norma(v)   ';
    const model = {
      getLineCount: () => 1,
      getLineMaxColumn: () => source.length + 1,
      getLineContent: () => source,
    };
    const monaco = {
      MarkerSeverity: { Error: 8, Warning: 4, Info: 2 },
    };

    const [marker] = toMonacoMarkers(
      monaco as never,
      model as never,
      [{ line: 1, column: 1, severity: 'error', message: 'Falta endfunction.' }],
    );

    expect(marker).toMatchObject({ startColumn: 1, endColumn: 9 });
  });

  it('exposes stable marker codes and a preferred fix for an unclosed block', () => {
    const source = '  if ready\n    disp(1);';
    const { monaco, model } = fakeRuntime(source);
    const markers = toMonacoMarkers(
      monaco as never,
      model as never,
      lintOctave(source),
    );
    const actions = provideOctaveCodeActions(monaco as never, model as never, markers);

    expect(markers).toContainEqual(expect.objectContaining({
      code: 'octave.unclosedBlock:endif',
      source: 'Octave',
    }));
    expect(actions).toContainEqual(expect.objectContaining({
      title: 'Insertar «endif»',
      kind: 'quickfix.octave',
      isPreferred: true,
      edit: {
        edits: [expect.objectContaining({
          versionId: 7,
          textEdit: expect.objectContaining({ text: '\n  endif' }),
        })],
      },
    }));
  });

  it('replaces an incompatible closer with the closer for the open block', () => {
    const source = 'for i = 1:3\nendif';
    const { monaco, model } = fakeRuntime(source);
    const markers = toMonacoMarkers(monaco as never, model as never, lintOctave(source));
    const actions = provideOctaveCodeActions(monaco as never, model as never, markers);

    expect(actions).toContainEqual(expect.objectContaining({
      title: 'Cambiar por «endfor»',
      edit: {
        edits: [expect.objectContaining({
          textEdit: {
            range: expect.objectContaining({
              startLineNumber: 2,
              startColumn: 1,
              endColumn: 6,
            }),
            text: 'endfor',
          },
        })],
      },
    }));
  });

  it('inserts a missing delimiter before a trailing comment', () => {
    const source = 'if (ready % wait\nendif';
    const { monaco, model } = fakeRuntime(source);
    const markers = toMonacoMarkers(monaco as never, model as never, lintOctave(source));
    const actions = provideOctaveCodeActions(monaco as never, model as never, markers);

    expect(actions).toContainEqual(expect.objectContaining({
      title: 'Insertar «)»',
      edit: {
        edits: [expect.objectContaining({
          textEdit: {
            range: expect.objectContaining({ startLineNumber: 1, startColumn: 11 }),
            text: ')',
          },
        })],
      },
    }));
  });

  it('offers nested closers from the inside out', () => {
    const source = 'if ready\n  for i = 1:3\n    disp(i);';
    const { monaco, model } = fakeRuntime(source);
    const markers = toMonacoMarkers(monaco as never, model as never, lintOctave(source));
    const actions = provideOctaveCodeActions(monaco as never, model as never, markers);

    expect(actions.map((action) => action.title)).toEqual(['Insertar «endfor»']);
  });

  it('does not guess which mixed matrix separator the user intended', () => {
    const source = 'A = [1,; 2];';
    const { monaco, model } = fakeRuntime(source);
    const markers = toMonacoMarkers(monaco as never, model as never, lintOctave(source));

    expect(markers).toContainEqual(expect.objectContaining({
      code: 'octave.consecutiveSeparators',
    }));
    expect(provideOctaveCodeActions(monaco as never, model as never, markers)).toEqual([]);
  });

  it('does not offer fixes for diagnostics from another source', () => {
    const { monaco, model } = fakeRuntime('endif');
    const markers = toMonacoMarkers(monaco as never, model as never, lintOctave('endif'));
    markers[0].source = 'Octave runtime';

    expect(provideOctaveCodeActions(monaco as never, model as never, markers)).toEqual([]);
  });
});
