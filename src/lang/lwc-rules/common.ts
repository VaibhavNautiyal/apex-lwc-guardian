import type {SourceFile} from '../../core/types.js'
import {type HtmlSource, type JsSource, preprocessHtml, preprocessJs} from '../lwc-preprocess.js'

export {finding} from '../finding.js'

export function isJs(file: SourceFile): boolean {
  return file.path.toLowerCase().endsWith('.js')
}

export function isHtml(file: SourceFile): boolean {
  return file.path.toLowerCase().endsWith('.html')
}

export function jsOf(file: SourceFile): JsSource {
  return preprocessJs(file.content)
}

export function htmlOf(file: SourceFile): HtmlSource {
  return preprocessHtml(file.content)
}
