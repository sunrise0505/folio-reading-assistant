# 拾页 FOLIO 技术架构

2026 年 11 月 15 日 · 当前比赛版

## 运行与数据存放

浏览器通过同源 `/api` 与 FastAPI 通信，FastAPI 使用 SQLAlchemy 会话访问 SQLite。正式启动时，Uvicorn 监听 `127.0.0.1:8000`，FastAPI 提供 `frontend/dist` 的入口和资源。开发模式下，Vite 在 5173 端口将 `/api` 转发到后端。服务端使用 Python 3.12，前端使用 React、TypeScript、Vite 和 Tailwind CSS，依赖版本由两个锁定文件记录。命令见 [README](../README.md#从零启动)。

- **SQLite** 默认为项目根目录的 `data/reading.sqlite3`。个人验收可用独立数据库。在项目根目录开一个终端运行以下命令，再访问 `http://127.0.0.1:8001/`。验收实例使用独立端口和数据库，也会使用单独的浏览器偏好。

  ```bash
  READING_DB_PATH=data/acceptance.sqlite3 .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8001
  ```

- **浏览器本地存储**保留阅读偏好和每组复习词数，键名分别为 `margin-settings` 和 `folio-review-group-size`。认词的小轮顺序、当前拼写输入和组内进度在 React 状态中，刷新页面会重建当前组，已提交的拼写排期和打卡计数从数据库恢复。
- **内置内容**从 `backend/data/articles.json` 初始化，使用唯一 `slug` 避免重复插入。媒体原文 URL 按 `slug` 从内置数据提供给前端。词典 TSV 和封面、纸纹资源随项目提供，基础流程运行时无需外网。外部原文链接由浏览器单独打开。

## 目录与职责

| 位置 | 职责 |
| --- | --- |
| [frontend/src/App.tsx](../frontend/src/App.tsx) | 主导航、文章库、导入、生词本、打卡，以及页面数据刷新 |
| [frontend/src/Reader.tsx](../frontend/src/Reader.tsx) | 正文排版、选词、标题与段落锚点、滚动进度、收藏入口 |
| [frontend/src/Review.tsx](../frontend/src/Review.tsx) | 到期词条分组、认词重试、原文拼写和组末结果 |
| [frontend/src/api.ts](../frontend/src/api.ts) | 前端共享类型和 API 请求 |
| [backend/main.py](../backend/main.py) | 应用初始化、输入校验、API、数据库会话与写入事务 |
| [backend/models.py](../backend/models.py) | SQLAlchemy 数据模型、唯一约束和外键 |
| [backend/reading.py](../backend/reading.py) | 文本处理、词形还原、离线词典查询、难度估算 |
| [backend/exam_import.py](../backend/exam_import.py) | 从已提取的试卷文本识别阅读分节，连接跨页正文并排除题干、选项、页码和答案区 |
| [backend/data/](../backend/data/) 与 [scripts/build_dictionary.py](../scripts/build_dictionary.py) | 样文、数据许可、词典资源与词典生成脚本 |
| [tests/test_workflow.py](../tests/test_workflow.py) | 用临时 SQLite 数据库验证主要 API 流程 |

## 数据模型

| 表 | 主要内容和约定 |
| --- | --- |
| `articles` | 文章标题、正文、栏目、作者和来源，另存段落位置 `paragraph` 与首次完成日期 `completed_on`。内置材料有唯一 `slug`。 |
| `article_translations` | 按文章 ID 保存用户填写的中文译文。内置译文按 `slug` 从项目文件读取。 |
| `vocabulary` | 词元 `lemma`、义项 `meaning`、备注、掌握状态、到期日 `due` 和连续正确次数 `streak`。词元与义项的组合唯一。 |
| `examples` | 生词义项与文章的关联，存标题或原句、实际词形 `surface` 和起始位置 `start`。正文段落从 0 起算，标题用 -1 表示。字符偏移按 Unicode 码点计算，前后端按同一口径处理。删除生词义项时级联删除对应出处。 |
| `activities` | 以服务端本地日期为主键，保存当天首次读完的文章数和成功提交的复习次数。 |
| `removed_articles` | 保存从文章库移除的文章 ID。文章详情仍可通过收藏出处打开，已完成的打卡记录继续计入统计。 |

## API 与行为约定

完整请求结构可在本地服务的 `/docs` 查阅。输入由 Pydantic 校验，前端通过同源 JSON 访问。API 检查本机 Host 和有 Origin 时的写请求来源。当前适用场景为单用户本机运行。

| API | 用途 |
| --- | --- |
| `GET /api/articles`、`GET /api/articles/{id}`、`POST /api/articles` | 列表、段落详情、单篇导入。详情附对应译文及词表收录的短语位置。 |
| `PATCH /api/articles/{id}/translation` | 存储与原文段数一致的译文。提交空白时清除用户译文。 |
| `POST /api/articles/extract?format=...&mode=auto` | 读取 UTF-8 TXT／Markdown 或用 python-docx、pypdf 提取正文。扫描 PDF 的图片页经 PDFium 渲染并交给本地 Tesseract 识别英文，返回使用 OCR 的页码 `ocr_pages`。按标题、分隔线或 PDF 顶层书签的起始页返回候选篇目与整份正文。自动检测常见试卷分节，`mode=exam` 可指定试卷模式。试卷预览额外返回 `extraction_kind: exam` 和 `warnings`。不足 45 个英文词的候选仅提示，未识别时返回整份正文和空候选列表。文档和预览仅用于当前导入请求。 |
| `POST /api/articles/batch` | 校验后在同一事务保存已勾选的文章，返回文章 ID。 |
| `DELETE /api/articles/{id}` | 将文章从目录移除，重复提交不会改变结果。 |
| `PATCH /api/articles/{id}/progress`、`POST /api/articles/{id}/complete` | 保存有效段落位置。首次完成文章会在同一事务增加当天阅读数。 |
| `GET /api/dictionary?word=...` | 查询本地单词或短语。用空词条表示未收录。 |
| `GET /api/vocabulary`、`POST /api/vocabulary`、`PATCH /api/vocabulary/{id}`、`DELETE /api/vocabulary/{id}` | 查询、收藏、修改和删除。收藏时校验词形与文中出处，并利用唯一约束合并重复记录。 |
| `GET /api/review`、`POST /api/review/{id}` | 取当天到期词条并提交拼写。改期与活动计数在同一事务写入。请求携带到期日和连续次数，重复或过期提交返回 409。 |
| `GET /api/activity` | 返回服务端当天日期、逐日记录和汇总数据。 |

词卡一次可勾选多个义项，逐条提交到已有的收藏接口。词条响应中的 `parts_of_speech` 由本地词典按词元与已收藏义项匹配，已有词条也可使用。无法匹配时返回空数组。

认词阶段由前端管理。拼写提交后，服务端比较输入与首条保存出处中的实际词形，没有出处时使用词元。判分忽略首尾空白和大小写，并统一英文弯引号。答错或跳过安排次日复习，连续拼写正确的间隔为 2、4、7、14、30 天，之后保持 30 天，连续正确三次标为已掌握。后端同时保留旧版评分字段的兼容处理。

## AI 使用与开发约束

开发阶段曾用 Kimi 辅助整理初版需求，用 ChatGPT/Codex 辅助调研、编写与验证。运行时模型功能尚在后续范围。若将来接入 AI，独立记录工具或模型名称、使用环节、发送的数据与人工复核方式。第三方数据及授权记录见 [README](../README.md#来源和许可)。

- 功能变更同步更新产品范围与验收用例。交互、视觉或数据接口变化同步更新对应文档。
- 校验业务变更时运行 `.venv/bin/python -m pytest -q` 和 `npm --prefix frontend run build`。改动用户流程后，按 [PRD 个人验收](PRD.md#本次个人验收) 复查相关步骤。
- 使用临时 SQLite 数据库跑测试，提交时排除个人数据库、虚拟环境、依赖目录和凭据。修改数据结构时先验证已有 SQLite 文件的升级路径。
