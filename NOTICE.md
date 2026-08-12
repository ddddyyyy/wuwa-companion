# 第三方评分口径说明

角色声骸评分的算法和全角色权重同步自：

- [WutheringWavesUID / WWUID](https://github.com/raared/WWUID)
- 算法文件：`WutheringWavesUID/utils/calculate.py`
- 角色配置：`WutheringWavesUID/utils/map/character/`
- 固定版本：`1d0ed3b7bc640cdf05b9320e5d514227549bf0c2`
- 绯雪配置：持续维护的 [XutheringWavesUID](https://github.com/Loping151/XutheringWavesUID) 公开评分资源

本项目按 GPL-3.0-only 分发，完整许可文本见 `LICENSE`。同步器只引入评分配置和许可文本，不引入机器人、图片识别或框架代码。

WuWaBuilds 仅作为公开 Build 数据来源，与本项目无隶属关系。

角色立绘与武器图片通过 WWUID 配套的公开素材仓库按需加载：

- [WutheringWaves_OverSea_StaticAssets](https://github.com/MoonShadow1976/WutheringWaves_OverSea_StaticAssets)

这些游戏素材的相关权利归原权利人所有；本项目不将素材打包进发行文件。

抽卡导入流程和卡池分类参考 MIT 许可的 [WuWa Local Tracker](https://github.com/dyar7474/WuWa_local_tracker)，本项目自行实现链接校验、官方接口代理、本地合并和页面展示，未复制其界面代码。
