# 个人主页（Apple 设计风格 · 多语言）

零依赖、零构建的静态个人主页，三种语言：`index.html` 简体中文、`zh-HK/index.html` 繁體中文（香港）、`en/index.html` English。共用一份 CSS 和一份 JS，由 GitHub Actions 部署到 GitHub Pages。

## 本地预览

直接双击 `index.html`，或起一个静态服务（语言切换与相对路径更像线上环境）：

```
python -m http.server 4173
```

打开 http://localhost:4173/ 与 http://localhost:4173/en/。

## 文件结构

| 文件 | 作用 |
| --- | --- |
| `index.html` | 中文页面（`lang="zh-CN"`） |
| `zh-HK/index.html` | 繁體中文（香港）页面（`lang="zh-HK"`） |
| `en/index.html` | 英文页面（`lang="en"`） |
| `assets/styles.css` | 全部样式，含逻辑属性与脚本感知排版 |
| `assets/app.js` | 动效、主题、语言提示、`Intl` 本地化 |
| `assets/img/` | 爱好卡片配图（1600×1067，3:2） |
| `sitemap.xml` | 每页列出全部语言，告诉搜索引擎这是同一个人而不是重复内容 |
| `robots.txt` | 允许收录并指向 sitemap |
| `tools/check-site.mjs` | 部署前的多语言检查，本地和 CI 都跑 |
| `.github/workflows/pages.yml` | 部署到 GitHub Pages 的 Action |

## 部署

推送到 `main` 即自动部署，也可以在 Actions 页面手动触发（`workflow_dispatch`）。

首次需要在仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。之后 workflow 会：

1. `check` 作业先跑 `node --check assets/app.js` 与 `node tools/check-site.mjs`，任何一个语言页面漏了 hreflang、漏了语言提示变体、指向错 URL，或 sitemap 与页面不一致，**部署直接失败**；
2. 通过后才把整个仓库作为静态产物上传（`actions/upload-pages-artifact` 会自动排除 `.git` 与 `.github`），再由 `actions/deploy-pages` 发布。

没有构建步骤——仓库本身就是站点，所以 Action 里唯一做的事是「检查」和「发布」。

## 国际化（i18n）与本地化（l10n）是怎么做的

### 1. 语言以「页面」为单位，而不是运行时字典

每种语言一个真实 HTML 文件，内容直接写死在标记里。好处：

- 没有 JS 也能完整阅读，搜索引擎和社交抓取能看到真实内容；
- 每个页面有自己的 `<title>`、`description`、`lang` 和 JSON-LD；
- 翻译文案写在其所属语言的页面里，不会和代码混在一起。

代价是同一段内容要维护两份。如果语言数增长到三种以上，再考虑引入构建步骤生成这些页面；现在两份手工维护更简单、更不容易出错。

### 2. 静态页面 + 双向 hreflang

```html
<link rel="alternate" hreflang="zh-CN" href="https://federation132.github.io/">
<link rel="alternate" hreflang="zh-HK" href="https://federation132.github.io/zh-HK/">
<link rel="alternate" hreflang="en"    href="https://federation132.github.io/en/">
<link rel="alternate" hreflang="x-default" href="https://federation132.github.io/">
```

两边互指，并声明 `x-default`；每页各有自己的 `rel="canonical"`，避免互相抢占。

### 3. 语言切换不劫持访问

- 右上角是一个标准的分段控件，两个语言链接互相指向，并各自标注 `hreflang` 与 `lang`（`中文` 用 `lang="zh-CN"`，`English` 用 `lang="en"`，屏幕阅读器会用正确语音朗读）。
- 如果浏览器首选语言与当前页面不同，页面底部**提议**一次切换（毛玻璃胶囊）。开始往下读时它会自己让位，不会一路跟着；也可以手动关闭。页脚留了空间，所以贴底时不会压住内容。
- 用户点过任意切换链接后，选择被记住，之后不再提示；关闭提示也会被记住。
- 判断首选语言时会遍历 `navigator.languages`，取其中**第一个本站支持**的语言，而不是死板地只看第一个；中文会额外判断简繁——浏览器要 `zh-TW`、`zh-Hant-*`、`zh-HK`、`zh-MO` 的访客会被引到繁體版，而不是碰巧排在前面那个中文版本。

### 4. 数据本地化交给 `Intl`，不手写格式

`assets/app.js` 里没有任何一句面向用户的文案，全部是数据格式化：

| 标记 | 输出（中文 / 英文） |
| --- | --- |
| `data-l10n-date="2024-09"` | `2024年9月` / `September 2024` |
| `data-l10n-date-range="2021-06/2024-03"` | `2021年6月–2024年3月` / `June 2021 – March 2024` |
| `data-l10n-relative="2026-07-20"` | `2 个月前` / `2 months ago` |
| `data-l10n-number="24"` | 按语言分组的数字格式 |
| `data-l10n-count` + `data-l10n-forms` | 按 CLDR 复数规则选词（`project` / `projects`） |
| `data-l10n-list="A\|B\|C"` | 中文用顿号顿开，英文自动加 `and` |

实现里四个容易踩坑的点：

- **日期不带时区**：`2024-09` 是日历日期而不是时刻，用 `Date.UTC` 构造并以 `timeZone: 'UTC'` 格式化，避免在别的时区被前移一天。
- **日期区间不用 `formatRange`**：直觉上区间该交给 `formatRange`，但在 `zh-CN` 下它会把 `2021年6月 – 2024年3月` 输出成 `2021/6 – 2024/3`，和同一个 formatter 单独格式化时的样式不一致。所以两端都用同一个 formatter，再用连接符拼接；连接符可用 `data-l10n-range-separator` 按语言覆盖。
- **列表不要用 `ListFormat` 的 `unit` 类型**：`unit` 在中文里没有任何分隔符（`产品设计前端开发动效与原型`）。统一用 `conjunction`：中文是 `A、B和C`，英文是 `A, B, and C`。
- **复数按 CLDR 分类**：`data-l10n-count` + `data-l10n-forms` 用 `Intl.PluralRules` 选词，所以将来加阿拉伯语也不用改代码。

### 5. 版式随语言调整

- 字距和行高按脚本微调：`:lang(zh)` 下大标题减少负字距、行高略松（见 `styles.css` 的「Script-aware typography」）。
- 所有间距用 `rem`/`em` 与 `clamp()`，字号放大或译文变长时是重排而不是截断；正文宽度用 `em` 而不是 `ch`（`ch` 基于数字 0 宽度，中文下会失准）。
- 中文启用 `line-break: strict`，避免标点被留在行首。

### 6. 方向性（RTL）已就位

全站使用逻辑属性（`margin-inline`、`inset-inline`、`padding-inline`、`border-block-end`），轮播拖拽、方向箭头、进度条方向都会随 `dir` 翻转。加一种 RTL 语言只需要新增页面并把 `<html>` 的 `dir` 改成 `rtl`，不用改 CSS 和 JS。

### 7. 再加一种语言：只动文件，不动代码

1. 复制 `en/index.html` 到 `<新语言代码>/index.html`，翻译正文，把 `<html lang="…" dir="…">` 改成对应值（RTL 语言设成 `rtl`）；
2. 改该页的 `<title>`、`description`、`og:locale`、`canonical` 与 JSON-LD；
3. 在每个页面的 `hreflang` 组里补一行 `<link rel="alternate">`；
4. 在每个页面的语言切换器里加一个选项，并写上 `hreflang` 与 `lang`；
5. 在每个页面的语言提示里加一组 `data-lang-variant="<新代码>"` 的文案（这组文案本身写在新语言里）；
6. 在 `sitemap.xml` 的两个 `<url>` 里各补一条 `xhtml:link`。

**不用动**：日期、区间、数字、复数、列表全部走 `Intl`，跟着 `<html lang>` 自动切换；轮播方向跟着 `dir` 自动翻转；导航切换器和语言提示会自己认出第三种语言——`assets/app.js` 和 `styles.css` 里没有任何语言名单。

唯一要额外留心的：每页在 JS 跑起来之前会先显示写死在 HTML 里的文案（例如中文页的「2026 年 9 月」），所以那些静态文案也要跟着翻译，它们同时是 JS 失效时的兜底。

## 这轮 i18n / l10n 检查改了什么

已修正：

- **语言标签要能降级**：以前直接拿 `<html lang>` 去构造 `Intl`，遇到浏览器 ICU 不认识的标签会抛错、整页格式化全挂。现在按 `zh-Hant-HK → zh-Hant → zh → en` 逐个试，取第一个可用的。
- **单个字段出错不再拖垮整页**：每个 `data-l10n-*` 元素独立 try/catch，出错就保留 HTML 里原有文案。
- **日期改成机器可读**：学生工作的日期从 `<span>` 换成 `<time datetime="2026-09">`，可见文字仍由 `Intl` 生成。
- **行内语言标记**：中文页里的 `Eric`、`English` 标了 `lang="en"`，英文页里的「中文」标了 `lang="zh-CN"`，屏幕阅读器会用正确语音朗读。品牌名与技术缩写（GitHub、BI2QVE、HTML）不标——它们不是某一种语言的内容。
- **语言提示不再写死两种语言**：判断逻辑改成「从浏览器偏好里挑出第一个本站支持、且与当前页不同的语言」，CSS 也用 `.is-current-variant` 而不是按语言代码硬编码选择器。
- **补了 `sitemap.xml` 与 `robots.txt`**，sitemap 里每个 URL 都带全套 `hreflang` 交替链接。

## Apple 设计原则的落点

- **即时反馈**：按钮在按下瞬间就响应，不等松手。
- **弹簧而非固定时长**：可用手抓取的动效全部由 damping / response 参数化的弹簧驱动，随时能从当前屏幕值接管。
- **速度传递 + 动量投影**：拖动松手时把手指速度交给弹簧，并按动量落点决定停在哪一张，两端做橡皮筋阻尼。
- **材质与层级**：导航栏与语言提示是半透明毛玻璃；滚动边缘用渐隐代替硬分割线；语言提示「materialize」（位移、缩放、模糊一起到位），不是淡入。
- **无障碍**：支持 `prefers-reduced-motion` / `-transparency` / `contrast`，轮播可用键盘与 trackpad 横向滚动操作，有跳到主内容链接与可见焦点环；`noscript` 下内容依旧完整可见。

## 页面内容现状

已经填好的是真实信息：

| 区块 | 内容 |
| --- | --- |
| 首屏 | 座右铭「干惊天动地事，做隐姓埋名人。」、尹赫 / Eric、中南大学机电工程学院（机械类）、呼号 BI2QVE、2602 班 |
| 三个数字 | 机械类班级 2602、3 项学生工作岗位、呼号 BI2QVE |
| 学生工作 | 机械类 2602 班班长、机电工程学院团学会学习部干事、校学生会学习实践部干事 |
| 关于 | 在读院校与专业、籍贯（辽宁沈阳）、现居（湖南长沙）、语言、呼号、更新日期 |
| 爱好 | 兵棋推演、桌游、业余无线电（各配一张图，图下有原作者署名） |
| 联系 | 业余无线电一栏已经写着呼号 BI2QVE；邮箱 / 微信 / GitHub 三项仍是「暂未公开」 |

## 配图与版权

三张配图都来自 Wikimedia Commons，均为可商用许可，并按卡片需要的 3:2 比例裁剪成 1600×1067：

| 文件 | 内容 | 作者 | 许可 |
| --- | --- | --- | --- |
| `interest-wargame.jpg` | 六角格兵棋地图与算子 | Rocco Pier Luigi Moroboshi | 公有领域 |
| `interest-boardgames.jpg` | 桌面游戏静物（骰子与棋子） | Tarasna0922 | CC BY-SA 4.0 |
| `interest-radio.jpg` | 塔架上的八木天线 | Ptolusque | CC BY-SA 4.0 |

署名写在**每张图片的正下方**（作者链接到原始文件页，许可链接到许可全文），页脚再说明一次总体来源与「已裁剪」。这是 CC BY-SA 的要求：署名、标明许可、指出改动。换图时记得同步更新这两处署名，新图也要确认许可。

页面里的 `<img>` 都带 `width`/`height`、`loading="lazy"`、`decoding="async"`，并且 **alt 文案按语言分别写好**（中文页与英文页各一份），不共用同一句英文描述。

**2602 与 BI2QVE 是编号和呼号，不是数量，所以故意没有走 `data-l10n-number`**（否则英文页面会显示成 `2,602`）。这是 i18n 里很容易踩的坑：标识符不等于数字。

还需要你确认或补充的位置：

| 位置 | 说明 |
| --- | --- |
| 联系方式 | 四个栏目现在都是「暂未公开」，想公开哪个就把值换成真实信息（可点击的再加 `<a>`） |
| 任职起始时间 | 三份学生工作的日期都暂用 2026 年 9 月，按实际改 |
| 座右铭的英文译法 | 中文是「干惊天动地事，做隐姓埋名人。」，英文页暂译作 “Shake the world, and stay unknown.”，想换更贴切的说法告诉我 |
| 关于我的两段文字 | 我按你的信息写的初稿，可以直接改 |
| 站点域名 | 目前按 `federation132.github.io` 写死在 `canonical` / `hreflang` / `og:url` 与 JSON-LD 里，换域名要一起改 |
| 主题色、圆角、字体栈 | `assets/styles.css` 顶部 `:root` |
