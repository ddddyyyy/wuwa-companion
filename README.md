# WuWa Companion

跨平台本地鸣潮助手，支持 Windows、macOS 和 Linux。可以读取 WuWaBuilds 公开 Build、按国内开源项目口径评分声骸，并嵌入 WuWa Tracker 查看抽卡分析。

要求：Node.js 20 或更新版本。

## 运行

```bash
npm start
```

然后打开 [http://127.0.0.1:4173](http://127.0.0.1:4173)。不需要安装 npm 依赖。

## 测试

```bash
npm test
```

## 抽卡分析

1. 在游戏内打开一次“唤取记录”。
2. 打开侧栏“抽卡分析”，应用会按当前系统自动读取并复制链接。
3. 把链接粘贴到嵌入的 WuWa Tracker 导入页。

链接中的临时令牌不会被本项目保存或上传；抽卡记录由 WuWa Tracker 管理。

## 当前状态

- 已完成：WuWaBuilds 同步、声骸评分、跨平台抽卡链接提取、WuWa Tracker 嵌入。

## 更新 WWUID 评分配置

评分配置固定在已审阅的上游 Commit。开发或发版时运行：

```bash
npm run sync:wwuid
```

普通用户启动应用时不会访问 GitHub。

评分参考与许可说明见 [NOTICE](NOTICE.md)。没有专属配置的角色不会套用通用分数。

完整方案见 [设计文档](docs/build-card-echo-scoring-design.md)。
