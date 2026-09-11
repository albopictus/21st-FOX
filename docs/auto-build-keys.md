# SullyOS 自动编译与自动构建部署相关 Key / Token 清单

本文档整理了 SullyOS / FoxOS 代码库中与**「自动编译、自动构建、CI/CD 部署」**相关的全部 Key、Token、Secrets 及环境变量，方便后续查阅与配置。

---

## 目录

1. [GitHub Actions CI/CD 自动编译与发布（Secrets & Vars）](#1-github-actions-cicd-自动编译与发布secrets--vars)
2. [主动消息 2.0 / 后端 Worker 一键部署密钥](#2-主动消息-20--后端-worker-一键部署密钥)
3. [Vite 编译期注入的 Build 常量与哈希](#3-vite-编译期注入的-build-常量与哈希)
4. [二次开发 / 迁移到个人仓库的修改注意点](#4-二次开发--迁移到个人仓库的修改注意点)

---

## 1. GitHub Actions CI/CD 自动编译与发布（Secrets & Vars）

仓库在 `.github/workflows/` 下配置了若干套自动化编译与持续集成流水线，分别使用以下 Key：

| Key / 变量名 | 类型 | 所在工作流 | 作用与触发机制 |
|-------------|------|-----------|---------------|
| **`CLOUDFLARE_API_TOKEN`** | Actions Secret | [`.github/workflows/deploy-cloudflare-worker.yml`](../.github/workflows/deploy-cloudflare-worker.yml) | **前端自动编译与部署**：Push 到 `master` 分支时自动触发。流水线运行 `pnpm run build`，并通过 Wrangler 将编译后的静态产物发布到 Cloudflare。<br>*(若未配置则在 Step 检查时提示 `没配 CLOUDFLARE_API_TOKEN，跳过 Cloudflare 部署。`)* |
| **`WORKERS_REPO_TOKEN`** | Actions Secret | [`.github/workflows/sync-workers-repo.yml`](../.github/workflows/sync-workers-repo.yml) | **后端 Worker 自动编译与同步**：当 `worker/**`、`utils/**` 或 `types.ts` 有改动时，自动执行 `pnpm build:workers` 打包 esbuild bundles，并使用此 Token（拥有 `contents:write` 权限的 fine-grained PAT）自动 commit & push 到用于用户 fork 部署的子仓库（原版为 `Tosd0/sullyos-workers`）。 |
| **`GITHUB_TOKEN`** | 自动生成 Secret | [`.github/workflows/build-apk.yml`](../.github/workflows/build-apk.yml) | **Android APK 自动编译打包**：Push 到 `master` 时，自动编译 Web 包（`pnpm run build`），同步 Capacitor 并执行 `./gradlew assembleDebug`，编译出 `FoxOS-latest.apk`，自动发布到 GitHub Release（标签为 `v-latest`，名称为 `FoxOS 最新构建 (Auto Build)`）。 |
| **`UMAMI_SCRIPT_URL`<br>`UMAMI_WEBSITE_ID`** | Actions Variables | [`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml)<br>[`.github/workflows/deploy-cloudflare-worker.yml`](../.github/workflows/deploy-cloudflare-worker.yml) | **编译期统计 Key**：构建静态页面时注入的 Umami 访问统计地址与站点 ID。Fork 仓库若未在 Variables 中配置，编译出来的页面会自动降级为纯零统计版本，不引入第三方打点。 |
| **`AUDIT_SSH_KEY`** | Actions Secret | [`.github/workflows/privacy-audit.yml`](../.github/workflows/privacy-audit.yml) | **每日隐私审计 SSH 私钥**：用于定时登录审计服务器比对 Schema 与自检日志。只在原作者环境使用。 |

---

## 2. 主动消息 2.0 / 后端 Worker 一键部署密钥

用于用户自己在 Cloudflare / 自建服务器上运行后端定时任务与推送：

| 密钥名称 | 来源 / 生成方式 | 用途 |
|---------|---------------|------|
| **`AMSG_MASTER_KEY`** | 前端一键生成（[`utils/activeMsgClient.ts`](../utils/activeMsgClient.ts)） | **任务加密主密钥**：64 位十六进制字符串（256-bit）。由浏览器 `crypto.getRandomValues()` 随机生成，填入 Worker 的环境变量中，用于加解密存储在 D1 数据库中的任务 payload 与角色凭据。 |
| **`Cloudflare API Token`** | Cloudflare 控制台创建 | **前端一键自动化部署**：用户在系统设置中点击「一键部署 Worker」时填入，授权前端直接调用 Cloudflare REST API 自动创建 D1 数据库、绑定环境变量并上传打包好的 Worker 脚本。 |
| **`VAPID_PUBLIC_KEY`<br>`VAPID_PRIVATE_KEY`** | 前端设置面板生成 | **Web Push 凭据对**：用于浏览器端推送握手及 Worker 侧向 FCM/Mozilla 推送服务发起加密签名。 |
| **`D1_DATABASE_ID`** | Cloudflare D1 控制台 | 关联的 SQLite 数据库 UUID，在部署 Worker 时注入到 `wrangler.toml` 中。 |

---

## 3. Vite 编译期注入的 Build 常量与哈希

在前端代码执行 `pnpm run build`（或 Vite dev）时，[`vite.config.ts`](../vite.config.ts) 会在编译期自动捕获并注入以下变量，源码通过 [`utils/buildInfo.ts`](../utils/buildInfo.ts) 统一消费：

```ts
define: {
  __BUILD_BRANCH__: JSON.stringify(gitInfo.branch),  // 分支名，如 'test'
  __BUILD_COMMIT__: JSON.stringify(gitInfo.commit),  // 7 位 short commit hash，如 'dc31ecf'
  __BUILD_TIME__: JSON.stringify(buildTime),        // UTC+8 编译时间戳
  __BUILD_BADGE_VISIBLE__: JSON.stringify(showBuildBadge), // 是否显示桌面调试角标
}
```

- **`BUILD_LABEL`**：由 `__BUILD_BRANCH__@__BUILD_COMMIT__` 组成（例如 `test@dc31ecf`），显示在设置页关于、桌面角标 `BuildBadge` 以及控制台日志中。
- **`VITE_SHOW_BUILD_BADGE` / `VITE_HIDE_BUILD_BADGE`**：环境变量开关。在构建时若未开启，esbuild 会在编译阶段将整个 `DevDebugPanel` 调试面板及角标彻底 Tree-shake 掉，确保正式生产构建不泄露内部调试工具。

---

## 4. 二次开发 / 迁移到个人仓库的修改注意点

如果将项目 Fork 或迁移到自己的 GitHub 仓库并打算启用上述自动编译/构建功能，需要注意修改以下硬编码项：

1. **Cloudflare 自动部署工作流** [`.github/workflows/deploy-cloudflare-worker.yml`](../.github/workflows/deploy-cloudflare-worker.yml)：
   - `CLOUDFLARE_ACCOUNT_ID` 原版硬编码为 `2cd975a0e2a9d667b85119c456d9478f`，需要替换为您自己的 Cloudflare Account ID。
   - 在 GitHub 仓库 `Settings -> Secrets and variables -> Actions` 中添加 `CLOUDFLARE_API_TOKEN`。
2. **Worker 部署同步工作流** [`.github/workflows/sync-workers-repo.yml`](../.github/workflows/sync-workers-repo.yml)：
   - `TARGET_REPO` 原版为 `Tosd0/sullyos-workers`，需修改为您自己创建的 target 仓库。
   - 创建具有目标仓库 `contents:write` 权限的 GitHub PAT，保存为 secret `WORKERS_REPO_TOKEN`。
3. **Android APK 构建工作流** [`.github/workflows/build-apk.yml`](../.github/workflows/build-apk.yml)：
   - 确保 GitHub 仓库的 `Settings -> Actions -> General -> Workflow permissions` 开启了 **"Read and write permissions"**，以便 `GITHUB_TOKEN` 具有发布 Release 的权限。
