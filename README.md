# WuWa Companion

跨平台本地鸣潮助手，支持 Windows、macOS 和 Linux。当前版本可以按 UID 读取 WuWaBuilds 的公开 Build，展示五件声骸并进行通用输出试算。

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

- 已完成：UID/Profile 地址校验、WuWaBuilds 分页与详情读取、五件声骸归一化、本地缓存、通用输出试算。
- 下一步：角色专属国内评分配置、抽卡历史导入与保底分析。

完整方案见 [设计文档](docs/build-card-echo-scoring-design.md)。
