import type { Mastery, Vocabulary } from './api'

export type VocabularyFilters = {
  query: string
  source: string
  status: Mastery | ''
  sort: 'newest' | 'due' | 'alphabetical'
}

export function filterVocabulary(words: Vocabulary[], filters: VocabularyFilters) {
  const query = filters.query.trim().toLowerCase()
  const matching = words.filter(word =>
    [word.lemma, word.meaning, word.note].join(' ').toLowerCase().includes(query) &&
    (!filters.status || word.status === filters.status) &&
    (!filters.source || word.examples.some(example => String(example.article_id) === filters.source)),
  )
  return matching.sort((left, right) => {
    if (filters.sort === 'due') return left.due.localeCompare(right.due) || left.id - right.id
    if (filters.sort === 'alphabetical') return left.lemma.localeCompare(right.lemma, 'en') || left.id - right.id
    return right.id - left.id
  })
}

function csvCell(value: string) {
  // Spreadsheet applications may execute formulas even inside quoted CSV cells.
  const text = /^[\t\r\n]|^\s*[=+\-@]/.test(value) ? "'" + value : value
  return '"' + text.replaceAll('"', '""') + '"'
}

export function vocabularyCsv(words: Vocabulary[], source: string) {
  const rows = [['单词或短语', '词性', '释义', '掌握度', '下次复习', '备注', '文章标题', '段落', '原词形', '原句']]
  for (const word of words) {
    const fields = [word.lemma, (word.parts_of_speech ?? []).join(' / '), word.meaning, word.status, word.due, word.note]
    const examples = word.examples.filter(example => !source || String(example.article_id) === source)
    if (!examples.length) rows.push([...fields, '', '', '', ''])
    for (const example of examples) {
      rows.push([...fields, example.title, example.paragraph === -1 ? '标题' : String(example.paragraph + 1), example.surface, example.sentence])
    }
  }
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
