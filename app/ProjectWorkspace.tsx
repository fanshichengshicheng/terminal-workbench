"use client";

import { useCallback,useEffect,useRef,useState,type ChangeEvent,type DragEvent } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  NodeResizer,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  Archive,
  Bot,
  FolderOpen,
  GitFork,
  ImagePlus,
  MessageSquarePlus,
  PanelLeftClose,
  PanelRightClose,
  PencilLine,
  Pin,
  Plus,
  Send,
  Square,
  StickyNote,
  X,
} from "lucide-react";
import { CodexClient,type CodexApproval,type CodexItem,type CodexThread,type CodexTurn } from "./codex-client";
import { loadProjectWorkspace,saveProjectWorkspace,type ProjectWorkspaceState,type StoredProjectThread } from "./project-storage";

type ProjectWorkspaceProject = {
  id: string;
  title: string;
  tags: string[];
  originId?: string;
};

type CanvasNodeData = {
  title: string;
  text?: string;
  image?: string;
  threadId?: string;
  editable?: boolean;
  update?: (id: string, patch: Partial<CanvasNodeData>) => void;
  remove?: (id: string) => void;
};

type CanvasNode = Node<CanvasNodeData,"note"|"image"|"response">;
type ChatEntry = { id: string; role: "user"|"assistant"|"event"; text: string; kind?: string };

const textFromInput = (item: CodexItem) => {
  if (item.type !== "userMessage") return "";
  return item.content.map(content => content.type === "text" ? content.text || "" : content.type === "image" ? "[图片]" : "").filter(Boolean).join("\n");
};

const turnsToEntries = (turns: CodexTurn[] = []) => turns.reduce<ChatEntry[]>((entries,turn) => {
  for (const item of turn.items) {
    if (item.type === "userMessage") entries.push({id:item.id,role:"user",text:textFromInput(item)});
    if (item.type === "agentMessage") entries.push({id:item.id,role:"assistant",text:item.text});
    if (item.type === "commandExecution") entries.push({id:item.id,role:"event",kind:"COMMAND",text:`${item.command}\n${item.aggregatedOutput || item.status}`});
    if (item.type === "fileChange") entries.push({id:item.id,role:"event",kind:"FILES",text:`文件修改 / ${item.status}`});
  }
  return entries;
},[]);

function NodeShell({id,selected,data,children}:{id:string;selected:boolean;data:CanvasNodeData;children:React.ReactNode}) {
  return <article className={`project-canvas-node ${selected?"selected":""}`}>
    <NodeResizer isVisible={selected} minWidth={180} minHeight={110}/>
    <header><span>{data.title}</span><button onClick={()=>data.remove?.(id)} aria-label="删除画布卡片"><X size={14}/></button></header>
    {children}
    <Handle type="target" position={Position.Left}/><Handle type="source" position={Position.Right}/>
  </article>;
}

function NoteNode({id,selected,data}:NodeProps<CanvasNode>) {
  return <NodeShell id={id} selected={selected} data={data}><textarea className="nodrag" value={data.text || ""} onChange={event=>data.update?.(id,{text:event.target.value})} placeholder="输入文字..."/></NodeShell>;
}

function ImageNode({id,selected,data}:NodeProps<CanvasNode>) {
  return <NodeShell id={id} selected={selected} data={data}><div className="project-image-node">{data.image?
    // Canvas images are user-provided Data URLs, so Next image optimization does not apply.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={data.image} alt={data.title}/>:<span>IMAGE EMPTY</span>}</div></NodeShell>;
}

function ResponseNode({id,selected,data}:NodeProps<CanvasNode>) {
  return <NodeShell id={id} selected={selected} data={data}><div className="project-response-node"><Bot size={16}/><p>{data.text}</p></div></NodeShell>;
}

const nodeTypes = { note: NoteNode, image: ImageNode, response: ResponseNode };

function ProjectWorkspaceInner({project,close}:{project:ProjectWorkspaceProject;close:()=>void}) {
  const clientRef=useRef<CodexClient|null>(null),saveTimer=useRef<number|null>(null),latestState=useRef<ProjectWorkspaceState|null>(null),imagePicker=useRef<HTMLInputElement>(null);
  const[projectDirectory,setProjectDirectory]=useState("");
  const[threads,setThreads]=useState<StoredProjectThread[]>([]),[activeThreadId,setActiveThreadId]=useState<string|null>(null);
  const[entries,setEntries]=useState<Record<string,ChatEntry[]>>({}),[draft,setDraft]=useState(""),[activeTurns,setActiveTurns]=useState<Record<string,string>>({});
  const[connection,setConnection]=useState<"connecting"|"online"|"offline">("connecting"),[connectionError,setConnectionError]=useState("");
  const[approvals,setApprovals]=useState<CodexApproval[]>([]),[leftOpen,setLeftOpen]=useState(true),[rightOpen,setRightOpen]=useState(true),[ready,setReady]=useState(false);
  const[nodes,setNodes,onNodesChange]=useNodesState<CanvasNode>([]),[edges,setEdges,onEdgesChange]=useEdgesState<Edge>([]);
  const flow=useReactFlow<CanvasNode,Edge>();

  const removeNode=useCallback((id:string)=>setNodes(current=>current.filter(node=>node.id!==id)),[setNodes]);
  const updateNode=useCallback((id:string,patch:Partial<CanvasNodeData>)=>setNodes(current=>current.map(node=>node.id===id?{...node,data:{...node.data,...patch}}:node)),[setNodes]);
  const hydrateNode=useCallback((node:CanvasNode):CanvasNode=>({...node,data:{...node.data,update:updateNode,remove:removeNode}}),[removeNode,updateNode]);
  const activeThread=threads.find(thread=>thread.id===activeThreadId),activeEntries=activeThreadId?entries[activeThreadId]||[]:[],activeTurnId=activeThreadId?activeTurns[activeThreadId]||null:null;
  const activeApprovals=activeThreadId?approvals.filter(approval=>String(approval.params.threadId||"")===activeThreadId):[];

  useEffect(()=>{let cancelled=false;loadProjectWorkspace(project.id).then(saved=>{if(cancelled)return;if(saved){setProjectDirectory(saved.projectDirectory||"");setThreads(saved.threads||[]);setActiveThreadId(saved.activeThreadId||saved.threads?.[0]?.id||null);setNodes((saved.nodes||[]).map(node=>hydrateNode(node as CanvasNode)));setEdges(saved.edges||[])}setReady(true)}).catch(()=>setReady(true));return()=>{cancelled=true}},[hydrateNode,project.id,setEdges,setNodes]);
  useEffect(()=>{if(!ready)return;const state:ProjectWorkspaceState={projectDirectory,threads,activeThreadId,nodes:nodes.map(node=>({...node,data:{...node.data,update:undefined,remove:undefined}})),edges};latestState.current=state;if(saveTimer.current)window.clearTimeout(saveTimer.current);saveTimer.current=window.setTimeout(()=>saveProjectWorkspace(project.id,state).catch(()=>{}),300);return()=>{if(saveTimer.current)window.clearTimeout(saveTimer.current)}},[activeThreadId,edges,nodes,project.id,projectDirectory,ready,threads]);
  useEffect(()=>()=>{if(saveTimer.current)window.clearTimeout(saveTimer.current);if(latestState.current)saveProjectWorkspace(project.id,latestState.current).catch(()=>{})},[project.id]);

  useEffect(()=>{const client=new CodexClient();clientRef.current=client;const onNotification=(event:Event)=>{const message=(event as CustomEvent<{method:string;params:Record<string,unknown>}>).detail,params=message.params||{},threadId=String(params.threadId||"");if(message.method==="item/agentMessage/delta"&&threadId){const itemId=String(params.itemId||"agent-stream"),delta=String(params.delta||"");setEntries(current=>{const list=[...(current[threadId]||[])],index=list.findIndex(item=>item.id===itemId);if(index>=0)list[index]={...list[index],text:list[index].text+delta};else list.push({id:itemId,role:"assistant",text:delta});return{...current,[threadId]:list}})}if(message.method==="item/completed"&&threadId){const item=params.item as CodexItem|undefined;if(!item)return;if(item.type==="commandExecution"||item.type==="fileChange")setEntries(current=>({...current,[threadId]:[...(current[threadId]||[]).filter(entry=>entry.id!==item.id),...turnsToEntries([{id:"event",status:"completed",items:[item]}])]}))}if(message.method==="turn/started"&&threadId){const turn=params.turn as {id?:string}|undefined;if(turn?.id)setActiveTurns(current=>({...current,[threadId]:turn.id!}))}if(message.method==="turn/completed"&&threadId){setActiveTurns(current=>{const next={...current};delete next[threadId];return next});setThreads(current=>current.map(thread=>thread.id===threadId?{...thread,updatedAt:Date.now()}:thread))}if(message.method==="thread/name/updated"){const name=String(params.name||"");setThreads(current=>current.map(thread=>thread.id===threadId?{...thread,name}:thread))}};const onApproval=(event:Event)=>setApprovals(current=>[...current,(event as CustomEvent<CodexApproval>).detail]);const onDisconnected=()=>{setConnection("offline");setConnectionError("Codex 本地连接已断开")};client.addEventListener("notification",onNotification);client.addEventListener("approval",onApproval);client.addEventListener("disconnected",onDisconnected);client.connect().then(()=>{setConnection("online");setConnectionError("")}).catch(error=>{setConnection("offline");setConnectionError(String(error instanceof Error?error.message:error))});return()=>{client.removeEventListener("notification",onNotification);client.removeEventListener("approval",onApproval);client.removeEventListener("disconnected",onDisconnected);client.disconnect();clientRef.current=null}},[]);

  const retryCodex=()=>{const client=clientRef.current;if(!client)return;setConnection("connecting");client.connect().then(()=>{setConnection("online");setConnectionError("")}).catch(error=>{setConnection("offline");setConnectionError(String(error instanceof Error?error.message:error))})};
  const createThread=async()=>{const client=clientRef.current;if(!projectDirectory.trim()){setConnectionError("请先设置本机项目目录，再创建 Codex 对话");return null}if(!client||connection!=="online"){setConnectionError("请先启动 Codex 本地服务");return null}try{const response=await client.request<{thread:CodexThread}>("thread/start",{cwd:projectDirectory.trim(),approvalPolicy:"on-request",sandbox:"workspace-write",developerInstructions:`你正在终端工作台的项目「${project.title}」中协作。保持修改范围与该项目一致。`});const thread=response.thread,name=`对话 ${threads.length+1}`;await client.request("thread/name/set",{threadId:thread.id,name});const stored={id:thread.id,name,preview:"新对话",updatedAt:Date.now()};setThreads(current=>[stored,...current]);setEntries(current=>({...current,[thread.id]:[]}));setActiveThreadId(thread.id);return thread.id}catch(error){setConnectionError(String(error instanceof Error?error.message:error));return null}};
  const openThread=async(id:string)=>{setActiveThreadId(id);if(entries[id])return;const client=clientRef.current;if(!client||connection!=="online")return;try{const response=await client.request<{thread:CodexThread}>("thread/read",{threadId:id,includeTurns:true});setEntries(current=>({...current,[id]:turnsToEntries(response.thread.turns||[])}))}catch(error){const message=String(error instanceof Error?error.message:error);if(message.includes("not materialized")){setEntries(current=>({...current,[id]:[]}));return}setConnectionError(message)}};
  useEffect(()=>{if(!ready||connection!=="online"||!activeThreadId||entries[activeThreadId]!==undefined)return;let cancelled=false;const client=clientRef.current;if(!client)return;client.request<{thread:CodexThread}>("thread/read",{threadId:activeThreadId,includeTurns:true}).then(response=>{if(!cancelled)setEntries(current=>({...current,[activeThreadId]:turnsToEntries(response.thread.turns||[])}))}).catch(error=>{if(cancelled)return;const message=String(error instanceof Error?error.message:error);if(message.includes("not materialized")){setEntries(current=>({...current,[activeThreadId]:[]}));return}setConnectionError(message)});return()=>{cancelled=true}},[activeThreadId,connection,entries,ready]);
  const send=async()=>{const text=draft.trim(),client=clientRef.current;if(!text||!client||connection!=="online")return;const threadId=activeThreadId||await createThread();if(!threadId)return;setDraft("");const userEntry={id:`user-${Date.now()}`,role:"user" as const,text};setEntries(current=>({...current,[threadId]:[...(current[threadId]||[]),userEntry]}));setThreads(current=>current.map(thread=>thread.id===threadId?{...thread,preview:text,updatedAt:Date.now()}:thread));try{const response=await client.request<{turn:{id:string}}>("turn/start",{threadId,input:[{type:"text",text,text_elements:[]}],cwd:projectDirectory||undefined});setActiveTurns(current=>({...current,[threadId]:response.turn.id}))}catch(error){setActiveTurns(current=>{const next={...current};delete next[threadId];return next});setConnectionError(String(error instanceof Error?error.message:error))}};
  const stop=()=>{if(activeThreadId&&activeTurnId)clientRef.current?.request("turn/interrupt",{threadId:activeThreadId,turnId:activeTurnId}).catch(()=>{})};
  const archiveThread=async(id:string)=>{try{await clientRef.current?.request("thread/archive",{threadId:id})}catch(error){setConnectionError(String(error instanceof Error?error.message:error));return}setThreads(current=>current.filter(thread=>thread.id!==id));setEntries(current=>{const next={...current};delete next[id];return next});setActiveTurns(current=>{const next={...current};delete next[id];return next});setApprovals(current=>current.filter(approval=>String(approval.params.threadId||"")!==id));if(activeThreadId===id)setActiveThreadId(null)};
  const renameThread=async(id:string)=>{const current=threads.find(thread=>thread.id===id),name=window.prompt("输入对话名称",current?.name||"")?.trim();if(!name)return;try{await clientRef.current?.request("thread/name/set",{threadId:id,name})}catch(error){setConnectionError(String(error instanceof Error?error.message:error));return}setThreads(items=>items.map(thread=>thread.id===id?{...thread,name}:thread))};
  const forkThread=async(id:string)=>{const client=clientRef.current;if(!client)return;try{const response=await client.request<{thread:CodexThread}>("thread/fork",{threadId:id,cwd:projectDirectory||undefined,excludeTurns:false});const stored={id:response.thread.id,name:`${threads.find(thread=>thread.id===id)?.name||"对话"} 分支`,preview:response.thread.preview||"分支对话",updatedAt:Date.now()};setThreads(current=>[stored,...current]);setEntries(current=>({...current,[stored.id]:turnsToEntries(response.thread.turns||[])}));setActiveThreadId(stored.id)}catch(error){setConnectionError(String(error instanceof Error?error.message:error))}};
  const answerApproval=(approval:CodexApproval,accept:boolean)=>{const decision=accept?"accept":"decline";clientRef.current?.respond(approval.requestId,{decision});setApprovals(current=>current.filter(item=>item.requestId!==approval.requestId))};
  const addNote=()=>setNodes(current=>[...current,hydrateNode({id:`note-${Date.now()}`,type:"note",position:{x:100+current.length*28,y:100+current.length*24},data:{title:"文字卡片",text:""},style:{width:260,height:180}})]);
  const addResponse=(entry:ChatEntry)=>setNodes(current=>[...current,hydrateNode({id:`response-${Date.now()}`,type:"response",position:{x:180+current.length*24,y:140+current.length*22},data:{title:"Codex 回复",text:entry.text,threadId:activeThreadId||undefined},style:{width:340,height:220}})]);
  const addImageFile=(file:File,position?:{x:number;y:number})=>{if(!file.type.startsWith("image/"))return;const reader=new FileReader();reader.onload=()=>setNodes(current=>[...current,hydrateNode({id:`image-${Date.now()}`,type:"image",position:position||{x:140+current.length*24,y:120+current.length*22},data:{title:file.name,image:String(reader.result||"")},style:{width:340,height:260}})]);reader.readAsDataURL(file)};
  const pickImage=(event:ChangeEvent<HTMLInputElement>)=>{const file=event.target.files?.[0];if(file)addImageFile(file);event.target.value=""};
  const dropImage=(event:DragEvent<HTMLDivElement>)=>{event.preventDefault();const file=Array.from(event.dataTransfer.files).find(item=>item.type.startsWith("image/"));if(file)addImageFile(file,flow.screenToFlowPosition({x:event.clientX,y:event.clientY}))};
  const onConnect=useCallback((connectionData:Connection)=>setEdges(current=>addEdge({...connectionData,id:`edge-${Date.now()}`},current)),[setEdges]);

  return <main className={`project-workspace ${leftOpen?"left-open":"left-closed"} ${rightOpen?"right-open":"right-closed"}`}>
    <header className="project-workspace-head"><button onClick={close} className="project-back">← 项目列表</button><div><small>{project.id} / PROJECT WORKSPACE</small><h1>{project.title}</h1></div><label className="project-directory"><FolderOpen size={15}/><input value={projectDirectory} onChange={event=>setProjectDirectory(event.target.value)} placeholder="设置本机项目目录，例如 G:\\Git_project\\..."/></label><span className={`codex-connection ${connection}`}><i/>{connection==="online"?"CODEX ONLINE":connection==="connecting"?"CONNECTING":"CODEX OFFLINE"}</span></header>
    <aside className="project-thread-rail"><header><button onClick={()=>setLeftOpen(value=>!value)} title={leftOpen?"收起对话栏":"展开对话栏"}><PanelLeftClose size={17}/></button>{leftOpen&&<><b>项目对话</b><button onClick={createThread} title="新建 Codex 对话"><MessageSquarePlus size={17}/></button></>}</header>{leftOpen&&<div className="project-thread-list">{threads.map(thread=><article key={thread.id} className={thread.id===activeThreadId?"active":""}><button className="thread-main" onClick={()=>openThread(thread.id)}><span><Bot size={14}/></span><b>{thread.name}</b><p>{thread.preview||"等待对话"}</p><time>{new Date(thread.updatedAt).toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})}</time></button><div><button onClick={()=>renameThread(thread.id)} title="重命名对话"><PencilLine size={13}/></button><button onClick={()=>forkThread(thread.id)} title="分叉对话"><GitFork size={13}/></button><button onClick={()=>archiveThread(thread.id)} title="归档对话"><Archive size={13}/></button></div></article>)}{!threads.length&&<div className="thread-empty"><Bot size={24}/><p>设置项目目录后，即可创建多个独立 Codex 对话。</p><button onClick={createThread}><Plus size={14}/>新建对话</button></div>}</div>}</aside>
    <section className="project-canvas"><header><div><button onClick={addNote} title="添加文字卡片"><StickyNote size={16}/>文字</button><button onClick={()=>imagePicker.current?.click()} title="添加图片"><ImagePlus size={16}/>图片</button><input ref={imagePicker} type="file" accept="image/*" hidden onChange={pickImage}/></div><span>CANVAS / {nodes.length} ITEMS · 可直接拖入图片</span><button onClick={()=>setRightOpen(value=>!value)} title={rightOpen?"收起 Codex 面板":"展开 Codex 面板"}><PanelRightClose size={17}/></button></header><div className="project-flow" onDragOver={event=>{event.preventDefault();event.dataTransfer.dropEffect="copy"}} onDrop={dropImage}><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} fitView minZoom={.15} maxZoom={2}><Background variant={BackgroundVariant.Dots} gap={24} size={1}/><MiniMap pannable zoomable/><Controls showInteractive={false}/></ReactFlow></div></section>
    <aside className="project-codex-panel">{rightOpen&&<><header><div><small>ACTIVE THREAD</small><b>{activeThread?.name||"未选择对话"}</b></div>{activeThread&&<button onClick={()=>renameThread(activeThread.id)} title="重命名当前对话"><PencilLine size={16}/></button>}</header>{connectionError&&<div className="codex-error"><b>LOCAL CONNECTION</b><p>{connectionError}</p><div><code>pnpm codex:bridge</code><button onClick={retryCodex}>重新连接</button></div></div>}<div className="project-chat">{activeEntries.map(entry=><article key={entry.id} className={entry.role}><header><span>{entry.role==="user"?"YOU":entry.role==="assistant"?"CODEX":entry.kind||"EVENT"}</span>{entry.role==="assistant"&&<button onClick={()=>addResponse(entry)} title="固定到画布"><Pin size={13}/></button>}</header><p>{entry.text}</p></article>)}{!activeEntries.length&&<div className="project-chat-empty"><Bot size={32}/><b>{activeThread?"开始与 Codex 协作":"选择或创建一个项目对话"}</b><p>对话共享当前项目目录，但每个线程拥有独立上下文。</p></div>}{activeApprovals.map(approval=><article key={String(approval.requestId)} className="approval"><header><span>APPROVAL REQUIRED</span></header><p>{approval.method.includes("fileChange")?"Codex 请求修改项目文件。":"Codex 请求执行本机命令。"}</p><pre>{JSON.stringify(approval.params,null,2)}</pre><footer><button onClick={()=>answerApproval(approval,false)}>拒绝</button><button onClick={()=>answerApproval(approval,true)}>批准</button></footer></article>)}</div><div className="project-composer"><textarea value={draft} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();send()}}} placeholder={activeThread?"向当前 Codex 对话发送任务...":"先创建或选择对话"}/>{activeTurnId?<button className="stop" onClick={stop} title="停止任务"><Square size={17}/></button>:<button onClick={send} title="发送"><Send size={17}/></button>}</div></>}</aside>
  </main>;
}

export default function ProjectWorkspace(props:{project:ProjectWorkspaceProject;close:()=>void}) {
  return <ReactFlowProvider><ProjectWorkspaceInner {...props}/></ReactFlowProvider>;
}
