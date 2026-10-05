/**
 * Dependency-free Markdown parser for AI answer bubbles.
 *
 * The app ships to H5 *and* WeChat mini-program, so we cannot use `v-html`,
 * `rich-text` styling or recursive custom components. Instead the parser emits
 * a flat list of rows that maps one-to-one onto uni-app `view` / `text`
 * elements, which keeps inline styles (bold, code, links) available on every
 * platform.
 *
 * Parsing is intentionally forgiving: answers arrive token by token while
 * streaming, so an unfinished `**bold` or an unterminated code fence simply
 * stays literal text until the closing token arrives.
 */

export interface MarkdownRun {
  text: string
  bold?: boolean
  italic?: boolean
  strike?: boolean
  code?: boolean
  href?: string
  /** Blinking caret appended to the very end while an answer streams in. */
  cursor?: boolean
}

export type MarkdownAlign = 'left' | 'center' | 'right' | null

export type MarkdownRow =
  | { kind: 'heading'; indent: number; quote: boolean; level: number; runs: MarkdownRun[] }
  | { kind: 'paragraph'; indent: number; quote: boolean; marker?: string; lines: MarkdownRun[][] }
  | { kind: 'code'; indent: number; quote: boolean; language: string; code: string }
  | { kind: 'divider'; indent: number; quote: boolean }
  | {
      kind: 'table'
      indent: number
      quote: boolean
      align: MarkdownAlign[]
      header: MarkdownRun[][]
      rows: MarkdownRun[][][]
    }

interface MarkdownListItem {
  content: MarkdownBlock[]
}

type MarkdownBlock =
  | { type: 'heading'; level: number; runs: MarkdownRun[] }
  | { type: 'paragraph'; lines: MarkdownRun[][] }
  | { type: 'list'; ordered: boolean; start: number; items: MarkdownListItem[] }
  | { type: 'quote'; blocks: MarkdownBlock[] }
  | { type: 'code'; language: string; code: string }
  | { type: 'divider' }
  | { type: 'table'; align: MarkdownAlign[]; header: MarkdownRun[][]; rows: MarkdownRun[][][] }

const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})\s*([A-Za-z0-9+#._-]*)\s*$/
const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const HR_RE = /^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/
const QUOTE_RE = /^\s{0,3}>\s?(.*)$/
const ITEM_RE = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/
const TABLE_DELIM_RE = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/
const ESCAPABLE = '\\`*_{}[]()#+-.!~|>'

/** Parse Markdown into rows ready for rendering. */
export function parseMarkdown(source: string): MarkdownRow[] {
  const rows: MarkdownRow[] = []
  const blocks = parseBlocks(String(source ?? '').replace(/\r\n?/g, '\n').split('\n'))
  emitBlocks(blocks, 0, false, rows)
  return rows
}

/** Append a streaming caret to the end of the last textual row. */
export function appendCursor(rows: MarkdownRow[]): void {
  const caret: MarkdownRun = { text: '\u258d', cursor: true }
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]
    if (row.kind === 'paragraph') {
      if (!row.lines.length) row.lines.push([])
      row.lines[row.lines.length - 1].push(caret)
      return
    }
    if (row.kind === 'heading') {
      row.runs.push(caret)
      return
    }
    if (row.kind === 'code') {
      row.code += '\u258d'
      return
    }
  }
  rows.push({ kind: 'paragraph', indent: 0, quote: false, lines: [[caret]] })
}

function emitBlocks(blocks: MarkdownBlock[], indent: number, quote: boolean, out: MarkdownRow[]): void {
  for (const block of blocks) {
    if (block.type === 'heading') {
      out.push({ kind: 'heading', indent, quote, level: block.level, runs: block.runs })
    } else if (block.type === 'paragraph') {
      out.push({ kind: 'paragraph', indent, quote, lines: block.lines })
    } else if (block.type === 'code') {
      out.push({ kind: 'code', indent, quote, language: block.language, code: block.code })
    } else if (block.type === 'divider') {
      out.push({ kind: 'divider', indent, quote })
    } else if (block.type === 'table') {
      out.push({ kind: 'table', indent, quote, align: block.align, header: block.header, rows: block.rows })
    } else if (block.type === 'quote') {
      emitBlocks(block.blocks, indent, true, out)
    } else {
      block.items.forEach((item, index) => {
        const before = out.length
        emitBlocks(item.content, indent + 1, quote, out)
        const marker = block.ordered ? `${block.start + index}.` : '\u2022'
        if (out.length > before) {
          const row = out[before]
          if (row.kind === 'paragraph' && !row.marker) row.marker = marker
        } else {
          out.push({ kind: 'paragraph', indent: indent + 1, quote, marker, lines: [] })
        }
      })
    }
  }
}

function parseBlocks(lines: string[]): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }

    const fence = FENCE_RE.exec(line)
    if (fence) {
      const marker = fence[1][0]
      const minLength = fence[1].length
      const closer = new RegExp(`^\\s{0,3}${marker === '`' ? '`' : '~'}{${minLength},}\\s*$`)
      const code: string[] = []
      index += 1
      while (index < lines.length && !closer.test(lines[index])) {
        code.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push({ type: 'code', language: fence[2] || '', code: code.join('\n') })
      continue
    }

    if (HR_RE.test(line)) {
      blocks.push({ type: 'divider' })
      index += 1
      continue
    }

    const heading = HEADING_RE.exec(line)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, runs: parseInline(heading[2]) })
      index += 1
      continue
    }

    if (QUOTE_RE.test(line)) {
      const quoted: string[] = []
      while (index < lines.length) {
        const match = QUOTE_RE.exec(lines[index])
        if (match) {
          quoted.push(match[1])
          index += 1
          continue
        }
        // Lazy continuation: a plain line keeps the quote going until a blank
        // line or the start of another block.
        if (lines[index].trim() && !startsBlock(lines[index]) && !isTableStart(lines, index)) {
          quoted.push(lines[index])
          index += 1
          continue
        }
        break
      }
      blocks.push({ type: 'quote', blocks: parseBlocks(quoted) })
      continue
    }

    if (isTableStart(lines, index)) {
      const table = parseTable(lines, index)
      blocks.push(table.block)
      index = table.next
      continue
    }

    if (ITEM_RE.test(line)) {
      const list = parseList(lines, index)
      blocks.push(list.block)
      index = list.next
      continue
    }

    const paragraph: string[] = []
    while (
      index < lines.length &&
      lines[index].trim() &&
      !startsBlock(lines[index]) &&
      !isTableStart(lines, index)
    ) {
      paragraph.push(lines[index])
      index += 1
    }
    blocks.push({ type: 'paragraph', lines: paragraph.map((text) => parseInline(text)) })
  }

  return blocks
}

function startsBlock(line: string): boolean {
  return FENCE_RE.test(line) || HR_RE.test(line) || HEADING_RE.test(line) || QUOTE_RE.test(line) || ITEM_RE.test(line)
}

function indentWidth(line: string): number {
  let width = 0
  while (width < line.length && (line[width] === ' ' || line[width] === '\t')) width += 1
  return width
}

function stripIndent(line: string, width: number): string {
  let removed = 0
  let index = 0
  while (index < line.length && removed < width && (line[index] === ' ' || line[index] === '\t')) {
    index += 1
    removed += 1
  }
  return line.slice(index)
}

function parseList(lines: string[], start: number): { block: MarkdownBlock; next: number } {
  const first = ITEM_RE.exec(lines[start]) as RegExpExecArray
  const baseIndent = first[1].length
  const ordered = /\d/.test(first[2])
  const startNumber = ordered ? Number.parseInt(first[2], 10) || 1 : 1
  const items: MarkdownListItem[] = []
  let index = start

  while (index < lines.length) {
    const match = ITEM_RE.exec(lines[index])
    if (!match || match[1].length !== baseIndent) break

    const contentIndent = baseIndent + match[2].length + 1
    const itemLines = [match[3]]
    index += 1

    while (index < lines.length) {
      const current = lines[index]
      if (!current.trim()) {
        const next = lines[index + 1]
        if (next && next.trim() && indentWidth(next) > baseIndent) {
          itemLines.push('')
          index += 1
          continue
        }
        break
      }
      const nestedItem = ITEM_RE.exec(current)
      if (nestedItem && nestedItem[1].length === baseIndent) break
      if (indentWidth(current) > baseIndent) {
        itemLines.push(stripIndent(current, contentIndent))
        index += 1
        continue
      }
      itemLines.push(current)
      index += 1
    }

    items.push({ content: parseBlocks(itemLines) })
  }

  return { block: { type: 'list', ordered, start: startNumber, items }, next: index }
}

function isTableStart(lines: string[], index: number): boolean {
  const header = lines[index]
  const delimiter = lines[index + 1]
  if (!header || !delimiter) return false
  return header.includes('|') && delimiter.includes('-') && TABLE_DELIM_RE.test(delimiter)
}

function splitRow(line: string): string[] {
  let text = line.trim()
  if (text.startsWith('|')) text = text.slice(1)
  if (text.endsWith('|')) text = text.slice(0, -1)
  return text.split('|').map((cell) => cell.trim())
}

function alignOf(cell: string): MarkdownAlign {
  const trimmed = cell.trim()
  const left = trimmed.startsWith(':')
  const right = trimmed.endsWith(':')
  if (left && right) return 'center'
  if (right) return 'right'
  if (left) return 'left'
  return null
}

function parseTable(lines: string[], start: number): { block: MarkdownBlock; next: number } {
  const header = splitRow(lines[start]).map((cell) => parseInline(cell))
  const align = splitRow(lines[start + 1]).map(alignOf)
  const rows: MarkdownRun[][][] = []
  let index = start + 2
  while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
    rows.push(splitRow(lines[index]).map((cell) => parseInline(cell)))
    index += 1
  }
  return { block: { type: 'table', align, header, rows }, next: index }
}

type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strong'; children: InlineNode[] }
  | { type: 'em'; children: InlineNode[] }
  | { type: 'del'; children: InlineNode[] }
  | { type: 'link'; href: string; children: InlineNode[] }

/** Parse inline markup into flat runs (nested emphasis is merged into flags). */
export function parseInline(source: string): MarkdownRun[] {
  const runs: MarkdownRun[] = []
  walkInline(parseInlineNodes(source), {}, runs)
  return runs
}

interface RunStyle {
  bold?: boolean
  italic?: boolean
  strike?: boolean
  href?: string
}

function walkInline(nodes: InlineNode[], style: RunStyle, runs: MarkdownRun[]): void {
  for (const node of nodes) {
    if (node.type === 'text') {
      pushRun(runs, node.text, style)
    } else if (node.type === 'code') {
      pushRun(runs, node.text, style, true)
    } else if (node.type === 'link') {
      walkInline(node.children, { ...style, href: node.href }, runs)
    } else {
      const next: RunStyle = { ...style }
      if (node.type === 'strong') next.bold = true
      if (node.type === 'em') next.italic = true
      if (node.type === 'del') next.strike = true
      walkInline(node.children, next, runs)
    }
  }
}

function pushRun(runs: MarkdownRun[], text: string, style: RunStyle, code = false): void {
  if (!text) return
  const last = runs[runs.length - 1]
  if (
    last &&
    !last.cursor &&
    Boolean(last.bold) === Boolean(style.bold) &&
    Boolean(last.italic) === Boolean(style.italic) &&
    Boolean(last.strike) === Boolean(style.strike) &&
    Boolean(last.code) === code &&
    (last.href || '') === (style.href || '')
  ) {
    last.text += text
    return
  }
  runs.push({
    text,
    ...(style.bold ? { bold: true } : {}),
    ...(style.italic ? { italic: true } : {}),
    ...(style.strike ? { strike: true } : {}),
    ...(code ? { code: true } : {}),
    ...(style.href ? { href: style.href } : {}),
  })
}

function parseInlineNodes(source: string): InlineNode[] {
  const nodes: InlineNode[] = []
  let buffer = ''
  let index = 0

  const flush = () => {
    if (buffer) {
      nodes.push({ type: 'text', text: buffer })
      buffer = ''
    }
  }

  while (index < source.length) {
    const char = source[index]

    if (char === '\\' && index + 1 < source.length && ESCAPABLE.includes(source[index + 1])) {
      buffer += source[index + 1]
      index += 2
      continue
    }

    if (char === '`') {
      const ticks = /^`+/.exec(source.slice(index))?.[0] || '`'
      const close = source.indexOf(ticks, index + ticks.length)
      if (close !== -1) {
        flush()
        nodes.push({ type: 'code', text: source.slice(index + ticks.length, close).replace(/^ | $/g, '') })
        index = close + ticks.length
        continue
      }
    }

    if (char === '!' && source[index + 1] === '[') {
      const image = matchLink(source, index + 1)
      if (image) {
        flush()
        nodes.push({
          type: 'link',
          href: image.href,
          children: image.text ? [{ type: 'text', text: image.text }] : [],
        })
        index = image.end
        continue
      }
    }

    if (char === '[') {
      const link = matchLink(source, index)
      if (link) {
        flush()
        nodes.push({ type: 'link', href: link.href, children: parseInlineNodes(link.text) })
        index = link.end
        continue
      }
    }

    if (char === '<') {
      const auto = /^<((?:https?:\/\/|mailto:)[^>\s]+)>/.exec(source.slice(index))
      if (auto) {
        flush()
        nodes.push({ type: 'link', href: auto[1], children: [{ type: 'text', text: auto[1] }] })
        index += auto[0].length
        continue
      }
    }

    if ((char === '*' || char === '_') && source[index + 1] === char) {
      const close = source.indexOf(char + char, index + 2)
      if (close > index + 2) {
        flush()
        nodes.push({ type: 'strong', children: parseInlineNodes(source.slice(index + 2, close)) })
        index = close + 2
        continue
      }
    }

    if (char === '*' || char === '_') {
      const next = source[index + 1]
      const previous = index > 0 ? source[index - 1] : ' '
      const usable = char === '*' || !/[0-9A-Za-z]/.test(previous)
      if (next && !/\s/.test(next) && usable) {
        const close = source.indexOf(char, index + 1)
        if (close > index + 1 && !/\s/.test(source[close - 1])) {
          flush()
          nodes.push({ type: 'em', children: parseInlineNodes(source.slice(index + 1, close)) })
          index = close + 1
          continue
        }
      }
    }

    if (char === '~' && source[index + 1] === '~') {
      const close = source.indexOf('~~', index + 2)
      if (close > index + 2) {
        flush()
        nodes.push({ type: 'del', children: parseInlineNodes(source.slice(index + 2, close)) })
        index = close + 2
        continue
      }
    }

    buffer += char
    index += 1
  }

  flush()
  return nodes
}

function matchLink(source: string, start: number): { text: string; href: string; end: number } | null {
  if (source[start] !== '[') return null
  let depth = 0
  let index = start
  for (; index < source.length; index += 1) {
    const char = source[index]
    if (char === '\\') {
      index += 1
      continue
    }
    if (char === '[') depth += 1
    else if (char === ']') {
      depth -= 1
      if (depth === 0) break
    }
  }
  if (depth !== 0 || source[index + 1] !== '(') return null
  const close = source.indexOf(')', index + 2)
  if (close === -1) return null
  const href = source.slice(index + 2, close).trim().split(/\s+/)[0]
  if (!href) return null
  return { text: source.slice(start + 1, index), href, end: close + 1 }
}