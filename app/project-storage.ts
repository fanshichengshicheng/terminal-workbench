export type StoredProjectThread = {
  id: string;
  name: string;
  preview: string;
  updatedAt: number;
};

export type StoredCanvasNode = {
  id: string;
  type: "note" | "image" | "response";
  position: { x: number; y: number };
  data: Record<string, unknown>;
  width?: number;
  height?: number;
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
  nodes: StoredCanvasNode[];
  edges: StoredCanvasEdge[];
};

const DB_NAME = "terminal-workbench-projects";
const STORE_NAME = "workspace-state";
const DB_VERSION = 1;

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) {
      request.result.createObjectStore(STORE_NAME);
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export async function loadProjectWorkspace(projectId: string): Promise<ProjectWorkspaceState | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(projectId);
    request.onsuccess = () => resolve((request.result as ProjectWorkspaceState | undefined) ?? null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

export async function saveProjectWorkspace(projectId: string, state: ProjectWorkspaceState) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(state, projectId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function deleteProjectWorkspace(projectId: string) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(projectId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}
