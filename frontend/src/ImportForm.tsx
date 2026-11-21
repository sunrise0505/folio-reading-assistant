import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Trash2, Upload } from 'lucide-react'
import { api, errorText } from './api'
import type { ArticleInput, ReaderArticle } from './api'
import { Button, IconButton, Modal } from './ui'

type UploadFormat = 'txt' | 'md' | 'docx' | 'pdf'
type Draft = { id: number; article: ArticleInput; selected: boolean }
type UploadGroup = {
  id: number
  filename: string
  original: ArticleInput
  canKeepWhole: boolean
  ocrPageCount: number
  warnings: string[]
  drafts: Draft[]
}

const emptyArticle: ArticleInput = { title: '', body: '', source: '', format: 'txt' }
const presetSources = [
  'China Daily', 'The Economist', 'The Times', 'The Guardian',
  'Financial Times', 'The Washington Post', 'BBC News',
]

function fileFormat(name: string): UploadFormat {
  const extension = name.match(/\.(txt|md|markdown|docx|pdf)$/i)?.[1].toLowerCase()
  switch (extension) {
    case 'txt':
    case 'docx':
    case 'pdf':
      return extension
    case 'md':
    case 'markdown':
      return 'md'
    default:
      throw new Error('请选择 TXT、Markdown、DOCX 或 PDF 文件。')
  }
}

export function ImportForm({ close, imported }: {
  close: () => void
  imported: (count: number, article?: ReaderArticle) => void
}) {
  const [manual, setManual] = useState(emptyArticle)
  const [uploads, setUploads] = useState<UploadGroup[]>([])
  const [activeId, setActiveId] = useState<number>()
  const [fileErrors, setFileErrors] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [examMode, setExamMode] = useState(false)
  const nextId = useRef(0)
  const drafts = uploads.flatMap(group => group.drafts)
  const active = drafts.find(draft => draft.id === activeId) ?? drafts[0]
  const article = active?.article ?? manual
  const selected = drafts.filter(draft => draft.selected).map(draft => draft.article)
  const locked = busy || !!progress

  async function readFiles(files: File[]) {
    if (!files.length || locked) return
    const added: UploadGroup[] = []
    const errors: string[] = []
    setError('')
    setFileErrors([])
    for (const [index, file] of files.entries()) {
      setProgress(`正在识别文件 ${index + 1} / ${files.length}…`)
      try {
        const format = fileFormat(file.name)
        const plainText = format === 'txt' || format === 'md'
        if (file.size > (plainText ? 400_000 : 10_000_000)) {
          throw new Error(plainText ? '文本文件超过 400 KB。' : '文档超过 10 MB。')
        }
        const parsed = await api<{
          body: string; articles: { title: string; body: string }[]; ocr_pages?: number[]
          warnings?: string[]; extraction_kind?: 'exam'
        }>(
          '/articles/extract?format=' + format + '&mode=' + (examMode ? 'exam' : 'auto'), 'POST', file,
        )
        const title = file.name.replace(/\.[^.]+$/, '').slice(0, 180)
        const original: ArticleInput = {
          ...emptyArticle, title, body: parsed.body, source: parsed.extraction_kind === 'exam' ? title : '',
          format: format === 'md' ? 'md' : 'txt',
        }
        const suggestions = parsed.articles.length ? parsed.articles : [{ title, body: parsed.body }]
        added.push({
          id: nextId.current++, filename: file.name, original,
          canKeepWhole: suggestions.length > 1 || (parsed.extraction_kind === 'exam' && parsed.articles.length > 0),
          ocrPageCount: parsed.ocr_pages?.length ?? 0,
          warnings: parsed.warnings ?? [],
          drafts: suggestions.map(suggestion => ({
            id: nextId.current++, article: { ...original, ...suggestion }, selected: true,
          })),
        })
      } catch (failure) {
        errors.push(file.name + ' · ' + errorText(failure))
      }
    }
    setUploads(previous => [...previous, ...added])
    if (added.length) setActiveId(added[0].drafts[0].id)
    setFileErrors(errors)
    setProgress('')
  }

  function updateDraft(id: number, update: (draft: Draft) => Draft) {
    setUploads(previous => previous.map(group => ({
      ...group, drafts: group.drafts.map(draft => draft.id === id ? update(draft) : draft),
    })))
  }

  function updateArticle(values: Partial<ArticleInput>) {
    if (active) updateDraft(active.id, draft => ({ ...draft, article: { ...draft.article, ...values } }))
    else setManual(previous => ({ ...previous, ...values }))
  }

  function keepWhole(group: UploadGroup) {
    const draft = { id: nextId.current++, article: group.original, selected: true }
    setUploads(previous => previous.map(item => item.id === group.id ? {
      ...item, canKeepWhole: false, drafts: [draft],
      warnings: item.warnings.length ? ['当前保留整份文本，包含试题和选项。可在下方编辑正文后导入。'] : [],
    } : item))
    setActiveId(draft.id)
  }

  function removeDraft(groupId: number, draftId: number) {
    setUploads(previous => previous.map(group => group.id === groupId ? {
      ...group, drafts: group.drafts.filter(draft => draft.id !== draftId),
    } : group).filter(group => group.drafts.length > 0))
    setError('')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (locked) return
    const articles = drafts.length ? selected : [manual]
    if (!articles.length) return
    if (articles.some(item => !item.title.trim() || !/[a-z]/i.test(item.body))) {
      setError('请为每篇勾选的文章填写标题和英文正文。')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (articles.length === 1) {
        imported(1, await api<ReaderArticle>('/articles', 'POST', articles[0]))
      } else {
        const saved = await api<{ id: number }[]>('/articles/batch', 'POST', articles)
        imported(saved.length)
      }
    } catch (failure) {
      setError(errorText(failure))
    } finally {
      setBusy(false)
    }
  }

  return <Modal title="导入文章" close={() => { if (!busy) close() }}>
    <form className="form-stack" onSubmit={submit}>
      <label className="upload-control"><Upload size={17} aria-hidden="true" />上传文章文件
        <input type="file" accept=".txt,.md,.markdown,.docx,.pdf" multiple disabled={locked} onChange={event => {
          void readFiles(Array.from(event.currentTarget.files ?? []))
          event.currentTarget.value = ''
        }} />
      </label>
      <p className="muted">可同时选择 TXT、Markdown、DOCX 和 PDF。英文扫描件会在本机识别，试卷阅读文章会自动尝试分篇。</p>
      <label className="import-exam-mode">
        <input type="checkbox" checked={examMode} disabled={locked} onChange={event => setExamMode(event.target.checked)} />
        这是考试试卷，优先提取阅读文章
      </label>
      <p className="muted">上传前可勾选试卷模式。识别后可预览、编辑并勾选文章，确认后才会保存。</p>
      {progress && <p className="muted" role="status">{progress}</p>}
      {fileErrors.length > 0 && <ul className="import-errors form-error" role="alert">
        {fileErrors.map((message, index) => <li key={index}>{message}</li>)}
      </ul>}
      {uploads.length > 0 && <section className="import-preview" aria-label="识别结果">
        <div className="import-preview-heading">
          <strong>已勾选 {selected.length} / {drafts.length} 篇</strong>
          <Button variant="text" disabled={locked} onClick={() => { setUploads([]); setFileErrors([]); setError('') }}>改用粘贴文本</Button>
        </div>
        {uploads.map(group => <div key={group.id} className="import-upload">
          <div className="import-upload-heading">
            <span>{group.filename}</span>
            {group.canKeepWhole && <Button variant="text" disabled={locked} onClick={() => keepWhole(group)}>整份保留</Button>}
          </div>
          {group.ocrPageCount > 0 && <p className="muted">已识别 {group.ocrPageCount} 页图片文字，请核对识别结果。</p>}
          {group.warnings.map((message, index) => <p key={index} className="muted">{message}</p>)}
          {group.warnings.length > 0 && <details className="import-original">
            <summary>查看整份提取文本</summary>
            <pre>{group.original.body}</pre>
          </details>}
          <ul>{group.drafts.map(draft => <li key={draft.id} className={draft.id === active?.id ? 'selected' : ''}>
            <input type="checkbox" aria-label={'导入 ' + (draft.article.title || '未命名文章')} checked={draft.selected}
              disabled={locked} onChange={event => {
                const checked = event.target.checked
                updateDraft(draft.id, previous => ({ ...previous, selected: checked }))
              }} />
            <button type="button" className="import-draft-title" aria-pressed={draft.id === active?.id} disabled={locked} onClick={() => setActiveId(draft.id)}>
              {draft.article.title || '未命名文章'}
            </button>
            <IconButton className="remove-draft" disabled={locked} title="移除草稿"
              aria-label={'移除草稿 ' + (draft.article.title || '未命名文章')} onClick={() => removeDraft(group.id, draft.id)}>
              <Trash2 size={16} aria-hidden="true" />
            </IconButton>
          </li>)}</ul>
        </div>)}
      </section>}
      <label className="field">文章标题<input required={!active} readOnly={locked} maxLength={180} value={article.title} onChange={event => updateArticle({ title: event.target.value })} placeholder="输入标题" /></label>
      <label className="field">英文正文<textarea required={!active} readOnly={locked} maxLength={100_000} rows={6} value={article.body} onChange={event => updateArticle({ body: event.target.value })} placeholder="粘贴英文正文，或上传文件后核对文本" /></label>
      <div className="form-columns">
        <label className="field">常用外刊
          <select disabled={locked} value={presetSources.includes(article.source) ? article.source : ''}
            onChange={event => updateArticle({ source: event.target.value })}>
            <option value="" disabled>选择外刊</option>
            {presetSources.map(source => <option key={source}>{source}</option>)}
          </select>
        </label>
        <label className="field">来源（选填）
          <input readOnly={locked} maxLength={500} value={article.source} placeholder="也可手动填写"
            onChange={event => updateArticle({ source: event.target.value })} />
        </label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <Button disabled={busy} onClick={close}>取消</Button>
        <Button variant="primary" type="submit" disabled={locked || (drafts.length > 0 && !selected.length)}>
          {busy ? '导入中…' : selected.length > 1 ? `导入 ${selected.length} 篇` : '导入并阅读'}
        </Button>
      </div>
    </form>
  </Modal>
}
