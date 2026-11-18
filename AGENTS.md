# AGENTS.md

本文件面向在本仓库中工作的编码代理，适用于整个项目。本文件使用 `AGENTS.md` 这一标准文件名，DSH 会自动把它作为工作区指令加载。本文件本身就是中文版本，仓库内没有单独的英文版；面向用户的文档是英文 `README.md` 与中文 `README.zh.md`。

## 项目概述

`@local/gui-launch-env-fix`（仓库名 `dsh-open-gui-fix`）是一个非官方、本地安装的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) bundle 插件。它修复 DSH 的 **Open in ... / 在应用中打开** 菜单：点击 VS Code、Cursor、Windsurf 等 Electron 应用后，应用应弹出窗口，而不是毫无反应。

根因是 DSH 宿主进程以 `ELECTRON_RUN_AS_NODE=1` 运行，而 open-in-app 的宿主实现以 detached 方式启动外部应用，并把经凭据清洗的继承环境（剔除凭据形态变量与 `DSH_*`，该开关仍会转发）交给它；Electron 应用拿到该变量后以纯 Node 进程运行，不显示窗口。插件只在 `child_process.spawn` 这一层拦截 **detached** 启动，从交给子进程的环境副本中移除该变量，不修改 DSH 自身环境。

命名对照：

| 位置 | 名称 |
| --- | --- |
| 仓库 | `dsh-open-gui-fix` |
| npm 包 | `@local/gui-launch-env-fix` |
| Cordis 插件 `name` | `gui-launch-env-fix` |
| `cordis.patch.yml` 行 id | `gui-launch-env-fix` |
| 插件页标题 | `Open in app window fix` / `外部应用打开修复` |

## 当前基线

| 项目 | 当前情况 |
| --- | --- |
| npm 包名 / 版本 | `@local/gui-launch-env-fix` / `1.0.3`（插件版本，与宿主版本无关） |
| 已验证宿主 | DSH `0.2.2-rc.3`，Windows Desktop；macOS 与 Linux 未验证 |
| 测试 | 13 个单元测试 + 4 个集成测试，`npm test` 全部通过 |
| 发布内容 | `npm pack --dry-run` 为 11 个文件；`AGENTS.md`、`test/`、`tools/` 不发布 |
| 运行时依赖 / CI | 无第三方依赖、无构建步骤、无 CI |

## 技术约束

- 纯 Node.js ES Modules，无构建步骤、无运行时或开发依赖；不要引入 TypeScript、打包器、linter 或 formatter。
- 插件由 DSH 宿主以 Cordis function plugin 形式加载：`index.js` 只负责导出 `name` 与 `apply(ctx)`。
- 必须依赖 `module.syncBuiltinESMExports()` 让 ESM 导入方看到被替换的 `child_process.spawn`；缺少它时插件安装应显式抛错，而不是静默失效。
- 只 patch `child_process.spawn`；不要 patch `spawnSync`、`exec`、`execFile`、`fork`，`fork` 需要该变量。
- 永远不修改 `process.env`；只处理某一次 detached 子进程的环境浅拷贝。
- 项目没有 CI；完整测试（含集成测试）需在本地 Windows 环境运行（依赖 `cmd.exe`）。
- 文档与代码中的注释使用英文；仓库用户文档保持英文 `README.md` 与中文 `README.zh.md` 双语同步。

## 目录与职责

| 路径 | 职责 | 随 npm 包发布 |
| --- | --- | --- |
| `index.js` | Host 插件入口：导出 `name`，在 `apply(ctx)` 中用 `ctx.effect` 安装/释放拦截器 | ✓ |
| `intercept.js` | 核心实现：判断、环境清理、`spawn` 包装、幂等安装与释放 | ✓ |
| `cordis.patch.yml` | 向 DSH bundle 插入插件行 | ✓ |
| `locale/en.json`、`locale/zh.json` | 插件页标题与描述（中英文） | ✓ |
| `icon.svg` | 插件图标 | ✓ |
| `package.json` | 包导出、`dsh.bundle.patch`、`files` 白名单与 `npm test` | ✓（npm 自动带入） |
| `README.md`、`README.zh.md` | 功能、安装、兼容性、开发、结构与自检说明（英文 / 中文） | ✓ |
| `CHANGELOG.md` | 版本记录 | ✓ |
| `LICENSE` | MIT 许可 | ✓ |
| `test/intercept.test.mjs` | 纯函数与 spawn 包装的单元测试（stub） | — |
| `test/index.test.mjs` | 插件入口冒烟测试：`name` 与 `ctx.effect` 接线 | — |
| `test/integration.test.mjs` | 真实 `child_process` 的集成测试（Windows） | — |
| `tools/doctor.mjs` | DSH 升级后的只读自检脚本 | — |
| `AGENTS.md` | 本文件：开发代理指南 | — |
| `.gitignore` | 忽略 `node_modules/`、日志与系统文件 | — |

`npm pack --dry-run` 当前发布 11 个文件。`package.json` 的 `files` 是白名单：新增运行时文件（例如新的 `.js` 模块或 locale 文件）必须加入该清单，否则安装后会在宿主里缺文件；测试、`tools/` 与 `AGENTS.md` 不得加入。

## 工作原理

```text
DSH 宿主进程（ELECTRON_RUN_AS_NODE=1）
  └─ open-in-app 宿主端
       └─ child_process.spawn(app, argv, { detached: true, env })
            └─ 本插件拦截器：detached 且不是 Node 解释器启动？
                 ├─ 是 → 复制 env，删除 ELECTRON_RUN_AS_NODE，再调用原 spawn
                 └─ 否 → 原样调用原 spawn
                      └─ Electron 应用获得正常环境并显示窗口
```

1. `index.js` 的 `apply(ctx)` 通过 `ctx.effect(() => installSpawnInterceptor(...), label)` 安装拦截器；插件行销毁时自动执行 disposer。
2. `installSpawnInterceptor` 保存原始 `childProcess.spawn`，用包装函数替换它，再调用 `syncBuiltinESMExports()`，让 `import { spawn } from 'node:child_process'` 的 ESM 导入方（包括打包后的 open-in-app）看到新函数。
3. 每次 `spawn` 调用：
   - 只有 `options.detached === true` 才处理；
   - 如果 `keepsRunAsNode(argv)` 为真（把可执行文件当 Node 解释器使用），完全不动环境；
   - 否则取 `options.env ?? process.env` 作为来源，调用 `stripRunAsNode`；只有真的删了键才构造 `{ ...options, env: sanitized }`，并以原参数形态调用原始 `spawn`；
   - 没有可删除的键时，传入的 options 对象保持原引用，调用参数完全不变。
4. 插件释放时，仅当 `childProcess.spawn` 仍是自己安装的包装器，才恢复原始函数并再次 `syncBuiltinESMExports()`。

## 关键设计决策

- 只拦截 `child_process.spawn`：open-in-app 的启动路径最终走 `spawn`。`spawnSync`、`exec`、`execFile` 与 `fork` 不经过这里；`fork` 还需要该变量。
- 只处理 `detached === true`：DSH 自己的 shell 工具、语言服务器、MCP 服务和终端都是非分离启动，必须拿到原环境；把修改限制在 detached 启动可避免全局副作用。
- 改写环境浅拷贝而不动 `process.env`：宿主自身依赖 `ELECTRON_RUN_AS_NODE=1` 运行，修改全局环境会破坏宿主；每个子进程只拿到自己的副本。
- 保留 Node 解释器启动：某些 Electron 应用（如 GitHub Desktop）通过自带 `cli.js` 以 Node 模式运行，删除变量会直接破坏它们；因此用“磁盘上真实存在的 JS 文件”与首参数 Node 开关识别这类启动。
- `syncBuiltinESMExports` 不能省略：ESM 的 `import { spawn }` 是活绑定，单纯替换 CommonJS exports 不会让 open-in-app 的 ESM bundle 看到；安装和释放后都要同步。
- `Symbol.for` 标记用于跨模块代际幂等：插件重载会创建新的模块实例，模块级变量无法阻止重复包装；标记挂在包装函数上即可跨代际识别。

## 行为契约

修改 `intercept.js` 时必须保持以下行为；任何一条变化都要同步更新测试与 README。

### `stripRunAsNode(env)`

- 名称匹配大小写不敏感（`ELECTRON_RUN_AS_NODE`、`electron_run_as_node` 等都会被删除）。
- 返回新的浅拷贝；调用方的 `env` 对象与 `process.env` 不被修改。
- 没有该变量时返回原对象本身（包括 `undefined` 和 `null`），以便上层判断“无需改动”。
- 不要做深拷贝：环境值都是字符串，浅拷贝足够；深拷贝没有必要。

### `keepsRunAsNode(args)`

- 任一参数是以 `.js`、`.cjs` 或 `.mjs` 结尾且 `statSync` 确认为文件的路径时返回 `true`。
- 首个参数匹配 `NODE_SWITCH` 时返回 `true`：`-e`/`-p`/`-i`/`-r` 及其组合，以及 `--eval`、`--print`、`--inspect`、`--inspect-brk`、`--require`、`--import`、`--loader`、`--input-type`、`--enable-source-maps`、`--experimental-*` 等。
- 目录、不存在的 `.js` 路径、普通文件（如 `.txt`）和普通应用参数返回 `false`。
- 这个函数决定 GitHub Desktop 这类通过打包 `cli.js` 启动的应用是否保留变量；不要为了“简单”去掉文件存在性检查。

### `installSpawnInterceptor({ childProcess, syncBuiltinESMExports })`

- `syncBuiltinESMExports` 不是函数时抛 `TypeError`；`childProcess.spawn` 不是函数时也抛 `TypeError`。
- 在包装函数上保存 `Symbol.for('dsh.gui-launch-env-fix.interceptor')` 标记；重复安装返回空 disposer，避免模块重载后二次包装。
- 返回的 disposer 只在当前 `childProcess.spawn` 仍是本次安装的包装器时恢复原函数；否则什么都不做，避免覆盖别人的 patch。

### `spawn` 包装器

- 同时支持 `spawn(command, options)` 和 `spawn(command, argv, options)`；调用原始函数时参数个数与形态保持一致。
- 只在 `options` 是普通对象且 `detached === true` 时处理；`false`、`undefined` 以及非对象参数原样透传。
- 保留 `stdio`、`cwd`、`windowsHide` 等其他 options 字段不变。
- 任何拦截器内部异常都必须被吞掉并回退到 `Reflect.apply(original, this, [command, ...rest])`；启动流程不能因本插件失败而中断。
- 不要在包装器里记录环境变量内容或做网络请求。

## 宿主接入与打包

- `cordis.patch.yml` 通过 `insert` 添加：

  ```yaml
  - insert:
      - id: gui-launch-env-fix
        name: '@local/gui-launch-env-fix'
  ```

- `locale/en.json` 与 `locale/zh.json` 的 `meta.title` / `meta.description` 是插件页用户可见文案；行为、限制或安装说明变化时要同步更新两种语言。
- `package.json` 的关键字段：`"type": "module"`、`"exports"`（`.` → `./index.js`，`./locale/*.json`，`./icon`）、`"dsh.bundle.patch": "./cordis.patch.yml"`、`"files"` 白名单和 `"scripts.test"`。
- 安装方式是按目录安装的本地方案，DSH 会链接该目录：克隆位置要固定，不要移动或删除；用 `plugin_manager install_bundle target="<绝对路径>"` 安装。
- 全新启用插件行立即生效；替换已安装副本后需要重启 DSH，让宿主重新加载模块。
- 插件没有自己的页面，只对 **Open in ... / 在应用中打开** 菜单生效。

## 常用命令

```sh
npm test                          # node test/intercept.test.mjs && node test/index.test.mjs && node test/integration.test.mjs
node test/intercept.test.mjs      # 仅单元测试
node test/index.test.mjs          # 仅入口冒烟测试
node test/integration.test.mjs    # 仅集成测试（需要 Windows cmd.exe）
node tools/doctor.mjs             # DSH 升级后的只读自检
npm pack --dry-run --json         # 检查实际发布内容（应为 11 个文件）
```

项目没有依赖，不需要 `npm install`。当前开发环境为 Node `24.17.0`，`package.json` 未声明 `engines`；集成测试依赖 `process.env.ComSpec ?? 'cmd.exe'`，在非 Windows 环境会失败。

## 开发循环

1. 修改 `index.js`、`intercept.js` 或文档。
2. 运行 `npm test`；只改文档时也至少确认测试基线不变。
3. 若本机 DSH 已安装该插件的旧副本，重启 DSH 让宿主重新加载模块（本地 bundle 是按目录链接的）。
4. 在 DSH 中打开 **Plugins** 确认插件行已启用，然后对工作区点击 **Open in VS Code**；DSH 终端里运行 `code .` 不是有效验证路径（终端不在修复范围）。
5. 若仍然无效，运行 `node tools/doctor.mjs` 并按「DSH 升级之后」的 verdict 处理。

## 测试策略

- `test/intercept.test.mjs`：使用 stub 的 `child_process`，覆盖环境删除（含大小写与不修改原对象）、`keepsRunAsNode` 的各种形态、detached 环境改写（含 `options.env` 缺省时回退 `process.env`）、双参数调用形态、其他 spawn 形态、拦截异常回退、安装守卫的显式报错、安装幂等、他人 patch 不被 disposer 覆盖与 dispose 恢复。共 12 个测试。
- `test/index.test.mjs`：导入真实 `index.js`，用假 `ctx` 捕获 `ctx.effect`，验证 `name` 导出、回调注册、拦截器安装与释放。共 1 个测试。
- `test/integration.test.mjs`：使用真实 `node:child_process` 与 ESM 具名导入，验证替换能被 ESM 导入方看到、detached 启动丢失变量、带 JavaScript 入口的 detached 启动保留变量、普通子进程保留变量。探针写入临时目录，`waitForReport` 有 15 秒上限，结束时清理。共 4 个测试。
- 新增或修改行为必须补充对应测试；不要只改断言来掩盖回归。测试不得读取或依赖开发者真实会话数据。

## DSH 升级之后

每次 DSH 升级后运行：

```sh
node tools/doctor.mjs
```

脚本依赖 DSH shell 中的 `DSH_INSTALL_DIR`；若由普通 Node 启动且存在 `DSH_NODE_EXECUTABLE`，它会用 DSH 运行时重新执行自己，以读取 `app.asar` 内的包。它只读，不启动 DSH、不修改 profile、不启动应用。

三种结论：

1. 输出 `scrub still forwards ELECTRON_RUN_AS_NODE : no`（`Verdict: upstream no longer forwards the switch at the scrub layer.`）：上游已修复，本插件变成无害空转，可停用或移除。
2. 输出 `Verdict: the leak and the intercepted launch shape are both still here.`：继续保留；若升级后 Open in 失效，再对照 `intercept.js` 的谓词检查安装的 open-in-app 代码。
3. 输出 `Verdict: the launch shape changed, so the interceptor may not match any more.`：拦截器可能已不匹配，先阅读安装目录中的 `@deepseek-ai/dsh-host-open-in-app` 与 `@deepseek-ai/dsh-subprocess`，再更新 `intercept.js` 与测试。

doctor 的检查是静态启发式（正则匹配 `detached`、`from "node:child_process"`、`scrubbedParentEnv`），打包格式变化可能造成误报或漏报；结论异常时以实际安装代码为准。

DSH 升级验证通过后，更新 `README.md` / `README.zh.md` 的兼容版本说明、在 `CHANGELOG.md` 增加记录，并视情况提升 `package.json` 版本号。

## 开发规范

- 优先小而集中的修改，保持现有代码风格：2 空格缩进、单引号、无分号、英文 JSDoc 注释、函数保持单一职责。
- 行为变化时同步更新：相关测试、`locale/en.json` 与 `locale/zh.json`（如果用户可见文案变化）、`CHANGELOG.md` 与版本号。
- `README.md` 与 `README.zh.md` 是用户文档，必须逐节对应、事实与数字一致；任何用户可见的行为、安装方式、兼容性或限制变化都要同步更新两份 README。
- `AGENTS.md` 是仓库内开发指南，不随 npm 包发布；行为契约、测试命令、目录职责或发布清单变化时同步更新本文件。
- 不引入第三方运行时依赖；不添加构建工具、格式化工具或无关重构。
- 不修改 `process.env`，不在日志中输出环境变量值；插件不应联网。
- 保持 README 中已知限制的表述准确：DSH 终端不在覆盖范围（终端里 `code .` 仍继承变量）；只 patch `spawn`；上游自行清洗后插件为空转。

## 常见陷阱

- **忘记 `syncBuiltinESMExports`**：直接替换 `childProcess.spawn` 后，ESM 导入方仍持有旧绑定，插件看起来完全无效。安装与释放后都要调用。
- **丢掉跨模块代际标记**：`Symbol.for('dsh.gui-launch-env-fix.interceptor')` 必须挂在包装函数上；模块重载后模块级变量会重置，没有标记就会重复包装。
- **把应用参数误判成 Node 开关**：只匹配明确的 Node 解释器开关；例如窗口管理器的 `-d`、shell 的 `--cd=...` 属于应用自身 argv。
- **只按后缀判断脚本**：`.js` 字符串可能不存在；必须 `statSync` 确认是文件，否则 GitHub Desktop 等启动会误保留变量。
- **假定 `options.env` 一定存在**：open-in-app 可能不传 `env`，此时要从 `process.env` 复制；但绝不能写回 `process.env`。
- **让拦截器异常冒泡**：任何判断失败都必须回退原始调用；启动失败比环境变量泄漏更严重。
- **改变 `files` 白名单**：把 `AGENTS.md`、测试或 `tools/` 加进去会污染发布包；新增运行时文件则必须加。

## 验证清单

完成修改前逐项检查：

1. `npm test` 全部通过（13 个单元 + 4 个集成），新增行为有对应测试。
2. 用户可见文案中英文一致，两份 README 的章节、限制与兼容版本一致。
3. `package.json` 的 `files`、`exports` 与实际文件一致；`npm pack --dry-run --json` 仍为 11 个文件且不含 `AGENTS.md`。
4. 若修改了拦截逻辑，重跑 `node tools/doctor.mjs`，确认 DSH 版本、泄漏与启动形态结论符合预期。
5. `git status` 只包含本任务需要的改动。
