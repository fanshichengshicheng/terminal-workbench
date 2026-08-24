"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

type LoadState = "loading" | "ready" | "error";
type RoomPoint = { x: number; y: number };

type Arrival = {
  animation?: string;
  loop?: boolean;
  done?: () => void;
};

export type QixunDormAvatarHandle = {
  moveTo: (point: RoomPoint, arrival?: Arrival) => void;
  play: (animation: string, loop?: boolean) => void;
  reset: () => void;
};

export type QixunPetManifest = {
  id: string;
  name: string;
  role: string;
  renderer: "sprite-v2";
  spriteVersionNumber: 2;
  spritesheet: string;
  license: string;
  source: string;
  cellWidth: number;
  cellHeight: number;
  columns: number;
  rows: number;
  animations: Record<string, string>;
  states: Record<
    string,
    {
      row?: number;
      leftRow?: number;
      rightRow?: number;
      frames: number;
      fps: number;
    }
  >;
};

type SpriteRuntime = {
  manifest: QixunPetManifest;
  sprite: HTMLDivElement;
  action: string;
  frame: number;
  elapsed: number;
  loop: boolean;
};

const MANIFEST_URL = "/pets/qixun-07/manifest.json";
const BUNDLED_MANIFEST: QixunPetManifest = {
  id: "qixun-07",
  name: "栖巡-07",
  role: "工业宿舍工程伴生体 / 机械渡鸦侦察单元",
  renderer: "sprite-v2",
  spriteVersionNumber: 2,
  spritesheet: "spritesheet.webp",
  license: "LICENSE.txt",
  source: "Original asset created for this workbench",
  cellWidth: 192,
  cellHeight: 208,
  columns: 8,
  rows: 11,
  animations: {
    idle: "idle",
    walk: "walk",
    interact: "interact",
    jump: "jump",
    showcase: "showcase",
    failed: "failed",
    waiting: "waiting",
    work: "work",
  },
  states: {
    idle: { row: 0, frames: 6, fps: 6 },
    walk: { rightRow: 1, leftRow: 2, frames: 8, fps: 10 },
    interact: { row: 3, frames: 4, fps: 7 },
    jump: { row: 4, frames: 5, fps: 8 },
    failed: { row: 5, frames: 8, fps: 7 },
    waiting: { row: 6, frames: 6, fps: 6 },
    work: { row: 7, frames: 6, fps: 8 },
    showcase: { row: 8, frames: 6, fps: 7 },
  },
};
const HOME_POINT: RoomPoint = { x: 0.5, y: 0.83 };
const GROUND_MIN_Y = 0.79;
const GROUND_MAX_Y = 0.87;

function loadImage(url: string) {
  return new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("栖巡-07 动作图集加载失败"));
    image.src = url;
  });
}

function renderSprite(
  runtime: SpriteRuntime,
  point: RoomPoint,
  facing: 1 | -1,
  hostWidth: number,
) {
  const state = runtime.manifest.states[runtime.action]
    ?? runtime.manifest.states.idle;
  let row = state.row ?? 0;
  let flip = facing === 1 ? -1 : 1;
  if (runtime.action === "walk") {
    row = facing === 1
      ? (state.rightRow ?? 1)
      : (state.leftRow ?? 2);
    flip = 1;
  }
  const frame = Math.min(runtime.frame, Math.max(0, state.frames - 1));
  runtime.sprite.style.left = `${point.x * 100}%`;
  runtime.sprite.style.top = `${point.y * 100}%`;
  runtime.sprite.style.backgroundPosition = `${-frame * runtime.manifest.cellWidth}px ${-row * runtime.manifest.cellHeight}px`;
  runtime.sprite.style.setProperty("--dorm-pet-flip", `${flip}`);
  runtime.sprite.style.setProperty(
    "--dorm-pet-scale",
    `${Math.max(0.56, Math.min(0.82, hostWidth / 1700))}`,
  );
}

const QixunDormAvatar = forwardRef<
  QixunDormAvatarHandle,
  {
    reloadKey: number;
    onLoadState: (state: LoadState, message?: string) => void;
    onManifest: (manifest: QixunPetManifest) => void;
    onAnimation: (animation: string) => void;
    onPosition: (point: RoomPoint) => void;
  }
>(function QixunDormAvatar(
  { reloadKey, onLoadState, onManifest, onAnimation, onPosition },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<SpriteRuntime | null>(null);
  const currentRef = useRef<RoomPoint>({ ...HOME_POINT });
  const targetRef = useRef<(Arrival & { point: RoomPoint }) | null>(null);
  const facingRef = useRef<1 | -1>(-1);

  const play = useCallback(
    (requested: string, loop = false) => {
      const runtime = runtimeRef.current;
      if (!runtime) return;
      const action = runtime.manifest.states[requested] ? requested : "idle";
      runtime.action = action;
      runtime.frame = 0;
      runtime.elapsed = 0;
      runtime.loop = loop || action === "idle" || action === "walk";
      onAnimation(action);
    },
    [onAnimation],
  );

  useImperativeHandle(
    ref,
    () => ({
      moveTo(point, arrival) {
        const runtime = runtimeRef.current;
        if (!runtime) return;
        const clamped = {
          x: Math.max(0.1, Math.min(0.9, point.x)),
          y: Math.max(GROUND_MIN_Y, Math.min(GROUND_MAX_Y, point.y)),
        };
        if (Math.abs(clamped.x - currentRef.current.x) > 0.01) {
          facingRef.current = clamped.x >= currentRef.current.x ? 1 : -1;
        }
        targetRef.current = { point: clamped, ...arrival };
        play("walk", true);
      },
      play(requested, loop = false) {
        targetRef.current = null;
        play(requested, loop);
      },
      reset() {
        if (!runtimeRef.current) return;
        targetRef.current = {
          point: { ...HOME_POINT },
          animation: "idle",
          loop: true,
        };
        if (Math.abs(HOME_POINT.x - currentRef.current.x) > 0.01) {
          facingRef.current = HOME_POINT.x >= currentRef.current.x ? 1 : -1;
        }
        play("walk", true);
      },
    }),
    [play],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let frameRequest = 0;
    let previousTime = performance.now();

    onLoadState("loading", "正在载入栖巡-07 动作图集");
    const start = async () => {
      try {
        const manifest = BUNDLED_MANIFEST;
        if (
          manifest.renderer !== "sprite-v2"
          || manifest.spriteVersionNumber !== 2
          || !manifest.spritesheet
          || !manifest.states?.idle
          || !manifest.states?.walk
        ) {
          throw new Error("栖巡-07 角色清单不完整");
        }
        const manifestLocation = new URL(MANIFEST_URL, window.location.href);
        const spritesheetUrl = new URL(manifest.spritesheet, manifestLocation).toString();
        await loadImage(spritesheetUrl);
        if (disposed) return;

        const sprite = document.createElement("div");
        sprite.className = "dorm-sprite-character";
        sprite.setAttribute("aria-hidden", "true");
        sprite.style.width = `${manifest.cellWidth}px`;
        sprite.style.height = `${manifest.cellHeight}px`;
        sprite.style.backgroundImage = `url("${spritesheetUrl}")`;
        sprite.style.backgroundSize = `${manifest.columns * manifest.cellWidth}px ${manifest.rows * manifest.cellHeight}px`;
        host.appendChild(sprite);

        runtimeRef.current = {
          manifest,
          sprite,
          action: "idle",
          frame: 0,
          elapsed: 0,
          loop: true,
        };
        onManifest(manifest);
        onAnimation("idle");
        onPosition(currentRef.current);
        onLoadState("ready", `SPRITE V2 / ${manifest.name} 已上线`);

        const tick = (now: number) => {
          if (disposed) return;
          const runtime = runtimeRef.current;
          if (!runtime) return;
          const delta = Math.min((now - previousTime) / 1000, 0.05);
          previousTime = now;
          const target = targetRef.current;
          if (target) {
            const dx = target.point.x - currentRef.current.x;
            const dy = target.point.y - currentRef.current.y;
            const distance = Math.hypot(dx, dy);
            const step = Math.min(distance, 0.25 * delta);
            if (distance <= 0.006) {
              currentRef.current = { ...target.point };
              targetRef.current = null;
              onPosition(currentRef.current);
              const arrivalAction = target.animation ?? "idle";
              play(arrivalAction, target.loop ?? arrivalAction === "idle");
              target.done?.();
            } else {
              currentRef.current = {
                x: currentRef.current.x + (dx / distance) * step,
                y: currentRef.current.y + (dy / distance) * step,
              };
            }
          }

          const state = runtime.manifest.states[runtime.action]
            ?? runtime.manifest.states.idle;
          runtime.elapsed += delta * 1000;
          const frameDuration = 1000 / Math.max(1, state.fps);
          if (runtime.elapsed >= frameDuration) {
            runtime.elapsed %= frameDuration;
            runtime.frame += 1;
            if (runtime.frame >= state.frames) {
              if (runtime.loop) {
                runtime.frame = 0;
              } else {
                runtime.action = "idle";
                runtime.frame = 0;
                runtime.elapsed = 0;
                runtime.loop = true;
                onAnimation("idle");
              }
            }
          }
          renderSprite(
            runtime,
            currentRef.current,
            facingRef.current,
            Math.max(1, host.clientWidth),
          );
          frameRequest = requestAnimationFrame(tick);
        };
        renderSprite(runtimeRef.current, currentRef.current, facingRef.current, host.clientWidth);
        frameRequest = requestAnimationFrame(tick);
      } catch (error) {
        if (!disposed) {
          runtimeRef.current = null;
          onLoadState(
            "error",
            error instanceof Error ? error.message : "栖巡-07 加载失败",
          );
        }
      }
    };

    start();
    return () => {
      disposed = true;
      cancelAnimationFrame(frameRequest);
      targetRef.current = null;
      runtimeRef.current = null;
      host.replaceChildren();
    };
  }, [onAnimation, onLoadState, onManifest, onPosition, play, reloadKey]);

  return <div className="dorm-sprite-host" ref={hostRef} />;
});

export default QixunDormAvatar;
