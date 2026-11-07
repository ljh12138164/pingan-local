# 数据及实现来源

本项目为独立实现的 Windows 本地《阴阳师》数据工作台。全部功能由本项目独立编写，数据均来自游戏公开配置、公开社区接口或本机合法只读采集。

## 游戏配置与公开资料

- 网易[藏宝阁公共配置](https://cbg-yys.res.netease.com/js/game_auto_config.js)：套装、式神名称、两件套属性和契灵公开资料。`scripts/update-catalog.py` 更新 `src-tauri/data/catalog.json`。
- 网易藏宝阁[公开商品数据](https://yys.cbg.163.com)：用于公共快照转换和显示精度内的属性验证。
- 已登录游戏进程中的配置和角色数据：由 `game_memory.rs` 独立只读采集，`game_codec.rs` 解码。`equipment.json`、`hero-stats.json`、`upgrade.json` 只保留计算所需的配置事实，未附带账户密码或原厂私有代码。
- `growth.rs` 保留游戏配置中 1–60 级、1–6 星的生命 / 攻击 / 防御成长系数，仅为数值事实。
- 阵容公开资料：阵容页按用户主动刷新，从公开社区 [阴阳师阵容资料](https://yys-guide.online/teams) 的公开 GET /api/teams 获取展示字段。仅在本机缓存，不执行来源代码。
- 外观目录：`src/data/collections.json` 收录 ID、名称、类型和描述等公开资料事实。
- 契灵配置：`src/data/spirits.json` 解析网易公开 `game_auto_config.js` 的契灵资料生成。
- 技能数据：`src-tauri/data/skill-facts.json` 由 `scripts/build-skill-facts.mjs` 根据独立采集的 skill、dict_skill 与已有式神配置生成。

## 依赖与开源组件

- 开源依赖由 `package-lock.json` 与 `src-tauri/Cargo.lock` 锁定。
- 前端技术栈：React 19、TypeScript、Vite、Lucide 图标库与 Tauri API。
- Rust 技术栈：Tauri 2、rusqlite、serde、reqwest、windows-sys、chrono、rand。
- Android 读取组件：`src-tauri/reader/memory.c` 为本项目独立实现，仅读取指定游戏进程的 `/proc/PID/mem`，不执行游戏函数。使用 [Zig](https://ziglang.org/) 交叉编译为静态 x86_64 Linux 可执行文件，静态链接 musl；musl 许可全文附在 `src-tauri/reader/MUSL-COPYRIGHT`。运行时使用用户本机已安装模拟器的 ADB。
- 中文拼音匹配：使用 [pinyin-pro](https://github.com/zh-lx/pinyin-pro)（MIT），匹配仅在本机执行。
- Excel 导出：使用 [ExcelJS](https://github.com/exceljs/exceljs)（MIT），由本项目独立生成工作簿。
- 图片与长图导出：使用 HTML Canvas 本地绘制，[JSZip](https://stuk.github.io/jszip/)（MIT）打包。
- 百科题库：数据来自 [assttyys_autojs](https://github.com/zzliux/assttyys_autojs) 开源题库，按 MIT 许可使用，许可全文位于 `licenses/assttyys-questions-MIT.txt`。
