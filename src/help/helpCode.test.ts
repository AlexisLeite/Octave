import { describe, expect, it } from 'vitest'
import { revealHelpCodeResults } from './helpCode'

describe('revealHelpCodeResults', () => {
  it('reveals assignments and statements', () => {
    expect(revealHelpCodeResults('a = 1; b = a + 1;\ndisp(b);')).toBe(
      'a = 1\nb = a + 1\ndisp(b)',
    )
  })

  it('preserves matrix row separators but reveals the matrix assignment', () => {
    expect(revealHelpCodeResults('A = [1, 2; 3, 4];')).toBe(
      'A = [1, 2; 3, 4]',
    )
  })

  it('preserves semicolons in strings, comments, and transpose operators', () => {
    const source = "texto = 'a;b'; % explicación; útil\nA = (1:3).';\nfprintf(\"x;y\\n\");"
    expect(revealHelpCodeResults(source)).toBe(
      "texto = 'a;b'\n% explicación; útil\nA = (1:3).'\nfprintf(\"x;y\\n\")",
    )
  })

  it('preserves continued matrix rows and removes only the final terminator', () => {
    expect(revealHelpCodeResults('A = [1, 2; ...\n  3, 4];')).toBe(
      'A = [1, 2; ...\n  3, 4]',
    )
  })

  it('preserves row separators in nested matrices and cell arrays', () => {
    const source = [
      "datos = {[1; 2], {'a;b'; 3}; [4; 5], (1:3).'};",
      "columna = datos{1, 1}';",
    ].join('\n')

    expect(revealHelpCodeResults(source)).toBe([
      "datos = {[1; 2], {'a;b'; 3}; [4; 5], (1:3).'}",
      "columna = datos{1, 1}'",
    ].join('\n'))
  })

  it('does not confuse delimiters in comments with matrix nesting', () => {
    const source = [
      '% [ este comentario contiene ];',
      'A = [1; 2]; # } tampoco cierra la matriz',
      '%{',
      '{ bloque; [comentado] }',
      '%}',
      'C = {3; 4};',
      'resultado = 5;',
    ].join('\n')

    expect(revealHelpCodeResults(source)).toBe([
      '% [ este comentario contiene ];',
      'A = [1; 2]',
      '# } tampoco cierra la matriz',
      '%{',
      '{ bloque; [comentado] }',
      '%}',
      'C = {3; 4}',
      'resultado = 5',
    ].join('\n'))
  })

  it('preserves structural separators across continuations and inline comments', () => {
    const source = [
      'A = [1, 2; ... % segunda fila',
      '     3, 4];',
      'C = {"x;y"; ... # segunda fila',
      "     'z;w'};",
    ].join('\n')

    expect(revealHelpCodeResults(source)).toBe([
      'A = [1, 2; ... % segunda fila',
      '     3, 4]',
      'C = {"x;y"; ... # segunda fila',
      "     'z;w'}",
    ].join('\n'))
  })

  it('keeps transpose operators separate from string delimiters around matrices', () => {
    expect(revealHelpCodeResults([
      "conjugada = [1 + 2i; 3 - 4i]';",
      "sin_conjugar = [1; 2].';",
      "doble = [1; 2]'';",
    ].join('\n'))).toBe([
      "conjugada = [1 + 2i; 3 - 4i]'",
      "sin_conjugar = [1; 2].'",
      "doble = [1; 2]''",
    ].join('\n'))
  })

  it('preserves doubled quotes and their semicolon contents', () => {
    expect(revealHelpCodeResults([
      "simple = 'don''t;split';",
      'doble = "a"";b";',
    ].join('\n'))).toBe([
      "simple = 'don''t;split'",
      'doble = "a"";b"',
    ].join('\n'))
  })
})
