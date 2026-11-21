# 拾页 FOLIO 设计规范

2026 年 11 月 17 日 · 当前界面基线

## 视觉方向

文章库采用明亮的当代文化杂志风格。品牌文字为「拾页 FOLIO」，副标题为「外刊阅读与词汇积累」。近白背景、轻量衬线标题和自然摄影形成首页层次。主要样式变量见 [style.css](../frontend/src/style.css)。

| 用途 | 变量与颜色 |
| --- | --- |
| 页面、卡片与正文 | `--paper` #FAFAF7、`--surface` #FFFFFF、`--reading-surface` #FEFEFC |
| 卡片与英文标题 | `--card-radius` 14 px、`--cover-radius` 9 px、`--article-title-weight` 500 |
| 正文与辅助文字 | `--ink` #26312E、`--ink-secondary` #475650、`--muted` #59655F |
| 分隔线与搜索筛选 | `--rule` #DCE3DE、`--catalog-control-fill` #EEF2EF |
| 封面与分类 | `--cover-*`、`--tag-*-bg` 与 `--tag-*-ink` 定义薄荷、淡蓝、淡黄、浅杏和中性色 |
| 主操作、链接与当前状态 | `--accent` #7A2E3A、`--accent-soft` #F0E5E5 |
| 查词高亮与完成状态 | `--highlighter` #F9E794；`--success` #35624F、`--success-soft` #E8EEE8 |

英文标题与正文优先使用系统可用的 Source Serif 4，回退到 Georgia 和 Times New Roman。中文界面使用系统无衬线字体。默认正文为 19 px、1.78 倍行距、目标正文宽度 680 px，窄窗口按实际空间收缩。

## 页面与关键交互

| 页面 | 布局与反馈 |
| --- | --- |
| 文章库 | 未筛选且至少三篇时，按原顺序放大首篇并并排展示接下来的两篇。首篇桌面封面占卡片内宽约 35%，标题字号 32–38 px。少量结果与筛选结果使用紧凑列表。辅助信息包括难度、阅读时长、读完日期和进度。图片缺失或加载失败时，固定显示对应分类的浅色文字封面。学习记录和继续阅读置于首屏文章组下方。 |
| 阅读器 | 正文居中单栏，工具栏可切换纯英文或中英双语。译文排在对应英文段落下方。细线表示阅读进度，难度详情与设置按需展开。词表识别出的固定搭配加细下划线，选中或收藏的单词和短语采用淡黄荧光标记。 |
| 生词本 | 顶部显示四种考试词表各自收录的收藏词占比。同一单词的多个义项只计一次，同时被多个词表收录的词分别计入各项。词条按行展示释义、原文片段和学习记录。来源链接跳到标题或段落。 |
| 复习 | 默认经典模式，先认词再原句拼写。翻卡模式可从一组背面卡片任意抽选。两种模式都在自评后显示释义和词性，选择「认识」的人可点「继续」确认或点「记错了」重练。「模糊」「忘记」和「记错了」的词进入下一小轮。翻卡模式的重练词排到次日复习。两种模式共用每组词数设置。 |
| 阅读打卡 | 同页显示连续天数、累计天数、已读篇数和复习次数。月历用色块与勾选图标共同标示打卡，当日带描边，侧栏展示本月逐日记录。 |

## 组件、状态与适配

- [ArticleCard.tsx](../frontend/src/ArticleCard.tsx) 复用 [ArticleCover.tsx](../frontend/src/ArticleCover.tsx) 与 [ui.tsx](../frontend/src/ui.tsx) 的栏目标签、难度标记和按钮。整张卡片可用键盘打开，删除按钮独立操作。装饰性图形从辅助技术中隐藏。
- 过渡默认 170 ms。鼠标悬停时照片放大 2.5%，收藏后显示一次勾选反馈。打开「减少动态效果」时关闭动画和过渡。Tab 焦点使用可见描边，阅读时聚焦标题或段落后可用左右键选词、Enter 查词。Esc 可关闭查词与设置面板，也可关闭表单对话框。
- 760 px 及以下，文章和学习摘要单列排列。350 px 及以下，封面移到标题上方。长标题自然换行。阅读工具移到底部并预留安全区，桌面宽屏把释义浮层放到正文右侧。
- **加载中**保留页面结构并显示文本状态。查词等待时显示「正在查词…」。**出错**在相关操作旁提示，页面数据加载失败可从顶部提示重试。**空列表**给出取消筛选、导入文章或前往阅读的入口，且与出错状态使用不同文案。
- **词典未收录**时保留原句并允许填写收藏义项。以后若加入 AI，语境注释放在独立、可展开的区块内，标明生成来源，基础查词和收藏入口继续可用。

## 文章封面来源

照片用于对应主题的两篇项目原创样文，文章来源仍显示在元信息中。图片本地存放，已缩小并转换为 WebP。街景图片裁去部分前景阴影。卡片按预留比例显示，使用 CSS 适配不同版面裁切。

| 本地资源 | 作者与来源 | 许可证 |
| --- | --- | --- |
| `amsterdam-tree-shade.webp` | Fons Heijnsbroek，阿姆斯特丹 Touwbaanpark 街景，[原图](https://unsplash.com/photos/people-walking-on-sidewalk-near-trees-and-building-during-daytime-slOWu2JaUR4) | [Unsplash License](https://unsplash.com/license) |
| `surrey-library.webp` | Canmenwalker，Surrey City Centre Public Library，[原图](https://commons.wikimedia.org/wiki/File:Surrey_City_Centre_Public_Library_interior_2024.jpg) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
