import { useState } from 'react'
import type { Article } from './api'
import amsterdamTreeShade from './assets/amsterdam-tree-shade.webp'
import surreyLibrary from './assets/surrey-library.webp'

const sections = {
  '城市与环境': { label: 'City', tone: 'green' },
  '经济观察': { label: 'Economy', tone: 'warm' },
  '文化与生活': { label: 'Culture', tone: 'coral' },
  '政治与国际': { label: 'World', tone: 'blue' },
  '健康与医疗': { label: 'Health', tone: 'green' },
  '科学与技术': { label: 'Science', tone: 'blue' },
  '自然与环境': { label: 'Nature', tone: 'green' },
  '法律与社会': { label: 'Society', tone: 'blue' },
} as const

export function articleSection(category: string) {
  return Object.hasOwn(sections, category)
    ? sections[category as keyof typeof sections]
    : { label: 'Folio', tone: 'neutral' } as const
}

export type CoverImage = {
  src: string
  credit: string
  width: number
  height: number
  position?: string
}

const sampleCovers: ReadonlyMap<string, CoverImage> = new Map([
  ['The quiet value of urban shade', {
    src: amsterdamTreeShade, credit: 'Fons Heijnsbroek', width: 763, height: 439, position: '54% 35%',
  }],
  ['A library is more than its books', {
    src: surreyLibrary, credit: 'Canmenwalker', width: 432, height: 324, position: '42% 50%',
  }],
])

export function articleCoverImage(article: Article) {
  if (article.material === '原创样文') return sampleCovers.get(article.title)
}

export function ArticleCover({ category, label, image }: { category: string; label?: string; image?: CoverImage }) {
  const section = articleSection(category)
  const [imageState, setImageState] = useState<{ src: string; loaded: boolean }>()
  const state = imageState?.src === image?.src ? imageState : undefined

  return <span className="article-cover" data-tone={section.tone} aria-hidden="true">
    <span className="cover-type" lang="en">{label ?? section.label}</span>
    {image && state?.loaded !== false && <img key={image.src} className="cover-image" data-loaded={state?.loaded || undefined}
      src={image.src} alt="" width={image.width} height={image.height} style={{ objectPosition: image.position }}
      loading="lazy" decoding="async"
      onLoad={() => setImageState({ src: image.src, loaded: true })}
      onError={() => setImageState({ src: image.src, loaded: false })} />}
  </span>
}
