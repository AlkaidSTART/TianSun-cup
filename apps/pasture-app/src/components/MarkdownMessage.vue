<script setup lang="ts">
import { computed } from 'vue'
import { appendCursor, parseMarkdown, type MarkdownAlign, type MarkdownRow, type MarkdownRun } from '../utils/markdown'

const props = withDefaults(defineProps<{ source: string; cursor?: boolean }>(), { cursor: false })

const rows = computed<MarkdownRow[]>(() => {
  const parsed = parseMarkdown(props.source || '')
  if (props.cursor) appendCursor(parsed)
  return parsed
})

function runClass(run: MarkdownRun): string {
  const names = ['md-run']
  if (run.bold) names.push('md-bold')
  if (run.italic) names.push('md-italic')
  if (run.strike) names.push('md-strike')
  if (run.code) names.push('md-code')
  if (run.href) names.push('md-link')
  if (run.cursor) names.push('md-cursor')
  return names.join(' ')
}

function rowStyle(row: MarkdownRow): string {
  const padding = row.indent * 14 + (row.quote ? 10 : 0)
  return padding ? `padding-left:${padding}px` : ''
}

function cellStyle(align: MarkdownAlign[], index: number): string {
  const value = align[index]
  return value ? `text-align:${value}` : ''
}

function headingClass(level: number): string {
  return `md-h md-h${level}`
}

function copyLink(href?: string): void {
  if (!href) return
  uni.setClipboardData({
    data: href,
    success: () => uni.showToast({ title: '链接已复制', icon: 'none' }),
  })
}
</script>

<template>
  <view class="md">
    <template v-for="(row, index) in rows" :key="index">
      <view
        v-if="row.kind === 'heading'"
        class="md-row"
        :class="[headingClass(row.level), row.quote ? 'md-quote' : '']"
        :style="rowStyle(row)"
      >
        <text
          v-for="(run, runIndex) in row.runs"
          :key="runIndex"
          :class="runClass(run)"
          @click="copyLink(run.href)"
        >{{ run.text }}</text>
      </view>

      <view
        v-else-if="row.kind === 'paragraph'"
        class="md-row md-p"
        :class="{ 'md-quote': row.quote }"
        :style="rowStyle(row)"
      >
        <text v-if="row.marker" class="md-marker">{{ row.marker }}</text>
        <view class="md-p-body">
          <view v-for="(line, lineIndex) in row.lines" :key="lineIndex" class="md-line">
            <text
              v-for="(run, runIndex) in line"
              :key="runIndex"
              :class="runClass(run)"
              @click="copyLink(run.href)"
            >{{ run.text }}</text>
          </view>
        </view>
      </view>

      <view
        v-else-if="row.kind === 'code'"
        class="md-row md-code-block"
        :class="{ 'md-quote': row.quote }"
        :style="rowStyle(row)"
      >
        <text v-if="row.language" class="md-code-lang">{{ row.language }}</text>
        <text class="md-code-text">{{ row.code }}</text>
      </view>

      <view
        v-else-if="row.kind === 'divider'"
        class="md-row md-divider"
        :class="{ 'md-quote': row.quote }"
        :style="rowStyle(row)"
      ></view>

      <view
        v-else-if="row.kind === 'table'"
        class="md-row md-table"
        :class="{ 'md-quote': row.quote }"
        :style="rowStyle(row)"
      >
        <view class="md-tr md-thead">
          <view
            v-for="(cell, cellIndex) in row.header"
            :key="cellIndex"
            class="md-td"
            :style="cellStyle(row.align, cellIndex)"
          >
            <text
              v-for="(run, runIndex) in cell"
              :key="runIndex"
              :class="runClass(run)"
              @click="copyLink(run.href)"
            >{{ run.text }}</text>
          </view>
        </view>
        <view v-for="(line, lineIndex) in row.rows" :key="lineIndex" class="md-tr">
          <view
            v-for="(cell, cellIndex) in line"
            :key="cellIndex"
            class="md-td"
            :style="cellStyle(row.align, cellIndex)"
          >
            <text
              v-for="(run, runIndex) in cell"
              :key="runIndex"
              :class="runClass(run)"
              @click="copyLink(run.href)"
            >{{ run.text }}</text>
          </view>
        </view>
      </view>
    </template>
  </view>
</template>

<style scoped>
.md { display: block; font-size: 14px; line-height: 1.65; color: inherit; word-break: break-word; }
.md-row { margin: 0 0 8px; }
.md-row:last-child { margin-bottom: 0; }
.md-row:first-child { margin-top: 0; }

.md-h { font-weight: 700; line-height: 1.4; }
.md-h1 { margin: 14px 0 8px; font-size: 18px; }
.md-h2 { margin: 14px 0 8px; font-size: 16px; }
.md-h3 { margin: 12px 0 6px; font-size: 15px; }
.md-h4, .md-h5, .md-h6 { margin: 10px 0 6px; font-size: 14px; }

.md-p { display: flex; align-items: flex-start; }
.md-p-body { flex: 1; min-width: 0; }
.md-line { display: block; }
.md-marker { flex: none; margin-right: 6px; color: var(--accent, #0071e3); font-weight: 600; }

.md-bold { font-weight: 700; }
.md-italic { font-style: italic; }
.md-strike { text-decoration: line-through; }
.md-code {
  padding: 1px 4px;
  border-radius: 4px;
  background: #eef2f7;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12.5px;
}
.md-link { color: var(--accent, #0071e3); text-decoration: underline; }

.md-quote { border-left: 3px solid #d7e3f4; color: #5b6673; }

.md-code-block {
  padding: 10px 12px;
  border: 1px solid #e6eaf0;
  border-radius: 10px;
  background: #f5f7fa;
  overflow-x: auto;
}
.md-code-lang {
  display: block;
  margin-bottom: 6px;
  color: #8a929c;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.md-code-text {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}

.md-divider { height: 1px; margin: 10px 0; background: #e6eaf0; }

.md-table { border: 1px solid #e6eaf0; border-radius: 10px; overflow: hidden; }
.md-tr { display: flex; align-items: stretch; border-bottom: 1px solid #e6eaf0; }
.md-tr:last-child { border-bottom: 0; }
.md-thead { background: #f6f8fb; font-weight: 600; }
.md-td { flex: 1; min-width: 0; padding: 7px 9px; font-size: 12.5px; line-height: 1.5; }

.md-cursor { animation: md-blink 1s steps(1) infinite; }
@keyframes md-blink { 50% { opacity: 0; } }
</style>