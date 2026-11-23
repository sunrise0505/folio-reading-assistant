# 拾页 FOLIO · 外刊阅读与词汇积累

面向大学生的本地外刊阅读助手。导入英文正文，按段落阅读和查词，把词义连同原句收藏，再用原句填空复习。每次安装使用一份本地 SQLite 数据库。

## 功能

- 文章库支持内置样文、媒体导读、粘贴正文，以及上传 UTF-8 TXT／Markdown、DOCX 和 PDF。上传后先在导入窗口核对、编辑正文，再保存文章。每篇文章的来源可选填，从常用外刊下拉框选择或手动输入。DOCX 和 PDF 单个文件上限为 10 MB，PDF 上限为 100 页，正文上限为 10 万字符。
- PDF 导入会提取可选中的文字。纯图片页使用本地英文 OCR，识别结果可在导入窗口核对、编辑后保存。旧报纸、低清或双栏扫描件可能需要校对。
- 考试试卷会自动尝试提取阅读文章，识别常见的 Passage One／Two、Text 1／2、Reading Passage 和阅读理解 A／B 分节，排除常见题干、选项与答案区。上传前也可勾选「这是考试试卷，优先提取阅读文章」。预览支持逐篇勾选、编辑和查看整份提取文本，确认后才保存。来源默认填试卷文件名，可手动修改。少于 45 个英文词的候选段落不会自动列入，识别失败时保留整份文本供整理。特殊排版、分栏、手写和模糊扫描件仍需要人工核对。
- 可同时选多个文件。单个文件内可用 Markdown 一级标题、Word 的「标题／标题 1」，或明确的 `Title:`／`标题：` 与 `---` 分隔线标记文章。无法可靠拆分的文件按整篇预览。预览中可勾选或移除草稿、编辑标题与正文，也可把拆分结果恢复成整份文档。
- 可按照 PDF 的顶层书签和起始页拆分合订文章。文章库每篇文章右侧可删除条目，已收藏的例句和打卡记录会保留。
- 阅读器支持调整字号、行距、段宽，保存段落进度。本地词表收录的固定搭配只在每篇文章首次出现时加下划线，标题也计入。可划选整个短语查释义，或点其中一个词再点「查短语」。短语可以连同原句收藏和复习，未收录的短语可自填释义。
- 阅读工具栏支持「纯英文」和「中英双语」。内置文章配有中文译文。导入文章切换到双语模式后，可按原文段落添加自己的译文。
- 已收藏的词在文章标题或正文的收藏位置保留荧光标记。生词本支持编辑备注、标记掌握度、删除、按来源筛选和回到原文。顶部按不同单词统计四级、六级、雅思和 GRE 词表收录比例。
- 复习默认每组 10 词，可在复习设置中调整。两种模式都先根据英文选「认识」「模糊」或「忘记」，再显示释义和词性。选「认识」后可点「继续」确认，或点「记错了」留到下一小轮。「模糊」和「忘记」也会进入下一小轮。经典模式在认词完成后进入原句拼写。
- 文章卡片和阅读页同时显示考试难度参考和 1–5 颗星。四级为 1–2 星，六级为 3 星，雅思为 4 星，GRE 为 5 星。标记低频词已掌握后，可看到个人难度。
- 首次安装依赖需要联网，启动后的导入、样文、查词、复习和打卡均可离线运行。

- 点击阅读工具栏中的段落计数，可输入段号、预览正文并跳转。跳转后键盘焦点位于目标段落，可继续用方向键选词。
- 生词本支持同时按文章、掌握度和关键词筛选，关键词覆盖单词、释义和备注。可按最近收藏、复习日期或字母排序。「导出当前结果」下载 UTF-8 CSV，包含词义、备注、掌握度、复习日期和原句出处，每条出处一行。选择文章时只导出该文章的出处，文件可用 Excel 等表格软件打开。

## 从零启动

准备 Python 3.12、Node.js 22 或 24（含 npm）和近期版本的 Chrome、Edge 或 Firefox。先在终端进入项目根目录，也就是能看到 `README.md`、`backend/`、`frontend/` 和 `requirements.lock.txt` 的目录。首次安装依赖需要联网。按顺序执行命令，若某一步报错，先处理该步再继续。

**macOS / Linux**

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock.txt
npm --prefix frontend ci
npm --prefix frontend run build
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

**Windows PowerShell**

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock.txt
npm.cmd --prefix frontend ci
npm.cmd --prefix frontend run build
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

最后一条命令启动服务。终端显示 `Uvicorn running on http://127.0.0.1:8000` 后，在同一台电脑打开 [本地阅读助手](http://127.0.0.1:8000/)。使用期间保持服务进程运行。按 Ctrl+C 会停止服务，下次从项目根目录执行对应平台的最后一条命令即可重新启动。

### 启用扫描 PDF 的英文 OCR

按上面的启动步骤安装 Python 依赖，再安装 Tesseract OCR：

- macOS 执行 `brew install tesseract`。
- Debian / Ubuntu 执行 `sudo apt install tesseract-ocr tesseract-ocr-eng`。
- Windows 按 [Tesseract 安装说明](https://tesseract-ocr.github.io/tessdoc/Installation.html)安装，并把 Tesseract 的安装目录加入 PATH。

执行 `tesseract --list-langs`，列表里有 `eng` 即可。安装完成后重启拾页。上传扫描 PDF 时，识别在本机进行。已识别的图片页数会显示在导入预览里。带文字层的 PDF、TXT、Markdown 和 DOCX 可直接导入。

如果浏览器显示「连接被拒绝」，回到终端检查启动命令是否报错或已经退出。如果页面提示需要构建前端，在项目根目录运行 `npm --prefix frontend run build`（Windows PowerShell 使用 `npm.cmd --prefix frontend run build`），然后重新启动服务。如果启动时显示端口已占用，可改用 `--port 8001` 并访问对应端口。希望用空白记录自验时，按[架构文档中的独立验收步骤](docs/ARCHITECTURE.md#运行与数据存放)启动，并打开该步骤给出的地址。

学习数据默认保存在项目根目录的 `data/reading.sqlite3`。阅读排版偏好存在当前浏览器。想保留学习记录时，停止服务后备份数据库文件即可。不同电脑上各自启动的应用有各自的数据。首次验收建议保留默认的本机绑定地址。

## 验收流程

1. 打开文章库，确认能看到三篇样文。导入一篇自己的英文文本，段落之间空一行，确认标题和正文正确显示。
2. 打开样文 *The quiet value of urban shade*，划选第二段中的 `infrastructure`，确认看到释义与原句。点击「加入生词本」，再收藏同一个位置和义项，确认只保留一条出处。
3. 在生词本里按文章筛选，编辑备注，试着从例句跳回原文。调整字号或行距，确认仍能继续读。
4. 打开「复习」，先为 `infrastructure` 选择「认识」。查看释义后点「记错了」，确认它进入下一小轮。再次选择「认识」并点「继续」，完成该组认词后进入原句填空。提交拼写，确认显示下次复习日期，当前卡片移出今日队列。
5. 回到文章底部点击「完成阅读」。打开「打卡」，确认当天有打卡，完成文章数和复习次数各增加一次。
6. 滚动到文章中间一段，停止并重启服务。在文章库重开原文，确认定位到之前的段落，生词和打卡仍在。可在另一台电脑从第一条安装命令重新验证。

## 开发与测试

- 前端使用 React、TypeScript、Vite、Tailwind CSS 和 Lucide 图标。运行 `npm --prefix frontend run dev` 开启前端热更新，同时保持后端在 8000 端口运行。Vite 将 `/api` 转发到后端。
- 后端使用 FastAPI、SQLAlchemy 和 SQLite。开发 API 文档可在本地服务的 `/docs` 查看。正式启动时，FastAPI 同时提供前端构建产物和 API。
- macOS / Linux 执行 `.venv/bin/python -m pytest -q`。Windows 执行 `.\.venv\Scripts\python.exe -m pytest -q`。测试使用临时数据库。
- 在项目根目录执行 `node --experimental-strip-types --test tests/test_vocabulary.mjs`，验证生词组合筛选、排序、CSV 特殊字符和公式前缀处理。使用支持类型擦除的 Node.js 22.6+ 或 24。

难度使用词频排名达到 3500 的已识别词占正文词数的比例，并用平均句长及至少 23 词的句子比例修正。分值为低频词百分比 + 0.8 × 超出 12 词的平均句长 + 0.1 × 长句百分比。3 分起为 2 星，6 分起为六级（3 星），13 分起为雅思（4 星），24 分起为 GRE（5 星）。6 分以下标为四级。这是本应用的相对阅读难度估算，无法与考试原卷或官方分数换算。个人分级会从低频词计数中扣除已掌握词元。词频覆盖率低时，等级仅供参考。

认词自评决定第一阶段的重试顺序。原句拼写答错或跳过会清空连续答对次数，次日再练。连续拼写正确的复习间隔为 2、4、7、14、30 天，之后保持 30 天。连续拼写正确三次可标记为已掌握，也可以手动修改。打卡按运行服务的电脑本地日期统计。每篇文章首次完成只记一次，每张到期卡片一次提交只记一次。

## 来源和许可

- 词典和词形索引由 [ECDICT](https://github.com/skywind3000/ECDICT) 的 `ecdict.csv` 生成。选入按词频排名前 25,000 范围内、有英汉释义的词元，约 24,500 条，保留原项目 [MIT 许可证](backend/data/ECDICT-LICENSE.txt)。另有少量样文释义调整。生成脚本在 `scripts/build_dictionary.py`。
- 常见固定搭配及释义和内置文章的中文译文随项目提供，见 [短语词表](backend/data/phrases.tsv)和[内置译文](backend/data/article_translations.json)。
- 首页的城市街景与图书馆实拍采用 Unsplash License 和 CC BY 4.0。摄影者、原图和许可见[文章封面来源](docs/DESIGN.md#文章封面来源)。
- 三篇样文与七篇媒体学习导读由拾页编写。媒体导读链接至 China Daily、The Economist、The Times 和 The Guardian 的具体文章。站内展示学习导读，媒体原文请通过阅读页的原文链接访问。界面图标使用 [Lucide](https://github.com/lucide-icons/lucide)（ISC）。应用框架和库的版本见 `frontend/package-lock.json` 和 `requirements.lock.txt`。
- 当前版本运行时没有模型依赖。公开网页 URL 抽取、AI 语境释义和 TTS 留作后续迭代。
- 文档提取使用 [python-docx](https://pypi.org/project/python-docx/)（MIT）和 [pypdf](https://pypi.org/project/pypdf/)（BSD-3-Clause）。
- 扫描 PDF 使用 [pypdfium2](https://pypi.org/project/pypdfium2/) 渲染（BSD-3-Clause / Apache-2.0 及依赖许可）、[Pillow](https://pypi.org/project/Pillow/) 处理图片（MIT-CMU）、[Tesseract](https://github.com/tesseract-ocr/tesseract) 本地识别（Apache-2.0）。

## AI 工具使用声明

Kimi 参与初版功能清单讨论。ChatGPT/Codex 参与同类项目调研、技术方案讨论、首版代码搭建和测试。提交前，请参赛成员根据实际情况补充各自做出的核心设计决策、实质性修改和参与度排名，并按赛事要求核对开发文档、仓库链接和演示视频。

本次增量由 ChatGPT/Codex 辅助实现段落导航、生词组合筛选与排序、CSV 导出及相关测试。成员贡献说明应结合本人实际完成的设计、修改和验收填写。
