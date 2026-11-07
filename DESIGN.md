---
name: 平安手札
description: 以夜庭为默认主题的中文本地数据工具，用浅蓝强调、细线和庭院面板组织真实档案。
colors:
  primary: "#aac0ff"
  primary-hover: "#c3d1ff"
  primary-ink: "#152141"
  ink: "#edf0f7"
  muted: "#b2b9c8"
  background: "#15171c"
  surface: "#1f2229"
  surface-alt: "#272b34"
  line: "#3b4353"
  sidebar: "#191c22"
  control-hover: "#2e3440"
  control-hover-line: "#78839a"
  nav-active: "#303847"
  nav-hover: "#2a303b"
  badge: "#303b55"
  disabled-bg: "#292e38"
  disabled-text: "#9ba5b8"
  success-bg: "#234037"
  success-text: "#a7dfc1"
  warning-bg: "#393126"
  warning-text: "#f0d49e"
  focus-ring: "#8fa8e4"
  light-primary: "#355bb5"
  light-primary-hover: "#294b9d"
  light-ink: "#202736"
  light-muted: "#566278"
  light-background: "#f5f6f9"
  light-surface: "#fff"
  light-surface-alt: "#f0f3f8"
  light-line: "#e3e7ef"
  light-sidebar: "#eef1f6"
  light-control-line: "#d8deea"
  light-control-text: "#34445e"
  light-nav-active: "#dce5f5"
  light-nav-active-text: "#284fa6"
  light-badge: "#eff2f7"
  light-success-bg: "#e9f3ee"
  light-success-text: "#23664f"
  light-warning-bg: "#fff4de"
  light-warning-text: "#795114"
typography:
  display:
    fontFamily: '"KaiTi", "STKaiti", "FangSong", serif'
    fontSize: "38px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.12em"
  headline:
    fontFamily: '"Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", sans-serif'
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "-0.02em"
  title:
    fontFamily: '"Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", sans-serif'
    fontSize: "16px"
    fontWeight: 650
    lineHeight: 1.5
  courtyard-title:
    fontFamily: '"Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", sans-serif'
    fontSize: "17px"
    fontWeight: 650
    lineHeight: 1.5
  body:
    fontFamily: '"Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", sans-serif'
    fontSize: "14px"
    lineHeight: 1.65
  label:
    fontFamily: '"Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", sans-serif'
    fontSize: "12px"
    lineHeight: 1.65
  button:
    fontFamily: '"Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", sans-serif'
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.5
  table:
    fontFamily: '"Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", sans-serif'
    fontSize: "12px"
    lineHeight: 1.6
  count:
    fontFamily: 'Georgia, "Times New Roman", serif'
    fontSize: "35px"
    fontWeight: 400
    lineHeight: 1.25
  identifier:
    fontFamily: "Consolas, monospace"
    fontSize: "12px"
rounded:
  sm: "6px"
  md: "12px"
  courtyard: "16px"
  badge: "4px"
  nav: "7px"
  theme: "28px"
  theme-option: "22px"
  avatar: "50%"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  courtyard-gap: "20px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: "7px 14px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: "7px 14px"
  button-text:
    textColor: "{colors.primary}"
    typography: "{typography.button}"
    padding: "4px 0"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "8px 10px"
  navigation-active:
    backgroundColor: "{colors.nav-active}"
    textColor: "{colors.primary}"
    rounded: "{rounded.nav}"
    padding: "9px 15px"
  badge:
    backgroundColor: "{colors.badge}"
    textColor: "{colors.primary}"
    rounded: "{rounded.badge}"
    padding: "2px 8px"
  sheet:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
  courtyard-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.courtyard}"
    padding: "23px 24px 0"
  courtyard-count:
    textColor: "{colors.primary}"
    typography: "{typography.count}"
    rounded: "{rounded.md}"
    padding: "15px 10px"
  theme-switch:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.theme}"
    padding: "4px"
  table:
    typography: "{typography.table}"
---

# Design System: 平安手札

## Overview

**Creative North Star: "庭中有信"**

平安手札采用安静的夜庭底色、浅蓝强调与细线分隔。左侧网格导航保留工具的定位感，右侧以真实角色档案和结界计时为首页主体；书法标题、轻微倾斜的文字印记和衬线数量为数据界面增加中文庭院气质。晴庭保留为可切换的浅色主题。

这是用于读取、检查、计算与管理本地数据的操作界面。视觉层级服务于角色、库存、计时和结果，未知值明确标注，历史预览与当前档案区分。整体氛围由系统字体、CSS 与线性图标独立表达。

**Key Characteristics:**

- 默认夜庭，保留晴庭；浅蓝承接操作、选择与关键数值。
- 网格侧栏、连续工作区、细边框与无阴影的庭院面板。
- 首页书法标题与衬线统计，数据工具保持清晰的中文无衬线文字。
- 真实档案、更新时间、未知状态和计算限制均有明确文字。

## Colors

前置信息记录实际 CSS 值；无前缀颜色对应夜庭，`light-` 颜色对应晴庭。主题由同一组语义 CSS 变量切换，新增页面应跟随当前主题。

### Primary

- **月蓝**（`primary`）：主操作、链接、当前导航、资源数量和计时。
- **亮月蓝**（`primary-hover`）：主按钮悬停；主按钮的深墨文字使用 `primary-ink`。
- **蓝灰选择面**（`nav-active`）与**深蓝标签面**（`badge`）：承接当前导航与普通状态标签。当前位置还带活动短线和字重变化。
- **焦点蓝**（`focus-ring`）：现有键盘焦点轮廓；不是只改变文字颜色。
- **晴庭工作台蓝**（`light-primary` / `light-primary-hover`）：浅色主题中的对应操作色。

### Neutral

- **夜庭底**（`background`）、**深灰面板**（`surface`）和**抬高灰面**（`surface-alt`）：依次承接工作区、面板、表头及局部控件区域。
- **侧栏夜灰**（`sidebar`）：配低对比网格，只用于导航区域。
- **月白正文**（`ink`）、**灰蓝说明**（`muted`）和**石灰边线**（`line`）：区分内容、辅助信息和结构。
- **控件悬停灰**（`control-hover`）与边线（`control-hover-line`）：表达鼠标状态；禁用态使用独立的低强调面和文字。
- 晴庭以浅灰底、白色面板、深墨正文和灰蓝说明对应同一层级。主题结构相同，背景和文字成组切换。

### Semantic States

- **温绿**（`success-bg` / `success-text`）：达标、读取成功等肯定状态。
- **暖琥珀**（`warning-bg` / `warning-text`）：演示、缺口、未配置和需要理解的限制。晴庭保留对应浅色状态面。

**The Explicit State Rule.** 状态必须同时有文字；演示、未知、达标、缺口和历史预览不能仅靠颜色区分。

## Typography

**Display Font:** KaiTi，回退 STKaiti、FangSong、serif，仅用于首页“庭中有信”。
**Body Font:** Microsoft YaHei UI，回退 PingFang SC、Noto Sans CJK SC、sans-serif。
**Label/Mono Font:** 标签沿用正文字体，标识符与 JSON 使用 Consolas、monospace。

中文无衬线承担操作与密集数据，书法展示字只在庭院标题建立情境。库存和式神总数使用 Georgia、Times New Roman、serif，与资源和计时的无衬线数值分工。

### Hierarchy

- **Display**：前置信息的 `display`；窄屏缩为 34px。标题旁印记为 12px，印记倾斜 5 度。
- **Headline**：一般页面标题使用 `headline`；窄屏为 23px。
- **Title**：一般区块为 `title`，庭院面板标题为 `courtyard-title`；角色名为 28px、650 字重，寮名称为 20px。
- **Body / Label**：基础正文为 `body`；说明常用 13px，表单标签及表格为 12px，时间、记录编号等元信息为 11px。
- **Count**：首页库存和式神总数使用 `count`，窄屏为 30px；资源为 18px、650 字重，在紧凑桌面和手机分别缩为 16px、15px。
- **Identifier**：长标识符可换行；需要比较的数值使用等宽数字。

**The Aligned Numbers Rule.** 比较数值时使用等宽数字和右对齐；单位与状态文字保持独立可读。

## Layout

应用外壳占满视口，侧栏、顶栏与可滚动的右侧工作区分开。桌面侧栏为 240px，带 40px 网格；一般顶栏为 60px，首页简化为 46px。工作区左右间距为 32px，内容最大宽度为 1440px 并居中。首页以标题和操作、主题与档案工具条、状态说明、面板网格依次排列。

首页默认两列等宽面板，列间距为 20px；第一行是游戏档案与结界卡计时，下方接本地待办与寮情报，工具展柜跨两列。这个顺序是可保存的首页布局，不是全站强制模板。面板常规内边距为上 23px、左右 24px，标题下方细线，底部信息通过自动留白对齐。

工具页面保留密集表格、筛选和条件表单。计算页条件栏为 340px 加弹性结果区；数据读取为内容区加 255px 说明栏。库存与计算结果表分别保留 770px、620px 最小宽度，外层横向滚动。

- **1600px 及以上**：首页左右间距为 38px，面板左右内边距为 28px；计算条件栏为 360px。
- **1150px 及以下**：侧栏为 218px，工作区左右间距为 22px；计算条件栏为 300px，读取说明栏为 215px。
- **701–960px**：侧栏折为 72px 图标导航，保留名称提示；普通顶栏为 55px。
- **950px 及以下**：庭院面板改为一列，工具展柜取消跨列，快捷入口保留两列。
- **700px 及以下**：侧栏为 245px 抽屉；工作区左右间距为 14px。首页顶栏为 52px，标题与操作上下排列，档案工具条换行，庭院面板内边距为上 20px、左右 18px。计算和读取页为单列，表格保留滚动。

## Elevation & Depth

常态层级由深浅表面、细边线和留白建立。庭院面板不加阴影；侧栏网格保持低对比，工作区不铺设网格。浮动选择器和反馈使用少量阴影，移动导航有遮罩表达临时层。

### Shadow Vocabulary

- **选择弹层**（`0 8px 32px #233d692e, 0 2px 7px #233d691c`）：固定定位的式神搜索弹层。
- **浮动反馈**（`0 8px 26px #263b5733`）：底部 toast。

## Shapes

控件小圆角、普通内容中圆角、庭院面板大圆角，具体值见前置信息。主题切换器采用胶囊轮廓，内部选项有独立圆角；角色标识是 72px 圆形边框和线性指纹图标。品牌字块和庭院文字印记轻微倾斜，但不将倾斜用于输入、表格或一般操作区。

细实线维持导航、面板和表格的结构，连续表格行不拆为独立卡片。首页计数链接为内嵌边框块，借字号和浅蓝强调信息。

## Components

### Buttons

紧凑、明确的中文操作。夜庭主按钮为浅蓝面和深墨字，次按钮为深灰面及细边框，文字按钮为浅蓝字。一般最小高度 38px；首页标题操作为 42px，手机为 38px。悬停改变背景和边线，焦点轮廓为 3px、偏移 3px；普通按钮背景与边线过渡为 150ms。

### Inputs / Fields

输入、选择器和文本域跟随主题表面及正文色，常规最小高度 38px、上下 8px 和左右 10px 内边距。标签常在输入上方，相距 6px。搜索容器提供整体焦点环。档案选择器与历史选择器并列，窄屏换行。

式神选择器为可搜索浮层，支持名称、拼音、首字母与编号；同名记录带培养与编号信息。键盘方向键、Enter、Esc 与焦点返回保持可用，空结果不能误选。

### Navigation

分组中文导航、线性 SVG 图标和当前页标记。桌面导航行至少 42px，文字 14px；活动项使用选择面、浅蓝字、650 字重及 3px 左侧短线。分组可以折叠，手机抽屉有打开、关闭与遮罩；关闭抽屉和打开时的主内容通过 inert 控制交互范围。

### Chips

普通标签为低强调蓝灰面，成功与提示各有颜色和文字。等级、数量和状态标签保留紧凑尺寸，不能仅以颜色传达结果。

### Cards / Containers

工具页容器使用普通圆角与细线，庭院面板使用 `courtyard-panel`。庭院面板的标题、内容和底部记录关系明确；内嵌计数是可点击链接，悬停切换到较高表面。角色资料、结界计时、待办、寮信息和工具展柜共享这一容器语言。

### Courtyard Controls and Records

夜庭 / 晴庭使用带 `aria-pressed` 的分段主题按钮。庭院装修面板通过复选框与上移、下移按钮调整首页模块，再显式保存。公共“数据版本”选择器将当前角色各页的数据、计算和导出统一到所选历史快照；其他角色、评分标准和本地偏好仍使用当前记录，并在版本提示中说明。历史预览为只读，不恢复或覆盖当前档案，暂停修改、游戏读取和提醒；加载失败保留先前版本，返回当前、切换角色或重启会清除预览。

档案面板底部标注档案更新时间，结界卡区域另行标注缓存读取时间，不将两者混称。结界计时保留卡片名、倒计时、结束时间和奖励。到期提醒为应用内提醒，程序需保持打开；文案直接说明这一限制。没有读取到的资源和寮信息显示未知或读取提示。

### Tables and Results

表格保持连续行、轻分隔、悬停与选中态；夜庭表头采用较高表面。数值列等宽、右对齐，主体常用 12px。式神表行内上下间距为 10px，工具结果保留状态、公式、搜索范围及明细。配装页签分开整套与单件提升，折叠条件保留摘要。

### Feedback and Motion

持久说明使用边框提示或语义提示面；完成、错误使用 toast。读取进度展示真实耗时，不能伪造百分比。导航抽屉为 200ms ease-out，分组箭头为 180ms ease-out，表格行背景为 120ms ease-out，旋转加载图标为 1s 线性循环。减少动态效果偏好禁用动画、过渡及平滑滚动。

## Do's and Don'ts

### Do:

- **Do** 以夜庭为默认视觉，使用同一组语义变量支持晴庭。
- **Do** 保留庭院标题的中文气质，同时让表单、表格和关键操作清晰可读。
- **Do** 用细边框、色面、留白和对齐组织层级，并保留键盘焦点。
- **Do** 明确标注演示、未知、更新时间、历史预览和计算范围。
- **Do** 保留窄屏换行、抽屉导航、表格滚动及减少动态效果支持。

### Don't:

- **Don't** 用只有色彩的状态替代达标、缺口或演示说明。
- **Don't** 为所有面板增加阴影，或把侧栏网格铺满工作区。
- **Don't** 将首页书法字和统计衬线字扩散到表单、表格和所有页面标题。
- **Don't** 将历史预览、应用内提醒或缓存读取写成更广的功能承诺。
- **Don't** 引入非授权专有资产。
