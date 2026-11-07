# 平安手札
<!-- impeccable:product-schema 1 -->

## Platform
web

Windows 桌面应用，界面由 Tauri 的 WebView2 承载。

## Stack
用户指定：Tauri 2 + React + TypeScript + Rust + SQLite。

## Users
在自己的电脑上整理《阴阳师》角色、御魂和游戏资料的玩家。

## Product Purpose
Windows 本地《阴阳师》数据工作台，尽可能本地运行，无应用登录或会员系统。

## Operating Context
Windows 本地版，中文数据工作台布局，提供明确标记的演示数据。

## Capabilities and Constraints
- 全部独立实现，本地运行。
- 本地数据导入、档案、御魂评分、基础面板和配装、模拟、式神、碎片、资产、任务、寮管理。
- Windows x64 和 MuMu x86_64 游戏内存只读采集已实机验证；支持真实寮成员缓存、结界 / 寄养计时和独立本机只读 API。ARM 模拟器、完整技能及四件套伤害机制仍需适配，不能伪装成已经完成。
- 默认空库存；演示数据必须由用户主动创建，不能冒充真实角色。

## Evidence on Hand
官方公开功能说明；MuMu 独立只读采集的 6,454 件御魂、2,268 条式神、3,323 项资源与 112 位寮成员；公开藏宝阁样本。6,450 枚御魂、2,268 条式神面板、142 项碎片及结界 / 寄养时间均已实测通过。

## Product Principles
- 计算结果解释假设及搜索范围。
- 数据保存在本机。
- 无数据、失败和未适配状态都给出明确的下一步。
