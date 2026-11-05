# dsh-session-titler 0.2.3 发版 / 验收清单

> 主题：**对齐 DSH 0.2.2-rc.1 的会话菜单行位置 + 补齐兼容矩阵**，无功能变化。
> 方案见 `docs/PLAN-2026-11-05.md`；核查依据见 `docs/COMPAT-2026-11-05-dsh-0.2.2-rc.1.md` 与 `docs/01` 附录 **A9**。
>
> 发版日期：待验收通过后填写 ｜ 基线：待填写

## 1. 代码 / 文案改动

- [x] `package.json`：`version` `0.2.2` → `0.2.3`。
- [x] `package.json`：`dsh.compatibility.dshReleases` 补 `0.2.1-rc.3/4/5`、`0.2.2-alpha.2/3`、`0.2.2-rc.1`（验收前 `unknown`）。
- [x] `client.js`：头注释改为「≤0.2.1 在 Rename/Fork 之间；≥0.2.2 在 Copy session ID 之后、Archive 之前」，顺带修正顶栏 order 注释（`0` → `-8`）。
- [x] `README.md`：快速开始第 2 步、入口表「会话行菜单项」行、兼容表新增 `0.2.2-rc.1` 行、补「0.2.3 改了什么」、文档索引挂链。
- [x] `locale/zh.json`、`locale/en.json`：`meta.description` 同步新位置。
- [x] `title.js`：`preparedTitleStream` 的 JSDoc 澄清「`ctx.llm.prepareCall(config, signal)` 是 `LlmRuntime` 服务签名，不是适配器层签名」；**行为不变**。
- [x] 文档：`docs/PLAN-2026-11-05.md`、`docs/01` 附录 A9、本清单。

## 2. 本地自检

- [x] `node --check client.js` / `title.js` / `index.js` 通过。
- [x] `npm test` = `node --test` **31 条全绿**（行为未变，无新增/删除用例）。
- [x] `npm --cache /tmp/dsh-npm-cache pack --dry-run`：**13 个文件**，`0.2.3`。
- [x] 覆盖到 desktop / main / web 三个 profile 的 `node_modules/dsh-session-titler/`（备份 `*.bak-0.2.3-20261105-204640` / `-205xxx`），刷新页面。

## 3. 实机验收

### 3.1 桌面版 DSH `0.2.2-rc.1`（`desktop` profile）

- [ ] 会话「…」菜单里「生成标题」位于「复制会话 ID」之后、「归档」之前。
- [ ] 点它 → 弹窗打开、菜单关闭；取消 / Esc 不写任何数据。
- [ ] 提案可编辑 →「确认修改」后标题真的改变，刷新仍在。
- [ ] 顶栏「✦ 生成标题」位置与行为无回归；空白会话按钮置灰。
- [ ] 窄窗口下顶栏按钮未被渐隐到不可点。
- [ ] 插件页里本插件的描述文案已是 0.2.3 的新版（`locale` 生效）。

### 3.2 CLI DSH `0.2.1-rc.5`（`main` / `web` profile，legacy 位置回归）

- [ ] 「生成标题」仍在「重命名」下方、「分叉会话」上方（旧 Slot 语义未变）。
- [ ] 点击 → 弹窗 →「确认修改」整条链路正常。

## 4. 发布（**验收通过后**才执行）

- [ ] `dshReleases["0.2.2-rc.1"]` 改为 `compatible`，README 兼容表状态改为「已验证可用」。
- [ ] `npm --cache /tmp/dsh-npm-cache publish`；以版本端点 `registry.npmjs.org/dsh-session-titler/0.2.3` 转 200 为准（CDN 负缓存约 10 分钟）。
- [ ] `git commit`（`chore(release): 0.2.3 — …`）→ `git tag -a v0.2.3` → `gh release create`（tgz 资产）。
- [ ] `git push origin main`。
- [ ] `docs/02-open-source-and-marketplace.md` 补 0.2.3 发版记录。

## 5. 未覆盖 / 已知残留

- Client 半仍无自动化回归（延续 `docs/01` A7 起的缺口）；本版只改注释与文案，风险低。
- `0.2.1-rc.3/4/5` 未实测，`dshReleases` 保持 `unknown`。
- 遗留到 `0.3.0`：迁移 `ctx.contextMenus` 保住「紧跟重命名」的位置（双路径 + `dsh.client.inject` 新增 `@deepseek-ai/dsh-client-ui-context-menu` + 客户端单测）；补 ja/es/fr/de/ru/pt 语言包。
