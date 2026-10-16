# dsh-session-titler 0.2.0 发版清单

> 配套计划：[`PLAN-2026-10-16.md`](PLAN-2026-10-16.md)（批准正文 + 事后补记）。
> 主题：**修复 0.2.1-alpha.x 下“同一进程重复挂载 → entry 激活失败”的崩溃**，并补上 DSH 版本兼容声明。
> 说明：本清单在**代码/单测完成但实机验收未做**的状态下创建；勾选状态即当前真实状态。

## A. 改动内容

- [x] `index.js`：新增 `mountRoute()`，用 `globalThis[Symbol.for('dsh-session-titler/propose-route')]` 记录路由句柄；重复挂载时**先释放旧的再注册**，返回的 disposer 带**所有权判断**（webserver 的 disposer 是按 path 删除，不做判断会误删继任者路由）；只容忍“本路由自身的重复 path”错误，其它注册错误照旧上抛；每个进程只打一条 `mounted from more than one loader source` 警告。
- [x] `title.js`：新增 `streamTitle()`（主路径 `llm.stream`，兜底 `llm.prepareCall` 的 0.2.1-alpha 形态）与 `preparedTitleStream()`；`proposeTitle()` 的 catch 增加 `TitlerError` 透传，使 `unsupported-host` 不被改写成 `llm-error`。
- [x] `client.js`：`confirm()` 对 `sessions.using` 与 `reference.binding.session.rename` 做存在性判断，缺失时给 `unavailable` 文案而不是抛空。
- [x] `package.json`：`0.1.2` → `0.2.0`；`engines.dsh = ">=0.2.0-rc.1 <0.3.0-0"`；`dsh.compatibility.dsh/dshReleases`。
- [x] **没有**新增 `peerDependencies`（有意为之：DSH 的 `evaluatePluginCompatibility()` 对 peer 不满足是 deny row / 跳过整个 bundle，静默消失比报错更糟；`engines.dsh` 只影响市场的装前拒绝与展示）。

## B. 单测与静态检查

- [x] `npm test` → 19 passed / 0 failed（原有 11 + `title.test.js` 新增 2 + `test/host.test.js` 6）。
- [x] `node --check`：`index.js`、`title.js`、`fence.js`、`client.js`、`test/host.test.js`、`test/title.test.js` 全部通过。
- [x] 幂等性契约覆盖：重复挂载不抛 / 最新 handler 生效 / 旧 fiber 不误删新路由 / 单挂载卸载即摘除 / 无关注册错误仍上抛 / 外来同 path 路由不被抢 / 双挂载后路由仍能返回 200 提案。
- [x] 能力探测覆盖：只有 `prepareCall` 时仍出标题且 `prepareCall` 收到 `{provider, model, maxTokens}`；两者都没有 → `unsupported-host` / 501。
- [x] 声明范围复核（用市场自带 `satisfiesRange(..., { includePrerelease: true })`）：
  `0.2.0-rc.1` ✓、`0.2.0-rc.2` ✓、`0.2.1-alpha.2` ✓、`0.2.1-alpha.3` ✓、`0.2.1-alpha.4` ✓、`0.2.1` ✓、`0.3.0` ✗、`0.1.5-alpha.1` ✗。
- [x] 声明生效复核（用市场自带的 `manifestFacts` + `deriveHostCompatibility` 跑本仓库新旧 `package.json`）：
  `0.1.2` 在 `0.2.1-alpha.2` 上 → `unknown / undeclared`；`0.2.0` → `compatible / manifest`（`requirement = ">=0.2.0-rc.1 <0.3.0-0"`），`0.3.0` → `incompatible`。即“市场说未声明”这个问题在**清单层面**已修好。

## C. 实机验收（**进行中**：2026-10-16 已手工装入 `main`，等待重启验证）

> ⚠️ 重启 DSH NEXT.app 会**结束当前会话**（本插件的开发会话就跑在里面）。下面是逐步步骤，可照着做。
> 全程可回滚：行为回滚只需删掉 `index.js` 的 `mountRoute` 与 `title.js` 的 `streamTitle`；声明回滚删掉 `engines.dsh` 与 `dsh.compatibility`；本次安装回滚见 C0b 的备份路径。

### C0. 记录现场（重启前）

```sh
cat ~/.dsh/desktop-next.json                                       # 应用当前 profile（本次为 main）
grep -n "session-titler" ~/.dsh/profiles/main/package.json         # 期望：dependencies 有 link:、bundles 里有名字
ls -la ~/.dsh/profiles/main/node_modules/dsh-session-titler        # 期望：指向本仓库的软链
```

### C0b. 本次验收前的安装方式（2026-10-16 手工 link，绕过 pnpm）

`dsh plugin --profile main add link:/Users/zilong/zWork/ai/zl-plugins/dsh-session-titler` 实测**失败**，且真实报错没有落盘：`~/.dsh/profiles/main/.plugin-manager/logs/operation-RvSpxS/pnpm.log`（16:57:55）里只有 execa 的一行摘要 `Command failed with exit code 1: pnpm add 'link:…'`。dshmarket 自己的源码注释确认了这一点：pnpm 输出现在直通界面，日志文件只留摘要。包本身没有问题——在临时目录里用 `pnpm add link:<本仓库>`（pnpm 12.3.4）直接成功。

可疑根因（属于**桌面版环境缺陷**，待单独修，与本插件无关）：桌面版生成的 pnpm shim `~/.local/bin/pnpm` 里 `PNPM_BIN` 指向 `~/Library/Application Support/io.github.hairyf.deepseek-harness-desktop/dependencies/pnpm/bin/pnpm.cjs`，而该目录**已不存在**（应用数据目录已迁到 `~/.dsh`；真正的自带 pnpm 11.7.0 在 `~/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/pnpm`）。shim 的兜底是顺 PATH 找用户 pnpm；在 `@deepseek-ai/dsh-plugin-manager` 的 service 路径（`scrubbedParentEnv()`）下 PATH 可能被裁剪到找不到 pnpm，于是打印 `[pnpm] pnpm not found. Please run DeepSeek Harness Desktop to install it first.` 并 exit 1——与「一行摘要、无其它输出」的表现一致。

因此改为**不经过 pnpm** 的手工安装（落地状态与一次成功的 `link:` 安装等价）：

- `~/.dsh/profiles/main/package.json`：`dependencies` 增加 `"dsh-session-titler": "link:/Users/zilong/zWork/ai/zl-plugins/dsh-session-titler"`；`dsh.profile.bundles` 增加 `"dsh-session-titler"`；删除残留的 `desktopNextDeselectedBundles`（数组清空后按应用自己的写法删掉整个键）。
- `~/.dsh/profiles/main/node_modules/dsh-session-titler` → 软链 `../../../../zWork/ai/zl-plugins/dsh-session-titler`（与 `desktop` profile 的写法一致）。
- 解析校验：`version: 0.2.0`、`engines.dsh: >=0.2.0-rc.1 <0.3.0-0`、`index.js` 含 `mountRoute`。
- 备份与回滚：`~/.dsh/profiles/main/package.json.bak-titler-20261016-170952`；回滚 = 还原该文件 + 删除软链。
- **已知残留**：`pnpm-lock.yaml` 与 `node_modules/.modules.yaml` 未同步，下一次真正的 pnpm 操作可能把这个软链剪掉。验证通过后应补一次正确的 pnpm 安装（或接受这一脆弱点，被剪掉后重做）。

另一条会干扰后续安装的事实（与崩溃无关）：`dsh plugin --profile <p> add` 只是 pnpm 透传，**不会**把包写进 `dsh.profile.bundles`；而 `readProfilePlugins()` 用 `enabled: bundles.includes(name)` 决定是否组装，所以单独一条 `dsh plugin add` 即使成功也不会加载。

### C1. 单源正常态（`main` profile；`desktop` 同理）

- [x] 完全退出 DSH NEXT.app（不是关窗口），再启动。（2026-10-16 17:12）
- [x] 日志检查（**核心判据**）：

```sh
grep -nE "session-titler|duplicate exact route|did not activate|client-modules" ~/.dsh/logs/desktop-next.log | tail -30
```

  实测（2026-10-16T09:12:20Z 那次 `run.start` 之后）：`patch: entry "session-titler" not found` **0 次**（说明残留 patch 对上了真实 row → 行已挂载）；`webserver: duplicate exact route` **0 次**；唯一的 `1 entry did not activate` 属于 `@deepseek-ai/dsh-hooks-claude-code`（orca-agent-hooks，既有的缺失包，与本插件无关）。
- [x] UI：顶栏「✦ 生成标题」→ 弹窗出现、标题可改 → 「确认修改」→ 左侧标题更新，刷新页面后仍在。（由子龙实测确认）
- [ ] 会话行「...」菜单 → 「生成标题」，同样可用。

### C2. 路由存活 + live patch reload

```sh
PROFILE=main   # 若改用 desktop，这里同步改
PORT=$(grep -o "127\.0\.0\.1:[0-9]\{4,5\}" ~/.dsh/logs/desktop-next.log | tail -1 | cut -d: -f2)
SID=$(ls -t ~/.dsh/sessions/--Users-zilong-zWork-ai-zl-plugins-dsh-session-titler--/ | head -1)
echo "$PORT / $SID"
curl -sS -X POST -H "Host: 127.0.0.1:$PORT" -H 'content-type: application/json' \
  -d "{\"sessionId\":\"$SID\"}" "http://127.0.0.1:$PORT/session-titler/propose" | head -c 400
```

- [ ] 返回 `{"ok":true,...}`。返回 403 说明 `Host` 头没对齐；404 说明会话 id 不对。
- [ ] 触发一次 profile patch 重载（`touch ~/.dsh/profiles/$PROFILE/cordis.patch.yml`；若 `touch` 不触发，就在插件页把任意插件开关一次），等 3–5 秒，**再 curl 一次**，仍应 200 且**日志里没有** `duplicate exact route`。

### C3. 双源复现（复刻 06:40 那条崩溃路径）

- [ ] 打开插件页，把 `dsh-session-titler` **启用/安装**（市场会 hot-mount，同时把它写回 `dsh.profile.bundles`）——这就是当时触发崩溃的路径。
- [ ] 日志检查：

```sh
grep -nE "duplicate exact route|did not activate|more than one loader source|multiple active Loader sources" ~/.dsh/logs/desktop-next.log | tail -20
```

  期望：**只有**一条 `mounted from more than one loader source`（本插件自己打的警告），**没有** `duplicate exact route`、**没有** `did not activate`、**不进恢复页**。
- [ ] 已知残留（预期内，不是回归）：双源下 DSH 客户端模块表按包名去重，会拒绝该包并打 `client-modules: package dsh-session-titler resolves from multiple active Loader sources … remove one entry`，因此两个 UI 入口**不会出现**。这是环境问题 → 在插件页/`dsh plugin` 里删掉多余一份，回到单源。
- [ ] 清理后回到 C1 的状态（UI 恢复可用）。

### C4. 兼容结论刷新

```sh
PROFILE=main
rm -f ~/.dsh/profiles/$PROFILE/.dsh-market/discovery-compatibility-v1.json   # 仅市场缓存，会重新抓取
node -e 'const j=require(process.env.HOME+"/.dsh/profiles/main/.dsh-market/discovery-compatibility-v1.json");console.log(j.entries["dsh-session-titler"])'
```

- [ ] 插件页显示为**确定兼容**（不再是“未声明”）。
- [ ] 上面的 node 输出里 `enginesDsh` 为 `">=0.2.0-rc.1 <0.3.0-0"`。
- [ ] 注意：`main` 的市场缓存文件可能要等一次插件页打开后才会重新生成；本次手工安装未经 pnpm，缓存里的 `version` 可能仍是旧值，以插件页显示为准。

### C5. 0.2.0-rc.2 回归（可选，涉及 profile 变更）

- [ ] 在 CLI 管理的 profile（如 `web`）里换成 0.2.0，跑一次生成标题，确认不退化。

```sh
dsh plugin --profile web add link:/Users/zilong/zWork/ai/zl-plugins/dsh-session-titler
```

  两个前提（见 C0b）：① 这条命令只是 pnpm 透传，**不会**把包加进 `dsh.profile.bundles`，需要再加一行（或在插件页操作）；② 桌面版 shim 那条路可能直接 exit 1，必要时用 `node ~/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/pnpm/bin/pnpm.cjs add link:<仓库> --dir ~/.dsh/profiles/web --no-frozen-lockfile`。

### C6. 回填

- [ ] `0.2.1-alpha.3` / `alpha.4`：能实跑后把 `dsh.compatibility.dshReleases` 的值从 `unknown` 改为实测结论，并同步本清单与 README 的版本表。

### C7. 应用内安装本地目录（**正式安装路径**，2026-10-16 待做）

目的：验证**用户真实会走的那条安装路径**（应用插件页 → 本地目录）在修复版上可用，而不是只验证 C0b 手工 link 出来的状态。

- 输入必须是**绝对路径**（`@deepseek-ai/dsh-plugin-manager` 的 `parseInstallSpec()` 会直接拒绝相对路径，理由是「Host 的工作目录对浏览器里输入的人没有意义」）：

```
/Users/zilong/zWork/ai/zl-plugins/dsh-session-titler
```

  `link:/Users/zilong/zWork/ai/zl-plugins/dsh-session-titler` 等价可用；插件页自带文案：`支持 npm 包、Git 仓库和本地目录` / `输入插件的包名、GitHub 仓库地址或本地目录路径。`

- 预期行为：核心插件管理器跑 `pnpm add <spec>` → 把包写进 `dsh.profile.bundles` → 做兼容预检（本插件 `peerDependencies` 为空，**不会**被 `evaluatePluginCompatibility()` 拒）。因为插件**已经**被 bundle 层组装，市场不会再 hot-mount（只有 `no loader entry matched` 才会），所以这一次**不该**出现双源。
- 成功时的额外收益：`pnpm-lock.yaml` 与 `node_modules/.modules.yaml` 被补齐，消掉 C0b 手工安装留下的「未同步、可能被下次 pnpm 操作剪掉」这个脆弱点。
- 判读：

```sh
grep -nE "duplicate exact route|did not activate|more than one loader source|multiple active Loader sources" ~/.dsh/logs/desktop-next.log | tail -10
```

- 若失败：**把界面上的报错原文贴出来**——上一次只留了 execa 的一行摘要，真因没落盘（见 C0b 的桌面版 pnpm shim 疑似根因）。失败后先用 C0b 的备份核对 `main/package.json` 是否被改动。

## D. 文档

- [x] `docs/PLAN-2026-10-16.md`（批准正文原样存档 + 事后补记 B1/B2/B3）。
- [x] `docs/RELEASE-CHECKLIST-0.2.0.md`（本文件）。
- [x] `README.md`：新增「支持的 DSH 版本与兼容声明」小节、双源安装的排查条目、文档索引挂链。
- [x] `docs/01-plugin-design-and-implementation.md`：附录 A6 事后补记。

## E. 发布动作（**未执行，须单独批准**）

- [ ] `git add` + commit（建议标题：`fix: survive a duplicate mount and declare DSH compatibility (0.2.0)`）。
- [ ] `npm publish`（注意仓库既有记录：npm 2FA 与 CDN 缓存滞后问题见 `docs/02-open-source-and-marketplace.md`）。
- [ ] 市场/插件页版本刷新与描述更新（`dsh.compatibility` 变更需等市场 24h TTL 或手动清缓存）。
- [ ] 在 `desktop` / `web` / `main` 三个 profile 里把 `dsh-session-titler` 升到 `^0.2.0`，并清理重复安装源（市场副本与 bundle 行只留一个）。
