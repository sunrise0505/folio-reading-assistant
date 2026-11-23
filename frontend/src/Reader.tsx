import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent } from 'react'
import { ArrowLeft, Check, Settings2, X } from 'lucide-react'
import { api, errorText } from './api'
import type { Entry, Example, ReaderArticle, Vocabulary } from './api'
import { Button, DifficultyLabel, IconButton, Modal, readingMinutes } from './ui'

type Selection = Omit<Example, 'title'>
type Settings = { size: number; line: number; width: number }
type Lookup = { selection: Selection; absoluteStart: number; entry?: Entry | null; error?: string }
type TextSpan = { start: number; end: number }
type Highlight = TextSpan & { meanings: Set<string> }
const defaultSettings: Settings = { size: 19, line: 1.78, width: 680 }
const expressionPattern = /^[a-z]+(?:['’-][a-z]+)*(?:[^\S\r\n]+[a-z]+(?:['’-][a-z]+)*)*$/i

function readingBoundary() {
  return window.innerHeight * 0.43
}

function tokensIn(text: string) {
  return Array.from(text.matchAll(/[a-z]+(?:['’-][a-z]+)*/gi))
}

function loadSettings(): Settings {
  try {
    const value = JSON.parse(localStorage.getItem('margin-settings') ?? 'null')
    return value && [value.size, value.line, value.width].every(Number.isFinite) ? value : defaultSettings
  } catch {
    return defaultSettings
  }
}

function wordContext(text: string, start: number, surface: string) {
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })
  for (const { index, segment } of segmenter.segment(text)) {
    if (start >= index && start < index + segment.length) {
      const prefix = segment.length - segment.trimStart().length
      const sentence = segment.trim()
      const offset = Array.from(text.slice(index + prefix, start)).length
      if (start + surface.length <= index + segment.length) return { sentence, start: offset }
    }
  }
  return { sentence: text, start: Array.from(text.slice(0, start)).length }
}

function collectHighlights(articleId: number, title: string, paragraphs: string[], words: Vocabulary[]) {
  const highlights = new Map<number, Map<string, Highlight>>()
  for (const { meaning, examples } of words) {
    for (const { article_id, paragraph, sentence, start, surface } of examples) {
      if (article_id !== articleId || !sentence) continue
      const text = paragraph === -1 ? title : paragraphs[paragraph]
      if (!text) continue
      // The server stores character offsets, while browser text offsets use UTF-16.
      const offset = Array.from(sentence).slice(0, start).join('').length
      const matches = highlights.get(paragraph) ?? new Map<string, Highlight>()
      for (let position = text.indexOf(sentence); position !== -1; position = text.indexOf(sentence, position + 1)) {
        const start = position + offset
        const key = `${start}:${surface.length}`
        const range = matches.get(key) ?? { start, end: start + surface.length, meanings: new Set<string>() }
        range.meanings.add(meaning)
        matches.set(key, range)
      }
      highlights.set(paragraph, matches)
    }
  }
  return highlights
}

export function Reader({ article, words, anchor, onBack, backLabel, onUpdate, onSaved, onError }: {
  article: ReaderArticle
  words: Vocabulary[]
  anchor?: number
  onBack: () => void
  backLabel: string
  onUpdate: (article: ReaderArticle) => void
  onSaved: (words: Vocabulary[]) => void
  onError: (message: string) => void
}) {
  const [settings, setSettings] = useState(loadSettings)
  const [bilingual, setBilingual] = useState(() => localStorage.getItem('folio-reading-mode') === 'bilingual')
  const [translationDraft, setTranslationDraft] = useState<string>()
  const [translationError, setTranslationError] = useState('')
  const [savingTranslation, setSavingTranslation] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [navigationTarget, setNavigationTarget] = useState<number>()
  const [keyboardWord, setKeyboardWord] = useState<{ paragraph: number; index: number; anchor: number }>()
  const [lookup, setLookup] = useState<Lookup>()
  const [customMeaning, setCustomMeaning] = useState('')
  const [selectedMeanings, setSelectedMeanings] = useState<string[]>([])
  const [saveError, setSaveError] = useState('')
  const [saveFeedback, setSaveFeedback] = useState(0)
  const [busy, setBusy] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [paragraph, setParagraph] = useState(anchor === -1 ? 0 : anchor ?? article.paragraph)
  const body = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const sequence = useRef(0)
  const initial = useRef(anchor === -1 ? 0 : anchor ?? article.paragraph)
  const lastSaved = useRef(article.paragraph)
  const current = useRef(initial.current)
  const lookupPanel = useRef<HTMLElement>(null)
  const settingsPanel = useRef<HTMLElement>(null)
  const settingsTrigger = useRef<HTMLButtonElement | null>(null)
  const lookupTrigger = useRef<HTMLElement | null>(null)
  const highlights = useMemo(() => collectHighlights(article.id, article.title, article.paragraphs, words),
    [article.id, article.title, article.paragraphs, words])
  const phrases = useMemo(() => (article.phrases ?? []).map((matches, index) => {
    const text = index === 0 ? article.title : article.paragraphs[index - 1]
    if (!matches.length) return []
    const offsets = [0]
    for (const character of text) offsets.push(offsets[offsets.length - 1] + character.length)
    return matches.map(({ start, surface, first_occurrence }) => ({
      start: offsets[start], end: offsets[start] + surface.length, surface, first: first_occurrence,
    }))
  }), [article.phrases, article.title, article.paragraphs])

  function closeLookup() {
    sequence.current++
    setLookup(undefined)
    lookupTrigger.current?.focus({ preventScroll: true })
    lookupTrigger.current = null
  }

  function closeSettings() {
    setShowSettings(false)
    settingsTrigger.current?.focus({ preventScroll: true })
  }

  function toggleSettings(trigger: HTMLButtonElement) {
    if (showSettings) {
      closeSettings()
      return
    }
    settingsTrigger.current = trigger
    setShowSettings(true)
    sequence.current++
    setLookup(undefined)
    lookupTrigger.current = null
  }

  function jumpTo(index: number) {
    const target = body.current?.querySelector<HTMLElement>('[data-paragraph="' + index + '"]')
    if (target) window.scrollBy(0, target.getBoundingClientRect().top - readingBoundary() + 2)
  }

  function keepParagraphPosition(update: () => void) {
    const activeParagraph = body.current?.querySelector<HTMLElement>('[data-paragraph="' + current.current + '"]')
    const previousTop = activeParagraph?.getBoundingClientRect().top
    update()
    if (activeParagraph && previousTop !== undefined) {
      requestAnimationFrame(() => window.scrollBy(0, activeParagraph.getBoundingClientRect().top - previousTop))
    }
  }

  function changeSettings(next: Settings) {
    keepParagraphPosition(() => setSettings(next))
  }

  function changeReadingMode(next: boolean) {
    localStorage.setItem('folio-reading-mode', next ? 'bilingual' : 'english')
    keepParagraphPosition(() => setBilingual(next))
  }

  async function saveTranslation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (translationDraft === undefined || savingTranslation) return
    setSavingTranslation(true)
    setTranslationError('')
    try {
      const translated = await api<ReaderArticle>('/articles/' + article.id + '/translation', 'PATCH', { body: translationDraft })
      keepParagraphPosition(() => onUpdate(translated))
      setTranslationDraft(undefined)
    } catch (failure) {
      setTranslationError(errorText(failure))
    } finally {
      setSavingTranslation(false)
    }
  }

  useLayoutEffect(() => {
    window.scrollTo(0, 0)
    if (anchor === -1) heading.current?.focus({ preventScroll: true })
    else if (initial.current > 0 || anchor !== undefined) jumpTo(initial.current)
  }, [anchor])

  useEffect(() => {
    let pending = Promise.resolve()
    let timer: ReturnType<typeof setTimeout> | undefined

    function flush() {
      if (lastSaved.current === current.current) return
      const position = current.current
      lastSaved.current = position
      pending = pending.then(async () => {
        try {
          await fetch('/api/articles/' + article.id + '/progress', {
            method: 'PATCH', keepalive: true, headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paragraph: position }),
          }).then(response => {
            if (!response.ok) throw new Error('阅读进度保存失败。')
          })
        } catch {
          if (lastSaved.current === position) lastSaved.current = -1
        }
      })
    }

    function track() {
      const paragraphs = Array.from(body.current?.querySelectorAll<HTMLElement>('[data-paragraph]') ?? [])
      if (!paragraphs.length) return
      const boundary = readingBoundary()
      const atEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2
      const next = atEnd ? paragraphs.length - 1 : paragraphs.findLastIndex(node => node.getBoundingClientRect().top <= boundary)
      current.current = Math.max(0, next)
      setParagraph(current.current)
      clearTimeout(timer)
      timer = setTimeout(flush, 220)
    }

    function saveWhenHidden() {
      if (document.visibilityState === 'hidden') flush()
    }

    window.addEventListener('scroll', track, { passive: true })
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', saveWhenHidden)
    return () => {
      clearTimeout(timer)
      flush()
      window.removeEventListener('scroll', track)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', saveWhenHidden)
    }
  }, [article.id])

  useEffect(() => {
    localStorage.setItem('margin-settings', JSON.stringify(settings))
  }, [settings])

  useEffect(() => {
    if (showSettings) settingsPanel.current?.focus({ preventScroll: true })
  }, [showSettings])

  useEffect(() => {
    if (!showSettings && !lookup) return
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (document.querySelector('dialog[open]')) return
      event.preventDefault()
      if (showSettings) closeSettings()
      else closeLookup()
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [showSettings, lookup])

  function textAt(index: number) {
    return index === -1 ? article.title : article.paragraphs[index]
  }

  async function selectWord(surface: string, start: number, index: number, trigger?: HTMLElement) {
    if (!expressionPattern.test(surface) || surface.length > 80) return
    const selection = { article_id: article.id, paragraph: index, surface, ...wordContext(textAt(index), start, surface) }
    const request = ++sequence.current
    setShowSettings(false)
    setCustomMeaning('')
    setSelectedMeanings([])
    setSaveError('')
    setSaveFeedback(0)
    setLookup({ selection, absoluteStart: start })
    lookupTrigger.current = trigger ?? null
    if (trigger) requestAnimationFrame(() => {
      if (sequence.current === request) lookupPanel.current?.focus({ preventScroll: true })
    })
    try {
      const { entry } = await api<{ entry: Entry | null }>('/dictionary?word=' + encodeURIComponent(surface))
      if (sequence.current !== request) return
      setSelectedMeanings([...new Set(entry?.senses.map(sense => sense.meaning) ?? [])])
      setLookup({ selection, entry, absoluteStart: start })
    } catch (error) {
      if (sequence.current === request) setLookup({ selection, error: errorText(error), absoluteStart: start })
    }
  }

  function readSelection() {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.rangeCount) return false
    const range = selection.getRangeAt(0)
    const startElement = range.startContainer instanceof HTMLElement ? range.startContainer : range.startContainer.parentElement
    const element = startElement?.closest<HTMLElement>('[data-paragraph], [data-title]')
    if (!element || (element !== heading.current && !body.current?.contains(element)) || !element.contains(range.endContainer)) return false
    const raw = range.toString()
    const surface = raw.trim()
    if (!surface || surface.length > 80) return false
    const before = document.createRange()
    before.selectNodeContents(element)
    before.setEnd(range.startContainer, range.startOffset)
    const offset = before.toString().length + raw.length - raw.trimStart().length
    const index = element === heading.current ? -1 : Number(element.dataset.paragraph)
    const text = textAt(index)
    const matches = tokensIn(text).filter(token => token.index < offset + surface.length && token.index + token[0].length > offset)
    const first = matches[0]
    const last = matches.at(-1)
    if (!first || !last) return false
    const expression = text.slice(first.index, last.index + last[0].length)
    if (!expressionPattern.test(expression) || expression.length > 80) return false
    void selectWord(expression, first.index, index,
      document.activeElement === element && element.matches(':focus-visible') ? element : undefined)
    return true
  }

  function onWordClick(event: MouseEvent<HTMLElement>, token: string, start: number, index: number) {
    if (event.detail !== 0 && !window.getSelection()?.isCollapsed) return
    void selectWord(token, start, index)
  }

  function onParagraphKeyDown(event: ReactKeyboardEvent<HTMLElement>, index: number) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const tokens = tokensIn(textAt(index))
    if (!tokens.length) return
    const selection = keyboardWord?.paragraph === index ? keyboardWord : undefined
    const selected = selection?.index
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      const next = selected === undefined ? (event.key === 'ArrowRight' ? 0 : tokens.length - 1) :
        Math.max(0, Math.min(tokens.length - 1, selected + (event.key === 'ArrowRight' ? 1 : -1)))
      setKeyboardWord({ paragraph: index, index: next, anchor: event.shiftKey ? selection?.anchor ?? next : next })
      event.currentTarget.querySelectorAll('[data-word]')[next]?.scrollIntoView({ block: 'nearest' })
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const position = selected ?? 0
      const anchor = selection?.anchor ?? position
      const first = tokens[Math.min(position, anchor)]
      const last = tokens[Math.max(position, anchor)]
      const expression = textAt(index).slice(first.index, last.index + last[0].length)
      if (expressionPattern.test(expression) && expression.length <= 80) {
        void selectWord(expression, first.index, index, event.currentTarget)
      }
    }
  }

  function renderWords(text: string, index: number) {
    const fragments = []
    const marked = Array.from(highlights.get(index)?.values() ?? [])
    const recognized = phrases[index + 1]?.filter(range => range.first) ?? []
    const active = lookup?.selection.paragraph === index ? lookup : undefined
    const activeRange = active && { start: active.absoluteStart, end: active.absoluteStart + active.selection.surface.length }
    const keyboard = keyboardWord?.paragraph === index ? keyboardWord : undefined
    const covers = ({ start, end }: TextSpan, left: number, right: number) => start <= left && end >= right
    let cursor = 0
    for (const [tokenIndex, match] of tokensIn(text).entries()) {
      const start = match.index
      const token = match[0]
      const end = start + token.length
      const keyboardActive = keyboard && tokenIndex >= Math.min(keyboard.anchor, keyboard.index) && tokenIndex <= Math.max(keyboard.anchor, keyboard.index)
      const saved = marked.some(range => covers(range, start, end))
      const WordTag = saved ? 'mark' : 'span'
      const className = [
        saved && 'saved-word', activeRange && covers(activeRange, start, end) && 'active-word',
        recognized.some(range => covers(range, start, end)) && 'recognized-phrase', keyboardActive && 'keyboard-word',
      ].filter(Boolean).join(' ')
      const gap = text.slice(cursor, start)
      if (gap) {
        const savedGap = marked.some(range => covers(range, cursor, start))
        const activeGap = activeRange && covers(activeRange, cursor, start)
        const recognizedGap = recognized.some(range => covers(range, cursor, start))
        const gapClass = [savedGap && 'saved-word', activeGap && 'active-word', recognizedGap && 'recognized-phrase'].filter(Boolean).join(' ')
        fragments.push(gapClass ? <span key={'gap-' + start} className={gapClass}>{gap}</span> : gap)
      }
      fragments.push(<WordTag key={start} data-word className={className} onClick={event => onWordClick(event, token, start, index)}>{token}</WordTag>)
      cursor = end
    }
    fragments.push(text.slice(cursor))
    return fragments
  }

  const senses = lookup?.entry?.senses ?? []
  const isPhrase = !!lookup && /\s/.test(lookup.selection.surface)
  const suggestedPhrase = lookup && !isPhrase ? phrases[lookup.selection.paragraph + 1]?.find(
    match => match.start <= lookup.absoluteStart && match.end >= lookup.absoluteStart + lookup.selection.surface.length,
  ) : undefined
  const savedMeanings = lookup ? Array.from(highlights.get(lookup.selection.paragraph)
    ?.get(`${lookup.absoluteStart}:${lookup.selection.surface.length}`)?.meanings ?? []) : []
  const availableMeanings = [...new Set(senses.map(sense => sense.meaning))].filter(meaning => !savedMeanings.includes(meaning))
  const allSelected = availableMeanings.length > 0 && availableMeanings.every(meaning => selectedMeanings.includes(meaning))
  const pendingMeanings = [...new Set([...selectedMeanings, customMeaning.trim()])].filter(meaning => meaning && !savedMeanings.includes(meaning))

  async function saveWords() {
    if (!lookup || !pendingMeanings.length || busy) return
    const request = sequence.current
    const saved: Vocabulary[] = []
    setBusy(true)
    setSaveError('')
    try {
      for (const meaning of pendingMeanings) {
        saved.push(await api<Vocabulary>('/vocabulary', 'POST', { ...lookup.selection, meaning }))
      }
    } catch (error) {
      if (sequence.current === request) setSaveError(errorText(error))
    } finally {
      setBusy(false)
      if (saved.length) {
        onSaved(saved)
        if (sequence.current === request) setSaveFeedback(previous => previous + 1)
      }
    }
  }

  async function complete() {
    setCompleting(true)
    try {
      onUpdate(await api<ReaderArticle>('/articles/' + article.id + '/complete', 'POST'))
    } catch (error) {
      onError(errorText(error))
    } finally {
      setCompleting(false)
    }
  }

  const difficulty = article.difficulty
  const progress = article.completed_on ? 100 : Math.round(100 * (paragraph + 1) / article.paragraphs.length)

  return (
    <div className="reader-shell">
      <div className="reader-bar">
        <div className="reader-progress" role="progressbar" aria-label="阅读进度" aria-valuenow={progress}><span style={{ width: progress + '%' }} /></div>
        <div className="reader-tools">
          <Button variant="text" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" /> {backLabel}</Button>
          <div className="reader-tools-right">
            <Button variant="text" className="paragraph-count" aria-label={`段落导航，当前第 ${paragraph + 1} 段，共 ${article.paragraphs.length} 段`}
              onClick={() => {
                setShowSettings(false)
                sequence.current++
                setLookup(undefined)
                lookupTrigger.current = null
                setNavigationTarget(paragraph + 1)
              }}>
              第 {paragraph + 1} / {article.paragraphs.length} 段
            </Button>
            <select className="reading-mode" aria-label="阅读模式" value={bilingual ? 'bilingual' : 'english'}
              onChange={event => changeReadingMode(event.target.value === 'bilingual')}>
              <option value="english">纯英文</option>
              <option value="bilingual">中英双语</option>
            </select>
            <IconButton className={showSettings ? 'selected' : ''} aria-label="阅读设置" title="阅读设置" aria-expanded={showSettings} aria-controls={showSettings ? 'reader-settings' : undefined} onClick={event => toggleSettings(event.currentTarget)}><Settings2 size={19} /></IconButton>
          </div>
          {showSettings && (
            <section className="reader-popover settings-popover" id="reader-settings" aria-label="阅读设置" ref={settingsPanel} tabIndex={-1}>
              <div className="popover-heading"><h2>阅读设置</h2><IconButton aria-label="关闭设置" onClick={closeSettings}><X size={17} /></IconButton></div>
              {([
                ['size', '字号', 16, 32, 1, settings.size + ' px'],
                ['line', '行距', 1.3, 2.5, 0.04, settings.line.toFixed(2)],
                ['width', '段宽', 420, 760, 20, settings.width + ' px'],
              ] as const).map(([key, label, min, max, step, value]) => (
                <label className="range-setting" key={key}>{label} <span>{value}</span>
                  <input type="range" aria-label={label} min={min} max={max} step={step} value={settings[key]} onChange={event => changeSettings({ ...settings, [key]: Number(event.target.value) })} />
                </label>
              ))}
              <Button variant="text" onClick={() => changeSettings(defaultSettings)}>恢复默认</Button>
            </section>
          )}
        </div>
      </div>
      <article className="reading-paper" style={{ maxWidth: settings.width + 96 }}>
        <div className="reading-heading">
          <div className="article-category">{article.category}</div>
          <h1 lang="en" ref={heading} data-title tabIndex={0} aria-describedby="reading-keys"
            onPointerUp={readSelection} onKeyDown={event => onParagraphKeyDown(event, -1)}>{renderWords(article.title, -1)}</h1>
          {bilingual && article.subtitle && <p className="reading-subtitle" lang="zh-CN">{article.subtitle}</p>}
          <div className="reading-meta">
            {article.author && <span>{article.source === '项目原创样文' && article.author === '页间示例编辑部' ? '拾页示例编辑部' : article.author}</span>}
            {article.source && <span>{article.source}</span>}
            {article.source_url && <a className="source-link" href={article.source_url} target="_blank" rel="noreferrer">查看媒体原文 ↗</a>}
            <span>{difficulty.word_count} 词</span>
            <span>约 {readingMinutes(difficulty.word_count)} 分钟</span>
          </div>
          {article.source_url && <p className="material-note">学习导读由拾页编写。难度标记依据本站导读正文。</p>}
          <details className="difficulty">
            <summary>文章难度参考 · <DifficultyLabel exam={difficulty.exam} stars={difficulty.stars} /></summary>
            <dl className="difficulty-details">
              <div><dt>评分依据</dt><dd>词频与句长</dd></div><div><dt>平均句长</dt><dd>{difficulty.average_sentence} 词</dd></div>
              <div><dt>长句比例</dt><dd>{difficulty.long_ratio}%</dd></div>
              <div><dt>低频词占比</dt><dd>{difficulty.rare_ratio}%</dd></div>
              <div><dt>词频覆盖率</dt><dd>{difficulty.coverage}%</dd></div>
            </dl>
            {difficulty.rare_words.length > 0 && <p className="rare-words">低频词 <span lang="en">{difficulty.rare_words.join(' · ')}</span></p>}
            {difficulty.personal_ratio < difficulty.rare_ratio && <p>个人难度 · {difficulty.personal_exam}（未掌握低频词占 {difficulty.personal_ratio}%）</p>}
          </details>
        </div>
        <p className="reading-hint" id="reading-keys">下划线标出固定搭配首次出现的位置。点击或划选查释义。键盘用左右键选词，按住 Shift 扩选，再按 Enter。</p>
        {bilingual && <div className="translation-tools">
          {!article.translation?.length && <p>这篇文章还没有中文译文。</p>}
          <Button variant="text" onClick={() => {
            setTranslationError('')
            setTranslationDraft(article.translation?.join('\n\n') ?? '')
          }}>{article.translation?.length ? '编辑中文译文' : '添加中文译文'}</Button>
        </div>}
        <div className="reading-body" ref={body} lang="en" style={{ fontSize: settings.size, lineHeight: settings.line }} onPointerUp={readSelection}>
          {article.paragraphs.map((text, index) => <div key={index} className="reading-block">
            <p data-paragraph={index} tabIndex={0} aria-describedby={index === 0 ? 'reading-keys' : undefined}
              onKeyDown={event => onParagraphKeyDown(event, index)}>{renderWords(text, index)}</p>
            {bilingual && article.translation?.[index] && <p className="reading-translation" lang="zh-CN">{article.translation[index]}</p>}
          </div>)}
        </div>
        <div className="reading-end">
          <Button variant="primary" disabled={completing || !!article.completed_on} onClick={() => void complete()}>
            {article.completed_on && <Check size={16} aria-hidden="true" />} {article.completed_on ? '已完成阅读' : '完成阅读'}
          </Button>
        </div>
      </article>
      {lookup && (
        <section className="reader-popover lookup-card" ref={lookupPanel} tabIndex={-1} aria-label={isPhrase ? '短语释义' : '划词释义'}>
          <div className="popover-heading"><h2>{isPhrase ? '短语释义' : '划词释义'}</h2><IconButton aria-label="关闭释义" onClick={closeLookup}><X size={17} /></IconButton></div>
          <div className="lookup-term" lang="en">{lookup.entry?.word ?? lookup.selection.surface}</div>
          <div className="lookup-meta">
            {lookup.entry?.word && lookup.entry.word !== lookup.selection.surface.toLowerCase() && <span lang="en">{lookup.selection.surface}</span>}
            {lookup.entry?.phonetic && <span>/{lookup.entry.phonetic}/</span>}
            {lookup.entry?.pos && <span lang="en">{lookup.entry.pos}</span>}
          </div>
          {suggestedPhrase && <Button variant="text" className="lookup-phrase-link" onClick={() => {
            void selectWord(suggestedPhrase.surface, suggestedPhrase.start, lookup.selection.paragraph, lookupTrigger.current ?? undefined)
          }}>查短语 <span lang="en">{suggestedPhrase.surface}</span></Button>}
          {lookup.error ? <p className="form-error" role="alert">{lookup.error}</p> : lookup.entry === undefined ? <p role="status">正在查词…</p> : (
            <>
              {lookup.entry ? <>
                {lookup.entry.exams?.length > 0 && <p className="lookup-exams">词表收录 · {lookup.entry.exams.join(' / ')}</p>}
                {senses.length ? <fieldset className="lookup-choices">
                  <legend className="sr-only">选择要收藏的义项</legend>
                  <Button variant="text" disabled={busy || !availableMeanings.length}
                    onClick={() => setSelectedMeanings(allSelected ? [] : availableMeanings)}>{allSelected ? '取消全选' : '全选义项'}</Button>
                  <ul className="lookup-senses">
                    {senses.map(({ pos, meaning }, index) => {
                      const isSaved = savedMeanings.includes(meaning)
                      return <li key={index}><label>
                        <input type="checkbox" checked={isSaved || selectedMeanings.includes(meaning)} disabled={busy || isSaved}
                          onChange={event => {
                            const selected = event.target.checked
                            setSelectedMeanings(previous => selected ? [...previous, meaning] : previous.filter(item => item !== meaning))
                          }} />
                        <span>{pos && <small lang="en">{pos}</small>}{meaning}{isSaved && <small className="saved-sense">已收藏</small>}</span>
                      </label></li>
                    })}
                  </ul>
                </fieldset> : <p className="definition">{lookup.entry.definition}</p>}
                {lookup.entry.english?.length > 0 && <details className="lookup-context">
                  <summary>英文释义</summary>
                  <ul className="english-definitions" lang="en">{lookup.entry.english.map((sense, index) => <li key={index}>{sense}</li>)}</ul>
                </details>}
              </> : <p className="muted">本地词典未收录这{isPhrase ? '个短语' : '个词'}。你可以填写释义后收藏。</p>}
              <details className="lookup-context" key={lookup.selection.paragraph === -1 ? "title" : "sentence"}>
                <summary>{lookup.selection.paragraph === -1 ? "查看原标题" : "查看原句"}</summary>
                <blockquote lang="en">{lookup.selection.sentence}</blockquote>
              </details>
              <label className="field">自定义义项<input maxLength={1000} value={customMeaning} disabled={busy}
                onChange={event => setCustomMeaning(event.target.value)} placeholder="可选，填写你理解的词义" /></label>
              {saveError && <p className="form-error" role="alert">{saveError}</p>}
              <div className="lookup-actions">
                <span className="saved-sense" role="status">{savedMeanings.length > 0 && <>
                  {saveFeedback > 0 && <Check key={saveFeedback} className="save-confirmation" size={15} aria-hidden="true" />}
                  已收藏 {savedMeanings.length} 项
                </>}</span>
                <Button variant="primary" disabled={!pendingMeanings.length || busy} onClick={() => void saveWords()}>
                  {busy ? '收藏中…' : pendingMeanings.length > 1 ? `收藏 ${pendingMeanings.length} 个义项` : '加入生词本'}
                </Button>
              </div>
            </>
          )}
        </section>
      )}
      {navigationTarget !== undefined && <Modal title="段落导航" close={() => setNavigationTarget(undefined)}>
        <form className="form-stack" onSubmit={event => {
          event.preventDefault()
          if (!Number.isInteger(navigationTarget) || navigationTarget < 1 || navigationTarget > article.paragraphs.length) return
          const index = navigationTarget - 1
          setNavigationTarget(undefined)
          requestAnimationFrame(() => {
            jumpTo(index)
            body.current?.querySelector<HTMLElement>(`[data-paragraph="${index}"]`)?.focus({ preventScroll: true })
          })
        }}>
          <label className="field">跳转到第几段（共 {article.paragraphs.length} 段）
            <input type="number" min={1} max={article.paragraphs.length} step={1} required autoFocus
              value={Number.isNaN(navigationTarget) ? '' : navigationTarget}
              onChange={event => setNavigationTarget(event.target.valueAsNumber)} />
          </label>
          <div className="paragraph-navigation-actions">
            <Button disabled={!Number.isInteger(navigationTarget) || navigationTarget <= 1} onClick={() => setNavigationTarget(navigationTarget - 1)}>上一段</Button>
            <Button disabled={!Number.isInteger(navigationTarget) || navigationTarget >= article.paragraphs.length} onClick={() => setNavigationTarget(navigationTarget + 1)}>下一段</Button>
          </div>
          {article.paragraphs[navigationTarget - 1] && <p className="paragraph-preview" lang="en">
            {article.paragraphs[navigationTarget - 1].slice(0, 240)}{article.paragraphs[navigationTarget - 1].length > 240 ? '…' : ''}
          </p>}
          <div className="modal-actions"><Button variant="primary" type="submit">跳转并继续阅读</Button></div>
        </form>
      </Modal>}
      {translationDraft !== undefined && <Modal title="中文译文" close={() => { if (!savingTranslation) setTranslationDraft(undefined) }}>
        <form className="form-stack" onSubmit={saveTranslation}>
          <p className="muted">原文共 {article.paragraphs.length} 段。请按顺序粘贴译文，段落之间留一空行。保存空白可清除自填译文。</p>
          <label className="field">中文译文<textarea rows={9} readOnly={savingTranslation} maxLength={100_000} value={translationDraft}
            onChange={event => setTranslationDraft(event.target.value)} /></label>
          {translationError && <p role="alert" className="form-error">{translationError}</p>}
          <div className="modal-actions">
            <Button disabled={savingTranslation} onClick={() => setTranslationDraft(undefined)}>取消</Button>
            <Button variant="primary" disabled={savingTranslation} type="submit">{savingTranslation ? '保存中…' : '保存译文'}</Button>
          </div>
        </form>
      </Modal>}
    </div>
  )
}
