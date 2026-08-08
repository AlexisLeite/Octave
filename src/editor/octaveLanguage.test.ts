import { describe, expect, it } from 'vitest';

import {
  collectOctaveSymbols,
  octaveCommentPrefixAt,
  octaveLanguageConfiguration,
} from './octaveLanguage';

describe('Octave quote pairs', () => {
  it('does not auto-close transpose quotes and preserves double-quote pairing', () => {
    expect(octaveLanguageConfiguration.autoClosingPairs).not.toContainEqual(
      expect.objectContaining({ open: "'", close: "'" }),
    );
    expect(octaveLanguageConfiguration.surroundingPairs).not.toContainEqual({ open: "'", close: "'" });
    expect(octaveLanguageConfiguration.autoClosingPairs).toContainEqual(
      expect.objectContaining({ open: '"', close: '"' }),
    );
    expect(octaveLanguageConfiguration.surroundingPairs).toContainEqual({ open: '"', close: '"' });
  });
});

describe('Octave comment continuation', () => {
  it.each([
    ['  % comment', 12, '% '],
    ['\t# comment', 11, '# '],
    ['%', 2, '% '],
    ['#', 2, '# '],
    ['%% section', 11, '%% '],
  ])('returns the marker for %j', (line, column, prefix) => {
    expect(octaveCommentPrefixAt(line, column)).toBe(prefix);
  });

  it.each([
    ['x = 1; % comment', 17],
    ['x = 1; # comment', 17],
    ['%{', 3],
    ['%}', 3],
    ['#{', 3],
    ['#}', 3],
    ['%{', 2],
    ['#}', 2],
    ['  # comment', 2],
  ])('excludes inline comments, block delimiters, and positions before the marker for %j', (line, column) => {
    expect(octaveCommentPrefixAt(line, column)).toBeUndefined();
  });
});

describe('Octave completion symbols', () => {
  it('collects local functions, parameters, outputs, assignments and loop variables', () => {
    const symbols = collectOctaveSymbols(`
function [valor, indice] = maximo_local(A, columna)
  temporal = A(:, columna);
  for fila = 1:rows(A)
    acumulado += temporal(fila);
  endfor
endfunction
`);
    expect(symbols).toEqual(expect.arrayContaining([
      { name: 'maximo_local', kind: 'function' },
      { name: 'A', kind: 'parameter' },
      { name: 'columna', kind: 'parameter' },
      { name: 'valor', kind: 'variable' },
      { name: 'indice', kind: 'variable' },
      { name: 'temporal', kind: 'variable' },
      { name: 'fila', kind: 'variable' },
      { name: 'acumulado', kind: 'variable' },
    ]));
  });

  it('collects fields but ignores strings and comments', () => {
    const symbols = collectOctaveSymbols(`
config.tolerancia = 1e-8;
nombre = "falso = comentario.campo";
% oculto = 1;
# otro.campo = 2;
`);
    expect(symbols).toContainEqual({ name: 'config', kind: 'variable' });
    expect(symbols).toContainEqual({ name: 'tolerancia', kind: 'field', owner: 'config' });
    expect(symbols.some((symbol) => symbol.name === 'falso' || symbol.name === 'oculto')).toBe(false);
  });
});
