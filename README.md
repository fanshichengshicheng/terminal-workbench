# 终端工作台

终端工作台是一款面向 Windows 的本机项目工作区，将项目管理、创作笔记、今日计划、日历、本机工具启动器、可视化画布和 Codex 对话整合在同一个桌面应用中。

当前版本：`0.2.7`

## 主要功能

- 多项目工作区与独立项目目录
- 本机 Codex 对话、流式回复、命令执行、文件修改与审批
- 后台任务中心，离开项目页面后任务仍可继续
- 画布文字、图片、回复卡片、自由涂鸦和节点连线
- 聊天图片附件、历史图片回显和操作记录折叠
- 创作知识库、笔记关系图谱、今日计划与月历同步
- Windows 应用、快捷方式、脚本、网址和文件夹快捷启动
- API Key 使用 Windows Credential Manager 保存，不写入项目文件

## 系统要求

- Windows 10/11 x64
- Node.js `>=22.13.0`
- pnpm
- Rust 与 Tauri 2 所需的 Windows 构建工具（仅从源码构建时需要）

## 本地开发

```powershell
pnpm install
pnpm desktop:dev
```

只运行网页界面：

```powershell
pnpm desktop:web:dev
```

## 构建 Windows 安装包

```powershell
pnpm install
pnpm desktop:build
```

安装包输出到：

```text
src-tauri/target/release/bundle/nsis/
```

构建前，`scripts/prepare-codex-sidecar.mjs` 会从已安装的官方 `@openai/codex` npm 依赖中准备 Windows Codex 运行时。`src-tauri/resources/` 是生成目录，不进入 Git 仓库。

## 数据与隐私

- 项目、计划、笔记与画布数据保存在本机浏览器存储或 IndexedDB 中。
- 第三方模型 API Key 在桌面版中保存到 Windows Credential Manager。
- `.env`、本机日志、构建缓存、Codex 运行时二进制和个人文档均由 `.gitignore` 排除。

## 验证

```powershell
pnpm exec eslint app/ProjectWorkspace.tsx app/codex-client.ts app/codex-runtime.ts
pnpm desktop:web:build
cargo check --manifest-path src-tauri/Cargo.toml
```

## 发布

`0.2.7` 的变更说明见 [RELEASE_NOTES.md](RELEASE_NOTES.md)。

本仓库当前未附带开源许可证；公开源码不等同于授予再分发或商业使用许可。
