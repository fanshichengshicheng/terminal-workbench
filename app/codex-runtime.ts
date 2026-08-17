import { CodexClient, type CodexApproval, type CodexItem, type CodexThread, type CodexTurn } from "./codex-client";

export type CodexConnectionState = "connecting" | "online" | "offline";
export type CodexTaskStatus = "running" | "waitingApproval" | "completed" | "failed";
export type CodexActivityStatus = "running" | "completed" | "failed";

export type CodexActivityOperation = {
  id: string;
  type: "command" | "files";
  label: string;
  status: CodexActivityStatus;
  detail: string;
  output?: string;
};

export type CodexChatEntry =
  | { id: string; role: "user"; text: string; imageUrl?: string; imageName?: string; turnId?: string }
  | { id: string; role: "assistant"; text: string; turnId?: string }
  | { id: string; role: "activity"; turnId: string; status: CodexActivityStatus; operations: CodexActivityOperation[] };

export type CodexThreadConfiguration = {
  model: string;
  reasoningEffort: string;
};

export type CodexThreadOwner = {
  projectId: string;
  projectTitle: string;
  threadName?: string;
};

export type CodexRuntimeTask = CodexThreadOwner & {
  threadId: string;
  turnId?: string;
  status: CodexTaskStatus;
  updatedAt: number;
};

export type CodexRuntimeSnapshot = {
  connection: CodexConnectionState;
  error: string;
  entries: Record<string, CodexChatEntry[]>;
  activeTurns: Record<string, string>;
  approvals: CodexApproval[];
  tasks: CodexRuntimeTask[];
  configurations: Record<string, CodexThreadConfiguration>;
};

type CodexNotification = { method: string; params: Record<string, unknown> };
type ThreadHydration = {
  model?: string | null;
  reasoningEffort?: string | null;
  owner?: CodexThreadOwner;
};

const OWNER_STORAGE_KEY = "workbench-codex-thread-owners";

const textFromInput = (item: CodexItem) => {
  if (item.type !== "userMessage") return "";
  return item.content
    .map(content => content.type === "text" ? content.text || "" : "")
    .filter(Boolean)
    .join("\n");
};

const imageFromInput = (item: CodexItem) => {
  if (item.type !== "userMessage") return undefined;
  return item.content.find(content => content.type === "image" && content.url)?.url;
};

const activityStatus = (status?: string): CodexActivityStatus => {
  const value = String(status || "").toLowerCase();
  if (value.includes("fail") || value.includes("error") || value.includes("declin")) return "failed";
  if (value.includes("progress") || value.includes("running") || value.includes("start")) return "running";
  return "completed";
};

const changeLabel = (change: unknown) => {
  if (!change || typeof change !== "object") return "项目文件";
  const candidate = change as Record<string, unknown>;
  return String(candidate.path || candidate.filePath || candidate.file || candidate.name || "项目文件");
};

const operationFromItem = (item: CodexItem): CodexActivityOperation | null => {
  if (item.type === "commandExecution") {
    return {
      id: item.id,
      type: "command",
      label: item.command || "执行命令",
      status: activityStatus(item.status),
      detail: item.command || "执行命令",
      output: item.aggregatedOutput || undefined,
    };
  }
  if (item.type === "fileChange") {
    const files = item.changes.map(changeLabel);
    return {
      id: item.id,
      type: "files",
      label: files.length ? `修改 ${files.length} 个文件` : "修改项目文件",
      status: activityStatus(item.status),
      detail: files.join("\n") || "项目文件",
    };
  }
  return null;
};

const turnActivityStatus = (turn: CodexTurn, operations: CodexActivityOperation[]) => {
  const status = activityStatus(turn.status);
  if (status === "failed" || operations.some(operation => operation.status === "failed")) return "failed" as const;
  if (status === "running" || operations.some(operation => operation.status === "running")) return "running" as const;
  return "completed" as const;
};

export const codexTurnsToEntries = (turns: CodexTurn[] = []) => turns.reduce<CodexChatEntry[]>((entries, turn) => {
  let activity: Extract<CodexChatEntry, { role: "activity" }> | null = null;
  for (const item of turn.items || []) {
    if (item.type === "userMessage") {
      const imageUrl = imageFromInput(item);
      entries.push({ id: item.id, role: "user", text: textFromInput(item), imageUrl, turnId: turn.id });
    }
    if (item.type === "agentMessage") entries.push({ id: item.id, role: "assistant", text: item.text, turnId: turn.id });
    const operation = operationFromItem(item);
    if (!operation) continue;
    if (!activity) {
      activity = { id: `activity-${turn.id}`, role: "activity", turnId: turn.id, status: "completed", operations: [] };
      entries.push(activity);
    }
    activity.operations.push(operation);
    activity.status = turnActivityStatus(turn, activity.operations);
  }
  return entries;
}, []);

const readOwners = (): Record<string, CodexThreadOwner> => {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(OWNER_STORAGE_KEY) || "null");
    return parsed && typeof parsed === "object" ? parsed as Record<string, CodexThreadOwner> : {};
  } catch {
    return {};
  }
};

class CodexRuntime extends EventTarget {
  readonly client = new CodexClient();
  private connecting: Promise<void> | null = null;
  private connection: CodexConnectionState = "connecting";
  private error = "";
  private entries: Record<string, CodexChatEntry[]> = {};
  private activeTurns: Record<string, string> = {};
  private approvals: CodexApproval[] = [];
  private tasks: Record<string, CodexRuntimeTask> = {};
  private configurations: Record<string, CodexThreadConfiguration> = {};
  private owners: Record<string, CodexThreadOwner> = readOwners();

  constructor() {
    super();
    this.client.addEventListener("notification", event => this.receiveNotification((event as CustomEvent<CodexNotification>).detail));
    this.client.addEventListener("approval", event => this.receiveApproval((event as CustomEvent<CodexApproval>).detail));
    this.client.addEventListener("disconnected", () => {
      this.connection = "offline";
      this.error = "Codex 本地连接已断开";
      this.emitChange();
    });
  }

  getSnapshot(): CodexRuntimeSnapshot {
    return {
      connection: this.connection,
      error: this.error,
      entries: this.entries,
      activeTurns: this.activeTurns,
      approvals: this.approvals,
      tasks: Object.values(this.tasks).sort((left, right) => right.updatedAt - left.updatedAt),
      configurations: this.configurations,
    };
  }

  subscribe(listener: () => void) {
    this.addEventListener("change", listener);
    return () => this.removeEventListener("change", listener);
  }

  hasActiveTasks() {
    return Object.values(this.tasks).some(task => task.status === "running" || task.status === "waitingApproval");
  }

  async ensureConnected() {
    if (this.connection === "online") return;
    if (this.connecting) return this.connecting;
    this.connection = "connecting";
    this.error = "";
    this.emitChange();
    this.connecting = this.client.connect()
      .then(() => {
        this.connection = "online";
        this.error = "";
        this.emitChange();
      })
      .catch(error => {
        this.connection = "offline";
        this.error = String(error instanceof Error ? error.message : error);
        this.emitChange();
        throw error;
      })
      .finally(() => { this.connecting = null; });
    return this.connecting;
  }

  async reconnect() {
    this.connection = "connecting";
    this.error = "";
    this.emitChange();
    try {
      await this.client.reconnect();
      this.connection = "online";
      this.error = "";
      this.emitChange();
    } catch (error) {
      this.connection = "offline";
      this.error = String(error instanceof Error ? error.message : error);
      this.emitChange();
      throw error;
    }
  }

  async shutdown() {
    this.client.disconnect();
  }

  setError(message: string) {
    this.error = message;
    this.emitChange();
  }

  clearError() {
    if (!this.error) return;
    this.error = "";
    this.emitChange();
  }

  registerThread(threadId: string, owner: CodexThreadOwner) {
    this.owners = { ...this.owners, [threadId]: { ...this.owners[threadId], ...owner } };
    if (typeof window !== "undefined") window.localStorage.setItem(OWNER_STORAGE_KEY, JSON.stringify(this.owners));
    const task = this.tasks[threadId];
    if (task) this.tasks = { ...this.tasks, [threadId]: { ...task, ...this.owners[threadId] } };
    this.emitChange();
  }

  updateThreadName(threadId: string, threadName: string) {
    const owner = this.owners[threadId];
    if (owner) this.registerThread(threadId, { ...owner, threadName });
  }

  hydrateThread(thread: CodexThread, hydration: ThreadHydration = {}) {
    if (hydration.owner) this.registerThread(thread.id, hydration.owner);
    this.entries = { ...this.entries, [thread.id]: codexTurnsToEntries(thread.turns || []) };
    if (hydration.model || hydration.reasoningEffort) {
      this.configurations = {
        ...this.configurations,
        [thread.id]: {
          model: hydration.model || this.configurations[thread.id]?.model || "",
          reasoningEffort: hydration.reasoningEffort || this.configurations[thread.id]?.reasoningEffort || "",
        },
      };
    }
    const runningTurn = [...(thread.turns || [])].reverse().find(turn => activityStatus(turn.status) === "running");
    if (runningTurn) {
      this.activeTurns = { ...this.activeTurns, [thread.id]: runningTurn.id };
      this.setTask(thread.id, "running", runningTurn.id);
    } else if (thread.status?.type === "active" && this.activeTurns[thread.id]) {
      this.setTask(thread.id, "running", this.activeTurns[thread.id]);
    }
    this.emitChange();
  }

  addUserMessage(threadId: string, entry: Extract<CodexChatEntry, { role: "user" }>) {
    this.entries = { ...this.entries, [threadId]: [...(this.entries[threadId] || []), entry] };
    this.emitChange();
  }

  markTurnStarted(threadId: string, turnId: string) {
    this.activeTurns = { ...this.activeTurns, [threadId]: turnId };
    this.setTask(threadId, "running", turnId);
    this.emitChange();
  }

  answerApproval(approval: CodexApproval, accept: boolean) {
    this.client.respond(approval.requestId, { decision: accept ? "accept" : "decline" });
    this.approvals = this.approvals.filter(item => item.requestId !== approval.requestId);
    const threadId = String(approval.params.threadId || "");
    if (threadId && this.activeTurns[threadId]) this.setTask(threadId, "running", this.activeTurns[threadId]);
    this.emitChange();
  }

  interrupt(threadId: string) {
    const turnId = this.activeTurns[threadId];
    if (!turnId) return Promise.resolve();
    return this.client.request("turn/interrupt", { threadId, turnId });
  }

  removeThread(threadId: string) {
    const entries = { ...this.entries };
    const activeTurns = { ...this.activeTurns };
    const tasks = { ...this.tasks };
    const configurations = { ...this.configurations };
    const owners = { ...this.owners };
    delete entries[threadId];
    delete activeTurns[threadId];
    delete tasks[threadId];
    delete configurations[threadId];
    delete owners[threadId];
    this.entries = entries;
    this.activeTurns = activeTurns;
    this.tasks = tasks;
    this.configurations = configurations;
    this.owners = owners;
    this.approvals = this.approvals.filter(approval => String(approval.params.threadId || "") !== threadId);
    if (typeof window !== "undefined") window.localStorage.setItem(OWNER_STORAGE_KEY, JSON.stringify(this.owners));
    this.emitChange();
  }

  dismissFinishedTasks() {
    this.tasks = Object.fromEntries(Object.entries(this.tasks).filter(([, task]) => task.status === "running" || task.status === "waitingApproval"));
    this.emitChange();
  }

  private receiveNotification(message: CodexNotification) {
    const params = message.params || {};
    const threadId = String(params.threadId || "");
    const turnId = String(params.turnId || this.activeTurns[threadId] || "");
    if (message.method === "item/agentMessage/delta" && threadId) {
      const itemId = String(params.itemId || "agent-stream");
      const delta = String(params.delta || "");
      const list = [...(this.entries[threadId] || [])];
      const index = list.findIndex(entry => entry.id === itemId && entry.role === "assistant");
      if (index >= 0) {
        const entry = list[index];
        if (entry.role === "assistant") list[index] = { ...entry, text: entry.text + delta, turnId: entry.turnId || turnId || undefined };
      } else {
        list.push({ id: itemId, role: "assistant", text: delta, turnId: turnId || undefined });
      }
      this.entries = { ...this.entries, [threadId]: list };
      this.emitChange();
      return;
    }
    if ((message.method === "item/started" || message.method === "item/completed") && threadId) {
      const item = params.item as CodexItem | undefined;
      if (!item) return;
      if (item.type === "agentMessage") this.upsertAgentMessage(threadId, turnId, item);
      else this.upsertOperation(threadId, turnId || `live-${threadId}`, item);
      return;
    }
    if (message.method === "turn/started" && threadId) {
      const turn = params.turn as CodexTurn | undefined;
      const id = String(turn?.id || turnId || "");
      if (id) this.markTurnStarted(threadId, id);
      return;
    }
    if (message.method === "turn/completed" && threadId) {
      const turn = params.turn as CodexTurn | undefined;
      const id = String(turn?.id || turnId || this.activeTurns[threadId] || "");
      const failed = activityStatus(turn?.status) === "failed";
      const nextActiveTurns = { ...this.activeTurns };
      delete nextActiveTurns[threadId];
      this.activeTurns = nextActiveTurns;
      this.approvals = this.approvals.filter(approval => String(approval.params.threadId || "") !== threadId);
      this.completeActivity(threadId, id, failed ? "failed" : "completed");
      this.setTask(threadId, failed ? "failed" : "completed", id || undefined);
      this.emitChange();
      return;
    }
    if (message.method === "thread/name/updated" && threadId) {
      const name = String(params.name || "");
      if (name) this.updateThreadName(threadId, name);
    }
  }

  private receiveApproval(approval: CodexApproval) {
    if (this.approvals.some(item => item.requestId === approval.requestId)) return;
    this.approvals = [...this.approvals, approval];
    const threadId = String(approval.params.threadId || "");
    if (threadId) this.setTask(threadId, "waitingApproval", this.activeTurns[threadId]);
    this.emitChange();
  }

  private upsertAgentMessage(threadId: string, turnId: string, item: Extract<CodexItem, { type: "agentMessage" }>) {
    const list = [...(this.entries[threadId] || [])];
    const index = list.findIndex(entry => entry.id === item.id && entry.role === "assistant");
    const entry: CodexChatEntry = { id: item.id, role: "assistant", text: item.text, turnId: turnId || undefined };
    if (index >= 0) list[index] = entry;
    else list.push(entry);
    this.entries = { ...this.entries, [threadId]: list };
    this.emitChange();
  }

  private upsertOperation(threadId: string, turnId: string, item: CodexItem) {
    const operation = operationFromItem(item);
    if (!operation) return;
    const list = [...(this.entries[threadId] || [])];
    const activityId = `activity-${turnId}`;
    const index = list.findIndex(entry => entry.id === activityId && entry.role === "activity");
    if (index >= 0) {
      const current = list[index];
      if (current.role !== "activity") return;
      const operations = current.operations.some(existing => existing.id === operation.id)
        ? current.operations.map(existing => existing.id === operation.id ? operation : existing)
        : [...current.operations, operation];
      const status = operations.some(existing => existing.status === "failed")
        ? "failed"
        : operations.some(existing => existing.status === "running") ? "running" : current.status;
      list[index] = { ...current, operations, status };
    } else {
      list.push({ id: activityId, role: "activity", turnId, status: operation.status, operations: [operation] });
    }
    this.entries = { ...this.entries, [threadId]: list };
    this.emitChange();
  }

  private completeActivity(threadId: string, turnId: string, status: CodexActivityStatus) {
    if (!turnId) return;
    const list = this.entries[threadId];
    if (!list) return;
    this.entries = {
      ...this.entries,
      [threadId]: list.map(entry => entry.role === "activity" && entry.turnId === turnId
        ? { ...entry, status, operations: entry.operations.map(operation => operation.status === "running" ? { ...operation, status } : operation) }
        : entry),
    };
  }

  private setTask(threadId: string, status: CodexTaskStatus, turnId?: string) {
    const owner = this.owners[threadId] || { projectId: "", projectTitle: "未归属项目", threadName: "Codex 对话" };
    const previous = this.tasks[threadId];
    this.tasks = {
      ...this.tasks,
      [threadId]: {
        threadId,
        projectId: owner.projectId,
        projectTitle: owner.projectTitle,
        threadName: owner.threadName || previous?.threadName || "Codex 对话",
        turnId: turnId || previous?.turnId,
        status,
        updatedAt: Date.now(),
      },
    };
  }

  private emitChange() {
    this.dispatchEvent(new Event("change"));
  }
}

export const codexRuntime = new CodexRuntime();
