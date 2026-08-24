# 里程碑功能设计 QA

verified: `2026-08-24`
prototype: `http://localhost:3000/`
verdict: **PASS**

## Requirement conformance

- PASS：里程碑与今日计划使用独立模型和独立本地存储，职责边界明确。
- PASS：支持名称、日期、时间、通用类型、P0/P1/P2 优先级、备注与可选关联项目。
- PASS：支持新增、编辑、完成、恢复、删除与空名称内联校验。
- PASS：刷新页面后里程碑数据保留。
- PASS：总览展示最近未完成节点的实时倒计时、状态、关联项目和后续序列。
- PASS：后续序列可展开为全部事件，较早的已完成事件仍可恢复或编辑。
- PASS：日历格与右侧议程同步展示里程碑；同日事件较多时优先露出里程碑。
- PASS：逾期、今日、未来与完成状态具有独立文案和视觉状态。

## Visual conformance

- PASS：使用黑、白、灰、黄色工程标尺语言，无圆角 SaaS 卡片和玻璃拟态。
- PASS：总览前三张行动卡保持原有 6/3/3 非对称结构；里程碑轨道全宽承接长期节奏。
- PASS：最近节点使用大号数据字体，后续节点降低层级，避免所有节点同权。
- PASS：日历中的菱形符号与深色节点条能和普通黄色计划条快速区分。

## Responsive and accessibility sanity

- PASS：`768×900` 下 `innerWidth === scrollWidth === 768`。
- PASS：`720×900` 下 `innerWidth === scrollWidth === 720`。
- PASS：720px 下里程碑编辑框完整位于视口内，页面无横向溢出。
- PASS：主要操作均为原生按钮或表单控件，完成状态使用 `aria-pressed`，错误使用 `aria-live`。
- MANUAL：仍建议在真实触屏设备上复核日期/时间原生选择器与误触情况。

## Automated verification

- `pnpm test`：6/6 通过，包含生产构建。
- `pnpm lint`：0 错误；保留 2 条原有 `<img>` 性能警告。
- `git diff --check`：通过。
