# 工作台设计 QA

prototype: `http://localhost:3000/`
source: `D:\Project\GRAD_RESEARCH_WORKBENCH_DESIGN_LANGUAGE.md`
verified: `2026-08-23`
verdict: **READY（保留人工无障碍复核）**

## Visual

- PASS：固定 90px 左侧编号导航成为唯一框架，A/B/C 三版切换已移除。
- PASS：总览采用深色任务头与浅色行动卡；项目、工具为深色工程工作区；忆泡、今日、日历为浅色工作区。
- PASS：总览卡统一使用切角、黄色结构边和黑黄偏移阴影。
- PASS：内容区工程测绘标尺按真实栏目位置显示 `01/06` 至 `06/06`，并与进度刻度使用同一结构语言。
- PASS：全局主强调与键盘聚焦统一为黄色，不再使用青色导航激活态。
- PASS：参考品牌文案 `ENDFIELD DAILY` 已替换为原创 `FIELD DAILY`。

## Layout

- PASS：1723px 桌面视口下 `innerWidth === scrollWidth === 1723`，无横向溢出。
- PASS：768×900 视口下 `innerWidth === scrollWidth === 768`；品牌区、导航和内容分别对齐到 76px 轨道。
- PASS：720×900 断点下 `innerWidth === scrollWidth === 720`；顶部高度 58px、左侧轨道 72px。
- PASS：720×900 下六个栏目逐页检查，内容区与模块均无横向溢出；日历议程自动移至月视图下方。
- PASS：桌面总览三卡改为内容驱动高度，消除原 792px 的无意义纵向拉伸。
- PASS：左上品牌区固定为顶部高度，不再撑满视口或遮挡导航。

## Behavior

- PASS：六个栏目均可切换，`data-section` 与当前栏目同步更新。
- PASS：三版切换控件、主题偏好持久化和 Alt+1/2/3 版本快捷键均已移除。
- PASS：模块导航、项目空状态 CTA、新增项目弹窗等原有主要交互保留。
- PASS：测试结束后已恢复到工程总览；页面不再出现三版切换入口。

## Motion

- PASS：工作台、栏目内容与总览卡片采用 300ms 轻量入场，卡片以 60ms 间隔依次出现。
- PASS：左侧导航激活条为 250ms，标签确认反馈为 200ms，不改变页面布局。
- PASS：设置抽屉使用 320ms 侧滑；新增项目、计划与笔记弹窗使用 260ms 缩放淡入。
- PASS：按钮按压反馈为 100ms、缩放至 0.96；进度条使用 500ms 横向展开。
- PASS：`prefers-reduced-motion: reduce` 会停用新增动画与过渡。

## Accessibility sanity

- PASS：导航按钮具有明确可访问名称，当前栏目继续使用 `aria-current="page"`。
- PASS：主要独立操作按钮提高到至少 42–44px，左侧栏目按钮为 58–68px。
- PASS：关键信息微字提高到 9–10px，中文正文与主要标签保持更高字号。
- PASS：键盘焦点统一使用 2px 黄色轮廓与 2px 偏移。
- MANUAL：仍需使用真实屏幕阅读器验证朗读顺序，并在触屏设备上进行误触测试。

## Release gate

代码与浏览器视觉阻塞项已清零。当前仅保留屏幕阅读器与真实触屏设备人工复核，不阻塞本地使用。
