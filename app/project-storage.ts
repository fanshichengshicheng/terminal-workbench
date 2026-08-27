export type StoredProjectThread = {
  id: string;
  name: string;
  preview: string;
  updatedAt: number;
};

export type StoredCanvasNode = {
  id: string;
  type: "note" | "image" | "response" | "doodle" | "shape" | "group";
  position: { x: number; y: number };
  data: Record<string, unknown>;
  width?: number;
  height?: number;
  parentId?: string;
  extent?: unknown;
  zIndex?: number;
  style?: unknown;
  [key: string]: unknown;
};

export type StoredCanvasEdge = {
  id: string;
  source: string;
  target: string;
};

export type ProjectWorkspaceState = {
  projectDirectory: string;
  threads: StoredProjectThread[];
  activeThreadId: string | null;
  assistantChats?: Record<string, Array<{ id: string; role: "user" | "assistant"; text: string }>>;
  nodes: StoredCanvasNode[];
  edges: StoredCanvasEdge[];
};

const DB_NAME = "terminal-workbench-projects";
const STORE_NAME = "workspace-state";
const DB_VERSION = 1;

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  const timeout = window.setTimeout(() => reject(new Error("项目工作区数据库连接超时")), 5000);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) {
      request.result.createObjectStore(STORE_NAME);
    }
  };
  request.onsuccess = () => { window.clearTimeout(timeout); resolve(request.result); };
  request.onerror = () => { window.clearTimeout(timeout); reject(request.error); };
  request.onblocked = () => { window.clearTimeout(timeout); reject(new Error("项目工作区数据库正被占用")); };
});

export async function loadProjectWorkspace(projectId: string): Promise<ProjectWorkspaceState | null> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(projectId);
      let result: ProjectWorkspaceState | null = null;
      request.onsuccess = () => { result = (request.result as ProjectWorkspaceState | undefined) ?? null; };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(transaction.error ?? new Error("项目工作区读取已中止"));
    });
  } finally {
    database.close();
  }
}

export async function saveProjectWorkspace(projectId: string, state: ProjectWorkspaceState) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(state, projectId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error("项目工作区保存已中止"));
    });
  } finally {
    database.close();
  }
}

export async function deleteProjectWorkspace(projectId: string) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(projectId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error("项目工作区删除已中止"));
    });
  } finally {
    database.close();
  }
}

export async function exportAllProjectWorkspaces(): Promise<Record<string, ProjectWorkspaceState>> {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readonly");
  const store = transaction.objectStore(STORE_NAME);
  const read = <T,>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const [keys, values] = await Promise.all([
      read(store.getAllKeys()),
      read(store.getAll() as IDBRequest<ProjectWorkspaceState[]>),
    ]);
    return Object.fromEntries(keys.map((key, index) => [String(key), values[index]]));
  } finally {
    database.close();
  }
}

export async function replaceAllProjectWorkspaces(workspaces: Record<string, ProjectWorkspaceState>) {
  if (!Object.keys(workspaces).length) {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("项目工作区数据库正被占用"));
    });
    return;
  }
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      store.clear();
      for (const [projectId, state] of Object.entries(workspaces)) store.put(state, projectId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error("项目工作区恢复已中止"));
    });
  } finally {
    database.close();
  }
}
