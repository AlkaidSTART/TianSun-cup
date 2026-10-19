import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const source = readFileSync(fileURLToPath(new URL('../src/utils/markdown.ts', import.meta.url)), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

const exports = {}
runInNewContext(compiled, { exports })
const { parseMarkdown, parseInline, appendCursor } = exports

// Values come from another VM realm, so re-create them here before deepEqual.
const norm = (value) => JSON.parse(JSON.stringify(value))
const plain = (rows) => norm(rows).map((row) => row.kind)
const textOf = (runs) => runs.map((run) => run.text).join('')

test('headings and paragraphs keep their block structure', () => {
  const rows = parseMarkdown('# 标题\n\n第一行\n第二行\n\n### 小标题')
  assert.deepEqual(plain(rows), ['heading', 'paragraph', 'heading'])
  assert.equal(rows[0].level, 1)
  assert.equal(textOf(rows[0].runs), '标题')
  assert.equal(norm(rows[1].lines).length, 2)
  assert.equal(rows[2].level, 3)
})

test('inline syntax becomes styled runs', () => {
  const runs = parseInline('正常 **加粗** *斜体* ~~删除~~ `代码` [链接](https://a.cn/x)')
  assert.deepEqual(
    norm(runs).map((run) => [run.text, Boolean(run.bold), Boolean(run.italic), Boolean(run.strike), Boolean(run.code), run.href || '']),
    [
      ['正常 ', false, false, false, false, ''],
      ['加粗', true, false, false, false, ''],
      [' ', false, false, false, false, ''],
      ['斜体', false, true, false, false, ''],
      [' ', false, false, false, false, ''],
      ['删除', false, false, true, false, ''],
      [' ', false, false, false, false, ''],
      ['代码', false, false, false, true, ''],
      [' ', false, false, false, false, ''],
      ['链接', false, false, false, false, 'https://a.cn/x'],
    ],
  )
})

test('nested emphasis is merged onto a single run', () => {
  const runs = parseInline('**加粗里的 `代码`**')
  assert.equal(runs.length, 2)
  assert.equal(runs[0].bold, true)
  assert.equal(runs[1].bold, true)
  assert.equal(runs[1].code, true)
})

test('lists, nested lists and ordered numbering', () => {
  const rows = parseMarkdown('- 第一项\n- 第二项\n  - 子项\n\n1. 甲\n2. 乙')
  assert.deepEqual(plain(rows), ['paragraph', 'paragraph', 'paragraph', 'paragraph', 'paragraph'])
  assert.deepEqual(norm(rows.slice(0, 3)).map((row) => [row.marker, row.indent]), [['•', 1], ['•', 1], ['•', 2]])
  assert.deepEqual(norm(rows.slice(3)).map((row) => [row.marker, row.indent]), [['1.', 1], ['2.', 1]])
  assert.equal(textOf(rows[2].lines[0]), '子项')
})

test('fenced code blocks, quotes, dividers and tables', () => {
  const rows = parseMarkdown(
    ['```ts', 'const a = 1', '```', '', '> 引用\n> 第二行', '', '---', '', '| 名称 | 数量 |', '| :--- | ---: |', '| 牦牛 | 12 |'].join('\n'),
  )
  assert.deepEqual(plain(rows), ['code', 'paragraph', 'divider', 'table'])
  assert.equal(rows[0].language, 'ts')
  assert.equal(rows[0].code, 'const a = 1')
  assert.equal(rows[1].quote, true)
  assert.equal(rows[3].header.length, 2)
  assert.deepEqual(norm(rows[3].align), ['left', 'right'])
  assert.equal(textOf(rows[3].rows[0][0]), '牦牛')
})

test('streaming keeps unfinished markup as literal text', () => {
  const partial = parseMarkdown('建议 **尽快\n联系兽医')
  assert.equal(textOf(partial[0].lines[0]), '建议 **尽快')
  assert.equal(textOf(partial[0].lines[1]), '联系兽医')

  const fence = parseMarkdown('```\n未闭合')
  assert.equal(fence[0].kind, 'code')
  assert.equal(fence[0].code, '未闭合')
})

test('plain text with symbols is not mangled', () => {
  const runs = parseInline('体温 40.7℃ 左右，*号与 #号')
  assert.equal(textOf(runs), '体温 40.7℃ 左右，*号与 #号')
  const rows = parseMarkdown('1.5 公斤饲料\n-5℃ 低温')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].kind, 'paragraph')
  assert.equal(textOf(rows[0].lines[0]), '1.5 公斤饲料')
})

test('the streaming caret lands at the end of the last row', () => {
  const rows = parseMarkdown('第一段\n\n第二段')
  appendCursor(rows)
  assert.equal(rows.length, 2)
  assert.equal(rows[1].lines[0].at(-1).cursor, true)

  const headingOnly = parseMarkdown('# 只有标题')
  appendCursor(headingOnly)
  assert.equal(headingOnly[0].runs.at(-1).cursor, true)
})