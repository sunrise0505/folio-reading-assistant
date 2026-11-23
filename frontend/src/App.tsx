import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, ArrowUpRight, Check, ChevronLeft, ChevronRight, Download, Plus, Trash2, X } from 'lucide-react'
import { api, errorText, examLevels } from './api'
import type { Activity, Article, Mastery, ReaderArticle, Vocabulary } from './api'
import { ArticleCard, FeaturedArticleCard } from './ArticleCard'
import { ArticleCover, articleCoverImage } from './ArticleCover'
import { ImportForm } from './ImportForm'
import { Reader } from './Reader'
import { Review } from './Review'
import { filterVocabulary, vocabularyCsv } from './vocabulary'
import type { VocabularyFilters } from './vocabulary'
import { Button, Empty, IconButton, Modal, PageHeading, SearchField, Tag } from './ui'

type View = 'library' | 'vocabulary' | 'review' | 'activity'
const tabs = [
  { key: 'library', label: '文章库' },
  { key: 'vocabulary', label: '生词本' },
  { key: 'review', label: '复习' },
  { key: 'activity', label: '打卡' },
] as const

function ArticleLibrary({ articles, activity, count, dueCount, onOpen, onImport, onNavigate, onRemove }: {
  articles: Article[]; activity?: Activity; count: number; dueCount: number
  onOpen: (id: number) => void; onImport: () => void; onNavigate: (view: View) => void
  onRemove: (id: number) => void
}) {
  const [filter, setFilter] = useState('全部文章')
  const [search, setSearch] = useState('')
  const [source, setSource] = useState('')
  const [exam, setExam] = useState('')
  const [deleting, setDeleting] = useState<Article>()
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState('')
  const sources = Array.from(new Set(articles.map(article => article.source || '未注明来源'))).sort()
  const activeSource = sources.includes(source) ? source : ''
  const matching = articles.filter(article => {
    const inFilter = filter === '全部文章' || (filter === '已读完' ? article.completed_on : !article.completed_on)
    return inFilter && (!activeSource || (article.source || '未注明来源') === activeSource) &&
      (!exam || article.difficulty.exam === exam) &&
      [article.title, article.subtitle, article.category, article.source].join(' ').toLowerCase().includes(search.trim().toLowerCase())
  })
  const inProgress = articles.findLast(article => !article.completed_on && article.paragraph > 0)
  const spotlight = matching.length >= 3 && filter === '全部文章' && !search.trim() && !activeSource && !exam
  const archive = spotlight ? matching.slice(3) : matching

  function cardProps(article: Article) {
    return {
      article,
      image: articleCoverImage(article),
      onOpen: () => onOpen(article.id),
      onRemove: () => { setRemoveError(''); setDeleting(article) },
    }
  }

  async function removeArticle() {
    if (!deleting || removing) return
    setRemoving(true)
    setRemoveError('')
    try {
      await api('/articles/' + deleting.id, 'DELETE')
      onRemove(deleting.id)
      setDeleting(undefined)
    } catch (failure) {
      setRemoveError(errorText(failure))
    } finally {
      setRemoving(false)
    }
  }

  return <div className="page-content library-page">
    <PageHeading title="文章库">
      <div className="library-edition">
        <span>{articles.length} 篇文章</span>
        {activity && <time className="edition-date" dateTime={activity.today}>{activity.today.replaceAll('-', ' / ')}</time>}
      </div>
    </PageHeading>
    <section className="library-articles" aria-label="文章列表">
      <div className="library-toolbar">
        <SearchField label="搜索文章" value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索文章" />
        <div className="catalog-filters">
          <label>出处<select aria-label="按出处筛选" value={activeSource} onChange={event => setSource(event.target.value)}>
            <option value="">全部出处</option>
            {sources.map(value => <option key={value}>{value}</option>)}
          </select></label>
          <label>难度参考<select aria-label="按难度筛选" value={exam} onChange={event => setExam(event.target.value)}>
            <option value="">全部难度</option>
            {examLevels.map(value => <option key={value}>{value}</option>)}
          </select></label>
        </div>
        <div className="filter-row library-status-filters" aria-label="按阅读状态筛选" role="group">{['全部文章', '未读完', '已读完'].map(label =>
          <button key={label} className={filter === label ? 'selected' : ''} aria-pressed={filter === label} onClick={() => setFilter(label)}>{label}</button>
        )}</div>
      </div>
      <div className="catalog-results">
        {spotlight && <ul className="article-list article-list--spread">
          <FeaturedArticleCard {...cardProps(matching[0])} />
          {matching.slice(1, 3).map(article => <ArticleCard key={article.id} {...cardProps(article)} variant="secondary" />)}
        </ul>}
        {!matching.length && <Empty title={articles.length ? '没有符合条件的文章' : '文章库还是空的'}
          illustration={<ArticleCover category="文化与生活" label="Folio" />}>
          {articles.length ? <Button variant="text" onClick={() => { setSearch(''); setFilter('全部文章'); setSource(''); setExam('') }}>查看全部文章</Button> :
            <Button variant="primary" onClick={onImport}>导入第一篇文章</Button>}
        </Empty>}
        <div className={archive.length ? 'library-lower has-archive' : 'library-lower'}>
          {archive.length > 0 && <ul className="article-list library-archive">
            {archive.map(article => <ArticleCard key={article.id} {...cardProps(article)} />)}
          </ul>}
          <aside className="library-index" aria-label="学习记录">
            {inProgress && <section className="continue-reading" aria-label="继续阅读">
              <h2 className="library-label">继续阅读</h2>
              <button onClick={() => onOpen(inProgress.id)} className="continue-link">
                <span lang="en">{inProgress.title}</span><ArrowRight size={15} aria-hidden="true" />
              </button>
              <p>上次读到第 {inProgress.paragraph + 1} 段</p>
            </section>}
            <section>
              <h2 className="library-label">今日复习</h2>
              <p className="review-count"><strong>{dueCount}</strong> 个待复习义项</p>
              <Button variant="text" onClick={() => onNavigate('review')}>{dueCount ? '开始复习' : '查看复习'} <ArrowRight size={15} aria-hidden="true" /></Button>
            </section>
            <section>
              <h2 className="library-label">阅读记录</h2>
              <dl className="index-stats">
                <div><dt>已读文章</dt><dd>{activity?.articles ?? 0}</dd></div>
                <div><dt>累计打卡</dt><dd>{activity?.days ?? 0} 天</dd></div>
                <div><dt>收藏义项</dt><dd>{count}</dd></div>
              </dl>
              {!activity?.days && <p className="index-note">读完一篇文章或完成复习，就会留下第一条记录。</p>}
              <Button variant="text" onClick={() => onNavigate('activity')}>打开阅读日志 <ArrowRight size={15} aria-hidden="true" /></Button>
            </section>
          </aside>
        </div>
      </div>
    </section>
    {deleting && <Modal title="删除文章？" close={() => { if (!removing) setDeleting(undefined) }}>
      <div className="form-stack">
        <p className="delete-article-title" lang="en">{deleting.title}</p>
        <p className="muted">文章会从文章库移除。已收藏的例句和打卡记录会保留。</p>
        {removeError && <p className="form-error" role="alert">{removeError}</p>}
        <div className="modal-actions">
          <Button disabled={removing} onClick={() => setDeleting(undefined)}>取消</Button>
          <Button variant="danger" disabled={removing} onClick={() => void removeArticle()}>{removing ? '删除中…' : '删除文章'}</Button>
        </div>
      </div>
    </Modal>}
  </div>
}

const percent = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 })

function VocabularyExamStats({ words }: { words: Vocabulary[] }) {
  const categories = Array.from(new Map(words.filter(({ lemma }) => !/\s/.test(lemma)).map(({ lemma, exams }) => [lemma, exams])).values())
  const total = categories.length
  return <section className="vocabulary-exams" aria-labelledby="vocabulary-exams-title">
    <h2 id="vocabulary-exams-title">收藏词汇的考试分布</h2>
    <p>按 {total} 个不同单词统计，同一个词可被多个词表收录。</p>
    <dl className="exam-distribution">
      {examLevels.map(exam => {
        const count = categories.filter(exams => exams?.includes(exam)).length
        const ratio = total ? count / total : 0
        return <div key={exam}>
          <dt>{exam}</dt>
          <dd>
            <span className="exam-figures"><strong>{percent.format(ratio)}</strong><span>{count} 词</span></span>
            <meter aria-hidden="true" min={0} max={1} value={ratio} />
          </dd>
        </div>
      })}
    </dl>
  </section>
}

function VocabularyList({ words, onChange, onOpen, onRead }: {
  words: Vocabulary[]; onChange: () => void; onOpen: (id: number, paragraph?: number) => void; onRead: () => void
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('')
  const [status, setStatus] = useState<Mastery | ''>('')
  const [sort, setSort] = useState<VocabularyFilters['sort']>('newest')
  const [exportNotice, setExportNotice] = useState('')
  const [edit, setEdit] = useState<Vocabulary>()
  const [deleting, setDeleting] = useState<Vocabulary>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const articles = new Map(words.flatMap(word => word.examples.map(example => [example.article_id, example.title] as const)))
  const activeSource = articles.has(Number(filter)) ? filter : ''
  const shown = filterVocabulary(words, { query, source: activeSource, status, sort })

  function exportWords() {
    const url = URL.createObjectURL(new Blob([vocabularyCsv(shown, activeSource)], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = '拾页生词本-' + new Date().toLocaleDateString('sv-SE') + '.csv'
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setExportNotice(`已生成 ${shown.length} 个义项的 CSV 文件，每条出处占一行。`)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!edit) return
    setBusy(true)
    setError('')
    try {
      await api('/vocabulary/' + edit.id, 'PATCH', { note: edit.note, status: edit.status })
      setEdit(undefined)
      onChange()
    } catch (failure) {
      setError(errorText(failure))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!deleting) return
    setBusy(true)
    setError('')
    try {
      await api('/vocabulary/' + deleting.id, 'DELETE')
      setDeleting(undefined)
      onChange()
    } catch (failure) {
      setError(errorText(failure))
    } finally {
      setBusy(false)
    }
  }

  return <div className="page-content inner-page">
    <PageHeading label="Vocabulary" title="生词本"><p>{words.length} 个收藏义项</p></PageHeading>
    <VocabularyExamStats words={words} />
    <div className="list-controls vocabulary-controls">
      <SearchField label="搜索生词" placeholder="搜索单词、释义或备注" value={query} onChange={event => setQuery(event.target.value)} />
      <select aria-label="按文章筛选" value={activeSource} onChange={event => setFilter(event.target.value)}><option value="">全部来源</option>{Array.from(articles, ([id, title]) => <option key={id} value={id}>{title}</option>)}</select>
      <select aria-label="按掌握度筛选" value={status} onChange={event => setStatus(event.target.value as Mastery | '')}>
        <option value="">全部掌握度</option><option>学习中</option><option>已掌握</option>
      </select>
      <select aria-label="生词排序" value={sort} onChange={event => setSort(event.target.value as VocabularyFilters['sort'])}>
        <option value="newest">最近收藏</option><option value="due">复习日期从早到晚</option><option value="alphabetical">字母顺序</option>
      </select>
    </div>
    <div className="vocabulary-results">
      <p role="status">显示 {shown.length} / {words.length} 个义项</p>
      <Button disabled={!shown.length} onClick={exportWords}><Download size={16} aria-hidden="true" />导出当前结果</Button>
    </div>
    {exportNotice && <p className="muted vocabulary-export-notice" role="status">{exportNotice}</p>}
    {!shown.length ? <Empty title={words.length ? '没有找到生词' : '还没有收藏生词'}
      illustration={<ArticleCover category="文化与生活" label="Words" />}>
      {words.length ? <Button variant="text" onClick={() => { setQuery(''); setFilter(''); setStatus('') }}>清除筛选</Button> :
        <Button onClick={onRead}>去读文章</Button>}
    </Empty> : <div className="word-list">
      <div className="word-index-heading" aria-hidden="true"><span>单词与释义</span><span>原句与来源</span><span>学习记录</span></div>
      {shown.map(word => <article className="word-row" key={word.id}>
        <div className="word-term">
          <h2 lang="en">{word.lemma}</h2>
          {!!word.parts_of_speech?.length && <div className="word-tags">
            {word.parts_of_speech.map(pos => <Tag key={pos} tone={pos === '名词' ? 'green' : pos.endsWith('动词') ? 'warm' : 'blue'}>{pos}</Tag>)}
          </div>}
          <p>{word.meaning}</p>
        </div>
        <div className="word-context">
          {word.examples.filter(example => !activeSource || String(example.article_id) === activeSource).map(example =>
            <div className="saved-example" key={[example.article_id, example.paragraph, example.start, example.sentence].join('|')}>
              <blockquote lang="en">{example.sentence}</blockquote>
              <Button variant="text" onClick={() => onOpen(example.article_id, example.paragraph)}>{example.title}{example.paragraph === -1 ? ' · 标题' : ''} <ArrowUpRight size={13} aria-hidden="true" /></Button>
            </div>
          )}
          {word.note && <p className="word-note">{word.note}</p>}
        </div>
        <div className="word-record">
          <p className={word.status === '已掌握' ? 'complete-state' : ''}>{word.status}</p>
          <p>下次复习 <time dateTime={word.due}>{word.due}</time></p>
          <div className="word-actions">
            <Button variant="text" onClick={() => { setError(''); setEdit(word) }}>编辑</Button>
            <IconButton aria-label={'删除 ' + word.lemma} title="删除" onClick={() => { setError(''); setDeleting(word) }}><Trash2 size={16} /></IconButton>
          </div>
        </div>
      </article>)}
    </div>}
    {edit && <Modal title={'编辑 ' + edit.lemma} close={() => setEdit(undefined)}><form className="form-stack" onSubmit={save}>
      <label className="field">掌握度<select value={edit.status} onChange={event => setEdit({ ...edit, status: event.target.value as Mastery })}><option>学习中</option><option>已掌握</option></select></label>
      <label className="field">备注<textarea rows={4} maxLength={1500} value={edit.note} onChange={event => setEdit({ ...edit, note: event.target.value })} /></label>
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="modal-actions"><Button variant="primary" type="submit" disabled={busy}>保存修改</Button></div>
    </form></Modal>}
    {deleting && <Modal title={'删除 ' + deleting.lemma + '？'} close={() => setDeleting(undefined)}>
      <p className="muted">该义项的原句、备注和复习安排也会被删除。</p>
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="modal-actions"><Button onClick={() => setDeleting(undefined)}>取消</Button><Button variant="danger" disabled={busy} onClick={() => void remove()}>删除</Button></div>
    </Modal>}
  </div>
}

function Calendar({ activity }: { activity?: Activity }) {
  const today = activity?.today ?? new Date().toLocaleDateString('sv-SE')
  const [year, month] = today.split('-').map(Number)
  const [offset, setOffset] = useState(0)
  const date = new Date(year, month - 1 + offset, 1)
  const days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  const pad = (date.getDay() + 6) % 7
  const dayPrefix = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-'
  const entries = new Map(activity?.entries.map(entry => [entry.day, entry]))
  const monthEntries = activity?.entries.filter(entry => entry.day.startsWith(dayPrefix)).toReversed() ?? []
  const trailing = (7 - (pad + days) % 7) % 7
  const monthArticles = monthEntries.reduce((total, entry) => total + entry.articles, 0)
  const monthReviews = monthEntries.reduce((total, entry) => total + entry.reviews, 0)
  const previous = new Date(year, month - 1, Number(today.slice(-2)), 12)
  if (!entries.has(today)) previous.setDate(previous.getDate() - 1)
  let streak = 0
  while (entries.has(previous.toLocaleDateString('sv-SE'))) {
    streak++
    previous.setDate(previous.getDate() - 1)
  }

  return <div className="page-content inner-page">
    <PageHeading label="Reading Log" title="阅读打卡"><p>读完文章或完成复习后自动记录</p></PageHeading>
    <dl className="log-stats">
      <div><dt>连续打卡</dt><dd>{streak} 天</dd></div>
      <div><dt>累计打卡</dt><dd>{activity?.days ?? 0} 天</dd></div>
      <div><dt>读完文章</dt><dd>{activity?.articles ?? 0} 篇</dd></div>
      <div><dt>复习次数</dt><dd>{activity?.reviews ?? 0} 次</dd></div>
    </dl>
    <div className="log-layout">
      <section className="calendar-sheet" aria-label="打卡日历">
        <div className="calendar-heading">
          <div><h2 aria-live="polite">{date.getFullYear()} 年 {date.getMonth() + 1} 月</h2>
            <p>打卡 {monthEntries.length} 天 · 阅读 {monthArticles} 篇 · 复习 {monthReviews} 次</p></div>
          <div className="calendar-controls">
            {offset !== 0 && <Button variant="text" onClick={() => setOffset(0)}>本月</Button>}
            <IconButton aria-label="上个月" onClick={() => setOffset(offset - 1)}><ChevronLeft size={18} /></IconButton>
            <IconButton aria-label="下个月" onClick={() => setOffset(offset + 1)}><ChevronRight size={18} /></IconButton>
          </div>
        </div>
        <div className="calendar-grid">
          {['一', '二', '三', '四', '五', '六', '日'].map(day => <span className="weekday" key={day}>{day}</span>)}
          {Array.from({ length: pad }, (_, index) => <span className="calendar-padding" key={'pad-' + index} aria-hidden="true" />)}
          {Array.from({ length: days }, (_, index) => {
            const day = dayPrefix + String(index + 1).padStart(2, '0')
            const entry = entries.get(day)
            const detail = entry ? day + ' · 阅读 ' + entry.articles + ' 篇 · 复习 ' + entry.reviews + ' 次' : day
            return <time key={day} dateTime={day} className={'calendar-day' + (entry ? ' checked' : '') + (day === today ? ' today' : '')}
              aria-current={day === today ? 'date' : undefined} title={detail}>
              <span className="day-number">{index + 1}</span>
              {entry && <><Check size={13} aria-hidden="true" /><span className="sr-only">{detail}</span></>}
            </time>
          })}
          {Array.from({ length: trailing }, (_, index) => <span className="calendar-padding" key={'trailing-' + index} aria-hidden="true" />)}
        </div>
        <div className="calendar-legend"><i /> 已打卡</div>
      </section>
      <section className="daily-log" aria-label="每日阅读记录">
        <h2>本月记录</h2>
        {monthEntries.length ? <ul>
          {monthEntries.map(entry => <li key={entry.day}>
            <time dateTime={entry.day}>{entry.day.slice(5).replace('-', ' / ')}</time>
            <span>读完 {entry.articles} 篇</span><span>复习 {entry.reviews} 次</span>
          </li>)}
        </ul> : <p className="muted">本月还没有打卡记录。</p>}
      </section>
    </div>
  </div>
}

export function App() {
  const [view, setView] = useState<View>('library')
  const [articles, setArticles] = useState<Article[]>([])
  const [words, setWords] = useState<Vocabulary[]>([])
  const [queue, setQueue] = useState<Vocabulary[]>([])
  const [activity, setActivity] = useState<Activity>()
  const [reader, setReader] = useState<{ article: ReaderArticle; anchor?: number }>()
  const [importing, setImporting] = useState(false)
  const [importNotice, setImportNotice] = useState('')
  const [libraryRevision, setLibraryRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [reviewVisit, setReviewVisit] = useState(0)
  const [error, setError] = useState('')
  const openSequence = useRef(0)
  const refreshSequence = useRef(0)

  async function refresh() {
    const request = ++refreshSequence.current
    try {
      const [newArticles, newWords, newQueue, newActivity] = await Promise.all([
        api<Article[]>('/articles'), api<Vocabulary[]>('/vocabulary'), api<Vocabulary[]>('/review'), api<Activity>('/activity'),
      ])
      if (request !== refreshSequence.current) return
      setArticles(newArticles)
      setWords(newWords)
      setQueue(newQueue)
      setActivity(newActivity)
    } catch (failure) {
      if (request === refreshSequence.current) setError(errorText(failure))
    } finally {
      if (request === refreshSequence.current) setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  function navigate(next: View) {
    openSequence.current++
    setView(next)
    setImportNotice('')
    if (next === 'review') setReviewVisit(visit => visit + 1)
    setReader(undefined)
    setError('')
    window.scrollTo(0, 0)
    void refresh()
  }

  async function openArticle(id: number, anchor?: number) {
    const request = ++openSequence.current
    setError('')
    try {
      const article = await api<ReaderArticle>('/articles/' + id)
      if (request === openSequence.current) setReader({ article, anchor })
    } catch (failure) {
      if (request === openSequence.current) setError(errorText(failure))
    }
  }

  function updateSavedWords(saved: Vocabulary[]) {
    setWords(current => {
      const changes = new Map(saved.map(word => [word.id, word]))
      return [...saved.filter(word => !current.some(existing => existing.id === word.id)),
        ...current.map(word => changes.get(word.id) ?? word)]
    })
    void refresh()
  }

  return <>
    <a className="skip-link" href="#main-content">跳到主要内容</a>
    <header className="app-header">
      <div className="header-inner">
        <button className="brand" onClick={() => navigate('library')} aria-label="拾页首页">
          <span className="brand-name"><strong>拾页</strong><span className="brand-english" lang="en">FOLIO</span></span>
          <span className="brand-subtitle">外刊阅读与词汇积累</span></button>
        <nav className="main-nav" aria-label="主导航">{tabs.map(({ key, label }) => <button key={key} className={view === key ? 'selected' : ''} aria-current={view === key ? 'page' : undefined} onClick={() => navigate(key)}>{label}</button>)}</nav>
        <Button className="header-import" onClick={() => setImporting(true)}><Plus size={16} aria-hidden="true" />导入文章</Button>
      </div>
    </header>
    {error && <div className="app-error" role="alert"><span>{error}</span><Button variant="text" onClick={() => { setError(''); void refresh() }}>重试</Button><IconButton aria-label="关闭消息" onClick={() => setError('')}><X size={16} /></IconButton></div>}
    <main id="main-content" tabIndex={-1}>
      {importNotice && <p className="import-notice" role="status">{importNotice}</p>}
      {reader ? <Reader key={reader.article.id + ':' + (reader.anchor ?? '')} article={reader.article} words={words} anchor={reader.anchor} onBack={() => {
        if (view === 'review') { setReader(undefined); window.scrollTo(0, 0) }
        else navigate(view)
      }} backLabel={tabs.find(tab => tab.key === view)!.label} onUpdate={article => { setReader({ ...reader, article }); void refresh() }} onSaved={updateSavedWords} onError={setError} /> :
        loading ? <div className="page-content library-page">
          <PageHeading title="文章库" />
          <p className="library-loading muted" role="status">正在读取文章…</p>
        </div> :
        view === 'library' ? <ArticleLibrary key={libraryRevision} articles={articles} activity={activity} count={words.length} dueCount={queue.length}
          onNavigate={navigate} onOpen={id => void openArticle(id)} onImport={() => setImporting(true)} onRemove={id => {
            setArticles(previous => previous.filter(article => article.id !== id))
            void refresh()
          }} /> :
        view === 'vocabulary' ? <VocabularyList words={words} onRead={() => navigate('library')} onChange={() => void refresh()} onOpen={(id, paragraph) => void openArticle(id, paragraph)} /> :
        view === 'activity' ? <Calendar activity={activity} /> : null
      }
      {!loading && view === 'review' && <div hidden={!!reader}>
        <Review key={reviewVisit} queue={queue} onOpen={(id, paragraph) => void openArticle(id, paragraph)} onRead={() => navigate('library')} onRated={result => {
          setQueue(previous => previous.filter(word => word.id !== result.id))
          void refresh()
        }} />
      </div>}
    </main>
    {importing && <ImportForm close={() => setImporting(false)} imported={(count, article) => {
      setImporting(false)
      openSequence.current++
      setView('library')
      setReader(article ? { article } : undefined)
      setImportNotice(article ? '' : `已导入 ${count} 篇文章`)
      if (!article) {
        setLibraryRevision(revision => revision + 1)
        window.scrollTo(0, 0)
      }
      void refresh()
    }} />}
  </>
}
