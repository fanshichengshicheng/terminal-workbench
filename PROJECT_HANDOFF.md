# 终端工作台项目交接文档

本文档用于在新 Codex 对话中快速恢复项目上下文。开始任何修改前，先完整阅读本文档，再检查 Git 状态和当前运行服务。

## 1. 项目定位

这是一个面向 Windows 桌面使用场景的个人工作台，目前优先完善网页版原型。

- 工作目录：仓库根目录
- 网页地址：**http://localhost:3000/**
- 当前阶段只修改网页版。
- 不做手机版适配，界面以 Windows 宽屏桌面为目标。
- Windows/Tauri 版本暂缓，等网页版功能和交互稳定后再统一生成。
- 当前 Git 基准：**59b0efa feat: expand web workbench projects and memory interactions**

## 2. 与用户协作的固定规则

1. 每次准备修改前，先向用户说明要修改什么、交互会如何变化。
2. 等用户明确确认后再修改。
3. 如果用户明确说“不用确认”，该次任务可以直接执行。
4. 不擅自扩展已确认范围，尤其不要提前生成 Windows 版。
5. 不删除、回退或覆盖并非当前任务产生的本地修改。

## 3. 环境与启动方式

要求：Node.js 22.13 或更高版本，包管理器使用 pnpm。

首次安装依赖：

~~~powershell
pnpm install
~~~

启动网页开发服务：

~~~powershell
pnpm dev
~~~

网页默认访问地址：**http://localhost:3000/**

项目内真实 Codex 对话还需要另开一个终端启动桥接：

~~~powershell
pnpm codex:bridge
~~~

桥接端口：

- 浏览器连接：**ws://127.0.0.1:45123**
- Codex app-server：**ws://127.0.0.1:45124**
- 健康检查：**http://127.0.0.1:45124/readyz**

如果端口已经被现有进程监听，不要重复启动或粗暴结束其他进程。先检查：

~~~powershell
Get-NetTCPConnection -LocalPort 3000,45123,45124 -ErrorAction SilentlyContinue
~~~

## 4. 当前模块和产品规则

### 4.1 忆泡

- 忆泡用于保存灵感。
- 信息面板只保留“转项目”和“删除”。
- 鼠标悬停时忆泡停止移动。
- 点击查看信息后忆泡停止移动，关闭信息后恢复。
- 可以进入关联模式，手动关联多个忆泡。
- 已关联忆泡共享运动方向，并平滑收拢到约 6px 的边缘间距。
- 关联组中任意忆泡悬停或被查看时，整个关联组暂停。
- 非沉底忆泡统一缩小约 30%。
- 当前沉底阈值为距上次查看 90 天。
- 沉底忆泡进一步缩小，固定在底部且完全静止。
- 沉底忆泡不可被其他忆泡推动，也不允许参与关联。
- 已关联忆泡一旦沉底，立即解除它涉及的全部关联。
- 关闭“记忆衰减”后，沉底忆泡退出沉底状态并恢复运动。

### 4.2 今日计划与日历

- 今日计划只有“进行中”和“已完成”两个状态。
- 没有奖励标识、奖励数量或领取按钮。
- 支持新增计划、删除计划和切换完成状态。
- 今日计划完成度区域保持固定布局。
- 日历和计划使用同一份数据。
- 日历中可以查看、添加或切换所选日期的计划。
- 日历顶部没有 TODAY/今天按钮。

### 4.3 工具

- 工具模块用于管理常用程序、快捷方式、脚本、网址、系统工具和文件夹。
- 浏览器版只展示和保存工具信息，不能真正打开本机程序。
- EXE、LNK、BAT、CMD、PS1、URL、MSC 和文件夹的拖入及启动能力，需要未来 Windows/Tauri 版本提供。
- 当前不要继续生成或打包 Windows 版。

### 4.4 项目工作区

- 项目列表支持新增项目、标签和删除项目。
- 从忆泡转成项目后会进入项目列表。
- 每个项目有一个独立的大画布。
- 画布基于 @xyflow/react。
- 支持文字卡片、图片卡片和 Codex 回复卡片。
- 支持拖动、缩放、连线、节点尺寸调整、缩略图和画布控制。
- 图片可以通过文件选择器添加，也可以直接拖入画布。
- 画布和项目对话引用保存在 IndexedDB。
- IndexedDB 数据库：**terminal-workbench-projects**。
- 对象仓库：**workspace-state**。

### 4.5 项目内 Codex

- 每个项目可以创建多个真实、独立的 Codex 对话。
- 支持创建、切换、重命名、分叉和归档对话。
- 支持流式回复、命令事件、文件修改事件和停止任务。
- 支持命令与文件修改审批。
- Codex 回复可以固定到画布。
- 每个项目需要先填写本机绝对项目目录，再创建对话。
- 新线程使用 approvalPolicy: on-request。
- 新线程使用 sandbox: workspace-write。
- 浏览器连接本地 WebSocket 代理，代理再连接官方 Codex CLI app-server。
- 代理必须把 WebSocket Buffer 转成 UTF-8 字符串，否则 Codex 会丢弃二进制消息。

## 5. 关键文件

- **app/Workbench.tsx**：工作台主体、忆泡运动、关联、计划、日历、工具和项目入口。
- **app/module-clean.css**：工作台主体和各模块主要样式。
- **app/ProjectWorkspace.tsx**：项目画布、多 Codex 对话、审批和流式消息。
- **app/project-workspace.css**：项目工作区专用样式。
- **app/codex-client.ts**：浏览器端 Codex JSON-RPC/WebSocket 客户端。
- **app/project-storage.ts**：项目画布和线程引用的 IndexedDB 持久化。
- **scripts/codex-bridge.mjs**：本地 WebSocket 代理和 Codex app-server 启动器。
- **app/layout.tsx**：全局样式和 React Flow 样式入口。
- **app/frame.css、app/globals.css、app/settings.css**：当前页面仍在使用的基础样式。
- **package.json、pnpm-lock.yaml**：依赖和运行命令。

## 6. 数据持久化位置

以下数据保存在浏览器本地，而不是 Git 仓库：

- 忆泡和项目条目：localStorage **memory-workbench-entries**
- 基础设置：localStorage **memory-workbench-preferences**
- 每日计划：localStorage **workbench-daily-plans**
- 忆泡关联：localStorage **workbench-memory-links**
- 工具列表：localStorage **workbench-tools**
- 项目目录、Codex 线程引用、画布节点和连线：IndexedDB

不要在调试时随意清除浏览器站点数据，否则用户现有项目画布和计划会丢失。

## 7. 构建与验证

生产构建：

~~~powershell
$env:WRANGLER_LOG_PATH='.wrangler/wrangler.log'
pnpm exec vinext build
~~~

专项 TypeScript 检查：

~~~powershell
$output = pnpm exec tsc --noEmit 2>&1
$output | Select-String 'Workbench.tsx|ProjectWorkspace|codex-client|project-storage'
~~~

差异检查：

~~~powershell
git diff --check
~~~

已知的整库 TypeScript 历史错误：

- db/index.ts 缺少 cloudflare:workers 声明。
- worker/index.ts 缺少 Fetcher 和 D1Database 类型。
- 这些错误不是工作台功能修改引入的。

浏览器自动截图控制组件此前无法初始化，错误为本机缺少运行资源：

~~~text
failed to write kernel assets: 系统找不到指定的路径
~~~

如果该问题仍存在，要明确说明无法自动截图验证，不要声称已经完成视觉截图检查。

## 8. Git 和本地文件保护

当前已提交的网页版基准是 **59b0efa**。

工作区中仍可能存在以下未提交内容：

- 思路.docx 及 Word 临时文件。
- desktop/。
- src-tauri/。
- vite.desktop.config.ts。
- .cargo/。
- 品牌图源文件和预览图。
- tools/、剪影/、生成脚本等本地素材。

这些内容可能来自用户或之前的桌面版探索。除非用户明确要求，否则：

- 不删除。
- 不回退。
- 不加入网页版提交。
- 不运行破坏性 Git 命令处理它们。

运行日志、TypeScript 缓存和音乐目录已经加入 .gitignore。

启动音乐位于本机：**public/music/BV1BtpMeKEjQ.mp3**。该文件约 119 MB，未提交 Git。缺少音乐时页面仍应可用，只是启动界面没有背景音乐。

## 9. 新对话恢复流程

1. 阅读本文件。
2. 运行 git status --short，确认用户本地未提交内容。
3. 运行 git log -1 --oneline，确认基准提交。
4. 检查 3000、45123、45124 端口。
5. 如有需要，启动 pnpm dev 和 pnpm codex:bridge。
6. 检查 http://localhost:3000/。
7. 用户提出修改后，先复述修改方案并等待确认。
8. 修改完成后运行构建、专项类型检查和 git diff --check。
9. 不自动提交，除非用户明确要求提交。

## 10. 可直接发给新对话的提示词

~~~text
请先阅读仓库根目录下的 PROJECT_HANDOFF.md，并严格按里面的恢复流程继续工作。
先检查 git status、最新提交和 3000/45123/45124 端口，不要删除或回退任何未提交的本地文件。
当前只修改网页版，不生成 Windows/Tauri 版本。每次准备修改前先告诉我你的修改方案，等我确认后再执行。
~~~
