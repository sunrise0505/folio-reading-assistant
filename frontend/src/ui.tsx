import { useEffect, useRef } from 'react'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { Search, Star, X } from 'lucide-react'
import type { Difficulty } from './api'

type ButtonProps = ComponentPropsWithoutRef<'button'>

export function Button({ variant = 'secondary', className = '', type = 'button', ...props }: ButtonProps & {
  variant?: 'primary' | 'secondary' | 'danger' | 'text'
}) {
  return <button {...props} type={type} className={variant + '-button ' + className} />
}

export function IconButton({ className = '', type = 'button', ...props }: ButtonProps) {
  return <button {...props} type={type} className={'icon-button ' + className} />
}

export function PageHeading({ label, title, mark, children }: { label: string; title: string; mark?: ReactNode; children?: ReactNode }) {
  return <div className="page-heading">
    <div><p className="section-label" lang="en">{label}</p><h1>{title}{mark}</h1></div>
    {children}
  </div>
}

export function DifficultyLabel({ exam, stars }: Pick<Difficulty, 'exam' | 'stars'>) {
  return <span className="difficulty-rating" title="按词频与句长估算">
    {exam}
    <span className="difficulty-stars" role="img" aria-label={`难度 ${stars} 星，共 5 星`}>
      {[1, 2, 3, 4, 5].map(star => <Star key={star} size={12} aria-hidden="true" className={star <= stars ? 'filled' : undefined} />)}
    </span>
  </span>
}

export function Tag({ tone, children }: { tone: 'green' | 'warm' | 'coral' | 'blue' | 'neutral'; children: ReactNode }) {
  return <span className="tag" data-tone={tone}>{children}</span>
}

export function SearchField({ label, ...props }: ComponentPropsWithoutRef<'input'> & { label: string }) {
  return <label className="search-field"><Search size={16} aria-hidden="true" /><input type="search" aria-label={label} {...props} /></label>
}

export function Empty({ title, children, illustration }: { title: string; children?: ReactNode; illustration?: ReactNode }) {
  return <div className={illustration ? 'empty empty-with-art' : 'empty'}>
    <div className="empty-copy"><h2>{title}</h2>{children}</div>
    {illustration}
  </div>
}

export function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const node = dialog.current
    const trigger = document.activeElement
    node?.showModal()
    return () => {
      node?.close()
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [])
  return <dialog ref={dialog} className="modal" onCancel={event => { event.preventDefault(); close() }} aria-label={title}>
    <div className="modal-heading">
      <h2>{title}</h2>
      <IconButton aria-label="关闭" onClick={close}><X size={19} /></IconButton>
    </div>
    {children}
  </dialog>
}

export function readingMinutes(words: number) {
  return Math.max(1, Math.ceil(words / 200))
}
