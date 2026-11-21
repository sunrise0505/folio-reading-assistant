import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Check, Settings2 } from 'lucide-react'
import { api, errorText } from './api'
import type { ReviewRating, ReviewResult, Vocabulary } from './api'
import { ArticleCover } from './ArticleCover'
import { Button, Empty, Modal, PageHeading } from './ui'

const defaultGroupSize = 10
const groupSizeKey = 'folio-review-group-size'
const ratings = [
  { value: 'known', label: '认识' },
  { value: 'fuzzy', label: '模糊' },
  { value: 'forgot', label: '忘记' },
] as const

function loadGroupSize() {
  const size = Number(localStorage.getItem(groupSizeKey))
  return Number.isInteger(size) && size >= 1 && size <= 50 ? size : defaultGroupSize
}

type Recall = {
  round: number
  remaining: Vocabulary[]
  retry: Vocabulary[]
  rating?: ReviewRating
}

type Group = {
  words: Vocabulary[]
  recall: Recall
  spelling: ReviewResult[]
}

type ReviewMode = 'classic' | 'flashcards'
type FlashEntry = { word: Vocabulary; needsRetry: boolean }
type FlashGroup = {
  total: number
  remaining: FlashEntry[]
  retry: FlashEntry[]
  selected?: number
  rating?: ReviewRating
}

function ReviewMeaning({ word }: { word: Vocabulary }) {
  return <p className="review-meaning">
    <span className="review-pos">{word.parts_of_speech?.join(' / ') || '词性未标注'}</span>
    {word.meaning}
  </p>
}

type RecallActions = {
  rating?: ReviewRating
  onRate: (rating: ReviewRating) => void
  onResolve: (remembered: boolean) => void
}

function RecallControls({ word, rating, busy, className, onRate, onResolve }: RecallActions & {
  word: Vocabulary
  busy?: boolean
  className: string
}) {
  const definition = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (rating) definition.current?.focus()
  }, [word.id, rating])

  if (!rating) return <div className={className} role="group" aria-label="复习自评">
    {ratings.map(({ value, label }) => <Button key={value} className="review-choice" data-rating={value}
      disabled={busy} onClick={() => onRate(value)}>{label}</Button>)}
  </div>

  const known = rating === 'known'
  return <>
    <div className="recall-meaning" data-rating={rating} ref={definition} tabIndex={-1}>
      <p className="review-label">释义</p><ReviewMeaning word={word} />
    </div>
    <div className={className} role="group" aria-label="释义确认">
      <Button variant="primary" disabled={busy} onClick={() => onResolve(known)}>继续</Button>
      {known ? <Button disabled={busy} onClick={() => onResolve(false)}>记错了</Button> :
        <span className="muted">这个词会在下一小轮再出现。</span>}
    </div>
  </>
}

function RecallCard({ word, rating, onRate, onResolve }: RecallActions & { word: Vocabulary }) {
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!rating) heading.current?.focus()
  }, [word.id, rating])

  return <article className="review-sheet">
    <h2 className="recall-word" ref={heading} tabIndex={-1} lang="en">{word.lemma}</h2>
    <RecallControls word={word} rating={rating} className="review-ratings" onRate={onRate} onResolve={onResolve} />
  </article>
}

function SpellingCard({ word, onResult, onSaved, onSaving, onOpen }: {
  word: Vocabulary
  onResult: (result: ReviewResult) => void
  onSaved: (result: ReviewResult) => void
  onSaving: (saving: boolean) => void
  onOpen: (id: number, paragraph?: number) => void
}) {
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<ReviewResult>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const field = useRef<HTMLInputElement>(null)
  const feedback = useRef<HTMLDivElement>(null)
  const example = word.examples[0]
  const expected = example?.surface ?? word.lemma
  const answerLabel = /\s/.test(expected) ? '填入原短语' : '填入原词'
  const characters = Array.from(example?.sentence ?? '')
  const offset = example?.start ?? 0
  const prefix = characters.slice(0, offset).join('')
  const suffix = characters.slice(offset + expected.length).join('')

  useEffect(() => {
    if (result) feedback.current?.focus()
    else field.current?.focus()
  }, [result])

  async function check(value: string) {
    if (busy || result) return
    setBusy(true)
    onSaving(true)
    setError('')
    try {
      const saved = await api<ReviewResult>('/review/' + word.id, 'POST', {
        rating: 'known', answer: value, due: word.due, streak: word.streak,
      })
      setResult(saved)
      onSaved(saved)
    } catch (failure) {
      setError(errorText(failure))
    } finally {
      setBusy(false)
      onSaving(false)
    }
  }

  return <article className="review-sheet">
    <h2 className="review-label">{example?.paragraph === -1 ? '标题填空' : '原句填空'}</h2>
    <p className="cloze" lang={example ? 'en' : undefined}>{example ?
      <>{prefix}<mark>{result ? expected : '_____'}</mark>{suffix}</> : '根据释义写出单词。'}</p>
    <ReviewMeaning word={word} />
    {result ? <div className="spelling-feedback" ref={feedback} tabIndex={-1}>
      <p className="answer-line" role="status">
        {result.correct ? <span className="spelling-correct"><Check size={17} className="spelling-check" aria-hidden="true" />拼写正确。</span> :
          <>正确答案为 <strong lang="en">{expected}</strong>。</>}
        下次复习 <time dateTime={result.due}>{result.due}</time>。
      </p>
      {example && <Button variant="text" onClick={() => onOpen(example.article_id, example.paragraph)}>
        查看原文 <ArrowUpRight size={14} aria-hidden="true" />
      </Button>}
      <div className="review-actions"><Button variant="primary" onClick={() => onResult(result)}>继续</Button></div>
    </div> : <form className="review-actions" onSubmit={event => { event.preventDefault(); if (answer.trim()) void check(answer) }}>
      <input className="answer-input" ref={field} aria-label={answerLabel} placeholder={answerLabel} autoComplete="off" spellCheck={false}
        autoCapitalize="none" maxLength={180} readOnly={busy} value={answer} onChange={event => setAnswer(event.target.value)} />
      <Button variant="primary" type="submit" disabled={busy || !answer.trim()}>检查答案</Button>
      <Button variant="text" disabled={busy} onClick={() => void check('')}>跳过</Button>
    </form>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </article>
}

function Flashcards({ group, cards, busy, error, onPick, onRate, onResolve, onClose, onNext, onRead }: {
  group?: FlashGroup
  cards: FlashEntry[]
  busy: boolean
  error: string
  onPick: (id: number) => void
  onRate: (rating: ReviewRating) => void
  onResolve: (remembered: boolean) => void
  onClose: () => void
  onNext?: () => void
  onRead: () => void
}) {
  const first = useRef<HTMLButtonElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const summary = useRef<HTMLDivElement>(null)
  const total = group?.total ?? cards.length
  const completed = total - cards.length - (group?.retry.length ?? 0)
  const current = cards.find(({ word }) => word.id === group?.selected)?.word
  const rating = group?.rating

  useEffect(() => {
    if (current) {
      if (!rating) heading.current?.focus()
    } else if (group) {
      if (cards.length) first.current?.focus()
      else summary.current?.focus()
    }
  }, [current, rating, group, cards.length])

  if (!total) return <ReviewEmpty onRead={onRead} />
  return <section className="flash-review" aria-label="翻卡练习">
    <div className="flash-toolbar">
      <p role="status">已完成 {completed} / {total} 张</p>
      {current && <Button variant="text" onClick={onClose} disabled={busy}>返回卡片堆</Button>}
    </div>
    <progress className="review-progress" aria-label="翻卡进度" value={completed} max={total} />
    {cards.length ? <div className={current ? 'flash-stage card-open' : 'flash-stage'} onKeyDown={event => {
      if (current && !busy && event.key === 'Escape') onClose()
    }}>
      <div className="flash-desk" inert={!!current} aria-hidden={current ? true : undefined}>
        <p>选一张卡，先回想词义。模糊或忘记的词会在下一小轮再出现。</p>
        <div className="flash-deck">
          {cards.map(({ word }, index) => <button className="flash-back" type="button" key={word.id} ref={index === 0 ? first : undefined}
            aria-label={`翻开第 ${index + 1} 张卡片`} onClick={() => onPick(word.id)}>
            <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          </button>)}
        </div>
      </div>
      {current && <article className="flash-face">
        <h2 ref={heading} tabIndex={-1} lang="en">{current.lemma}</h2>
        <RecallControls word={current} rating={rating} busy={busy} className="flash-ratings" onRate={onRate} onResolve={onResolve} />
        {error && <p className="form-error" role="alert">{error}</p>}
      </article>}
    </div> : <div ref={summary} tabIndex={-1}>
      <Empty title={`本组已完成，共 ${total} 张卡片`}>
        <p>下次复习时间已更新。</p>
        {onNext ? <Button variant="primary" onClick={onNext}>开始下一组</Button> : <Button onClick={onRead}>去读文章</Button>}
      </Empty>
    </div>}
  </section>
}

function ReviewEmpty({ onRead }: { onRead: () => void }) {
  return <Empty title="今天没有待复习的卡片" illustration={<ArticleCover category="我的导入" label="Review" />}>
    <Button onClick={onRead}>去读文章</Button>
  </Empty>
}

export function Review({ queue, onOpen, onRead, onRated }: {
  queue: Vocabulary[]
  onOpen: (id: number, paragraph?: number) => void
  onRead: () => void
  onRated: (word: Pick<Vocabulary, 'id'>) => void
}) {
  const [groupSize, setGroupSize] = useState(loadGroupSize)
  const [settings, setSettings] = useState(false)
  const [draftSize, setDraftSize] = useState(groupSize)
  const [group, setGroup] = useState<Group>()
  const [mode, setMode] = useState<ReviewMode>('classic')
  const [switchTo, setSwitchTo] = useState<ReviewMode>()
  const [flash, setFlash] = useState<FlashGroup>()
  const [saving, setSaving] = useState(false)
  const [flashError, setFlashError] = useState('')
  const flashCards = flash?.remaining ?? queue.slice(0, groupSize).map(word => ({ word, needsRetry: false }))
  const words = group?.words ?? queue.slice(0, groupSize)
  const recall = group?.recall ?? { round: 1, remaining: words, retry: [] }
  const recallWord = recall.remaining[0]
  const spelled = group?.spelling ?? []
  const spellingWord = words[spelled.length]
  const ready = !!words.length && !recallWord
  const finished = ready && !spellingWord
  const recognized = words.length - recall.remaining.length - recall.retry.length
  const correct = spelled.filter(result => result.correct).length
  const summary = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (mode === 'classic' && finished) summary.current?.focus()
  }, [mode, finished])

  function selectMode(next: ReviewMode) {
    if (next === mode) return
    if ((mode === 'classic' && group && !finished) || (mode === 'flashcards' && flash?.remaining.length)) {
      setSwitchTo(next)
      return
    }
    changeMode(next)
  }

  function changeMode(next: ReviewMode) {
    setGroup(undefined)
    setFlash(undefined)
    setFlashError('')
    setSwitchTo(undefined)
    setMode(next)
  }

  function pickFlash(id: number) {
    setFlash({
      ...(flash ?? { total: flashCards.length, remaining: flashCards, retry: [] }),
      selected: id, rating: undefined,
    })
  }

  async function advanceFlash(remembered: boolean) {
    if (!flash?.rating || saving) return
    const entry = flash.remaining.find(({ word }) => word.id === flash.selected)
    if (!entry) return
    const { word } = entry
    const remaining = flash.remaining.filter(card => card.word.id !== word.id)
    const retry = remembered ? flash.retry : [...flash.retry, { ...entry, needsRetry: true }]
    const repeat = !remaining.length && retry.length > 0
    const next = { total: flash.total, remaining: repeat ? retry : remaining, retry: repeat ? [] : retry }
    if (!remembered) {
      setFlash(next)
      return
    }
    setSaving(true)
    setFlashError('')
    try {
      await api('/review/' + word.id, 'POST', { remembered: !entry.needsRetry, due: word.due, streak: word.streak })
      setFlash(next)
      onRated(word)
    } catch (failure) {
      setFlashError(errorText(failure))
    } finally {
      setSaving(false)
    }
  }

  function rate(rating: ReviewRating) {
    setGroup({ words, recall: { ...recall, rating }, spelling: spelled })
  }

  function advanceRecall(remembered: boolean) {
    if (!group || !recall.rating || !recallWord) return
    const remaining = recall.remaining.slice(1)
    const retry = remembered ? recall.retry : [...recall.retry, recallWord]
    const repeat = !remaining.length && retry.length > 0
    setGroup({
      ...group,
      recall: repeat ? { round: recall.round + 1, remaining: retry, retry: [] } :
        { round: recall.round, remaining, retry },
    })
  }

  return <div className="page-content inner-page">
    <PageHeading label="Review" title="词汇复习">
      <Button onClick={() => { setDraftSize(groupSize); setSettings(true) }}><Settings2 size={16} aria-hidden="true" />复习设置</Button>
    </PageHeading>
    <div className="review-modes filter-row" role="group" aria-label="复习模式">
      <button type="button" aria-pressed={mode === 'classic'} disabled={saving} onClick={() => selectMode('classic')}>经典模式</button>
      <button type="button" aria-pressed={mode === 'flashcards'} disabled={saving} onClick={() => selectMode('flashcards')}>翻卡模式</button>
    </div>
    <div className="review-overview">
      <p>今日待复习 {queue.length} 词 · 每组 {groupSize} 词</p>
      {mode === 'classic' && words.length > 0 && <p>本组 {words.length} 词</p>}
    </div>
    {mode === 'flashcards' ? <Flashcards group={flash} cards={flashCards} busy={saving} error={flashError}
      onPick={pickFlash} onRate={rating => setFlash(current => current && { ...current, rating })}
      onClose={() => { setFlashError(''); setFlash(current => current && { ...current, selected: undefined, rating: undefined }) }}
      onResolve={remembered => void advanceFlash(remembered)} onNext={queue.length ? () => setFlash(undefined) : undefined} onRead={onRead} /> : <>
    {words.length > 0 && <>
      <div className="review-stage">
        <span aria-current={!ready ? 'step' : undefined}>1. 认词</span>
        <span aria-current={ready ? 'step' : undefined}>2. 原句拼写</span>
        <span className="review-stage-progress">
          {ready ? `已拼写 ${spelled.length} / ${words.length}` : `第 ${recall.round} 小轮 · 已认识 ${recognized} / ${words.length}`}
        </span>
      </div>
      <progress className="review-progress" aria-label={ready ? '拼写进度' : '认词进度'}
        value={ready ? spelled.length : recognized} max={words.length} />
    </>}
    {recallWord ? <RecallCard word={recallWord} rating={recall.rating} onRate={rate} onResolve={advanceRecall} /> :
      ready && spellingWord ? <SpellingCard key={spellingWord.id} word={spellingWord} onOpen={onOpen} onSaved={onRated} onSaving={setSaving}
        onResult={result => setGroup(current => current && { ...current, spelling: [...current.spelling, result] })} /> :
      finished ? <div ref={summary} tabIndex={-1}>
        <Empty title={`本组已完成，共 ${words.length} 词`}>
          <p>拼写正确 {correct} 词 · 明天重练 {spelled.length - correct} 词</p>
          {queue.length ? <Button variant="primary" onClick={() => setGroup(undefined)}>开始下一组</Button> :
            <Button onClick={onRead}>去读文章</Button>}
        </Empty>
      </div> : <ReviewEmpty onRead={onRead} />}
    </>}
    {switchTo && <Modal title="切换复习模式？" close={() => setSwitchTo(undefined)}>
      <p className="muted">切换后会结束当前练习，已经保存的复习记录会保留。</p>
      <div className="modal-actions">
        <Button onClick={() => setSwitchTo(undefined)}>继续本组</Button>
        <Button variant="primary" onClick={() => changeMode(switchTo)}>切换模式</Button>
      </div>
    </Modal>}
    {settings && <Modal title="复习设置" close={() => setSettings(false)}>
      <form className="form-stack" onSubmit={event => {
        event.preventDefault()
        localStorage.setItem(groupSizeKey, String(draftSize))
        setGroupSize(draftSize)
        setSettings(false)
      }}>
        <label className="field">每组词数<input type="number" min={1} max={50} step={1} required
          value={Number.isNaN(draftSize) ? '' : draftSize} onChange={event => setDraftSize(event.target.valueAsNumber)} /></label>
        <p className="muted">默认 10 词，可设为 1–50 词。正在复习的组完成后应用新设置。</p>
        <div className="modal-actions"><Button variant="primary" type="submit">保存设置</Button></div>
      </form>
    </Modal>}
  </div>
}
