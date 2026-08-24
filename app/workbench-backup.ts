import { exportAllProjectWorkspaces,replaceAllProjectWorkspaces,type ProjectWorkspaceState } from "./project-storage";

const BACKUP_FORMAT="terminal-workbench-backup";
const BACKUP_VERSION=1;

export const BACKUP_STORAGE_KEYS=[
 "memory-workbench-entries",
 "memory-workbench-preferences",
 "workbench-daily-plans",
 "workbench-milestones-v1",
 "workbench-memory-links",
 "workbench-tools",
 "workbench-ai-companion-v1",
 "workbench-pet-state-v1",
 "workbench-ai-settings",
 "workbench-codex-thread-owners",
 "workbench-codex-operations"
] as const;

export type WorkbenchBackup={
 format:typeof BACKUP_FORMAT;
 version:typeof BACKUP_VERSION;
 createdAt:string;
 localStorage:Record<string,string>;
 projectWorkspaces:Record<string,ProjectWorkspaceState>;
};

const isObject=(value:unknown):value is Record<string,unknown>=>Boolean(value&&typeof value==="object"&&!Array.isArray(value));

const isProjectWorkspace=(value:unknown):value is ProjectWorkspaceState=>{
 if(!isObject(value))return false;
 return typeof value.projectDirectory==="string"&&Array.isArray(value.threads)&&(value.activeThreadId===null||typeof value.activeThreadId==="string")&&Array.isArray(value.nodes)&&Array.isArray(value.edges);
};

export async function createWorkbenchBackup(includeProjectWorkspaces=true):Promise<WorkbenchBackup>{
 const stored:Record<string,string>={};
 for(const key of BACKUP_STORAGE_KEYS){const value=window.localStorage.getItem(key);if(value!==null)stored[key]=value}
 return{format:BACKUP_FORMAT,version:BACKUP_VERSION,createdAt:new Date().toISOString(),localStorage:stored,projectWorkspaces:includeProjectWorkspaces?await exportAllProjectWorkspaces():{}};
}

export function parseWorkbenchBackup(text:string):WorkbenchBackup{
 if(text.length>50*1024*1024)throw new Error("备份文件超过 50 MB，已停止读取");
 let value:unknown;
 try{value=JSON.parse(text)}catch{throw new Error("备份文件不是有效的 JSON")}
 if(!isObject(value)||value.format!==BACKUP_FORMAT)throw new Error("这不是终端工作台备份文件");
 if(value.version!==BACKUP_VERSION)throw new Error(`暂不支持备份版本 ${String(value.version)}`);
 if(typeof value.createdAt!=="string"||!Number.isFinite(Date.parse(value.createdAt))||!isObject(value.localStorage)||!isObject(value.projectWorkspaces))throw new Error("备份文件结构不完整");
 const localStorage:Record<string,string>={};
 for(const key of BACKUP_STORAGE_KEYS){const item=value.localStorage[key];if(item!==undefined&&typeof item!=="string")throw new Error(`备份项 ${key} 已损坏`);if(typeof item==="string")localStorage[key]=item}
 const projectWorkspaces:Record<string,ProjectWorkspaceState>={};
 for(const[projectId,state]of Object.entries(value.projectWorkspaces)){if(!projectId||projectId==="__proto__"||projectId==="constructor"||projectId==="prototype"||!isProjectWorkspace(state))throw new Error(`项目工作区 ${projectId||"UNKNOWN"} 已损坏`);projectWorkspaces[projectId]=state}
 return{format:BACKUP_FORMAT,version:BACKUP_VERSION,createdAt:value.createdAt,localStorage,projectWorkspaces};
}

export async function restoreWorkbenchBackup(backup:WorkbenchBackup){
 // IndexedDB can fail because another window still owns the database. Replace it
 // first so a failure cannot leave the lightweight workbench data half-restored.
 await replaceAllProjectWorkspaces(backup.projectWorkspaces);
 for(const key of BACKUP_STORAGE_KEYS)window.localStorage.removeItem(key);
 for(const[key,value]of Object.entries(backup.localStorage))window.localStorage.setItem(key,value);
}

export function createBackupDownload(backup:WorkbenchBackup){
 const day=backup.createdAt.slice(0,10),filename=`terminal-workbench-backup-${day}.json`,content=JSON.stringify(backup,null,2);
 return{filename,url:URL.createObjectURL(new Blob([content],{type:"application/json"}))};
}
