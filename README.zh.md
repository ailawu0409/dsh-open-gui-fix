# dsh-open-gui-fix

[English](README.md) | [简体中文](README.zh.md)

修复 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 **在应用中打开**（Open in）
菜单对 Electron 应用（VS Code、Cursor、Windsurf 等）失效的问题：点击 **用 VS Code 打开** 会正常弹出
应用窗口，而不是毫无反应。

## 为什么点了没反应

DSH 宿主进程带着 `ELECTRON_RUN_AS_NODE=1` 运行。open-in-app 的宿主实现会以「分离进程」方式启动目标
应用，并把继承来的环境变量一并传下去；Electron 应用一旦拿到这个变量，就会以纯 Node 进程启动，不显示
任何窗口。整个过程不会报错——子进程直接就退出了。

## 插件做了什么

它只改写**分离式启动**（`detached`）那一次子进程的环境变量：

- 从该子进程环境的**浅拷贝**中删除这个变量；
- 调用方的环境对象和 `process.env` 本身都不被修改；
- 非分离启动（shell 工具、后台任务、语言服务器、MCP 服务、终端）拿到的环境与原来完全一致；
- 把可执行文件当作 Node 解释器使用的分离启动会**保留**这个变量：某个参数是指向磁盘上真实存在的
  JavaScript 脚本（GitHub Desktop 通过打包的 `cli.js` 启动，需要这个变量），或首个参数是
  `-e`、`--eval`、`--inspect` 这类 Node 解释器开关时，均属此列。

## 安装

这是一个本地 DSH bundle：按目录安装，不走包仓库。

1. 把仓库克隆到一个固定位置——DSH 是链接该目录的，之后不要移动或删除：

   ```sh
   git clone https://github.com/ailawu0409/dsh-open-gui-fix.git
   ```

2. 在 DSH 里打开 **插件** 页，把该目录添加为本地插件；或在 agent 会话中安装：

   ```
   plugin_manager install_bundle target="<克隆目录的绝对路径>"
   ```

3. 在 **插件** 页确认出现 **外部应用打开修复**（英文界面为 **Open in app window fix**）这一行，
   然后对某个工作区点击 **用 VS Code 打开** 验证。

全新安装时启用该行立即生效；如果是替换已安装的副本，请重启 DSH，让宿主加载新的模块。

## 生效位置

插件没有自己的页面，它只对提供 **在应用中打开**（Open in ...）的菜单生效，例如工作区或目录上的
**用 VS Code 打开**。

## 环境要求

- DSH 宿主运行时需提供 `module.syncBuiltinESMExports`（当前各版本 Electron/Node 都有）。缺少它时
  插件会在插件页**显式报错**，而不是假装生效。
- 已在 DSH `0.2.2-rc.2` + Windows 桌面端验证。实现机制本身与平台无关，但 macOS 与 Linux 未做验证。

## DSH 升级之后

跑一次自检脚本，它会报告当前安装是否仍然泄漏该变量，以及本插件拦截的启动形态是否还存在：

```sh
node tools/doctor.mjs
```

当 DSH 的包位于 `app.asar` 内时，脚本会自动改用 DSH 运行时重新执行自己。它的结论会告诉你是继续保留
插件、因为上游已修复而移除，还是因为启动实现变了而需要更新 `intercept.js`。

## 已知限制

- **不覆盖 DSH 终端**：在终端里运行 `code .` 仍会从 shell 继承该变量。本插件只修复 **在应用中打开**
  这条启动路径。
- 不处理 `spawnSync`、`exec`、`execFile`、`fork`；`fork` 本来就需要这个变量。
- 如果 DSH 日后自行从子进程环境中剔除该变量，本插件会变成无害的空转。

## 测试

```sh
node test/intercept.test.mjs
node test/integration.test.mjs
```

集成测试会在临时目录里启动一个有超时上限的探针，断言「分离启动丢失该变量」且「以 JavaScript 入口
启动保留该变量」，结束后清理临时文件。

## 如何关闭

在 **插件** 页停用该行，或移除这个 bundle。原行为立即恢复：点击 **在应用中打开** 菜单里的 Electron
应用会再次没有可见反应。

## 许可证

[MIT](LICENSE)

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
