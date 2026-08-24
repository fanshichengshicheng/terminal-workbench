import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the terminal workbench boot experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>终端工作台 \/ ENGINEERING FIELD WORKBENCH<\/title>/i);
  assert.match(html, /面向嵌入式、机械设计、3D 打印、工程竞赛与无人机研究的个人工程工作台/);
  assert.match(html, /property="og:image" content="http:\/\/localhost:3000\/og\.png"/i);
  assert.match(html, /class="boot boot-empty/);
  assert.match(html, /点击此处继续/);
  assert.match(html, /系统加载进度 0\.00%/);
  assert.match(html, /\/brand-logo\.png/);
  assert.match(html, /\/admin-silhouette\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("ships one section-aware engineering workbench", async () => {
  const [workbench, variants, bootMotion, layout, packageJson, desktopEntry] = await Promise.all([
    readFile(new URL("../app/Workbench.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workbench-variants.css", import.meta.url), "utf8"),
    readFile(new URL("../app/boot-motion.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../desktop/main.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(workbench, /data-section=\{section\}/);
  assert.doesNotMatch(workbench, /DesignVariant|variantMeta|variant-switcher|data-variant|Alt\+[123]/);
  assert.match(workbench, /工程行动总览/);
  assert.match(workbench, /嵌入式系统/);
  assert.match(workbench, /无人机研究/);
  assert.doesNotMatch(workbench, /长期技术航线|比赛与研发闭环/);
  assert.doesNotMatch(workbench, /ENDFIELD DAILY/);
  assert.match(workbench, /sound:item\.sound!==false/);
  assert.match(variants, /data-section="overview"/);
  assert.match(variants, /data-section="project"/);
  assert.match(variants, /data-section="tools"/);
  assert.match(variants, /prefers-reduced-motion:reduce/);
  assert.match(variants, /@keyframes wb-section-enter/);
  assert.match(variants, /@keyframes wb-drawer-in/);
  assert.match(variants, /@keyframes wb-progress-reveal/);
  assert.match(workbench, /boot-motion-scan/);
  assert.doesNotMatch(workbench, /BootMotion|bootMotionMeta|bootMotionOptions/);
  assert.match(bootMotion, /boot-motion-scan/);
  assert.match(bootMotion, /prefers-reduced-motion:reduce/);
  assert.match(variants, /@import "\.\/boot-motion\.css"/);
  assert.match(layout, /workbench-variants\.css/);
  assert.match(packageJson, /cross-env WRANGLER_LOG_PATH=/);
  assert.match(desktopEntry, /workbench-variants\.css/);
  assert.match(desktopEntry, /dorm\.css/);
  assert.match(desktopEntry, /ai-companion\.css/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
  await assert.rejects(access(new URL("public/_sites-preview", templateRoot)));
});

test("ships versioned local backup and guarded restore", async () => {
  const [backup, controls, storage, workbench] = await Promise.all([
    readFile(new URL("../app/workbench-backup.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/BackupControls.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/project-storage.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/Workbench.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(backup, /BACKUP_FORMAT="terminal-workbench-backup"/);
  assert.match(backup, /BACKUP_VERSION=1/);
  for (const key of [
    "memory-workbench-entries",
    "memory-workbench-preferences",
    "workbench-daily-plans",
    "workbench-milestones-v1",
    "workbench-memory-links",
    "workbench-tools",
    "workbench-pet-state-v1",
    "workbench-ai-settings",
    "workbench-codex-thread-owners",
    "workbench-codex-operations",
  ]) assert.match(backup, new RegExp(`"${key}"`));
  assert.match(backup, /value\.format!==BACKUP_FORMAT/);
  assert.match(backup, /value\.version!==BACKUP_VERSION/);
  assert.ok(
    backup.indexOf("replaceAllProjectWorkspaces(backup.projectWorkspaces)") <
      backup.indexOf("window.localStorage.removeItem(key)"),
    "project workspaces must be replaced before localStorage to avoid a partial restore",
  );
  assert.match(storage, /exportAllProjectWorkspaces/);
  assert.match(storage, /replaceAllProjectWorkspaces/);
  assert.match(controls, /window\.confirm/);
  assert.match(controls, /download=\{download\.filename\}/);
  assert.match(controls, /aria-live="polite"/);
  assert.match(workbench, /<BackupControls hasProjects=\{hasProjects\}\/>/);
  assert.match(backup, /50\*1024\*1024/);
});

test("ships general milestones and keeps the original launcher tools", async () => {
  const [milestones, variants, workbench, backup] = await Promise.all([
    readFile(new URL("../app/MilestoneRail.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workbench-variants.css", import.meta.url), "utf8"),
    readFile(new URL("../app/Workbench.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workbench-backup.ts", import.meta.url), "utf8"),
  ]);

  assert.match(milestones, /"考试","约会","纪念日","旅行","生活"/);
  assert.match(milestones, /notes:string/);
  assert.match(milestones, /查看全部/);
  assert.match(milestones, /任意事件都会同步显示在工程总览和日历中/);
  assert.match(workbench, /快捷启动台/);
  assert.match(workbench, /WINDOWS TOOL LAUNCHER/);
  assert.doesNotMatch(workbench, /UtilityTools|tools-view-switch|built-in/);
  assert.doesNotMatch(backup, /workbench-built-in-tools-v1/);
  assert.doesNotMatch(variants, /\.tools-view-switch|\.utility-grid/);
  await assert.rejects(access(new URL("../app/UtilityTools.tsx", import.meta.url)));
});

test("ships an isolated task, persona, and pet companion", async () => {
  const [companion, companionCss, petState, layout, workbench, backup] = await Promise.all([
    readFile(new URL("../app/AiCompanion.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ai-companion.css", import.meta.url), "utf8"),
    readFile(new URL("../app/pet-state.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/Workbench.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workbench-backup.ts", import.meta.url), "utf8"),
  ]);

  assert.match(companion, /type CompanionMode="task"\|"chat"\|"pet"/);
  assert.match(companion, /workbench-ai-companion-v1/);
  assert.match(companion, /任务与项目上下文隔离/);
  assert.match(companion, /通用任务 \/ 不访问项目/);
  assert.match(companion, /不得读取项目、忆泡、计划或本机文件/);
  assert.match(companion, /人格记忆独立保存/);
  assert.match(companion, /sandbox:"workspace-write"/);
  assert.match(companion, /sandbox:"read-only"/);
  assert.match(companion, /approvalPolicy:"on-request"/);
  assert.match(companion, /approvalPolicy:"never"/);
  assert.match(companion, /rewardedPlanIds/);
  assert.match(companion, /<QixunDormAvatar/);
  assert.match(companion, /栖巡-07/);
  assert.match(companion, /openDorm/);
  assert.doesNotMatch(companion, /pet-entity/);
  assert.match(companion, /genericTaskPrompts/);
  assert.match(companion, /chatStarters/);
  assert.match(companion, /完成一项今日计划可获得 1 份/);
  assert.match(companion, /<AiSettingsModal/);
  assert.match(workbench, /<AiCompanion/);
  assert.match(layout, /ai-companion\.css/);
  assert.match(backup, /"workbench-ai-companion-v1"/);
  assert.match(backup, /"workbench-pet-state-v1"/);
  assert.match(petState, /PET_STATE_EVENT/);
  assert.match(petState, /PET_ACTION_EVENT/);
  assert.match(petState, /LEGACY_COMPANION_KEY/);
  assert.match(companionCss, /\.companion-launcher/);
  assert.match(companionCss, /\.companion-panel/);
  assert.match(companionCss, /\.pet-avatar-preview/);
  assert.doesNotMatch(companionCss, /\.pet-entity/);
  assert.match(companionCss, /@media\(max-width:720px\)/);
  assert.match(companionCss, /prefers-reduced-motion:reduce/);
});

test("ships the Qixun sprite-v2 dorm with a Spine import fallback", async () => {
  const [dorm, avatar, dormCss, qixunManifest, qixunLicense, manifest, license, layout, workbench, packageJson] = await Promise.all([
    readFile(new URL("../app/DormView.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/QixunDormAvatar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/dorm.css", import.meta.url), "utf8"),
    readFile(new URL("public/pets/qixun-07/manifest.json", templateRoot), "utf8"),
    readFile(new URL("public/pets/qixun-07/LICENSE.txt", templateRoot), "utf8"),
    readFile(new URL("public/pets/spineboy/manifest.json", templateRoot), "utf8"),
    readFile(new URL("public/pets/spineboy/LICENSE.txt", templateRoot), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/Workbench.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(workbench, /\["dorm","宠物","DORM","07"\]/);
  assert.match(workbench, /<DormView\/>/);
  assert.match(layout, /dorm\.css/);
  assert.match(dorm, /const ACTIVE_DORM_AVATAR: "qixun" \| "spine" = "qixun"/);
  assert.match(dorm, /<QixunDormAvatar/);
  assert.match(dorm, /PET_ACTION_EVENT/);
  assert.match(dorm, /PET_STATE_EVENT/);
  assert.match(dorm, /updateSharedPetState/);
  assert.match(dorm, /@esotericsoftware\/spine-pixi-v8/);
  assert.match(dorm, /Spine\.from/);
  assert.match(dorm, /点击宿舍地面移动角色/);
  assert.match(dorm, /重新加载角色/);
  assert.match(dorm, /空置工业宿舍/);
  assert.match(dorm, /dorm-strip-light/);
  assert.match(dorm, /dorm-cable-run/);
  assert.match(dorm, /dorm-hatch/);
  assert.match(dorm, /const GROUND_MIN_Y = 0\.79/);
  assert.match(dorm, /Math\.max\(GROUND_MIN_Y, Math\.min\(GROUND_MAX_Y, point\.y\)\)/);
  assert.doesNotMatch(dorm, /const furniture|dorm-furniture|休息舱|战术终端|娱乐区|训练标记/);
  assert.match(dormCss, /\.dorm-world/);
  assert.match(dormCss, /\.dorm-back-wall/);
  assert.match(dormCss, /\.dorm-floor-plane/);
  assert.match(dormCss, /\.dorm-sprite-character/);
  assert.match(dormCss, /prefers-reduced-motion:reduce/);
  assert.match(avatar, /\/pets\/qixun-07\/manifest\.json/);
  assert.match(avatar, /const BUNDLED_MANIFEST: QixunPetManifest/);
  assert.doesNotMatch(avatar, /fetch\(MANIFEST_URL/);
  assert.match(avatar, /const GROUND_MIN_Y = 0\.79/);
  assert.match(avatar, /state\.rightRow \?\? 1/);
  assert.match(avatar, /state\.leftRow \?\? 2/);
  assert.match(qixunManifest, /"renderer": "sprite-v2"/);
  assert.match(qixunManifest, /"spriteVersionNumber": 2/);
  assert.match(qixunManifest, /"cellWidth": 192/);
  assert.match(qixunManifest, /"cellHeight": 208/);
  assert.match(qixunManifest, /"rows": 11/);
  assert.match(qixunLicense, /Original AI-assisted character asset/);
  assert.match(manifest, /"spineVersion": "4\.2\.22"/);
  assert.match(manifest, /"modelType": "spine-json"/);
  assert.match(license, /may not be used for commercial use/);
  assert.match(packageJson, /@esotericsoftware\/spine-pixi-v8/);

  await access(new URL("public/pets/qixun-07/spritesheet.webp", templateRoot));
  await access(new URL("public/pets/spineboy/spineboy-pro.json", templateRoot));
  await access(new URL("public/pets/spineboy/spineboy.atlas", templateRoot));
  await access(new URL("public/pets/spineboy/spineboy.png", templateRoot));
});

test("ships a persistent canvas with rename, selection, and movable groups", async () => {
  const [workspace, css] = await Promise.all([
    readFile(new URL("../app/ProjectWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/project-workspace.css", import.meta.url), "utf8"),
  ]);

  assert.match(workspace, /type CanvasNode = Node<CanvasNodeData,[^;]*"group"/);
  assert.match(workspace, /function EditableTitle/);
  assert.match(workspace, /aria-label="重命名画布卡片"/);
  assert.match(workspace, /selectionOnDrag/);
  assert.match(workspace, /selectionKeyCode=\{\["Shift","Meta"\]\}/);
  assert.match(workspace, /multiSelectionKeyCode=\{\["Control","Shift","Meta"\]\}/);
  assert.match(workspace, /function GroupNode/);
  assert.match(workspace, /parentId:groupId/);
  assert.match(workspace, /extent:"parent"/);
  assert.match(workspace, /const createGroup/);
  assert.match(workspace, /const ungroupSelection/);
  assert.match(workspace, /project-selection-toolbar/);
  assert.match(css, /\.project-canvas-group/);
  assert.match(css, /\.project-group-color/);
  assert.match(css, /\.project-node-title-input/);
});
