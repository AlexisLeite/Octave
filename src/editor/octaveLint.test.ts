import { describe, expect, it } from 'vitest';

import { lintOctave } from './octaveLint';

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

  it('reports unclosed delimiters and blocks at their opening positions', () => {
    const diagnostics = lintOctave('if (ready\n  values = [1, 2;\n');

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ line: 1, column: 4, severity: 'error' }),
      expect.objectContaining({ line: 2, column: 12, severity: 'error' }),
      expect.objectContaining({ line: 1, column: 1, severity: 'warning' }),
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
});
