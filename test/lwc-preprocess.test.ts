import {describe, expect, it} from 'vitest'

import {preprocessHtml, preprocessJs} from '../src/lang/lwc-preprocess.js'

describe('preprocessJs', () => {
  it('blanks comments, strings and template text but keeps template expressions', () => {
    const source =
      "// eval(x)\nconst a = 'eval(1)' + \"x\";\nconst t = `eval(${run('q')}) done`;\n/* debugger */"
    const src = preprocessJs(source)
    expect(src.code).toHaveLength(source.length)
    expect(src.code).not.toMatch(/eval|debugger|done/)
    expect(src.code).toContain('${run(')
    expect(src.strings.map((s) => s.value)).toEqual(['eval(1)', 'x', 'eval(', 'q', ') done'])
  })

  it('blanks regular-expression literals but not divisions', () => {
    const source = "const re = /'eval(/g;\nconst half = total / 2 / count;\nconst s = 'kept';"
    const src = preprocessJs(source)
    expect(src.code).not.toContain('eval')
    expect(src.code).toContain('total / 2 / count')
    expect(src.strings.map((s) => s.value)).toEqual(['kept'])
  })

  it('handles nested template literals', () => {
    const src = preprocessJs('const a = `x${`y${z}`}w`;\nfoo();')
    expect(src.code).toContain('foo();')
    expect(src.code).toContain('${z}')
  })
})

describe('preprocessHtml', () => {
  it('blanks comments and keeps line numbers', () => {
    const src = preprocessHtml(
      '<template>\n<!-- lwc:inner-html\n -->\n<p lwc:inner-html={x}></p>\n</template>',
    )
    expect(src.code.indexOf('lwc:inner-html')).toBeGreaterThan(0)
    expect(src.lineAt(src.code.indexOf('lwc:inner-html'))).toBe(4)
  })
})
