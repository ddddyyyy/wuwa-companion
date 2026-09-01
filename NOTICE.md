# 第三方评分口径说明

角色声骸评分算法和基础配置来自：

- [WutheringWavesUID / WWUID](https://github.com/raared/WWUID)
- 算法文件：`WutheringWavesUID/utils/calculate.py`
- 角色配置：`WutheringWavesUID/utils/map/character/`
- 固定版本：`1d0ed3b7bc640cdf05b9320e5d514227549bf0c2`

全部角色的当前权重、条件模板和新增角色配置由持续维护的 [XutheringWavesUID](https://github.com/Loping151/XutheringWavesUID) 公开评分资源覆盖更新；同步版本记录在 `wwuid-sync-report.json`。

本项目按 GPL-3.0-only 分发，完整许可文本见 `LICENSE`。同步器只引入评分配置和许可文本，不引入机器人、图片识别或框架代码。

WuWaBuilds 仅作为公开 Build 数据来源，与本项目无隶属关系。

角色立绘与武器图片通过 WWUID 配套的公开素材仓库按需加载：

- [WutheringWaves_OverSea_StaticAssets](https://github.com/MoonShadow1976/WutheringWaves_OverSea_StaticAssets)

这些游戏素材的相关权利归原权利人所有；本项目不将素材打包进发行文件。

macOS 声骸扫描器的界面坐标和遍历流程参考了 GPL-3.0 项目 [WuWa Inventory Kamera](https://github.com/wuwatracker/WuWa_Inventory_Kamera)，并使用 WWUID 的声骸名称、COST 和合鸣效果对照数据。本项目的 macOS 实现使用 ScreenCaptureKit、Vision 和 Core Graphics。

抽卡分析由 [WuWa Tracker](https://wuwatracker.com/zh-CN/tracker) 提供。本项目仅参考其 GPL-3.0 许可的公开导入脚本，从本机日志提取临时唤取链接，并将网站嵌入本地页面；不会保存或代为上传该链接。
