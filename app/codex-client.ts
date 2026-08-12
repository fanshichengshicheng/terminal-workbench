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

export class CodexClient extends EventTarget {
  private socket: WebSocket | null = null;
  private pending = new Map<number, PendingRequest>();
  private requestId = 1;
  readonly url: string;

  constructor(url = "ws://127.0.0.1:45123") {
    super();
    this.url = url;
  }

  async connect() {
    if (this.socket?.readyState === WebSocket.OPEN) return;
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
        for (const request of this.pending.values()) request.reject(new Error("Codex 连接已断开"));
        this.pending.clear();
        this.dispatchEvent(new Event("disconnected"));
      };
      socket.onmessage = event => this.receive(String(event.data));
    });
    await this.request("initialize", {
      clientInfo: { name: "terminal-workbench", title: "终端工作台", version: "0.1.0" },
      capabilities: { experimentalApi: true, requestAttestation: false },
    });
    this.notify("initialized");
    this.dispatchEvent(new Event("connected"));
  }

  disconnect() {
    this.socket?.close();
    this.socket = null;
  }

  request<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Codex 尚未连接"));
    }
    const id = this.requestId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: value => resolve(value as T), reject });
    });
  }

  respond(id: number | string, result: unknown) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ id, result }));
  }

  notify(method: string, params?: Record<string, unknown>) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ method, params }));
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
}
