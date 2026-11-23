import assert from 'node:assert/strict'
import { test } from 'node:test'
import { filterVocabulary, vocabularyCsv } from '../frontend/src/vocabulary.ts'

function word(id, overrides = {}) {
  return {
    id, lemma: 'word', meaning: '释义', note: '', status: '学习中',
    due: '2026-11-23', parts_of_speech: ['名词'], examples: [], ...overrides,
  }
}

const filters = { query: '', source: '', status: '', sort: 'newest' }

test('combines note search, source and mastery without changing the input order', () => {
  const examples = [{ article_id: 7 }]
  const words = [
    word(1, { note: 'CITY 阅读', examples }),
    word(2, { note: 'CITY 阅读', examples, status: '已掌握' }),
    word(3, { note: 'CITY 阅读' }),
  ]
  const result = filterVocabulary(words, { ...filters, query: ' city ', source: '7', status: '学习中' })
  assert.deepEqual(result.map(item => item.id), [1])
  assert.deepEqual(filterVocabulary(words, filters).map(item => item.id), [3, 2, 1])
  assert.deepEqual(words.map(item => item.id), [1, 2, 3])
})

test('orders overdue dates before future dates and uses stable ID tie breakers', () => {
  const words = [word(3), word(2, { due: '2026-11-20' }), word(1), word(4, { due: '2026-12-01' })]
  assert.deepEqual(filterVocabulary(words, { ...filters, sort: 'due' }).map(item => item.id), [2, 1, 3, 4])
  const alphabetical = [word(1, { lemma: 'zebra' }), word(2, { lemma: 'apple' })]
  assert.deepEqual(filterVocabulary(alphabetical, { ...filters, sort: 'alphabetical' }).map(item => item.id), [2, 1])
})

test('CSV preserves Unicode, commas, quotes and multiline notes', () => {
  const csv = vocabularyCsv([word(1, { meaning: '中文, "引号"', note: '第一行\n第二行' })], '')
  assert.ok(csv.startsWith('\uFEFF"单词或短语"'))
  assert.ok(csv.includes('"中文, ""引号"""'))
  assert.ok(csv.includes('"第一行\n第二行"'))
  assert.ok(csv.endsWith('\r\n'))
})

test('CSV exports each matching source and preserves words without examples', () => {
  const examples = [
    { article_id: 7, title: 'First', paragraph: -1, surface: 'Word', sentence: 'Word in title' },
    { article_id: 8, title: 'Second', paragraph: 2, surface: 'word', sentence: 'Another word' },
  ]
  const selected = vocabularyCsv([word(1, { examples })], '7')
  assert.ok(selected.includes('"First","标题","Word","Word in title"'))
  assert.ok(!selected.includes('Second'))
  const all = vocabularyCsv([word(1, { examples }), word(2, { lemma: 'orphan' })], '')
  assert.ok(all.includes('"Second","3","word","Another word"'))
  assert.ok(all.includes('"orphan"'))
  assert.equal(all.split('\r\n').length, 5)
})

test('CSV neutralizes formula prefixes in imported text and notes', () => {
  for (const note of ['=1+1', '+SUM(A1)', '-1+2', '@SUM(A1)', '  =1+1', '\tformula', '\rformula']) {
    assert.ok(vocabularyCsv([word(1, { note })], '').includes('"\'' + note + '"'))
  }
})
