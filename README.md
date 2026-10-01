# dsh-session-titler

**Summarize a whole DeepSeek Harness session into one title on demand — confirm it before it is applied.** A Host + Web Client plugin: its only entries are a header button and a session-row menu item, and nothing is written until you press Confirm. It registers no title provider, so automatic titling keeps whatever else you have installed.

把**整个会话**总结成一条新标题，**确认后**才写入。DeepSeek Harness 的 Host + Web Client 双半插件。

> **Quick start (EN)** — Desktop app: install from the in-app **Plugins** page (the `desktop` profile is app-managed, so `dsh plugin --profile desktop …` refuses). CLI-managed profiles: `dsh plugin --profile <profile> add dsh-session-titler`. Then hit **✦ Generate title** in the session header or **Generate title** in a session row's “…” menu, edit the proposal, and press **Apply** — nothing is written before that.

## 快速开始

### 1. 安装

**桌面版（DeepSeek Harness.app）** —— `desktop` profile 由应用独占，命令行不接管它
（`dsh plugin --profile desktop …` 会直接报 `profile "desktop" is managed exclusively by the Electron application`）。
请在**应用内左侧「插件」页**安装；插件市场收录后，也可以直接在里面搜 `titler` 一键装（收录状态见 PR，通常一天内生效）。

**命令行管理的 profile**（`web` / `main` / 自建 profile 等）—— `dsh plugin` 是 pnpm 透传，一条命令即可：

```sh
# 从 npm 安装（推荐）
dsh plugin --profile <你的profile> add dsh-session-titler

# 从 GitHub 源码安装（想跟 main 分支时）
dsh plugin --profile <你的profile> add github:ZilongYang/dsh-session-titler#main

# 本地开发：把本仓库直接挂进去
dsh plugin --profile <你的profile> add link:/绝对路径/dsh-session-titler
```

### 2. 使用

1. 打开任意一个**已经有内容**的会话；
2. 点标题栏里的 **✦ 生成标题** —— 它在「创造模式」右边、「费用 ¥0」左边；
   或点左侧会话行 **「...」菜单 → 生成标题**（在「重命名」下面一行）；
3. 等 2–4 秒，弹窗给出标题提案，**可以直接改**；
4. 点 **确认修改** —— 左侧标题立即更新，刷新页面也还在。

> 点「取消 / Esc / 点遮罩」都**不会写任何数据**；空白会话没有可总结的内容，按钮会置灰。

### 3. 卸载

```sh
dsh plugin --profile <你的profile> remove dsh-session-titler
```

桌面版在应用内「插件」页停用或卸载。

> 装完没看到按钮？Host 半是进程内模块，**重启一次 dsh/应用**再刷新页面即可（Client 半刷新页面就生效）。

## 入口在哪（两处，都在现有 Web UI 上，不新增页面）

| 入口 | 位置 |
|---|---|
| 顶栏按钮「✦ 生成标题」 | 会话标题栏里，`conversation.session.header.actions` 的 `order: -8` —— 紧跟「创造模式」芯片 `agent-preset`（`-10`）右侧，排在费用芯片 `cost-meter`（`-5`）之前，从而让 `费用 ¥0` 与 `费用明细`（`1`）保持相邻 |
| 会话行菜单项「生成标题」 | 会话行「...」菜单 `sidebar.workspaces.session.menu.item` 的 `order: 250` —— 在「重命名」（`200`）下面一行、「分叉会话」（`300`）上面 |

点击后：生成 → 居中确认弹窗（标题**可编辑**，另有「重新生成 / 取消」）→ 点「确认修改」才真正改标题。取消、Esc、点遮罩都不会写任何数据。

## 它是怎么工作的

```
顶栏按钮 / 会话菜单项
      │ store.open({ sessionId, currentTitle })
      ▼
  Client store ──POST /session-titler/propose { sessionId }──► Host 路由（只读）
      ▲                                                        ├─ ctx.sessionQuery.readSurface(sessionId)
      │                                                        │    （当前「模型表面」，已考虑压缩/替换）
      │                                                        ├─ 组装 transcript（32 KiB 预算，条目级截断）
      │                                                        ├─ 路由候选（新→旧）：活会话 requestHeader().config
      │                                                        │    → 日志每条 request/header → agentDefaultModel 默认模型
      │                                                        │    每个候选都要在 llm.listProviders() 里（探测失败则不过滤）
      │                                                        └─ ctx.llm.stream({ …, purpose:'session-title' })
      │  { ok:true, value:{ title, provider, model, fallback, messages, truncated } }
      ▼
 确认弹窗（可编辑）
      │ 点「确认修改」
      ▼
 ctx.sessions.using(id, { source:'workspaceOperation' }, ref =>
      ref.binding.session.rename(title))          ← 与官方「重命名」菜单同一条写入路径
      ▼
 Host 追加 session/title 事件（source: user）→ 列表标题刷新、刷新页面仍保持
```

**关键取舍**：不注册 `ctx.sessionTitle` 的 provider。那是**独占**的，会顶掉 DSH 自带的自动标题 provider，而且 `automatic` 只有 `first-prompt` / `all-prompts`，没有「只在用户点击时才生成」的档位。所以本插件走自己的显式调用，并保证生成阶段**完全不写会话日志**。

## 目录

| 文件 | 作用 |
|---|---|
| `package.json` | bundle 补丁声明 + `dsh.client`（web 平台、客户端模块依赖） |
| `cordis.patch.yml` | 往 profile 插一行 host 插件（`id: session-titler`） |
| `index.js` | Host 半：注册 `/session-titler/propose`，做请求围栏、体积上限、错误映射 |
| `title.js` | Host 半：读会话 → 选模型路由（每个候选都校验已注册 adapter）→ 组装/裁剪 transcript → 调 `ctx.llm.stream` → 标题归一化 |
| `test/title.test.js` | 路由解析与失败映射的单元测试（`npm test` = `node --test`，不进 npm 包） |
| `fence.js` | Host 半：loopback / 同源请求校验（DNS-rebinding、CSRF 防护，**不是**鉴权） |
| `client.js` | Client 半：手写模块产物，注册 3 个座位 + 状态 store + 确认弹窗 |
| `locale/{zh,en}.json` | 插件卡片显示用的 `meta.title` / `meta.description` |

## HTTP 契约

`POST /session-titler/propose`，请求体 ≤ 8 KiB：`{ "sessionId": "session-…" }`

成功：

```json
{ "ok": true, "value": { "title": "…", "provider": "…", "model": "…", "fallback": false, "messages": 14, "truncated": false } }
```

`fallback: true` 表示会话自己记录的路由在当前 profile 里没有已注册 adapter，本次是**回退**到日志里更早的可用路由或 `llm-pi-ai`/`agentDefaultModel` 的默认模型生成的；弹窗会显示「使用模型：X（…已回退）」。

失败：`{ "ok": false, "error": { "code": "…", "message": "…", … } }`（`no-adapter` 额外带 `route`）

| code | HTTP | 触发 |
|---|---|---|
| `forbidden` | 403 | 围栏未通过（非 loopback/可信 Host、跨站标记、异源 Origin） |
| `method-error` | 405 | 非 POST |
| `bad-request` | 400 | JSON 坏 / `sessionId` 缺失 |
| `too-large` | 413 | 请求体超限 |
| `not-found` | 404 | 会话不存在或读不出来 |
| `no-content` | 409 | 表面里没有 user / assistant 文本 |
| `timeout` | 504 | 30 s 未回 |
| `no-adapter` | 502 | 会话记录的路由 + 默认模型都没有已注册的 adapter（响应带 `route`，弹窗给中文可操作提示） |
| `llm-error` | 502 | finish 非 `stop`、模型未产出文本 |
| `internal` | 500 | 其它 |

## 可调参数

集中在 `title.js` 顶部的 `POLICY`（本插件不带 `Config` 段，改完需要重启 Host 才生效）：

| 键 | 默认 | 含义 |
|---|---|---|
| `maxInputBytes` | 32768 | 送进模型的 transcript 字节上限 |
| `maxOutputTokens` | 256 | 标题输出的 token 上限（DSH 自带的首条消息 provider 用 64；整段会话会让推理模型把 64 全花在思考上，故放宽） |
| `timeoutMs` | 30000 | 单次标题调用的墙钟预算 |
| `maxTitleBytes` | 120 | 接受标题的 UTF-8 字节上限 |
| `userCharsPerMessage` / `assistantCharsPerMessage` | 2000 / 3000 | 单条消息裁剪上限 |

超长会话的处理：先按单条裁剪，再从**中间整条丢弃**（保留开头＝任务目标、结尾＝当前状态），仍然超就截尾部字符，并在返回值里给 `truncated: true`。

标题取模型回答里**第一条可用行**（跳过空行、剥掉解释段落），再按 DSH 的 `normalizeSessionTitle` 归一化：剥 OSC/CSI/ESC 控制序列、C0/C1 控制符、方向性不可见字符 → 空白折叠成单行 → 按 code point 截到 120 字节，绝不切坏字符。`max-tokens` 结束但已产出可用标题行时按成功处理（模型只是话多了，反正要用户确认）。

## 本机开发（改代码时看这节）

安装与卸载见上面的「快速开始」。日常改代码用本地挂载最省事：

```bash
# 让 Agent 代为安装（Host + Web 同 profile）
#   plugin_manager install_bundle target=<本目录绝对路径>
# 或者命令行
dsh plugin --profile <你的profile> add link:/绝对路径/dsh-session-titler
```

- 本仓库以 `link:` 方式挂进 profile，所以**改代码不用重装**。
- **Client 半**（`client.js`）：刷新页面生效；插件刚装好时 Host 会推送模块图变更，通常无需刷新就会激活。
- **Host 半**（`index.js` / `title.js` / `fence.js`）：**必须重启 DSH**。宿主进程内的 ESM 模块缓存不会因装卸载而失效——这是本插件开发中真实踩到的：改完 `title.js` 后路由行为不变，重启后才生效。
- **单测**：`npm test`（= `node --test`，Node ≥ 20.3）。覆盖路由候选的 adapter 校验与失败映射，不联网、不装依赖。`test/` 不在 npm 包的 `files` 里。


## 已知限制

- 只服务 loopback 或 `webRuntime.trustedHosts` 里的主机。经隧道/局域网用非受信 Host 访问时，本路由返回 403（这是有意的 DNS-rebinding 防护）。
- 弹窗是自写组件（按官方规范不 import `dsh-client-ui-primitives`），样式只引用 `--dsw-alias-*` / `--dsw-radius-*` / `--dsw-elevation-*` token；视觉与宿主的 Modal / 菜单行对齐，但不共享宿主组件的行为升级。
- 不做自动标题：不会在后台为任何会话生成标题，也不会改动 DSH 自带的标题 provider。
- 每次点击消耗一次模型调用（输出 ≤ 256 token，输入 ≤ 32 KiB），且**只读**，不写会话。

## 设计与发布文档

- [`docs/01-plugin-design-and-implementation.md`](docs/01-plugin-design-and-implementation.md) —— 插件设计与实现计划，含落地偏差记录与最终验证数据。
- [`docs/02-open-source-and-marketplace.md`](docs/02-open-source-and-marketplace.md) —— 开源、npm 发布与社区插件市场上架流程。

## License

[MIT](LICENSE)

