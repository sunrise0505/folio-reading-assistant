import { useState } from 'react'

const sections = {
  '城市与环境': { motif: 'city', tone: 'green' },
  '经济观察': { motif: 'economy', tone: 'warm' },
  '文化与生活': { motif: 'culture', tone: 'warm' },
  '政治与国际': { motif: 'politics', tone: 'coral' },
  '健康与医疗': { motif: 'health', tone: 'green' },
  '科学与技术': { motif: 'science', tone: 'blue' },
  '自然与环境': { motif: 'nature', tone: 'green' },
  '法律与社会': { motif: 'law', tone: 'blue' },
} as const

export function articleSection(category: string) {
  return Object.hasOwn(sections, category)
    ? sections[category as keyof typeof sections]
    : { motif: 'archive', tone: 'neutral' } as const
}

function coverVariant(title: string, articleId = 0) {
  let hash = articleId
  for (const character of title.normalize('NFC')) {
    hash = (Math.imul(hash, 31) + character.codePointAt(0)!) >>> 0
  }
  return hash % 3
}

type ArtworkProps = { title: string; variant: number }

function City({ variant }: ArtworkProps) {
  if (variant === 2) return <>
    <circle className="art-spot" cx="118" cy="49" r="30" />
    <path className="art-mid" d="M0 119 22 105 42 105 68 89 104 90 133 76 160 84v76H0Z" />
    <path className="art-ink" d="M19 107 25 57 20 43 29 39 33 51 46 38 50 44 37 61 38 109Z" />
    <path className="art-ink" d="m0 28 10-12 15 2 15-8 16 8 5 11 10 6-2 16-13 8-14-5-14 6-10-6L0 54Z" />
    <path className="art-light" d="m0 143 44-15 31-4 31 3 54-17v16l-54 17-34-4-65 21H0Z" />
    <path className="art-ink" d="M55 91h52v7H55zm-4 12h61v6H51zm10 6h5v13h-5zm38 0h5v13h-5z" />
    <path className="art-line-light" d="m16 40 12 5 13-13m86 66 8-3m4-1 9-4" />
  </>
  const canopy = 'M82 26 97 29 104 36 117 34 129 41 134 53 143 60 140 76 130 85 114 88 101 83 91 92 73 92 64 84 49 84 38 76 38 64 47 53 48 43 60 34 71 34Z'
  return <>
    <circle className="art-spot" cx={variant === 1 ? 103 : 64} cy="52" r="45" />
    <path className="art-mid" d="M0 106 18 102 18 95 40 94 40 111 59 110 59 84 81 84 81 115 104 113 104 99 137 98 137 107 160 105 160 160 0 160Z" />
    <path className="art-light" d="M0 86 27 75 54 85 54 136 0 141ZM116 102l27-10 17 3v41l-44 2Z" />
    <path className="art-line" d="M8 94h27m-27 9h26m-26 9h26m-26 9h26m91-10h27m-27 8h27" />
    <g transform={variant === 1 ? 'translate(153 0) scale(-1 1)' : undefined}>
      <path className="art-spot" transform="translate(4 3)" d={canopy} />
      <path className="art-ink" d={canopy} />
      <path className="art-ink" d="m82 127 5-58 8-15-3 39 4 32-9 7Z" />
      <path className="art-line-light" d="m91 85-1-28m1 21 16-17M89 73 75 57m37 20 7-5m-59-9 5 4" />
    </g>
    <path className="art-ink" d="m0 137 33-4 41-7 24 4 31-2 31 2v30H0Z" />
    <path className="art-line-light" d="M17 146q28-9 56-9m26 7 23-3m10 1 12-2" />
  </>
}

function Economy({ variant }: ArtworkProps) {
  return <>
    <path className="art-spot" d="M0 113 160 41v119H0Z" />
    <path className="art-light" d="m15 26 129-9 3 120-129 6Z" />
    <path className="art-grid" d="M24 40h112M24 60h112M24 80h112M24 100h112M24 120h112M41 28v103m25-103v103m25-103v103m25-103v103" />
    <path className="art-ink" d="M25 99h18v30H25zm52-20h18v50H77z" />
    <path className="art-spot" d="M51 88h18v41H51zm52-33h18v74h-18z" />
    <path className="art-mid" d="M129 41h15v88h-15z" />
    <path className="art-line" d={variant === 0 ? 'M22 84c25-9 27-25 49-24s25 5 45-24l17-8' : 'M22 89 46 74l21 3 22-22 22-1 22-22'} />
    <circle className="art-ink" cx="133" cy={variant === 0 ? 28 : 32} r="3.5" />
    <path className="art-line" d="M21 130h123" />
  </>
}

function Culture({ variant }: ArtworkProps) {
  return <>
    <circle className="art-light" cx="119" cy="37" r="25" />
    <path className="art-spot" d="M0 106 160 54v106H0Z" />
    <g transform={variant === 1 ? 'rotate(12 80 80)' : 'rotate(-12 80 80)'}>
      <path className="art-ink" d="M25 30h54v102H25q-4 0-4-5V35q0-5 4-5Z" />
      <path className="art-line-light" d="M32 31v100m8-74h30m-30 7h22m-22 49h22" />
      <path className="art-light" d="M67 45q17-8 35 0 18-8 36 0v78q-18-8-36 0-18-8-35 0Z" />
      <path className="art-line" d="M102 46v76" />
      <path className="art-grid" d="M76 62h19m-19 8h19m-19 8h19m-19 8h15m18-24h20m-20 8h20m-20 8h20m-20 8h17" />
    </g>
    <circle className="art-mid" cx="119" cy="119" r="20" />
    <circle className="art-line-light" cx="119" cy="119" r="11" />
  </>
}

function Politics() {
  return <>
    <circle className="art-light" cx="111" cy="46" r="33" />
    <path className="art-mid" d="M0 101 160 65v95H0Z" />
    <path className="art-spot" d="M25 82h110l13 16v43H12V98Z" />
    <path className="art-ink" d="M12 99h136v42H12z" />
    <path className="art-line-light" d="M45 112h70m-58 9h46M47 90h62" />
    <g transform="rotate(-13 76 65)">
      <path className="art-light" d="M50 31h54v57H50Z" />
      <path className="art-line" d="m62 52 7 8 15-17M62 70h29m-29 8h20" />
    </g>
  </>
}

function Health() {
  return <>
    <path className="art-mid" d="M0 122c40-64 99-10 160-95v133H0Z" />
    <circle className="art-light" cx="92" cy="74" r="53" />
    <circle className="art-spot" cx="107" cy="84" r="40" />
    <path className="art-line-light" d="M80 86h14l6-11 8 24 8-31 7 18h12" />
    <g transform="rotate(-36 53 109)">
      <rect className="art-ink" x="19" y="94" width="68" height="30" rx="15" />
      <path className="art-light" d="M53 94h19a15 15 0 0 1 0 30H53Z" />
      <path className="art-line-light" d="M28 105a10 10 0 0 1 9-6" />
    </g>
  </>
}

function Science({ variant }: ArtworkProps) {
  return <>
    <path className="art-ink" d={variant === 1 ? 'M0 0h88l72 70v90H0Z' : 'M46 0h114v160H0V80Z'} />
    <circle className="art-spot" cx="81" cy="81" r="36" />
    <g transform="translate(81 81)">
      <ellipse className="art-line-light" rx="66" ry="21" transform="rotate(-31)" />
      <ellipse className="art-line-light" rx="66" ry="21" transform="rotate(37)" />
      <ellipse className="art-line-light" rx="61" ry="24" transform="rotate(92)" />
      <circle className="art-light" r="9" />
    </g>
    <circle className="art-spot" cx="133" cy="45" r="6" />
    <circle className="art-light" cx="30" cy="40" r="5" />
    <path className="art-line-light" d="M119 124h21m-10.5-10.5v21M17 80h10m-5-5v10" />
  </>
}

function Nature({ variant }: ArtworkProps) {
  return <>
    <circle className="art-light" cx={variant === 0 ? 111 : 56} cy="40" r="25" />
    <path className="art-mid" d="M0 87 38 57l37 27 41-34 44 38v72H0Z" />
    <path className="art-spot" d="M0 101q42-33 82 0t78-5v64H0Z" />
    <path className="art-ink" d="M0 138q44-34 83-11t77-10v43H0Z" />
    <path className="art-light" d="M81 122c-8-32-16-49-44-56-4 21 10 39 39 41-3-33 11-56 43-64 1 25-12 45-41 60Z" />
    <path className="art-line" d="M83 131Q69 92 46 74m32 33 31-54" />
    <path className="art-line-light" d="M13 144q29-14 49-13m47 12q16 3 37-10" />
  </>
}

function Law() {
  return <>
    <circle className="art-light" cx="79" cy="70" r="53" />
    <path className="art-spot" d="M0 129h160v31H0zM18 116h124v13H18z" />
    <path className="art-ink" d="M76 39h8v78h-8zM42 48h76v6H42zM54 110h52v8H54z" />
    <circle className="art-ink" cx="80" cy="36" r="7" />
    <path className="art-line" d="m46 53-20 36h40L46 53Zm68 0L94 89h40l-20-36Z" />
    <path className="art-mid" d="M26 89h40a20 10 0 0 1-40 0Zm68 0h40a20 10 0 0 1-40 0Z" />
    <path className="art-line-light" d="M10 145h140" />
  </>
}

function Archive({ title, variant }: ArtworkProps) {
  const words = title.replace(/^(?:the|a|an)\s+/i, '').match(/[\p{L}\p{N}]+/gu) ?? []
  const initials = words.slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase()
  return <>
    <circle className="art-light" cx="124" cy="39" r="30" />
    <path className="art-spot" d="M0 108 160 64v96H0Z" />
    <g transform={variant === 1 ? 'rotate(11 80 80)' : 'rotate(-11 80 80)'}>
      <path className="art-mid" d="M20 53h107v73H20z" />
      <path className="art-light" d="M31 34h107v73H31z" />
      <path className="art-grid" d="M42 45h85v51H42z" />
      <text className="cover-initials" x="85" y="82" textAnchor="middle">{initials}</text>
    </g>
  </>
}

const artwork = { city: City, economy: Economy, culture: Culture, politics: Politics, health: Health, science: Science, nature: Nature, law: Law, archive: Archive }

export type CoverImage = { src: string; credit: string }

export function ArticleCover({ category, title, articleId, image }: { category: string; title: string; articleId?: number; image?: CoverImage }) {
  const { motif } = articleSection(category)
  const variant = coverVariant(title, articleId)
  const Artwork = artwork[motif]
  const [imageState, setImageState] = useState<{ src: string; loaded: boolean }>()
  const state = imageState?.src === image?.src ? imageState : undefined

  return <span className={`article-cover article-cover--${motif}`} data-variant={variant} aria-hidden="true">
    <svg className="cover-art" viewBox="0 0 160 160" preserveAspectRatio="xMidYMid slice" focusable="false">
      <Artwork title={title} variant={variant} />
    </svg>
    {image && state?.loaded !== false && <img key={image.src} className="cover-image" data-loaded={state?.loaded || undefined}
      src={image.src} alt="" width={160} height={160} loading="lazy" decoding="async"
      onLoad={() => setImageState({ src: image.src, loaded: true })}
      onError={() => setImageState({ src: image.src, loaded: false })} />}
  </span>
}
