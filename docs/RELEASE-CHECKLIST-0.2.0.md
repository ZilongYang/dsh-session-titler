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

## C. 实机验收（**未做，需要重启 DSH，须子龙批准**）

> ⚠️ 重启 DSH NEXT.app 会**结束当前会话**（本插件的开发会话就跑在里面）。下面是逐步步骤，可照着做。
> 全程可回滚：行为回滚只需删掉 `index.js` 的 `mountRoute` 与 `title.js` 的 `streamTitle`；声明回滚删掉 `engines.dsh` 与 `dsh.compatibility`。

### C0. 记录现场（重启前）

```sh
cp ~/.dsh/profiles/desktop/package.json /tmp/desktop-profile-before.json
ls -la ~/.dsh/profiles/desktop/node_modules/dsh-session-titler     # 期望是指向本仓库的 link
grep -n "session-titler" ~/.dsh/profiles/desktop/package.json      # 期望在 dsh.profile.bundles 里
grep -c "session-titler" ~/.dsh/profiles/main/package.json         # main 里当前应为已卸载状态
```

### C1. 单源正常态（`desktop` profile）

- [ ] 完全退出 DSH NEXT.app（不是关窗口），再启动。
- [ ] 日志检查（**核心判据**）：

```sh
grep -nE "session-titler|duplicate exact route|did not activate|client-modules" ~/.dsh/logs/desktop-next.log | tail -30
```

  期望：**没有** `webserver: duplicate exact route`、**没有** `did not activate`。
- [ ] UI：顶栏「✦ 生成标题」→ 弹窗出现、标题可改 → 「确认修改」→ 左侧标题更新，刷新页面后仍在。
- [ ] 会话行「...」菜单 → 「生成标题」，同样可用。

### C2. 路由存活 + live patch reload

```sh
PORT=$(grep -o "127\.0\.0\.1:[0-9]\{4,5\}" ~/.dsh/logs/desktop-next.log | tail -1 | cut -d: -f2)
SID=$(ls -t ~/.dsh/sessions/--Users-zilong-zWork-ai-zl-plugins-dsh-session-titler--/ | head -1)
echo "$PORT / $SID"
curl -sS -X POST -H "Host: 127.0.0.1:$PORT" -H 'content-type: application/json' \
  -d "{\"sessionId\":\"$SID\"}" "http://127.0.0.1:$PORT/session-titler/propose" | head -c 400
```

- [ ] 返回 `{"ok":true,...}`。返回 403 说明 `Host` 头没对齐；404 说明会话 id 不对。
- [ ] 触发一次 profile patch 重载（`touch ~/.dsh/profiles/desktop/cordis.patch.yml`；若 `touch` 不触发，就在插件页把任意插件开关一次），等 3–5 秒，**再 curl 一次**，仍应 200 且**日志里没有** `duplicate exact route`。

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
rm -f ~/.dsh/profiles/desktop/.dsh-market/discovery-compatibility-v1.json   # 仅市场缓存，会重新抓取
node -e 'const j=require(process.env.HOME+"/.dsh/profiles/desktop/.dsh-market/discovery-compatibility-v1.json");console.log(j.entries["dsh-session-titler"])'
```

- [ ] 插件页显示为**确定兼容**（不再是“未声明”）。
- [ ] 上面的 node 输出里 `enginesDsh` 为 `">=0.2.0-rc.1 <0.3.0-0"`。

### C5. 0.2.0-rc.2 回归（可选，涉及 profile 变更）

- [ ] 在 CLI 管理的 profile（如 `web`）里升级到 0.2.0，跑一次生成标题，确认不退化：

```sh
dsh plugin --profile web add link:/Users/zilong/zWork/ai/zl-plugins/dsh-session-titler
```

### C6. 回填

- [ ] `0.2.1-alpha.3` / `alpha.4`：能实跑后把 `dsh.compatibility.dshReleases` 的值从 `unknown` 改为实测结论，并同步本清单与 README 的版本表。

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
