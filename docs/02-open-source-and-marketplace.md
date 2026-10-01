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
| **npm 发布** | **`dsh-session-titler@0.1.0` 已发布**（2026-10-01）。`repository` 指回本仓库，`dist.fileCount = 13` |

### npm 发布：踩到的两个坑（留档）

**坑 1 —— 账号开了 2FA 时，普通 token 发不出去。** `npm publish` 连续返回：

```
E403 … Two-factor authentication or granular access token with bypass 2fa enabled is required to publish packages.
```

诊断方法不是猜，而是直接读 token 元数据：

```sh
curl -sS -H "Authorization: Bearer $(awk -F= '/_authToken/{print $2}' ~/.npmrc)" \
  https://registry.npmjs.org/-/npm/v1/tokens
```

`npm login` 产生的会话 token 会带一个约 24 小时的 `expiry`；而**粒度 token** 即便权限正确
（`permissions: [{"name":"package","action":"write"}]`），只要缺 `"bypass_2fa": true` 就仍然发不出去。
创建粒度 token 时，「Bypass two-factor authentication (2FA)」是一个**独立复选框**，需要单独勾选。

⚠️ **后续注意**：npm 已在 2026-07 公告收紧 bypass-2FA token——账号类操作从 2026-08 起、**直接发布从 2027-01 起**将不再支持。
2027 年起本仓库发版应改用 `npm publish --otp=<6位码>`，或配置 Trusted Publishing（OIDC）。

**坑 2 —— 发布前反复探测包名，会把 404 缓存进 CDN。** 发布成功后一段时间内：

- `registry.npmjs.org/dsh-session-titler` 与 tarball 直链仍返回 `{"error":"Not found"}`（加 cache-buster 也命中缓存）；
- 但 `registry.npmjs.org/dsh-session-titler/0.1.0`（版本端点）**已经是 200**，`npmjs.com` 页面也已显示 `0.1.0 • Public`。

结论：**负缓存会自动过期**（本次约 10 分钟）。判断「到底发出去没有」要看**版本端点**与 **npm 官网页面**，不要只看 packument。

### 成品审计（从 registry 重新拉取）

```sh
npm --cache /tmp/dsh-npm-cache pack dsh-session-titler@0.1.0 --pack-destination /tmp
tar tzf /tmp/dsh-session-titler-0.1.0.tgz | sort
```

结果：**13 个文件**，与 `files` 白名单逐项一致，**无 `private/`、无 `.npm-cache/`**：

```
package/LICENSE  package/README.md  package/client.js  package/cordis.patch.yml
package/docs/01-plugin-design-and-implementation.md
package/docs/02-open-source-and-marketplace.md
package/fence.js  package/icon.svg  package/index.js
package/locale/{en,zh}.json  package/package.json  package/title.js
```

### CI 结论（已出）

- `check` ✅ **通过**（`8m13s`）
- `Submission gate` ❌ —— **唯一失败项是仓库年龄**，原文：
  > `repository is 0.0 days old (needs 1) — nothing to do: this check re-runs by itself and should clear in about 24h. No need to resubmit, push, or close and reopen; the age bar is the only thing failing here.`

即 `dsh.bundle`、条目数、格式 lint **全部已通过**，只等 24 小时年龄门槛自动清零。期间**不** push 空提交、**不**重开 PR。

### 0.1.2 发版记录（2026-10-02）

**发版原因**：0.1.1 的「已注册 adapter 校验」只加在冷会话分支，活会话把日志里最后一条路由（`opencode-go-new`）原样拿去调用，换成没有该 provider 的 profile 后直接 502 `no adapter registered`。根因、证据与修法见 `docs/01` 附录 **A5**。

**提交与推送**：

```sh
# 36ed227 fix: validate the recorded model route for live sessions too
# 9ca1796 docs: record the live-session route gap and the fallback note
# da6285f chore(release): 0.1.2 — validate routed providers for live sessions
git push origin main                # d025362..da6285f
```

**发布**：

```sh
npm --cache /tmp/dsh-npm-cache publish
```

- 结果：`+ dsh-session-titler@0.1.2`；npm debug 日志确认 `http fetch PUT 202 https://registry.npmjs.org/dsh-session-titler`（服务端已接收，未触发 OTP——现有粒度 token 的 bypass-2FA 仍有效）。
- **包内容未变**：13 个文件，同 0.1.0 的白名单；`test/` 不在 `files` 里，故不进包。
- 读接口依旧滞后（与「坑 2」同一现象，但这次连**版本端点也还是 404**）：

  ```
  curl -s "https://registry.npmjs.org/dsh-session-titler/0.1.2?cb=$RANDOM"  → "version not found: 0.1.2"
  curl -s "https://registry.npmjs.org/dsh-session-titler"                   → dist-tags.latest 仍为 0.1.1
  ```

- 本轮额外碰到两次 `curl: (35) LibreSSL SSL_connect: SSL_ERROR_SYSCALL in connection to registry.npmjs.org:443`（本地代理抖动），第三次即恢复正常；与发布结果无关，判断依据仍取 **PUT 状态码 + npm 命令回显**。
- 判定「发出去了没有」的标准不变：**版本端点 / npm 官网页面**为准，负缓存约 10 分钟过期。

**复验（CDN 刷新后）**：

```sh
curl -s "https://registry.npmjs.org/dsh-session-titler/0.1.2?cb=$RANDOM" | head -c 200
npm --cache /tmp/dsh-npm-cache pack dsh-session-titler@0.1.2 --pack-destination /tmp
tar xzOf /tmp/dsh-session-titler-0.1.2.tgz package/title.js | grep -c routeCandidates   # 期望 ≥ 2
```

**复验结果（发布后约 10 分钟，2026-10-02 03:04）**：

- `dist-tags.latest` 已由 `0.1.1` 变为 **`0.1.2`**；版本端点 `GET /dsh-session-titler/0.1.2` 返回 0.1.2 的 packument。
- `npm --cache /tmp/dsh-npm-cache pack dsh-session-titler@0.1.2` 拉下的 tarball：**13 个文件**、`package/package.json` 的 `version = 0.1.2`、`package/title.js` 里 `routeCandidates` 计数 **3**（新增逻辑确已在正式包里）。
- 与「坑 2」完全一致：负缓存约 10 分钟自动过期，无需重新发布。

**安装侧提醒**：CDN 刷新前 `/install` 与市场装到的仍是 `0.1.1`。本机 DSH Next 的 `main` profile 已从 `link:` 回滚到 npm `0.1.1`（`~/.dsh/profiles/main/node_modules/dsh-session-titler/title.js` 里 `routeCandidates` 计数为 0，即**当前无修复**）；CDN 刷新后需退出 App 再执行：

```sh
dsh plugin --profile main add dsh-session-titler@0.1.2
```


