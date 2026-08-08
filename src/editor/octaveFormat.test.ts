import { describe, expect, it } from 'vitest'
import { formatOctaveCode } from './octaveFormat'

describe('formatOctaveCode', () => {
  it('indents blocks and compacts surrounding blank lines', () => {
    expect(formatOctaveCode('\n\nif ok\n\nvalue = f( a ,  b )  \n\n\nelseif other\nnext = 1\nend\n\n')).toBe(
      'if ok\n  value = f(a, b)\n\nelseif other\n  next = 1\nend',
    )
  })

  it('does not put a blank immediately after block signatures', () => {
    expect(formatOctaveCode('function y = f(x)\n\ny = x;\nend\nfor i = 1:2\n\ndisp(i)\nend')).toBe(
      'function y = f(x)\n  y = x;\nend\nfor i = 1:2\n  disp(i)\nend',
    )
  })

  it('protects strings, comments and transpose operators while spacing calls', () => {
    expect(formatOctaveCode("if ok\n  x = A' + f( a ,  b ); % f( untouched ,  here )\n  y = 'f( untouched ,  here )';\nend")).toBe(
      "if ok\n  x = A' + f(a, b); % f( untouched ,  here )\n  y = 'f( untouched ,  here )';\nend",
    )
  })

  it('keeps relative alignment inside multiline matrices', () => {
    expect(formatOctaveCode('if ok\nA = [1, 2;\n     3, f( a , b )\n    ];\nend')).toBe(
      'if ok\n  A = [1, 2;\n       3, f( a , b )\n      ];\nend',
    )
  })

  it('preserves CRLF', () => {
    expect(formatOctaveCode('if ok\r\nvalue = f( a )\r\nend\r\n')).toBe('if ok\r\n  value = f(a)\r\nend')
  })
})
