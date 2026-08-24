"use client";

import { useEffect,useRef,useState,type ChangeEvent } from "react";
import { createBackupDownload,createWorkbenchBackup,parseWorkbenchBackup,restoreWorkbenchBackup } from "./workbench-backup";

export default function BackupControls({hasProjects}:{hasProjects:boolean}){
 const[fileInput,setFileInput]=useState(0),[busy,setBusy]=useState<"export"|"restore"|"">(""),[status,setStatus]=useState("备份包含工作台数据和项目画布，不包含账户密钥"),[download,setDownload]=useState<{filename:string;url:string}|null>(null),inputRef=useRef<HTMLInputElement>(null);
 useEffect(()=>()=>{if(download)URL.revokeObjectURL(download.url)},[download]);
 const exportBackup=async()=>{setBusy("export");setStatus("正在整理本地数据...");try{const backup=await createWorkbenchBackup(hasProjects),next=createBackupDownload(backup);setDownload(next);setStatus(`备份已就绪 · ${Object.keys(backup.projectWorkspaces).length} 个项目工作区`)}catch(error){setStatus(`导出失败：${String(error instanceof Error?error.message:error)}`)}finally{setBusy("")}};
 const importBackup=async(event:ChangeEvent<HTMLInputElement>)=>{const file=event.target.files?.[0];if(!file)return;setBusy("restore");setStatus("正在校验备份文件...");try{const backup=parseWorkbenchBackup(await file.text()),created=new Date(backup.createdAt).toLocaleString("zh-CN");if(!window.confirm(`将恢复 ${created} 创建的备份。\n\n当前本地数据和项目画布会被替换，工作台随后重新加载。确定继续吗？`)){setStatus("已取消恢复");return}await restoreWorkbenchBackup(backup);setStatus("恢复完成，正在重新加载...");window.location.reload()}catch(error){setStatus(`恢复失败：${String(error instanceof Error?error.message:error)}`)}finally{setBusy("");setFileInput(value=>value+1)}};
 return <div className="backup-control"><div className="backup-control-copy"><b>工作台数据备份</b><small>LOCAL DATA ARCHIVE / JSON</small><p>忆泡、计划、里程碑、工具、设置，以及项目画布与项目内对话。</p></div><div className="backup-actions">{download?<a href={download.url} download={download.filename} onClick={()=>setStatus("备份文件已交给浏览器下载")}>下载备份文件</a>:<button onClick={exportBackup} disabled={Boolean(busy)}>{busy==="export"?"正在生成...":"生成备份"}</button>}<button onClick={()=>inputRef.current?.click()} disabled={Boolean(busy)}>{busy==="restore"?"正在恢复...":"恢复备份"}</button><input key={fileInput} ref={inputRef} type="file" accept="application/json,.json" onChange={importBackup}/></div><p className="backup-status" aria-live="polite">{status}</p></div>;
}
