"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Box, Crosshair, Heart, RotateCcw, Sparkles } from "lucide-react";
import QixunDormAvatar, { type QixunPetManifest } from "./QixunDormAvatar";
import { loadSharedPetState,PET_ACTION_EVENT,PET_STATE_EVENT,PET_STATE_KEY,updateSharedPetState,type PetAction,type SharedPetState } from "./pet-state";

type LoadState = "loading" | "ready" | "error";
type RoomPoint = { x: number; y: number };
type SpineInstance = import("@esotericsoftware/spine-pixi-v8").Spine;
type PixiApplication = import("pixi.js").Application;

type PetManifest = {
  id: string;
  name: string;
  role: string;
  spineVersion: string;
  skeleton: string;
  atlas: string;
  license: string;
  source: string;
  animations: Record<string, string>;
};

type PetProfile = Pick<PetManifest, "name" | "role" | "animations">;

type Arrival = {
  animation?: string;
  loop?: boolean;
  done?: () => void;
};

type DormAvatarHandle = {
  moveTo: (point: RoomPoint, arrival?: Arrival) => void;
  play: (animation: string, loop?: boolean) => void;
  reset: () => void;
};

const MANIFEST_URL = "/pets/spineboy/manifest.json";
const ACTIVE_DORM_AVATAR: "qixun" | "spine" = "qixun";
const GROUND_MIN_Y = 0.79;
const GROUND_MAX_Y = 0.87;
const HOME_POINT: RoomPoint = { x: 0.5, y: 0.83 };

const SpineDormAvatar = forwardRef<
  DormAvatarHandle,
  {
    reloadKey: number;
    onLoadState: (state: LoadState, message?: string) => void;
    onManifest: (manifest: PetManifest) => void;
    onAnimation: (animation: string) => void;
    onPosition: (point: RoomPoint) => void;
  }
>(function SpineDormAvatar(
  { reloadKey, onLoadState, onManifest, onAnimation, onPosition },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<{
    app: PixiApplication;
    spine: SpineInstance;
    manifest: PetManifest;
  } | null>(null);
  const currentRef = useRef<RoomPoint>({ ...HOME_POINT });
  const targetRef = useRef<(Arrival & { point: RoomPoint }) | null>(null);
  const facingRef = useRef(1);

  const play = useCallback(
    (requested: string, loop = false) => {
      const runtime = runtimeRef.current;
      if (!runtime) return;
      const fallback = runtime.manifest.animations.idle ?? "idle";
      const animation = runtime.spine.skeleton.data.findAnimation(requested)
        ? requested
        : fallback;
      runtime.spine.state.setAnimation(0, animation, loop);
      if (!loop && animation !== fallback) {
        runtime.spine.state.addAnimation(0, fallback, true, 0);
      }
      onAnimation(animation);
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
        play(runtime.manifest.animations.walk ?? "walk", true);
      },
      play(requested, loop = false) {
        targetRef.current = null;
        play(requested, loop);
      },
      reset() {
        const runtime = runtimeRef.current;
        if (!runtime) return;
        targetRef.current = {
          point: { ...HOME_POINT },
          animation: runtime.manifest.animations.idle ?? "idle",
          loop: true,
        };
        play(runtime.manifest.animations.walk ?? "walk", true);
      },
    }),
    [play],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let app: PixiApplication | null = null;

    onLoadState("loading", "正在校验 Spine 4.2 角色包");
    const start = async () => {
      try {
        const response = await fetch(MANIFEST_URL, { cache: "force-cache" });
        if (!response.ok) throw new Error(`角色清单请求失败（${response.status}）`);
        const manifest = (await response.json()) as PetManifest;
        if (!manifest.skeleton || !manifest.atlas || !manifest.animations?.idle) {
          throw new Error("角色清单缺少骨骼、图集或待机动作");
        }

        const [pixi, spineRuntime] = await Promise.all([
          import("pixi.js"),
          import("@esotericsoftware/spine-pixi-v8"),
        ]);
        if (disposed) return;

        app = new pixi.Application();
        await app.init({
          resizeTo: host,
          backgroundAlpha: 0,
          antialias: true,
          autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          preference: "webgl",
        });
        if (disposed) {
          app.destroy({ removeView: true }, { children: true });
          return;
        }

        app.canvas.className = "dorm-spine-canvas";
        app.canvas.setAttribute("aria-hidden", "true");
        host.appendChild(app.canvas);

        const manifestLocation = new URL(MANIFEST_URL, window.location.href);
        const skeletonUrl = new URL(manifest.skeleton, manifestLocation).toString();
        const atlasUrl = new URL(manifest.atlas, manifestLocation).toString();
        await pixi.Assets.load([skeletonUrl, atlasUrl]);
        if (disposed) return;

        const spine = spineRuntime.Spine.from({
          skeleton: skeletonUrl,
          atlas: atlasUrl,
          scale: 1,
        });
        spine.state.data.defaultMix = 0.16;
        app.stage.addChild(spine);
        runtimeRef.current = { app, spine, manifest };
        onManifest(manifest);

        const idle = manifest.animations.idle ?? "idle";
        spine.state.setAnimation(0, idle, true);
        onAnimation(idle);
        onLoadState("ready", `Spine ${manifest.spineVersion} / ${manifest.name} 已上线`);

        app.ticker.add((ticker) => {
          const runtime = runtimeRef.current;
          if (!runtime) return;
          const target = targetRef.current;
          if (target) {
            const dx = target.point.x - currentRef.current.x;
            const dy = target.point.y - currentRef.current.y;
            const distance = Math.hypot(dx, dy);
            const step = Math.min(distance, 0.25 * Math.min(ticker.deltaMS / 1000, 0.05));
            if (distance <= 0.006) {
              currentRef.current = { ...target.point };
              targetRef.current = null;
              onPosition(currentRef.current);
              const arrivalAnimation = target.animation ?? idle;
              play(arrivalAnimation, target.loop ?? arrivalAnimation === idle);
              target.done?.();
            } else {
              currentRef.current = {
                x: currentRef.current.x + (dx / distance) * step,
                y: currentRef.current.y + (dy / distance) * step,
              };
            }
          }

          const width = Math.max(1, host.clientWidth);
          const height = Math.max(1, host.clientHeight);
          const responsiveScale = Math.max(0.48, Math.min(1.08, width / 920));
          const scale = 0.34 * responsiveScale;
          spine.position.set(currentRef.current.x * width, currentRef.current.y * height);
          spine.scale.set(scale * facingRef.current, scale);
        });
      } catch (error) {
        if (!disposed) {
          runtimeRef.current = null;
          onLoadState(
            "error",
            error instanceof Error ? error.message : "Spine 角色加载失败",
          );
        }
      }
    };

    start();
    return () => {
      disposed = true;
      targetRef.current = null;
      runtimeRef.current = null;
      app?.destroy({ removeView: true }, { children: true });
    };
  }, [onAnimation, onLoadState, onManifest, onPosition, play, reloadKey]);

  return <div className="dorm-spine-host" ref={hostRef} />;
});

export default function DormView() {
  const avatarRef = useRef<DormAvatarHandle>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [status, setStatus] = useState("正在准备宿舍角色资源");
  const [manifest, setManifest] = useState<PetProfile | null>(null);
  const [animation, setAnimation] = useState("—");
  const [position, setPosition] = useState<RoomPoint>({ ...HOME_POINT });
  const [reloadKey, setReloadKey] = useState(0);
  const [pet, setPet] = useState<SharedPetState>(loadSharedPetState);

  const loadStateChanged = useCallback((next: LoadState, message?: string) => {
    setLoadState(next);
    if (message) setStatus(message);
  }, []);
  const manifestChanged = useCallback(
    (next: PetManifest | QixunPetManifest) => setManifest(next),
    [],
  );
  const animationChanged = useCallback((next: string) => setAnimation(next), []);
  const positionChanged = useCallback((next: RoomPoint) => setPosition(next), []);

  const mappedAnimation = useCallback(
    (semantic: string) => manifest?.animations[semantic] ?? semantic,
    [manifest],
  );

  useEffect(() => {
    const sync = (event: Event) => setPet(
      (event as CustomEvent<SharedPetState>).detail ?? loadSharedPetState(),
    );
    const storage = (event: StorageEvent) => {
      if (event.key === PET_STATE_KEY) setPet(loadSharedPetState());
    };
    window.addEventListener(PET_STATE_EVENT, sync);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener(PET_STATE_EVENT, sync);
      window.removeEventListener("storage", storage);
    };
  }, []);

  useEffect(() => {
    const reactToCompanion = (event: Event) => {
      if (loadState !== "ready") return;
      const action = (event as CustomEvent<PetAction>).detail;
      const semantic = action === "feed" ? "jump" : "interact";
      avatarRef.current?.play(mappedAnimation(semantic), false);
      setStatus(action === "feed"
        ? "收到悬浮窗补给 / 栖巡-07 状态已同步"
        : "收到悬浮窗互动 / 栖巡-07 已回应");
    };
    window.addEventListener(PET_ACTION_EVENT, reactToCompanion);
    return () => window.removeEventListener(PET_ACTION_EVENT, reactToCompanion);
  }, [loadState, mappedAnimation]);

  const moveTo = useCallback(
    (
      point: RoomPoint,
      label: string,
      semantic = "idle",
      loop = semantic === "idle",
    ) => {
      if (loadState !== "ready") return;
      setStatus(`正在前往 ${label}`);
      avatarRef.current?.moveTo(point, {
        animation: mappedAnimation(semantic),
        loop,
        done: () => setStatus(`${label} / 交互动作已触发`),
      });
    },
    [loadState, mappedAnimation],
  );

  const clickRoom = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (loadState !== "ready") return;
    const bounds = event.currentTarget.parentElement?.getBoundingClientRect()
      ?? event.currentTarget.getBoundingClientRect();
    const point = event.detail === 0
      ? { ...HOME_POINT }
      : {
          x: (event.clientX - bounds.left) / bounds.width,
          y: (event.clientY - bounds.top) / bounds.height,
        };
    const nearCharacter = Math.hypot(point.x - position.x, point.y - position.y) < 0.12;
    if (nearCharacter) {
      const interact = mappedAnimation("interact");
      avatarRef.current?.play(interact, false);
      updateSharedPetState((current) => ({ ...current, xp: current.xp + 3 }));
      setStatus("已与栖巡-07 互动 / 协同经验 +3");
      return;
    }
    moveTo(point, "指定位置");
  };

  const playAction = (semantic: string, loop = false) => {
    if (loadState !== "ready") return;
    const action = mappedAnimation(semantic);
    avatarRef.current?.play(action, loop);
    setStatus(`手动触发动作 / ${action}`);
  };

  const patrol = () => {
    const points = [
      { x: 0.26, y: 0.8 },
      { x: 0.42, y: 0.84 },
      { x: 0.68, y: 0.81 },
      { x: 0.78, y: 0.86 },
    ];
    const target = points[Math.floor(Math.random() * points.length)];
    moveTo(target, "随机巡逻点");
  };

  return (
    <section className="dorm-module">
      <header className="dorm-header">
        <div>
          <small>BASE / DORMITORY PROTOTYPE</small>
          <h2>宠物宿舍</h2>
          <p>空置工业舱室 / 角色活动原型</p>
        </div>
        <div className="dorm-vitals" aria-label="宿舍状态">
          <span>
            <Heart size={14} /> 饱食 <b>{pet.satiety}%</b>
          </span>
          <span>
            <Sparkles size={14} /> 协同 <b>LV.{String(Math.floor(pet.xp / 60) + 1).padStart(2, "0")}</b>
          </span>
          <span>
            <Box size={14} /> 补给 <b>{pet.food}</b>
          </span>
        </div>
      </header>

      <div className="dorm-body">
        <div className={`dorm-world ${loadState}`}>
          <div className="dorm-room-shell" aria-hidden="true">
            <div className="dorm-ceiling">
              <span className="dorm-ceiling-hatch" />
              <span className="dorm-ceiling-rail" />
            </div>
            <div className="dorm-back-wall">
              <span className="dorm-wall-bolts dorm-wall-bolts-top" />
              <span className="dorm-wall-bolts dorm-wall-bolts-bottom" />
            </div>
            <div className="dorm-side-wall dorm-side-wall-left" />
            <div className="dorm-side-wall dorm-side-wall-right" />
            <div className="dorm-strip-light"><i /></div>
            <div className="dorm-cable-run">
              <i /><i /><i />
              <span className="dorm-junction-box" />
            </div>
            <div className="dorm-lower-pipe"><i /><span /></div>
            <div className="dorm-hatch">
              <i className="dorm-hatch-light" />
              <i className="dorm-hatch-track" />
              <span>07</span>
            </div>
            <div className="dorm-floor-plane" />
          </div>
          <button
            className="dorm-floor-target"
            onClick={clickRoom}
            disabled={loadState !== "ready"}
            aria-label="点击宿舍地面移动角色"
          />
          <div className="dorm-room-id" aria-hidden="true">
            <small>DORMITORY / ROOM 07</small>
            <b>空置工业宿舍</b>
          </div>
          {ACTIVE_DORM_AVATAR === "qixun" ? (
            <QixunDormAvatar
              ref={avatarRef}
              reloadKey={reloadKey}
              onLoadState={loadStateChanged}
              onManifest={manifestChanged}
              onAnimation={animationChanged}
              onPosition={positionChanged}
            />
          ) : (
            <SpineDormAvatar
              ref={avatarRef}
              reloadKey={reloadKey}
              onLoadState={loadStateChanged}
              onManifest={manifestChanged}
              onAnimation={animationChanged}
              onPosition={positionChanged}
            />
          )}
          {loadState !== "ready" && (
            <div className={`dorm-load-state ${loadState}`} role="status">
              <Crosshair size={22} />
              <b>{loadState === "loading" ? "LOADING OPERATOR" : "PET LOAD FAILED"}</b>
              <span>{status}</span>
              {loadState === "error" && (
                <button onClick={() => setReloadKey((value) => value + 1)}>
                  重新加载角色
                </button>
              )}
            </div>
          )}
          <div className="dorm-coordinate" aria-hidden="true">
            X {Math.round(position.x * 100)} / Y {Math.round(position.y * 100)}
          </div>
          <div className="dorm-runtime-strip" aria-live="polite">
            <span className={`dorm-runtime-light ${loadState}`} />
            <div>
              <small>OPERATOR SLOT / 01</small>
              <b>{manifest?.name ?? "等待角色"}</b>
            </div>
            <div>
              <small>STATUS</small>
              <b>{status}</b>
            </div>
            <div>
              <small>ANIMATION</small>
              <b>{animation}</b>
            </div>
          </div>
          <div className="dorm-action-dock" aria-label="角色动作">
            <button disabled={loadState !== "ready"} onClick={() => playAction("idle", true)}>
              待机
            </button>
            <button disabled={loadState !== "ready"} onClick={patrol}>
              巡逻
            </button>
            <button disabled={loadState !== "ready"} onClick={() => playAction("jump")}>
              跳跃
            </button>
            <button disabled={loadState !== "ready"} onClick={() => playAction("showcase", true)}>
              特殊
            </button>
            <button
              disabled={loadState !== "ready"}
              onClick={() => {
                avatarRef.current?.reset();
                setStatus("正在返回宿舍中心");
              }}
              title="返回初始位置"
              aria-label="角色返回初始位置"
            >
              <RotateCcw size={14} />
            </button>
          </div>
          <a
            className="dorm-license-link"
            href="/pets/qixun-07/LICENSE.txt"
            target="_blank"
            rel="noreferrer"
          >
            QIXUN-07 / ORIGINAL ASSET
          </a>
        </div>
      </div>
    </section>
  );
}
