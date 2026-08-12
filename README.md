# WuWa Companion

跨平台本地鸣潮助手，支持 Windows、macOS 和 Linux。当前版本可以按 UID 读取 WuWaBuilds 的公开 Build，展示五件声骸并按国内开源项目口径评分。

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

## 当前状态

- 已完成：UID/Profile 地址校验、WuWaBuilds 同步、五件声骸归一化、本地缓存、WWUID 口径评分引擎、爱弥斯专属配置。
- 下一步：继续补充角色专属配置、抽卡历史导入与保底分析。

评分参考与许可说明见 [NOTICE](NOTICE.md)。没有专属配置的角色不会套用通用分数。

完整方案见 [设计文档](docs/build-card-echo-scoring-design.md)。
