export const examLevels = ['四级', '六级', '雅思', 'GRE'] as const
export type ExamLevel = typeof examLevels[number]

export type Difficulty = {
  exam: ExamLevel
  stars: number
  personal_exam: ExamLevel
  word_count: number
  average_sentence: number
  long_ratio: number
  rare_ratio: number
  personal_ratio: number
  level: string
  personal_level: string
  rare_words: string[]
  coverage: number
}
export type Article = {
  id: number
  title: string
  subtitle: string
  category: string
  cover_section: string | null
  author: string
  source: string
  source_url: string | null
  material: string
  paragraph: number
  completed_on: string | null
  difficulty: Difficulty
}
export type ReaderArticle = Article & {
  paragraphs: string[]
  translation: string[]
  phrases: { start: number; surface: string; first_occurrence: boolean }[][]
}
export type Entry = {
  word: string
  phonetic: string
  pos: string
  definition: string
  senses: { pos: string; meaning: string }[]
  english: string[]
  exams: ExamLevel[]
}
export type Example = {
  article_id: number
  title: string
  paragraph: number
  surface: string
  sentence: string
  start: number
}
export type Mastery = '学习中' | '已掌握'
export type Vocabulary = {
  id: number
  lemma: string
  meaning: string
  parts_of_speech: string[]
  exams: ExamLevel[]
  note: string
  status: Mastery
  due: string
  streak: number
  examples: Example[]
}
export type ReviewRating = 'known' | 'fuzzy' | 'forgot'
export type ReviewResult = Vocabulary & { correct: boolean; interval_days: number }
export type Activity = {
  today: string
  days: number
  articles: number
  reviews: number
  entries: { day: string; articles: number; reviews: number }[]
}
export type ArticleInput = { title: string; body: string; source: string; format: 'txt' | 'md' }

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const file = body instanceof Blob ? body : undefined
  const response = await fetch('/api' + path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': file ? 'application/octet-stream' : 'application/json' },
    body: file ?? JSON.stringify(body),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(typeof error.detail === 'string' ? error.detail : '请求失败，请检查输入或重试。')
  }
  return response.status === 204 ? undefined as T : response.json()
}

export function errorText(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请重试。'
}
