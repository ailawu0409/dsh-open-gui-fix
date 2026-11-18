# dsh-open-gui-fix

[English](README.md) | [简体中文](README.zh.md)

[GitHub](https://github.com/ailawu0409/dsh-open-gui-fix) · [Issues](https://github.com/ailawu0409/dsh-open-gui-fix/issues)

修复 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 **在应用中打开**（Open in）
菜单对 Electron 应用（VS Code、Cursor、Windsurf 等）失效的问题：点击 **用 VS Code 打开** 会正常弹出
应用窗口，而不是毫无反应。

> **非官方插件**：本项目与 DeepSeek 官方无隶属关系，也未获其认可。DSH 扩展 API 可能随版本变化。
>
> **版本说明**：`package.json` 中的版本（当前 `1.0.2`）是插件版本，不是 DSH 宿主版本。清单未声明宿主
> 版本约束，因此下文兼容性说明仅供参考。

## 为什么点了没反应

DSH 宿主进程带着 `ELECTRON_RUN_AS_NODE=1` 运行。open-in-app 的宿主实现会以「分离进程」方式启动目标
应用，并把经凭据清洗的继承环境交给它（剔除 `*KEY*`、`*PASSWORD*`、`*SECRET*`、`*TOKEN*` 与
`DSH_*` 名称，该开关仍会转发）；Electron 应用一旦拿到这个变量，就会以纯 Node 进程启动，不显示任何
窗口。整个过程不会报错——子进程直接就退出了。

## 插件做了什么

它只改写**分离式启动**（`detached`）那一次子进程的环境变量：

- 从该子进程环境的**浅拷贝**中删除这个变量；
- 调用方的环境对象和 `process.env` 本身都不被修改；
- 非分离启动（shell 工具、后台任务、语言服务器、MCP 服务、终端）拿到的环境与原来完全一致；
- 把可执行文件当作 Node 解释器使用的分离启动会**保留**这个变量：某个参数是指向磁盘上真实存在的
  JavaScript 脚本（GitHub Desktop 通过打包的 `cli.js` 启动，需要这个变量），或首个参数是
  `-e`、`--eval`、`--inspect` 这类 Node 解释器开关时，均属此列；
- 不写文件、不联网、不采集遥测数据。

## 安装

本仓库是私有本地包 `@local/gui-launch-env-fix`：按目录安装，不走包仓库。

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

### 更新

在同一个目录拉取新版本，然后重启 DSH：

```sh
git pull
```

DSH 链接的是插件目录；插件安装期间不要移动或删除该目录。

## 生效位置

插件没有自己的页面，它只对提供 **在应用中打开**（Open in ...）的菜单生效，例如工作区或目录上的
**用 VS Code 打开**。

## 兼容性

- 已在 DSH `0.2.2-rc.3` + Windows 桌面端验证。实现机制与平台无关，但 macOS 与 Linux 未验证。
- DSH 宿主运行时必须提供 `module.syncBuiltinESMExports`（当前 DSH 桌面端均提供）。缺少它时插件行会
  显式报错，而不是假装生效。
- 插件版本 `1.0.2` 与 DSH 宿主版本无关；`package.json` 未声明宿主版本约束。

## DSH 升级之后

运行自检脚本，它会报告当前安装是否仍然泄漏该变量，以及本插件拦截的启动形态是否还存在：

```sh
node tools/doctor.mjs
```

当 DSH 的包位于 `app.asar` 内时，脚本会自动改用 DSH 运行时重新执行自己；它从 DSH shell 读取
`DSH_INSTALL_DIR` 与 `DSH_NODE_EXECUTABLE`。自检是只读的：不会启动 DSH，也不会修改 profile。
它的结论会告诉你是继续保留插件、因为上游已修复而移除，还是因为启动实现变了而需要更新 `intercept.js`。

## 已知限制

- **不覆盖 DSH 终端**：在终端里运行 `code .` 仍会从 shell 继承该变量。本插件只修复 **在应用中打开**
  这条启动路径。
- 不处理 `spawnSync`、`exec`、`execFile`、`fork`；`fork` 本来就需要这个变量。
- 如果 DSH 日后自行从子进程环境中剔除该变量，本插件会变成无害的空转。

## 开发

当前开发环境为 Node.js `24.17.0`；`package.json` 未声明 `engines` 约束。项目没有第三方运行时依赖，
测试也不需要安装任何依赖；仓库没有 CI，请在本地运行完整测试。

### 测试

```sh
npm test                          # 运行三个测试文件
node test/intercept.test.mjs      # 单元测试（12 个）
node test/index.test.mjs          # 入口冒烟测试（1 个）
node test/integration.test.mjs    # 集成测试（4 个；需要 Windows cmd.exe）
npm pack --dry-run --json         # 检查实际发布内容
```

单元测试用 stub 的 `child_process` 覆盖环境删除、各种 spawn 形态、安装守卫与释放行为；入口冒烟测试
校验 `name` 导出与真实的 `ctx.effect` 接线。集成测试使用真实 `child_process` 与临时目录，验证 ESM
替换、detached 启动丢失变量、JavaScript 入口启动保留变量、普通子进程保留变量。集成测试依赖
Windows 的 `ComSpec`/`cmd.exe`。

架构、行为契约与升级检查见 [AGENT.md](AGENT.md)（仅仓库内）。

## 结构

| 文件 | 作用 | 随包发布 |
| --- | --- | --- |
| `index.js` | Host 插件入口：导出 `name`，在 `apply(ctx)` 中安装/释放拦截器 | ✓ |
| `intercept.js` | 核心实现：启动判断、环境清理、`spawn` 包装、幂等安装与释放 | ✓ |
| `cordis.patch.yml` | 向 DSH bundle 插入插件行 | ✓ |
| `locale/en.json`、`locale/zh.json` | 插件页标题与描述（英文 / 中文） | ✓ |
| `icon.svg` | 插件图标 | ✓ |
| `package.json` | 包导出、`dsh.bundle.patch`、`files` 清单与 `npm test` 脚本 | ✓（npm 自动带入） |
| `README.md`、`README.zh.md` | 用户文档（英文 / 中文） | ✓ |
| `CHANGELOG.md` | 版本记录 | ✓ |
| `LICENSE` | MIT 许可 | ✓ |
| `test/intercept.test.mjs` | 纯函数与 spawn 包装的单元测试（stub `child_process`） | — |
| `test/index.test.mjs` | 插件入口冒烟测试：`name` 导出与 `ctx.effect` 接线 | — |
| `test/integration.test.mjs` | 使用真实 `child_process` 的集成测试（Windows） | — |
| `tools/doctor.mjs` | DSH 升级后的只读自检脚本 | — |
| `AGENT.md` | 开发代理指南（中文） | — |
| `.gitignore` | 忽略 `node_modules/`、日志与系统文件 | — |

`npm pack --dry-run` 实际发布 11 个文件：`index.js`、`intercept.js`、`cordis.patch.yml`、
`locale/en.json`、`locale/zh.json`、`icon.svg`、`CHANGELOG.md`、`LICENSE`、`README.md`、
`README.zh.md` 与 `package.json`。`AGENT.md`、`test/`、`tools/` 与 `.gitignore` 只留在仓库中。

## 故障排查

- **插件行没有出现**：确认目录仍然存在，并在 **插件** 页把它添加为本地插件；本插件是本地包，不从
  包仓库获取。
- **点击后仍然没有反应**：确认插件行已启用；如果是替换已安装副本，请重启 DSH。然后运行
  `node tools/doctor.mjs`，按它的结论处理。
- **在 DSH 终端里运行 `code .` 仍无反应**：这是预期行为，插件只覆盖 **在应用中打开** 菜单
  （见「已知限制」）。
- **插件行提示缺少 `syncBuiltinESMExports`**：当前 DSH 运行时过旧或不受支持，请升级 DSH。

## 如何关闭

在 **插件** 页停用该行，或移除这个 bundle。原行为立即恢复：点击 **在应用中打开** 菜单里的 Electron
应用会再次没有可见反应。

## 许可证

[MIT](LICENSE)

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
