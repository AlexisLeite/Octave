import { describe, expect, it } from 'vitest';

import { lintOctave, toMonacoMarkers } from './octaveLint';

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

  it('ignores trailing whitespace', () => {
    expect(lintOctave('x = 1;   \n')).toEqual([]);
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

    expect(lintOctave(source)).toContainEqual({
      line: 1,
      column: 1,
      severity: 'error',
      message: 'Bloque «function» sin cerrar. Falta «endfunction» o «end».',
    });
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
});
