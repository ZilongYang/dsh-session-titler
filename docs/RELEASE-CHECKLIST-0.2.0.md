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

## C. 实机验收（**核心项已通过**：2026-10-16 C1 ✅ / C7 ✅；C2、C3、C4 为可选补充）

> 结论：在 DSH `0.2.1-alpha.2`（桌面版 `2.0.18-next`）+ profile `main` 上，插件的 0.2.0 修复版**能正常安装、正常挂载、功能可用**，不再出现 `duplicate exact route` / entry 失活。剩余可选项见 C2/C3/C4。
>
> ⚠️ 重启 DSH NEXT.app 会**结束当前会话**（本插件的开发会话就跑在里面）。下面是逐步步骤，可照着做。
> 全程可回滚：行为回滚只需删掉 `index.js` 的 `mountRoute` 与 `title.js` 的 `streamTitle`；声明回滚删掉 `engines.dsh` 与 `dsh.compatibility`；安装回滚见 C0b 的备份路径。

### C0. 记录现场（重启前）

```sh
cat ~/.dsh/desktop-next.json                                       # 应用当前 profile（本次为 main）
grep -n "session-titler" ~/.dsh/profiles/main/package.json         # 期望：dependencies 有 link:、bundles 里有名字
ls -la ~/.dsh/profiles/main/node_modules/dsh-session-titler        # 期望：指向本仓库的软链
```

### C0b. 本次验收前的安装方式（2026-10-16 手工 link，绕过 pnpm）

`dsh plugin --profile main add link:/Users/zilong/zWork/ai/zl-plugins/dsh-session-titler` 实测**失败**，且真实报错没有落盘：`~/.dsh/profiles/main/.plugin-manager/logs/operation-RvSpxS/pnpm.log`（16:57:55）里只有 execa 的一行摘要 `Command failed with exit code 1: pnpm add 'link:…'`。dshmarket 自己的源码注释确认了这一点：pnpm 输出现在直通界面，日志文件只留摘要。包本身没有问题——在临时目录里用 `pnpm add link:<本仓库>`（pnpm 12.3.4）直接成功。

可疑点（**未证实**，后来被推翻）：当时注意到桌面版生成的 pnpm shim `~/.local/bin/pnpm` 里 `PNPM_BIN` 指向 `~/Library/Application Support/io.github.hairyf.deepseek-harness-desktop/dependencies/pnpm/bin/pnpm.cjs`，而该目录**已不存在**（应用数据目录已迁到 `~/.dsh`），shim 的兜底是顺 PATH 找用户 pnpm，在裁剪过的环境里可能落到 `[pnpm] pnpm not found…` 并 exit 1。**但这个假设在 C7 被证伪**：同一条安装路径（应用内 → 本地目录）17:26 用 pnpm **11.8.0** 一次成功。那次 16:57 的失败发生在应用「正在退出/重启」的窗口里，最可能是环境/时序问题，真因仍未知（因为错误只留在当时界面上）。上面那条 stale `PNPM_BIN` 依然是个值得修的潜在问题，但不是这次失败的已证原因。

因此改为**不经过 pnpm** 的手工安装（落地状态与一次成功的 `link:` 安装等价）：

- `~/.dsh/profiles/main/package.json`：`dependencies` 增加 `"dsh-session-titler": "link:/Users/zilong/zWork/ai/zl-plugins/dsh-session-titler"`；`dsh.profile.bundles` 增加 `"dsh-session-titler"`；删除残留的 `desktopNextDeselectedBundles`（数组清空后按应用自己的写法删掉整个键）。
- `~/.dsh/profiles/main/node_modules/dsh-session-titler` → 软链 `../../../../zWork/ai/zl-plugins/dsh-session-titler`（与 `desktop` profile 的写法一致）。
- 解析校验：`version: 0.2.0`、`engines.dsh: >=0.2.0-rc.1 <0.3.0-0`、`index.js` 含 `mountRoute`。
- 备份与回滚：`~/.dsh/profiles/main/package.json.bak-titler-20261016-170952`；回滚 = 还原该文件 + 删除软链。
- 手工安装留下的脆弱点（`pnpm-lock.yaml` 里没有这个 link，下次 pnpm 操作可能剪掉软链）**已在 C7 被消除**：应用内正式安装把 lockfile 刷新为含 `dsh-session-titler` 的版本。注：`node_modules/.modules.yaml` 的 `hoistedLocations` 只登记走 store 的依赖，`link:` 直接依赖不在此列，因此它里面查不到属**正常**，判据应看 `pnpm-lock.yaml`。

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

### C7. 应用内安装本地目录（**正式安装路径**）—— ✅ 2026-10-16 17:26 实测通过

目的：验证**用户真实会走的那条安装路径**（应用插件页 → 本地目录）在修复版上可用，而不是只验证 C0b 手工 link 出来的状态。

- 输入必须是**绝对路径**（`@deepseek-ai/dsh-plugin-manager` 的 `parseInstallSpec()` 会直接拒绝相对路径，理由是「Host 的工作目录对浏览器里输入的人没有意义」）：

```
/Users/zilong/zWork/ai/zl-plugins/dsh-session-titler
```

  `link:/Users/zilong/zWork/ai/zl-plugins/dsh-session-titler` 等价可用；插件页自带文案：`支持 npm 包、Git 仓库和本地目录` / `输入插件的包名、GitHub 仓库地址或本地目录路径。`

- **实测结果**（`~/.dsh/profiles/main/.plugin-manager/logs/operation-d1W1B1/pnpm.log`，17:26:57，pnpm **11.8.0**）：

```
✓ Lockfile passes supply-chain policies (verified 14s ago)
dependencies:
+ dsh-session-titler link:/Users/zilong/zWork/ai/zl-plugins/dsh-session-titler
Already up to date
Done in 1.2s using pnpm v11.8.0
```

  即：**pnpm 一次成功**（没有 execa 的失败摘要），`package.json`（17:27）与 `pnpm-lock.yaml`（17:26，含 `dsh-session-titler` ×3）都被刷新 → C0b 手工安装留下的脆弱点消除。
- 兼容预检没有拦（本插件 `peerDependencies` 为空）；市场**没有** hot-mount（`.dsh-market/log.ndjson` 无新记录），因此**没有产生双源**。
- 装完未重启应用，功能即正常（Host 行本来就在组装中）。
- 日志判读：17:25 之后 `duplicate exact route` / `did not activate` / `multiple active Loader sources` / `more than one loader source` **均为 0 次**。
- 失败时的排查路径（本次未用到，留档）：把界面报错**原文**贴出来——失败摘要只会在 `pnpm.log` 留 execa 的一行；若 `package.json` 被改动，用 C0b 的备份核对。

## D. 文档

- [x] `docs/PLAN-2026-10-16.md`（批准正文原样存档 + 事后补记 B1/B2/B3）。
- [x] `docs/RELEASE-CHECKLIST-0.2.0.md`（本文件）。
- [x] `README.md`：新增「支持的 DSH 版本与兼容声明」小节、双源安装的排查条目、文档索引挂链。
- [x] `docs/01-plugin-design-and-implementation.md`：附录 A6 事后补记。

## E. 发布动作 —— ✅ 2026-10-16 17:28–17:33 已执行

- [x] commit：`8d2982c`（修复）+ `06b027d` / `bb71832` / `447ab7f`（验收记录）。
- [x] `git push origin main`：`808a348..447ab7f`（GitHub 源码安装 `github:ZilongYang/dsh-session-titler#main` 已可拿到修复）。
- [x] `npm --cache /tmp/dsh-npm-cache publish`：`+ dsh-session-titler@0.2.0`，exit 0，**未触发 OTP**（现有粒度 token 的 bypass-2FA 仍有效；注意 `docs/02` 记录的 2027-01 起将不再支持，届时要改 `--otp` 或 Trusted Publishing）。
- [x] 线上产物核验（直接抓 registry tarball，绕过本地缓存）：
  `version 0.2.0`、`engines.dsh = ">=0.2.0-rc.1 <0.3.0-0"`、`dsh.compatibility.dshReleases` 齐全；`index.js` 含 `mountRoute` ×2、`title.js` 含 `streamTitle` ×2、`client.js` 含 `sessions?.using` 保护 ×1；README 含「支持的 DSH 版本与兼容声明」；13 个文件。
- [ ] 市场/插件页刷新：`discovery-compatibility-v1.json` 里 `dsh-session-titler` 仍是旧的 `0.1.2 / enginesDsh: null`（`checkedAt` 14:19，24h TTL）→ 需要打开一次插件页或等 TTL；这也是 C4 未做的原因。
- [ ] 三个 profile 的版本策略（按需）：`desktop` / `main` 目前是本地 `link:`（代码即 0.2.0），`web` 仍是 npm `^0.1.2`；要让 `web` 也用上修复版，在插件页把它更新到 0.2.0 即可。

### 本次发布踩到的两个坑（下次直接照做）

1. **registry 读取路径滞后约 1.5 分钟**：`npm publish` 返回 202（"being processed"）后，`dist-tags.latest` 仍是 `0.1.2`；轮询到 17:32:57（约 1 分 30 秒）才变成 `0.2.0`。发布后不要立刻断言失败，轮询 `https://registry.npmjs.org/dsh-session-titler` 的 `dist-tags.latest`。
2. **`npm pack dsh-session-titler@0.2.0` 会假性报 `ETARGET/notarget`**：即使 registry 已经能提供 0.2.0（`GET /dsh-session-titler/0.2.0` 正常），npm 仍用本地缓存里过期的 packument。核验线上产物要**直接抓 tarball**：
   ```sh
   curl -sSL -o /tmp/p.tgz https://registry.npmjs.org/dsh-session-titler/-/dsh-session-titler-0.2.0.tgz
   ```
   （或给 npm 加 `--prefer-online`）。
