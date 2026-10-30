# dsh-session-titler 0.2.2 发版 / 验收清单

> 主题：**修「生成标题」的两类 Host 侧失败**（社区 PR [#2](https://github.com/ZilongYang/dsh-session-titler/pull/2)，作者 [@little3tar](https://github.com/little3tar)）——
> ① 会话记录的模型已在 profile 里被删（provider 在、模型 id 不在）时，旧校验只查 adapter 不查模型，直接把调用派发给 `modelOf()` 的 `UNKNOWN_MODEL`，不回退默认模型；
> ② 端点**强制推理**时（profile 声明 `reasoningEfforts: { off: null }` 让 adapter 把 `off` 编译成「键缺失」，openai-completions 分支发出 `effort: 'none'`），端点报 `400 Reasoning is mandatory for this endpoint and cannot be disabled`。
> 修法与证据链见 `docs/01` 附录 **A8**（含 A8.4 detached-probe 踩坑记录）。
>
> 发版日期：2026-10-30 ｜ 基线：`d05f84d`（PR #2 rebase 合并后 main）

## 1. 代码改动（均已随 PR #2 进 main）

- [x] `title.js`：路由候选逐个过 `ctx.llm.resolveModelInfo()`（挂在 `ctx.llm` 上调，A8.4），`UNKNOWN_MODEL`/`NO_ADAPTER` 判为路由失效、其它探测错误放行给真实调用去报；全灭时 `noRouteError(rejected)` 按首个被拒原因给 `no-model` / `no-adapter` 并带 `route`；`titleReasoningEffort`（元数据无 `off` 档就提前指定）+ `attempt(effort)` 闭包 + 被「强制推理」拒绝后**仅重试一次**（`forcedReasoningEffort`：模型默认档，否则最便宜档）；`POLICY.maxReasoningOutputTokens = 2048`；重试与首次共享同一 30 s 预算。
- [x] `client.js`：`no-model` 中英文案；`describeFailure` 增加 `no-model` 分支。
- [x] `test/title.test.js`：新增 12 条（模型已删回退 / 全灭报 `no-model` / 缺凭据不过滤 / 探测必须带接收者 / 强制推理档位与预算 / 重试链路 5 条）。
- [x] `README.md`、`docs/01`：错误码表补 `no-model`，POLICY 表补 `maxReasoningOutputTokens`，数据流图与失败契约同步，附录 A8。
- [x] `package.json`：`0.2.1` → `0.2.2`（`dshReleases` 无新增版本，兼容声明不变）。

## 2. 本地自检

- [x] `node --check title.js` / `node --check client.js` 通过（发版提交前执行）。
- [x] `npm test` = `node --test` **31 条全绿**（基线 0.2.1 为 19 条，本版新增 12 条）。
- [x] `npm --cache /tmp/dsh-npm-cache pack --dry-run`：文件数与白名单一致，不含 `test/`。

## 3. 发布

- [x] `npm --cache /tmp/dsh-npm-cache publish`（沙箱下默认 `~/.npm` 会被拒；2FA 见 `docs/02`「坑 1」）→ `+ dsh-session-titler@0.2.2`，未触发 OTP。
- [x] 判定以**版本端点**为准（`curl -s https://registry.npmjs.org/dsh-session-titler/0.2.2`）→ **t+2 分钟转 200**（shasum 一致）；tarball 直链又滞后约 5 分钟（t+7 分钟转正），比 0.2.1 的 CDN 延迟更久。
- [x] `git push origin main`（d05f84d..d9f05ed）。
- [x] `docs/02-open-source-and-marketplace.md` 补 0.2.2 发版记录。
- [x] 社区市场**无需**重新提 PR（列表按仓库自动收录）。
- [x] 成品审计：从 registry 直链拉 `dsh-session-titler-0.2.2.tgz` → **13 个文件**，`package/title.js` 含 `noRouteError` / `maxReasoningOutputTokens`，`package/client.js` 含 `noModel` 文案。

## 4. 实机验收（desktop / main profile，DSH `0.2.1-rc.2`）

> 本机两处拷贝已于 2026-10-30 手动覆盖为 0.2.2 的 `client.js` + `title.js` + `package.json`（原文件备份为同目录 `*.bak-0.2.2-20261030-1931*`）；Host 半有改动，**需重启 DSH 生效**，Client 半刷新页面生效。

- [ ] 「生成标题」正常出提案（回归 0.2.1 路径不受影响）。
- [ ] 造一条「模型已删」的会话（改 profile 模型配置）→ 提案提示回退模型或报 `no-model` 文案。
- [ ] 端点强制推理的会话 → 第一次被拒后自动重试成功（或仅提示一次失败文案）。
- [ ] 「确认修改」仍正常（0.2.1 修复路径未回归）。

## 5. 未覆盖 / 已知残留

- 客户端半边依旧没有自动化回归（延续 `docs/01` A7 记录的缺口）；本版 client.js 只加了文案与一个失败分支，风险低。
- `no-model` / 强制推理的实机项依赖特定 profile 状态，报告人（issue #1 / PR #2 作者）环境未直接复用，靠单测覆盖。
