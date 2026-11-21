import { Trash2 } from 'lucide-react'
import type { Article } from './api'
import { ArticleCover, articleSection } from './ArticleCover'
import type { CoverImage } from './ArticleCover'
import { DifficultyLabel, IconButton, readingMinutes, Tag } from './ui'

type ArticleCardProps = {
  article: Article
  image?: CoverImage
  onOpen: () => void
  onRemove: () => void
}

export function FeaturedArticleCard(props: ArticleCardProps) {
  return <ArticleCard {...props} variant="featured" />
}

export function ArticleCard({ article, image, onOpen, onRemove, variant = 'standard' }: ArticleCardProps & {
  variant?: 'featured' | 'secondary' | 'standard'
}) {
  const section = article.cover_section ?? article.category
  const tone = articleSection(section).tone
  return <li className={`article-card article-card--${variant}`} data-tone={tone}>
    <button type="button" className="article-row" onClick={onOpen}>
      <span className="article-copy">
        <span className="article-kicker">
          <Tag tone={tone}>{section}</Tag>
        </span>
        <span className="article-title" lang="en">{article.title}</span>
        {article.subtitle && <span className="article-subtitle">{article.subtitle}</span>}
      </span>
      <ArticleCover category={section} image={image} />
      <span className="article-meta">
        <span className="article-source">{article.source || '未注明来源'}{article.source_url ? ' · 导读' : ''}</span>
        <DifficultyLabel exam={article.difficulty.exam} stars={article.difficulty.stars} />
        <span>{article.difficulty.word_count} 词 · 约 {readingMinutes(article.difficulty.word_count)} 分钟</span>
        {image && <span className="cover-credit">封面 · {image.credit}</span>}
        {article.completed_on ? <span className="complete-state">
          已读完 <time dateTime={article.completed_on}>{article.completed_on}</time>
        </span> : article.paragraph > 0 && <span className="article-progress">读到第 {article.paragraph + 1} 段</span>}
      </span>
    </button>
    <IconButton className="remove-article" aria-label={'删除文章 ' + article.title} title="删除文章" onClick={onRemove}>
      <Trash2 size={16} aria-hidden="true" />
    </IconButton>
  </li>
}
