# dsh-session-titler：开源到 GitHub → 发 npm → 上架社区插件市场

> 发布文档（脱敏版）。原始版本含本地绝对路径、临时备份路径与全局提交邮箱，保存在 `private/raw-plans/`（已被 Git 忽略）。
> 前置：插件功能已完成并端到端验证（见 `01-plugin-design-and-implementation.md`）。

## 0. 已核实的事实（决定了整个流程）

| 事实 | 证据 |
|---|---|
| **「社区插件市场」和「dshmarket 插件市场」是同一次提交** | dshmarket README：「这个仓库是市场应用本身，不是插件目录……请去 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 那边提 PR（在列表里加一条即可，**站点和本市场会自动收录**）」 |
| 收录 = 提一个 PR 加**一个文件** `data/plugins/<owner>__<repo>.yml` | contributing.md；字段只有 `url`/`name`/`category`/`description.{en,zh}`（+可选 `tarball`） |
| 分类：同类插件**全部**是 `category: session` | 逐个读了 7 个同类条目 |
| 仓库年龄门槛按**检查运行时刻**算，且每 6 小时自动重跑，红灯会自己变绿 | `scripts/check-submission.mjs`：`MIN_AGE_DAYS = 1`，`ageDays = (Date.now() - created_at)/864e5`；提示原文「nothing to do: this check re-runs by itself」；`.github/workflows/regate.yml` |
| **没有提交数门槛** | 同上，注释：`MIN_COMMITS` 已于 2026-09-03 废除（#4196） |
| npm 包名 `dsh-session-titler` **未被占用** | `registry.npmjs.org/dsh-session-titler` → 404 |
| npm 映射靠 `repository` 字段自动关联，**条目里不能手写 `npm:`** | contributing.md「npm package / npm 包」 |
| 截图放**自己仓库**的 `screenshots.json`（1–8 张，相对路径），PR 里不用加 | contributing.md「Screenshots」 |
| 官方 `@deepseek-ai/*` 应声明为 `peerDependencies` | 本插件**一个都没依赖**（只用 `ctx` 服务），天然满足 |
| **npm 默认缓存被 DSH 文件沙箱挡住**（EPERM），必须 `--cache <可写路径>` | `npm whoami` 直接跑报 EPERM；加 `--cache` 正常 |
| 全局 git 提交邮箱**会被写进公开历史** | `git config --global user.email` |

**已存在的同类插件**：`weibaohui/dsh-smart-title`、`cq-guojia/dsh-session-title-pattern`、`y2zyyr/smart-session-title`、`JohnXu22786/session-titler`、`Relethe/dsh-brief-session-title`、`9Ashwin/dsh-session-rename`、`598829314/oil-dsh-title` —— **它们全都是「自动生成」路线**，本插件是**手动触发 + 确认后才写**。

---

## 1. 目标与验收标准

1. 工作区成为 git 仓库，有清晰提交历史，无敏感文件入库。
2. GitHub 上出现公开仓库 `ZilongYang/dsh-session-titler`，带 `dsh-plugin` topic。
3. npm 上出现 `dsh-session-titler@0.1.0`，`repository` 指回该 GitHub 仓库。
4. 向 `awesome-dsh-plugin/awesome-dsh-plugin` 提交一个 PR，**只新增一个文件**。
5. CI 的 `dsh.bundle` 检查立即通过；仓库年龄检查预期先红、**约 24 小时内自动变绿**。

---

## 2. 文档归档与脱敏

### 2.1 目录结构

```
docs/01-plugin-design-and-implementation.md   ← 公开（脱敏）
docs/02-open-source-and-marketplace.md        ← 公开（脱敏）
private/raw-plans/01-plugin-design-and-implementation.md   ← 原样
private/raw-plans/02-open-source-and-marketplace.md        ← 原样
private/redaction-notes.md                                 ← 脱敏对照表 + 提交身份说明
```

### 2.2 脱敏对照

| 敏感项 | 公开 `docs/` 里 | `private/` 里 |
|---|---|---|
| 真实会话 ID | `session-<redacted>` | 原样 |
| 全局提交邮箱 | 不出现 | 原样 |
| 本地绝对路径 | `<workspace>` | 原样 |
| 临时备份路径 | `$HOME/pnpm-workspace.yaml（改动前已备份）` | 原样 |
| GitHub 用户名 / id | 保留（本就公开） | 原样 |
| npm 账号 | 保留（发布后必然公开） | 原样 |

---

## 3. 阶段 A：开源化改造

### A1 `package.json`

```jsonc
{
  "name": "dsh-session-titler",
  "version": "0.1.0",
  // 删除 "private": true          ← npm 发布必须去掉
  "license": "MIT",
  "author": "ZilongYang",
  "repository": { "type": "git", "url": "git+https://github.com/ZilongYang/dsh-session-titler.git" },
  "homepage": "https://github.com/ZilongYang/dsh-session-titler#readme",
  "bugs": { "url": "https://github.com/ZilongYang/dsh-session-titler/issues" },
  "keywords": ["deepseek","deepseek-harness","dsh","dsh-plugin","client-plugin","session","title","web","cordis"],
  "engines": { "node": ">=20.3" },
  "files": ["index.js","title.js","fence.js","client.js","icon.svg","locale/zh.json","locale/en.json",
            "cordis.patch.yml","README.md","LICENSE",
            "docs/01-plugin-design-and-implementation.md","docs/02-open-source-and-marketplace.md"]
}
```

**明确不加**：`engines.dsh` / `dsh.compatibility`（只在 DSH `0.2.0-rc.2` 上实测过，不写跨版本兼容承诺）、`dshhub` 清单块、`peerDependencies`。

### A2 新增 `LICENSE`（MIT / `Copyright (c) 2026 ZilongYang`）

### A3 新增 `.gitignore`

```gitignore
# 私有：原始计划副本 + 脱敏对照，永不入库、永不进 npm 包
/private/

# DSH 沙箱挡住 ~/.npm，npm 命令必须指到这个本地缓存
.npm-cache/

# 系统与编辑器
.DS_Store
*.log

# 依赖树（本包无依赖，保持仓库干净）
node_modules/
```

### A4 清理探测时遗留的 `.npm-cache/`

### A5 `README.md`：顶部加英文导读；末尾加一行「设计与开源计划见 `docs/`」

### A6 截图：本轮跳过（不声明 `screenshots.json`，市场卡片无图，不影响上架）。日后往仓库丢图，加 `screenshots.json` 即可，**不用再提 PR**。

---

## 4. 阶段 B：`git init` + 提交

```sh
cd <workspace>
# ① 提交身份脱敏（仅本仓库，不动全局配置）
git config user.name  "ZilongYang"
git config user.email "<github-id>+ZilongYang@users.noreply.github.com"

git init -b main
# ② 提交前硬校验：private/ 必须被忽略
git check-ignore -v private/raw-plans/01-plugin-design-and-implementation.md
git status --short --ignored | grep private

git add -A
git diff --cached --stat          # 复核：不应出现 private/ 与 .npm-cache/
git commit -m "feat: DSH session titler — whole-session title proposal with confirm-first rename"
git add -A && git commit -m "chore: open-source metadata, docs and LICENSE"
```

---

## 5. 阶段 C：创建 GitHub 仓库并推送

```sh
gh auth setup-git
gh repo create ZilongYang/dsh-session-titler --public --source=. --remote=origin --push \
  --description "Generate a title for a whole DSH session on demand, then confirm before it is applied."
gh repo edit ZilongYang/dsh-session-titler \
  --add-topic dsh-plugin --add-topic deepseek-harness --add-topic dsh
```

`dsh-plugin` topic 是收录要求之一，**必须在提 PR 前打好**。

---

## 6. 阶段 D：发布 npm

```sh
cd <workspace>
NPM="npm --cache /tmp/dsh-npm-cache"     # 必须：默认 ~/.npm 会被沙箱拒绝
$NPM publish --dry-run
$NPM publish
$NPM view dsh-session-titler version repository dist.fileCount
```

- 首次发 `0.1.0`；`repository` 必须已指向该仓库。
- 本地 profile 的 `link:` 安装**不受影响**。

---

## 7. 阶段 E：提社区插件市场 PR

### 条目文件 `data/plugins/ZilongYang__dsh-session-titler.yml`

```yaml
url: https://github.com/ZilongYang/dsh-session-titler
name: ZilongYang/dsh-session-titler
category: session
description:
  en: 'Adds a manual, confirm-first title generator: a header button and a session-row menu entry ask a model to summarize the whole conversation, show the proposal in an editable dialog, and rename the session only after you confirm — without registering a title provider or changing automatic titling.'
  zh: '手动触发的「先确认再改名」标题生成器：顶栏按钮与会话行菜单各一个入口，让模型总结整段会话给出标题，在可编辑弹窗里确认后才重命名会话；不注册标题 provider，不影响自带的自动标题。'
```

### 提交（不克隆条目仓库，走 API）

```sh
gh repo fork awesome-dsh-plugin/awesome-dsh-plugin --clone=false
UP=$(gh api repos/awesome-dsh-plugin/awesome-dsh-plugin/git/refs/heads/main --jq .object.sha)
gh api repos/ZilongYang/awesome-dsh-plugin/git/refs -X POST -f ref=refs/heads/add-session-titler -f sha=$UP
gh api repos/ZilongYang/awesome-dsh-plugin/contents/data/plugins/ZilongYang__dsh-session-titler.yml -X PUT \
  -f branch=add-session-titler -f message="Add ZilongYang/dsh-session-titler" \
  -f content="$(base64 -i /tmp/titler-entry.yml)"
gh pr create --repo awesome-dsh-plugin/awesome-dsh-plugin --head ZilongYang:add-session-titler \
  --title "Add ZilongYang/dsh-session-titler" --body-file /tmp/titler-pr-body.md
```

### PR body 要点

- [x] 只加一个文件，未手工编辑 README
- [x] `package.json` 声明 `dsh.bundle`（`{ patch: "./cordis.patch.yml" }`）
- [ ] 仓库满 1 天 —— **预期自动转绿**
- [x] `category: session`
- [x] 描述只陈述功能，无营销词
- [x] 已打 `dsh-plugin` topic
- 已发 npm（`repository` 指回本仓库）；无 `@deepseek-ai/*` 依赖，不需要 `peerDependencies`
- 差异段：现有 7 个同类插件全部走**自动**生成；本插件是**手动触发 + 确认后才写**，且**不注册 title provider**，可与它们共存。

---

## 8. 验证清单

| # | 验什么 | 怎么验 |
|---|---|---|
| 1 | **private 绝不入库** | `git log --all --name-only \| grep -c '^private/'` → 0 |
| 2 | **公开历史无 Gmail** | `git log --format='%ae %ce' \| grep -c gmail` → 0 |
| 3 | 提交内容干净 | `git log --oneline` + `git diff --cached --stat` |
| 4 | npm 包不含 private | `npm pack --dry-run` 清单核对 |
| 5 | 远端仓库与 manifest | `gh repo view … --json url,visibility,repositoryTopics`；远端 `package.json` 里有 `dsh.bundle` |
| 6 | npm 已发布且互链 | `npm view dsh-session-titler version repository` |
| 7 | PR 只动一个文件 | `gh pr view <n> --json files` |
| 8 | CI 与预期一致 | `gh pr checks <n>` |
| 9 | 上架生效（隔天） | `curl -s https://awesome-dsh-plugin.com/plugins.json \| grep -i session-titler` |

---

## 9. 风险与回滚

| 风险 | 对策 |
|---|---|
| **private/ 泄漏** | 三重保险：`.gitignore` + 提交前 `git check-ignore`/`git diff --cached --stat` + 提交后 `git log --all --name-only` 断言为 0。⚠️ `git add -f` 会绕过忽略规则 |
| **提交邮箱泄漏** | 仓库级 `user.email` 用 noreply；验证项 2 断言 Gmail 计数为 0 |
| **可能被判「已被现有条目覆盖」** | 同类有 7 个，差异点是**手动触发 + 确认后才写 + 不注册 provider + 生成阶段零写入**，写进描述与 PR body。若被打回，改描述重提即可 |
| 仓库名与 `JohnXu22786/session-titler` 相近 | registry 键是 `owner/repo`，不冲突 |
| npm 沙箱 EPERM | 全程 `--cache /tmp/dsh-npm-cache` |
| npm 发布不可逆 | 先 `--dry-run`；坏版本用 `npm deprecate` 而非 unpublish |
| gh token 缺 `delete_repo` | 如需删仓库，在 GitHub 网页操作 |

---

## 10. 明确不做

- 不提 DSHHub.co、不提 dshpluginhub.ai。
- 不加 `dshhub` 清单块、不加跨版本兼容声明。
- 不改插件运行行为。
- 不把 profile 的 `link:` 安装换成 npm/GitHub 安装。
- 不做截图。
- 不动全局 git 配置。

---

## 附录：执行结果（2026-10-01）

### 已完成

| 环节 | 结果 |
|---|---|
| 文档归档 | `docs/` 两份脱敏版 + `private/` 原始副本与脱敏对照表（`private/` 已被 `.gitignore` 忽略） |
| 开源化改造 | 去掉 `private`，补 `repository` / `homepage` / `bugs` / `keywords` / `engines`，新增 `LICENSE`、`.gitignore` |
| 首次提交 | 2 个提交：`feat: DSH session titler — whole-session title proposal with confirm-first rename`、`chore: LICENSE, .gitignore and design/marketplace docs` |
| 提交身份脱敏 | 仓库级 `user.email` 用 GitHub noreply；`git log --format='%ae %ce' \| grep -c gmail` → **0**；全局 git 配置未改动 |
| 公开仓库 | <https://github.com/ZilongYang/dsh-session-titler>（PUBLIC），topics：`dsh-plugin` / `dsh` / `deepseek-harness` |
| 远端 manifest | 已在远端确认含 `dsh.bundle: { "patch": "./cordis.patch.yml" }`，无 `private` |
| 社区市场 PR | <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/6327> —— 只新增 `data/plugins/ZilongYang__dsh-session-titler.yml`（+6 −0），`category: session` |
| npm 包内容 | `npm pack --dry-run` → 13 个文件，**不含** `private/` 与 `.npm-cache/` |

### 未完成 / 阻塞

**npm 发布被账号 2FA 拦住。** `npm publish` 返回：

```
E403 … Two-factor authentication or granular access token with bypass 2fa enabled is required to publish packages.
```

排查过程与结论：粒度 token 本身已正确（`permissions: package/write`、90 天有效期），但 npm 侧元数据显示 `bypass_2fa: false` —— 缺的是创建 token 时 **「Bypass two-factor authentication (2FA)」** 那个勾。两条解法：

1. 重建 Granular Access Token 并勾上该框，再 `npm config set //registry.npmjs.org/:_authToken=<token>`；
2. 在终端跑一次 `npm publish --otp=<6位码>`。

发布完成后市场会**自动**从 npm registry 采集关联（条目里不需要、也不允许手写 `npm:` 字段）。

### CI 预期

条目数（1 ≤ 3）→ `dsh.bundle` ✅ → **仓库年龄**（仓库创建于 2026-10-01，**先红**）→ awesome-lint 与站点构建。
`regate.yml` 每 6 小时重跑，约 24 小时内自动变绿；期间**不** push 空提交、**不**重开 PR。

