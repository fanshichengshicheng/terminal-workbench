export type CodexThread = {
  id: string;
  name: string | null;
  preview: string;
  cwd: string;
  updatedAt: number;
  status?: { type: string };
  turns?: CodexTurn[];
};

export type CodexTurn = {
  id: string;
  status: string;
  items: CodexItem[];
};

export type CodexItem =
  | { type: "userMessage"; id: string; content: Array<{ type: string; text?: string; url?: string }> }
  | { type: "agentMessage"; id: string; text: string }
  | { type: "reasoning"; id: string; summary: string[]; content: string[] }
  | { type: "commandExecution"; id: string; command: string; status: string; aggregatedOutput: string | null }
  | { type: "fileChange"; id: string; status: string; changes: unknown[] };

export type CodexApproval = {
  requestId: number | string;
  method: string;
  params: Record<string, unknown>;
};

type RpcMessage = {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { message?: string };
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type NativeCodexStatus = { generation: number };
type NativeCodexMessage = { generation: number; message: string };
type NativeCodexSignal = { generation: number };

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isDesktopApp } from "./desktop-ai";

export class CodexClient extends EventTarget {
  private socket: WebSocket | null = null;
  private native = false;
  private unlisten: UnlistenFn | null = null;
  private unlistenDisconnect: UnlistenFn | null = null;
  private nativeGeneration: number | null = null;
  private connecting: Promise<void> | null = null;
  private pending = new Map<number, PendingRequest>();
  private requestId = 1;
  readonly url: string;

  constructor(url = "ws://127.0.0.1:45123") {
    super();
    this.url = url;
  }

  async connect() {
    if (this.native || this.socket?.readyState === WebSocket.OPEN) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.connectInternal().finally(() => { this.connecting = null; });
    return this.connecting;
  }

  private async connectInternal() {
    if (isDesktopApp()) {
      try {
        const status = await invoke<NativeCodexStatus>("codex_start");
        this.nativeGeneration = status.generation;
        this.unlisten = await listen<NativeCodexMessage>("codex-message", event => {
          if (event.payload.generation === this.nativeGeneration) this.receive(event.payload.message);
        });
        this.unlistenDisconnect = await listen<NativeCodexSignal>("codex-disconnected", event => {
          if (event.payload.generation === this.nativeGeneration) this.handleDisconnect("Codex 本地进程已退出");
        });
        this.native = true;
        await this.request("initialize", {
          clientInfo: { name: "terminal-workbench", title: "终端工作台", version: "0.2.7" },
          capabilities: { experimentalApi: true, requestAttestation: false },
        });
        this.notify("initialized");
        this.dispatchEvent(new Event("connected"));
        return;
      } catch (error) {
        this.native = false;
        this.nativeGeneration = null;
        this.unlisten?.();
        this.unlistenDisconnect?.();
        this.unlisten = null;
        this.unlistenDisconnect = null;
        await invoke("codex_stop").catch(() => {});
        throw error;
      }
    }
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.url);
      const timeout = window.setTimeout(() => {
        socket.close();
        reject(new Error("Codex 本地服务连接超时"));
      }, 5000);
      socket.onopen = () => {
        window.clearTimeout(timeout);
        this.socket = socket;
        resolve();
      };
      socket.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error("Codex 本地服务未启动"));
      };
      socket.onclose = () => {
        this.socket = null;
        this.handleDisconnect("Codex 连接已断开");
      };
      socket.onmessage = event => this.receive(String(event.data));
    });
    await this.request("initialize", {
      clientInfo: { name: "terminal-workbench", title: "终端工作台", version: "0.2.7" },
      capabilities: { experimentalApi: true, requestAttestation: false },
    });
    this.notify("initialized");
    this.dispatchEvent(new Event("connected"));
  }

  disconnect() {
    if (this.native) {
      this.native = false;
      this.nativeGeneration = null;
      this.unlisten?.();
      this.unlistenDisconnect?.();
      this.unlisten = null;
      this.unlistenDisconnect = null;
      invoke("codex_stop").catch(() => {});
    }
    this.socket?.close();
    this.socket = null;
    for (const request of this.pending.values()) request.reject(new Error("Codex 连接已断开"));
    this.pending.clear();
  }

  async reconnect() {
    const shouldStopNative = this.native || isDesktopApp();
    this.native = false;
    this.nativeGeneration = null;
    this.unlisten?.();
    this.unlistenDisconnect?.();
    this.unlisten = null;
    this.unlistenDisconnect = null;
    this.socket?.close();
    this.socket = null;
    for (const request of this.pending.values()) request.reject(new Error("Codex 正在重新连接"));
    this.pending.clear();
    if (shouldStopNative) await invoke("codex_stop").catch(() => {});
    await this.connect();
  }

  request<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.native && (!this.socket || this.socket.readyState !== WebSocket.OPEN)) {
      return Promise.reject(new Error("Codex 尚未连接"));
    }
    const id = this.requestId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: value => resolve(value as T), reject });
      this.sendRaw(JSON.stringify({ id, method, params })).catch(error => {
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  respond(id: number | string, result: unknown) {
    this.sendRaw(JSON.stringify({ id, result })).catch(() => {});
  }

  notify(method: string, params?: Record<string, unknown>) {
    this.sendRaw(JSON.stringify({ method, params })).catch(() => {});
  }

  private async sendRaw(raw: string) {
    if (this.native) {
      await invoke("codex_send", { message: raw });
      return;
    }
    if (this.socket?.readyState !== WebSocket.OPEN) throw new Error("Codex 尚未连接");
    this.socket.send(raw);
  }

  private receive(raw: string) {
    for (const line of raw.split(/\r?\n/).filter(Boolean)) {
      let message: RpcMessage;
      try { message = JSON.parse(line) as RpcMessage; } catch { continue; }
      if (message.id !== undefined && !message.method) {
        const pending = this.pending.get(Number(message.id));
        if (!pending) continue;
        this.pending.delete(Number(message.id));
        if (message.error) pending.reject(new Error(message.error.message || "Codex 请求失败"));
        else pending.resolve(message.result);
        continue;
      }
      if (message.id !== undefined && message.method) {
        this.dispatchEvent(new CustomEvent<CodexApproval>("approval", { detail: { requestId: message.id, method: message.method, params: message.params || {} } }));
        continue;
      }
      if (message.method) this.dispatchEvent(new CustomEvent("notification", { detail: message }));
    }
  }

  private handleDisconnect(message: string) {
    this.native = false;
    this.nativeGeneration = null;
    this.unlisten?.();
    this.unlistenDisconnect?.();
    this.unlisten = null;
    this.unlistenDisconnect = null;
    this.socket = null;
    for (const request of this.pending.values()) request.reject(new Error(message));
    this.pending.clear();
    this.dispatchEvent(new Event("disconnected"));
  }
}
