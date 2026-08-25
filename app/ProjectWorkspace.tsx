"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback,useEffect,useRef,useState,type ChangeEvent,type DragEvent } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  Handle,
  MiniMap,
  NodeResizer,
  Position,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
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
  ArrowDown,
  ArrowUp,
  Bot,
  Brush,
  BringToFront,
  ChevronDown,
  FileCode2,
  FileJson,
  FolderOpen,
  GitFork,
  ImageDown,
  ImagePlus,
  ListFilter,
  LoaderCircle,
  MessageSquarePlus,
  PanelLeftClose,
  PanelRightClose,
  PencilLine,
  Pin,
  Plus,
  Send,
  Settings2,
  SendToBack,
  Square,
  StickyNote,
  Terminal,
  Trash2,
  Undo2,
  Waypoints,
  X,
} from "lucide-react";
import AiSettingsModal from "./AiSettingsModal";
import { loadAiSettings,providerInfo,type AiSettings } from "./ai-provider";
import { type CodexApproval,type CodexClient,type CodexThread } from "./codex-client";
import { codexRuntime,type CodexChatEntry,type CodexActivityStatus } from "./codex-runtime";
import { runAiChat } from "./desktop-ai";
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
  strokes?: Array<{ path: string; color: string }>;
  stroke?: string;
  groupColor?: string;
  update?: (id: string, patch: Partial<CanvasNodeData>) => void;
  remove?: (id: string) => void;
  ungroup?: (id: string) => void;
};

type CanvasNode = Node<CanvasNodeData,"note"|"image"|"response"|"doodle"|"group">;
type AssistantEntry = { id: string; role: "user"; text: string } | { id: string; role: "assistant"; text: string };
type ThreadListResponse = { data: CodexThread[]; nextCursor?: string | null };
type ThreadResponse = { thread: CodexThread; model?: string | null; reasoningEffort?: string | null };

const normalizedDirectory = (value:string) => value.trim().replace(/[\\/]+$/, "").toLocaleLowerCase();
const groupColors = ["#d5a900","#7a8580","#5e6d68"];
const nodeWidth = (node:CanvasNode) => node.measured?.width ?? node.width ?? (typeof node.style?.width === "number" ? node.style.width : 260);
const nodeHeight = (node:CanvasNode) => node.measured?.height ?? node.height ?? (typeof node.style?.height === "number" ? node.style.height : 180);
const absoluteNodePosition = (node:CanvasNode,nodes:CanvasNode[]) => {
  const lookup=new Map(nodes.map(item=>[item.id,item]));
  let current=node,position={...node.position},guard=0;
  while(current.parentId&&guard<20){const parent=lookup.get(current.parentId);if(!parent)break;position={x:position.x+parent.position.x,y:position.y+parent.position.y};current=parent;guard+=1}
  return position;
};
const sortCanvasNodes = (items:CanvasNode[]) => [...items.filter(node=>node.type==="group"),...items.filter(node=>node.type!=="group")];

const safeFilename = (value:string) => Array.from(value.trim().replace(/[<>:"/\\|?*]/g,"-")).filter(character=>character.charCodeAt(0)>=32).join("").replace(/\s+/g," ").slice(0,80)||"canvas";
const downloadFile = (filename:string,content:BlobPart,type:string) => {
  const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),link=document.createElement("a");
  link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),0);
};
const serializableCanvasNodes = (items:CanvasNode[]) => items.map(node=>{
  const {data,...rest}=node;
  const safeData={...data};
  delete safeData.update;delete safeData.remove;delete safeData.ungroup;
  return {...rest,data:safeData};
});
const escapeXml = (value:string) => value.replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[character]||character));
const svgLines = (value:string,max=42) => value.split(/\r?\n/).flatMap(line=>line.match(new RegExp(`.{1,${max}}`,"g"))||[""]).slice(0,8);
const buildCanvasSvg = (project:ProjectWorkspaceProject,nodes:CanvasNode[],edges:Edge[]) => {
  const pad=42,positions=nodes.map(node=>({node,position:absoluteNodePosition(node,nodes),width:nodeWidth(node),height:nodeHeight(node)}));
  const minX=positions.length?Math.min(...positions.map(item=>item.position.x)):0,minY=positions.length?Math.min(...positions.map(item=>item.position.y)):0;
  const maxX=positions.length?Math.max(...positions.map(item=>item.position.x+item.width)):720,maxY=positions.length?Math.max(...positions.map(item=>item.position.y+item.height)):460;
  const width=Math.max(720,maxX-minX+pad*2),height=Math.max(460,maxY-minY+pad*2),offset=(point:{x:number;y:number})=>({x:point.x-minX+pad,y:point.y-minY+pad}),byId=new Map(positions.map(item=>[item.node.id,item]));
  const layer=(node:CanvasNode)=>typeof node.zIndex==="number"?node.zIndex:0;
  const renderNodes=[...positions].sort((a,b)=>{if(a.node.type!==b.node.type){if(a.node.type==="group")return-1;if(b.node.type==="group")return 1}return layer(a.node)-layer(b.node)});
  const edgeMarkup=edges.map(edge=>{const source=byId.get(edge.source),target=byId.get(edge.target);if(!source||!target)return"";const a=offset({x:source.position.x+source.width/2,y:source.position.y+source.height/2}),b=offset({x:target.position.x+target.width/2,y:target.position.y+target.height/2});return`<path d="M ${a.x} ${a.y} L ${b.x} ${b.y}" fill="none" stroke="#8d9690" stroke-width="2" marker-end="url(#arrow)"/>`}).join("");
  const nodeMarkup=renderNodes.map(({node,position,width:nodeW,height:nodeH})=>{const point=offset(position),title=escapeXml(node.data.title||"未命名卡片"),color=node.data.groupColor||"#d5a900",headerHeight=node.type==="group"?38:34;
    if(node.type==="group")return`<g><rect x="${point.x}" y="${point.y}" width="${nodeW}" height="${nodeH}" fill="#e8ebe6" fill-opacity=".84" stroke="${color}" stroke-width="2"/><rect x="${point.x}" y="${point.y}" width="${nodeW}" height="${headerHeight}" fill="#f6f7f3" fill-opacity=".96" stroke="${color}" stroke-width="2"/><text x="${point.x+12}" y="${point.y+24}" fill="#202322" font-family="Arial, sans-serif" font-size="12" font-weight="700">${title}</text><text x="${point.x+12}" y="${point.y+nodeH-14}" fill="#7b827e" font-family="Arial, sans-serif" font-size="9">GROUP FRAME</text></g>`;
    const body=svgLines(node.data.text||"").map((line,index)=>`<text x="${point.x+14}" y="${point.y+headerHeight+24+index*17}" fill="#252826" font-family="Arial, sans-serif" font-size="11">${escapeXml(line)}</text>`).join("");
    const image=node.type==="image"&&node.data.image?`<image href="${escapeXml(node.data.image)}" x="${point.x+2}" y="${point.y+headerHeight+2}" width="${Math.max(0,nodeW-4)}" height="${Math.max(0,nodeH-headerHeight-4)}" preserveAspectRatio="xMidYMid meet"/>`:"";
    const strokes=node.type==="doodle"?(node.data.strokes||[]).map(stroke=>`<path d="${escapeXml(stroke.path)}" transform="translate(${point.x} ${point.y+headerHeight}) scale(${(nodeW/1000).toFixed(4)} ${(Math.max(0,nodeH-headerHeight)/600).toFixed(4)})" fill="none" stroke="${escapeXml(stroke.color)}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`).join(""):"";
    return`<g><rect x="${point.x}" y="${point.y}" width="${nodeW}" height="${nodeH}" fill="#fff" stroke="#202322" stroke-width="1.5"/><rect x="${point.x}" y="${point.y}" width="${nodeW}" height="${headerHeight}" fill="#f0f1ee" stroke="#c8cbc8" stroke-width="1"/><text x="${point.x+10}" y="${point.y+22}" fill="#202322" font-family="Arial, sans-serif" font-size="11" font-weight="700">${title}</text>${image}${node.type!=="image"?body:""}${node.type==="response"?`<text x="${point.x+14}" y="${point.y+headerHeight+17}" fill="#202322" font-family="Arial, sans-serif" font-size="11">AI RESPONSE</text>`:""}${strokes}</g>`;
  }).join("");
  return`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(width)}" height="${Math.ceil(height)}" viewBox="0 0 ${Math.ceil(width)} ${Math.ceil(height)}" role="img" aria-label="${escapeXml(project.title)} 画布导出"><defs><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="#e1e4df" stroke-width="1"/><circle cx="0" cy="0" r="1" fill="#c7ccc7"/></pattern><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#8d9690"/></marker></defs><rect width="100%" height="100%" fill="#fafbf8"/><rect x="0" y="0" width="100%" height="100%" fill="url(#grid)"/><text x="${pad}" y="24" fill="#747977" font-family="Arial, sans-serif" font-size="10" letter-spacing="2">${escapeXml(project.title.toUpperCase())} / CANVAS</text>${edgeMarkup}${nodeMarkup}</svg>`;
};

const activityLabel = (status:CodexActivityStatus,count:number) => status==="running"?`正在执行 ${count} 项操作`:status==="failed"?`${count} 项操作出现失败`:`已完成 ${count} 项操作`;

function ChatActivity({entry,showAll}:{entry:Extract<CodexChatEntry,{role:"activity"}>;showAll:boolean}) {
  return <details className={`chat-activity ${entry.status}`} open={showAll||undefined}>
    <summary><span>{entry.status==="running"?<LoaderCircle className="spin" size={14}/>:entry.operations.some(operation=>operation.type==="files")?<FileCode2 size={14}/>:<Terminal size={14}/>}</span><b>{activityLabel(entry.status,entry.operations.length)}</b><small>{showAll?"已展开":"查看详情"}</small><ChevronDown size={14}/></summary>
    <div>{entry.operations.map(operation=><section key={operation.id} className={operation.status}><header>{operation.type==="command"?<Terminal size={13}/>:<FileCode2 size={13}/>}<b>{operation.type==="command"?"命令":"文件"}</b><span>{operation.status==="running"?"进行中":operation.status==="failed"?"失败":"完成"}</span></header><pre>{operation.detail}{operation.output?`\n\n${operation.output}`:""}</pre></section>)}</div>
  </details>;
}

function EditableTitle({id,data}:{id:string;data:CanvasNodeData}) {
  const[editing,setEditing]=useState(false),[draft,setDraft]=useState(data.title||"");
  const begin=()=>{setDraft(data.title||"");setEditing(true)};
  const commit=()=>{const next=draft.trim();if(next&&next!==data.title)data.update?.(id,{title:next});setEditing(false)};
  return <div className="project-node-title-wrap">
    {editing?<input className="project-node-title-input nodrag" value={draft} onChange={event=>setDraft(event.target.value)} onBlur={commit} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();commit()}if(event.key==="Escape"){event.preventDefault();setEditing(false);setDraft(data.title||"")}}}/>:<span>{data.title||"未命名卡片"}</span>}
    <button className="project-node-rename nodrag" onClick={begin} aria-label="重命名画布卡片" title="重命名"><PencilLine size={12}/></button>
  </div>;
}

function NodeShell({id,selected,data,children}:{id:string;selected:boolean;data:CanvasNodeData;children:React.ReactNode}) {
  return <article className={`project-canvas-node ${selected?"selected":""}`}>
    <NodeResizer isVisible={selected} minWidth={180} minHeight={110}/>
    <header><EditableTitle id={id} data={data}/><button className="nodrag" onClick={()=>data.remove?.(id)} aria-label="删除画布卡片"><X size={14}/></button></header>
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
    <img src={data.image} alt={data.title}/>:<span>IMAGE EMPTY</span>}</div></NodeShell>;
}

function ResponseNode({id,selected,data}:NodeProps<CanvasNode>) {
  return <NodeShell id={id} selected={selected} data={data}><div className="project-response-node"><Bot size={16}/><p>{data.text}</p></div></NodeShell>;
}

function DoodleNode({id,selected,data}:NodeProps<CanvasNode>) {
  const[activePath,setActivePath]=useState("");
  const activePathRef=useRef("");
  const point=(event:React.PointerEvent<SVGSVGElement>)=>{const box=event.currentTarget.getBoundingClientRect();return`${((event.clientX-box.left)/box.width*1000).toFixed(1)} ${((event.clientY-box.top)/box.height*600).toFixed(1)}`};
  const start=(event:React.PointerEvent<SVGSVGElement>)=>{if(event.button!==0)return;event.currentTarget.setPointerCapture(event.pointerId);const path=`M ${point(event)}`;activePathRef.current=path;setActivePath(path)};
  const move=(event:React.PointerEvent<SVGSVGElement>)=>{if(!activePathRef.current||event.buttons!==1)return;const path=`${activePathRef.current} L ${point(event)}`;activePathRef.current=path;setActivePath(path)};
  const finish=()=>{const path=activePathRef.current;if(!path)return;data.update?.(id,{strokes:[...(data.strokes||[]),{path,color:data.stroke||"#171918"}]});activePathRef.current="";setActivePath("")};
  const undo=()=>data.update?.(id,{strokes:(data.strokes||[]).slice(0,-1)});
  return <NodeShell id={id} selected={selected} data={data}><div className="project-doodle-node nodrag nopan">
    <div className="doodle-tools">
      {["#171918","#f2d600"].map(color=><button key={color} className={(data.stroke||"#171918")===color?"active":""} style={{background:color}} onClick={()=>data.update?.(id,{stroke:color})} title={color==="#171918"?"黑色画笔":"黄色画笔"}/>) }
      <button onClick={undo} disabled={!data.strokes?.length} title="撤销一笔"><Undo2 size={13}/></button>
      <button onClick={()=>data.update?.(id,{strokes:[]})} disabled={!data.strokes?.length} title="清空涂鸦"><Trash2 size={13}/></button>
    </div>
    <svg viewBox="0 0 1000 600" preserveAspectRatio="none" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}>
      {(data.strokes||[]).map((stroke,index)=><path key={`${index}-${stroke.path.length}`} d={stroke.path} stroke={stroke.color} />)}
      {activePath&&<path d={activePath} stroke={data.stroke||"#171918"}/>}
    </svg>
  </div></NodeShell>;
}

function GroupNode({id,selected,data}:NodeProps<CanvasNode>) {
  const color=data.groupColor||"#d5a900";
  return <article className={`project-canvas-group ${selected?"selected":""}`} style={{borderColor:color}}>
    <NodeResizer isVisible={selected} minWidth={300} minHeight={150}/>
    <header className="project-group-header" style={{borderBottomColor:color}}>
      <EditableTitle id={id} data={data}/>
      <button className="nodrag" onClick={()=>data.ungroup?.(id)} aria-label="解除编组" title="解除编组"><X size={14}/></button>
    </header>
    <div className="project-group-body"><span>GROUP FRAME</span><small>移动框架可带动内部卡片</small></div>
  </article>;
}

const nodeTypes = { note: NoteNode, image: ImageNode, response: ResponseNode, doodle: DoodleNode, group: GroupNode };

function ProjectTitleEditor({title,rename}:{title:string;rename:(title:string)=>void}) {
  const[editing,setEditing]=useState(false),[draft,setDraft]=useState(title);
  const begin=()=>{setDraft(title);setEditing(true)};
  const commit=()=>{const next=draft.trim();if(next)rename(next);else setDraft(title);setEditing(false)};
  return <div className="project-workspace-title"><small>PROJECT WORKSPACE</small>{editing?<input className="project-title-input" value={draft} onChange={event=>setDraft(event.target.value)} onBlur={commit} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();commit()}if(event.key==="Escape"){event.preventDefault();setDraft(title);setEditing(false)}}}/>:<div className="project-title-display"><h1>{title}</h1><button onClick={begin} title="重命名项目" aria-label="重命名项目"><PencilLine size={14}/></button></div>}</div>;
}

function ProjectWorkspaceInner({project,rename,close}:{project:ProjectWorkspaceProject;rename:(title:string)=>void;close:()=>void}) {
  const saveTimer=useRef<number|null>(null),latestState=useRef<ProjectWorkspaceState|null>(null),imagePicker=useRef<HTMLInputElement>(null),chatImagePicker=useRef<HTMLInputElement>(null),activeThreadIdRef=useRef<string|null>(null),threadSyncRef=useRef(0);
  const[projectDirectory,setProjectDirectory]=useState("");
  const[threads,setThreads]=useState<StoredProjectThread[]>([]),[activeThreadId,setActiveThreadId]=useState<string|null>(null);
  const[draft,setDraft]=useState("");
  const[chatAttachment,setChatAttachment]=useState<{name:string;url:string}|null>(null);
  const[aiSettings,setAiSettings]=useState<AiSettings>(()=>loadAiSettings()),[assistantChats,setAssistantChats]=useState<Record<string,AssistantEntry[]>>({}),[assistantBusy,setAssistantBusy]=useState(false),[settingsOpen,setSettingsOpen]=useState(false);
  const[connectionError,setConnectionError]=useState(""),[leftOpen,setLeftOpen]=useState(true),[rightOpen,setRightOpen]=useState(true),[ready,setReady]=useState(false),[threadsSynced,setThreadsSynced]=useState(false);
  const[runtimeSnapshot,setRuntimeSnapshot]=useState(()=>codexRuntime.getSnapshot());
  const[showAllOperations,setShowAllOperations]=useState(()=>typeof window!=="undefined"&&window.localStorage.getItem("workbench-codex-operations")==="all");
  const[directoryPicking,setDirectoryPicking]=useState(false),[connectMode,setConnectMode]=useState(false),[connectSource,setConnectSource]=useState<string|null>(null);
  const[nodes,setNodes,onNodesChange]=useNodesState<CanvasNode>([]),[edges,setEdges,onEdgesChange]=useEdgesState<Edge>([]);
  const flow=useReactFlow<CanvasNode,Edge>();
  const nodesRef=useRef<CanvasNode[]>([]);
  useEffect(()=>{nodesRef.current=nodes},[nodes]);
  const selectedNodes=nodes.filter(node=>node.selected);
  const selectedGroups=selectedNodes.filter(node=>node.type==="group");
  const groupableSelection=selectedNodes.filter(node=>node.type!=="group"&&!node.parentId);
  const ungroupIds=selectedGroups.length?selectedGroups.map(node=>node.id):Array.from(new Set(selectedNodes.map(node=>node.parentId).filter((id):id is string=>Boolean(id))));

  const removeNode=useCallback((id:string)=>{
    const descendants=new Set([id]);
    let changed=true;
    while(changed){changed=false;for(const node of nodesRef.current)if(node.parentId&&descendants.has(node.parentId)&&!descendants.has(node.id)){descendants.add(node.id);changed=true}}
    setNodes(current=>current.filter(node=>!descendants.has(node.id)));
    setEdges(current=>current.filter(edge=>!descendants.has(edge.source)&&!descendants.has(edge.target)));
  },[setEdges,setNodes]);
  const updateNode=useCallback((id:string,patch:Partial<CanvasNodeData>)=>setNodes(current=>current.map(node=>node.id===id?{...node,data:{...node.data,...patch}}:node)),[setNodes]);
  const ungroupNode=useCallback((groupId:string)=>setNodes(current=>sortCanvasNodes(current.filter(node=>node.id!==groupId).map(node=>{
    if(node.parentId!==groupId)return node;
     return {...node,position:absoluteNodePosition(node,current),parentId:undefined,extent:undefined};
  }))),[setNodes]);
  const hydrateNode=useCallback((node:CanvasNode):CanvasNode=>({...node,data:{...node.data,update:updateNode,remove:removeNode,ungroup:ungroupNode}}),[removeNode,ungroupNode,updateNode]);
  const usingCodex=aiSettings.provider==="codex",selectedProvider=providerInfo(aiSettings.provider);
  const client:CodexClient=codexRuntime.client,connection=runtimeSnapshot.connection;
  const activeThread=threads.find(thread=>thread.id===activeThreadId),activeTurnId=usingCodex&&activeThreadId?runtimeSnapshot.activeTurns[activeThreadId]||null:null;
  const activeEntries:Array<CodexChatEntry|AssistantEntry>=usingCodex?(activeThreadId?runtimeSnapshot.entries[activeThreadId]||[]:[]):assistantChats[aiSettings.provider]||[];
  const activeApprovals=usingCodex&&activeThreadId?runtimeSnapshot.approvals.filter(approval=>String(approval.params.threadId||"")===activeThreadId):[];
  const activeConfiguration=activeThreadId?runtimeSnapshot.configurations[activeThreadId]:undefined;
  const modelSummary=activeConfiguration?.model?[activeConfiguration.model.toUpperCase(),activeConfiguration.reasoningEffort?.toUpperCase()].filter(Boolean).join(" · "):"CODEX LOCAL";
  const visibleConnectionError=connectionError||runtimeSnapshot.error;
  useEffect(()=>{activeThreadIdRef.current=activeThreadId},[activeThreadId]);
  useEffect(()=>codexRuntime.subscribe(()=>setRuntimeSnapshot(codexRuntime.getSnapshot())),[]);
  useEffect(()=>{codexRuntime.ensureConnected().catch(()=>{})},[]);
  useEffect(()=>{if(typeof window!=="undefined")window.localStorage.setItem("workbench-codex-operations",showAllOperations?"all":"compact")},[showAllOperations]);

  const resumeCodexThread=useCallback((threadId:string)=>client.request<ThreadResponse>("thread/resume",{
    threadId,
    cwd:projectDirectory.trim()||undefined,
    approvalPolicy:"on-request",
    sandbox:"workspace-write",
  }),[client,projectDirectory]);

  const syncCodexThreads=useCallback(async()=>{
    const generation=++threadSyncRef.current;
    setThreadsSynced(false);
    const response=await client.request<ThreadListResponse>("thread/list",{limit:100});
    if(generation!==threadSyncRef.current)return;
    const preferredId=activeThreadIdRef.current,targetDirectory=normalizedDirectory(projectDirectory);
    const uniqueThreads=Array.from(new Map((response.data||[]).map(thread=>[thread.id,thread])).values());
    const relevant=uniqueThreads.filter(thread=>thread.id===preferredId||(targetDirectory&&normalizedDirectory(thread.cwd)===targetDirectory));
    const stored=relevant.map((thread,index):StoredProjectThread=>({id:thread.id,name:thread.name||`对话 ${index+1}`,preview:thread.preview||"等待对话",updatedAt:thread.updatedAt||Date.now()})).sort((a,b)=>b.updatedAt-a.updatedAt);
    const selected=(preferredId&&relevant.find(thread=>thread.id===preferredId))||relevant[0]||null;
    setThreads(stored);
    for(const thread of relevant)codexRuntime.registerThread(thread.id,{projectId:project.id,projectTitle:project.title,threadName:thread.name||undefined});
    setActiveThreadId(selected?.id||null);
    if(selected){
      const read=await resumeCodexThread(selected.id);
      if(generation!==threadSyncRef.current)return;
      codexRuntime.hydrateThread(read.thread,{model:read.model,reasoningEffort:read.reasoningEffort,owner:{projectId:project.id,projectTitle:project.title,threadName:selected.name||undefined}});
    }
    setConnectionError("");
    setThreadsSynced(true);
  },[client,project.id,project.title,projectDirectory,resumeCodexThread]);

  useEffect(()=>{let cancelled=false;loadProjectWorkspace(project.id).then(saved=>{if(cancelled)return;if(saved){setProjectDirectory(saved.projectDirectory||"");setThreads(saved.threads||[]);setActiveThreadId(saved.activeThreadId||saved.threads?.[0]?.id||null);setAssistantChats(saved.assistantChats||{});setNodes(sortCanvasNodes((saved.nodes||[]).map(node=>hydrateNode(node as CanvasNode))));setEdges(saved.edges||[])}setReady(true)}).catch(()=>setReady(true));return()=>{cancelled=true}},[hydrateNode,project.id,setEdges,setNodes]);
  useEffect(()=>{if(!ready)return;const state:ProjectWorkspaceState={projectDirectory,threads,activeThreadId,assistantChats,nodes:sortCanvasNodes(nodes.map(node=>({...node,data:{...node.data,update:undefined,remove:undefined,ungroup:undefined}}))),edges};latestState.current=state;if(saveTimer.current)window.clearTimeout(saveTimer.current);saveTimer.current=window.setTimeout(()=>saveProjectWorkspace(project.id,state).catch(()=>{}),300);return()=>{if(saveTimer.current)window.clearTimeout(saveTimer.current)}},[activeThreadId,assistantChats,edges,nodes,project.id,projectDirectory,ready,threads]);
  useEffect(()=>()=>{if(saveTimer.current)window.clearTimeout(saveTimer.current);if(latestState.current)saveProjectWorkspace(project.id,latestState.current).catch(()=>{})},[project.id]);

  useEffect(()=>{const onNotification=(event:Event)=>{const message=(event as CustomEvent<{method:string;params:Record<string,unknown>}>).detail,params=message.params||{},threadId=String(params.threadId||"");if(message.method==="turn/completed"&&threadId)setThreads(current=>current.map(thread=>thread.id===threadId?{...thread,updatedAt:Date.now()}:thread));if(message.method==="thread/name/updated"){const name=String(params.name||"");setThreads(current=>current.map(thread=>thread.id===threadId?{...thread,name}:thread))}};client.addEventListener("notification",onNotification);return()=>client.removeEventListener("notification",onNotification)},[client]);
  useEffect(()=>{if(!ready||connection!=="online")return;Promise.resolve().then(syncCodexThreads).catch(error=>{setThreadsSynced(false);setConnectionError(`线程同步失败：${String(error instanceof Error?error.message:error)}`)})},[connection,ready,syncCodexThreads]);

  const retryCodex=()=>{threadSyncRef.current+=1;setThreadsSynced(false);setConnectionError("");if(connection==="online"){syncCodexThreads().catch(error=>setConnectionError(String(error instanceof Error?error.message:error)));return}codexRuntime.reconnect().catch(error=>setConnectionError(String(error instanceof Error?error.message:error)))};
  const createThreadUnlocked=async()=>{if(!projectDirectory.trim()){setConnectionError("请先设置本机项目目录，再创建 Codex 对话");return null}if(connection!=="online"){setConnectionError("请先启动 Codex 本地服务");return null}try{threadSyncRef.current+=1;const response=await client.request<ThreadResponse>("thread/start",{cwd:projectDirectory.trim(),approvalPolicy:"on-request",sandbox:"workspace-write",developerInstructions:`你正在终端工作台的项目「${project.title}」中协作。保持修改范围与该项目一致。`});const thread=response.thread,name=`对话 ${threads.length+1}`,owner={projectId:project.id,projectTitle:project.title,threadName:name};await client.request("thread/name/set",{threadId:thread.id,name});const stored={id:thread.id,name,preview:"新对话",updatedAt:Date.now()};setThreads(current=>[stored,...current.filter(item=>item.id!==thread.id)]);codexRuntime.hydrateThread(thread,{model:response.model,reasoningEffort:response.reasoningEffort,owner});resumeCodexThread(thread.id).then(read=>codexRuntime.hydrateThread(read.thread,{model:read.model,reasoningEffort:read.reasoningEffort,owner})).catch(()=>undefined);activeThreadIdRef.current=thread.id;setActiveThreadId(thread.id);setThreadsSynced(true);return thread.id}catch(error){setConnectionError(String(error instanceof Error?error.message:error));return null}};
  const createThreadLockRef=useRef<Promise<string|null>|null>(null);
  const createThread=()=>{if(createThreadLockRef.current)return createThreadLockRef.current;const pending=createThreadUnlocked();createThreadLockRef.current=pending;pending.finally(()=>{if(createThreadLockRef.current===pending)createThreadLockRef.current=null});return pending};
  const openThread=async(id:string)=>{setActiveThreadId(id);if(connection!=="online")return;try{const response=await resumeCodexThread(id),thread=threads.find(item=>item.id===id);codexRuntime.hydrateThread(response.thread,{model:response.model,reasoningEffort:response.reasoningEffort,owner:{projectId:project.id,projectTitle:project.title,threadName:thread?.name}});setConnectionError("")}catch(error){setConnectionError(String(error instanceof Error?error.message:error))}};
  useEffect(()=>{if(!ready||connection!=="online"||!threadsSynced||!activeThreadId||runtimeSnapshot.entries[activeThreadId]!==undefined)return;let cancelled=false;resumeCodexThread(activeThreadId).then(response=>{if(!cancelled){const thread=threads.find(item=>item.id===activeThreadId);codexRuntime.hydrateThread(response.thread,{model:response.model,reasoningEffort:response.reasoningEffort,owner:{projectId:project.id,projectTitle:project.title,threadName:thread?.name}})}}).catch(error=>{if(!cancelled)setConnectionError(String(error instanceof Error?error.message:error))});return()=>{cancelled=true}},[activeThreadId,connection,project.id,project.title,ready,resumeCodexThread,runtimeSnapshot.entries,threads,threadsSynced]);
  const sendUnlocked=async()=>{const text=draft.trim(),attachment=chatAttachment;if(!text&&!attachment)return;if(!usingCodex){if(assistantBusy)return;const provider=aiSettings.provider,userEntry:AssistantEntry={id:`user-${Date.now()}`,role:"user",text},history=[...(assistantChats[provider]||[]),userEntry];setDraft("");setAssistantChats(current=>({...current,[provider]:history}));setAssistantBusy(true);setConnectionError("");try{const response=await runAiChat(aiSettings,[{role:"system",content:`你正在终端工作台的项目「${project.title}」中作为文本助手协作。项目目录：${projectDirectory||"未设置"}。除非用户明确提供内容，否则不要声称已经读取或修改本机文件。`},...history.map(entry=>({role:entry.role,content:entry.text}))]);setAssistantChats(current=>({...current,[provider]:[...(current[provider]||history),{id:`assistant-${Date.now()}`,role:"assistant",text:response.content}]}))}catch(error){setConnectionError(String(error instanceof Error?error.message:error))}finally{setAssistantBusy(false)}return}if(connection!=="online"||!threadsSynced)return;const threadId=activeThread?.id||await createThread();if(!threadId)return;setDraft("");setChatAttachment(null);const userEntry:Extract<CodexChatEntry,{role:"user"}>={id:`user-${Date.now()}`,role:"user",text,imageUrl:attachment?.url,imageName:attachment?.name};codexRuntime.addUserMessage(threadId,userEntry);const preview=text||`图片：${attachment?.name||"未命名图片"}`;setThreads(current=>current.map(thread=>thread.id===threadId?{...thread,preview,updatedAt:Date.now()}:thread));try{const input=[...(text?[{type:"text",text,text_elements:[]}]:[]),...(attachment?[{type:"image",url:attachment.url}]:[])];const response=await client.request<{turn:{id:string}}>("turn/start",{threadId,input,cwd:projectDirectory||undefined});codexRuntime.markTurnStarted(threadId,response.turn.id)}catch(error){setConnectionError(String(error instanceof Error?error.message:error))}};
  const sendLockRef=useRef(false);
  const send=async()=>{if(sendLockRef.current||activeTurnId)return;sendLockRef.current=true;try{await sendUnlocked()}finally{sendLockRef.current=false}};
  const stop=()=>{if(activeThreadId&&activeTurnId)codexRuntime.interrupt(activeThreadId).catch(()=>{})};
  const archiveThread=async(id:string)=>{try{await client.request("thread/archive",{threadId:id})}catch(error){setConnectionError(String(error instanceof Error?error.message:error));return}setThreads(current=>current.filter(thread=>thread.id!==id));codexRuntime.removeThread(id);if(activeThreadId===id)setActiveThreadId(null)};
  const renameThread=async(id:string)=>{const current=threads.find(thread=>thread.id===id),name=window.prompt("输入对话名称",current?.name||"")?.trim();if(!name)return;try{await client.request("thread/name/set",{threadId:id,name})}catch(error){setConnectionError(String(error instanceof Error?error.message:error));return}setThreads(items=>items.map(thread=>thread.id===id?{...thread,name}:thread));codexRuntime.updateThreadName(id,name)};
  const forkThread=async(id:string)=>{try{const response=await client.request<ThreadResponse>("thread/fork",{threadId:id,cwd:projectDirectory||undefined,excludeTurns:false});const stored={id:response.thread.id,name:`${threads.find(thread=>thread.id===id)?.name||"对话"} 分支`,preview:response.thread.preview||"分支对话",updatedAt:Date.now()},owner={projectId:project.id,projectTitle:project.title,threadName:stored.name};setThreads(current=>[stored,...current]);codexRuntime.hydrateThread(response.thread,{model:response.model,reasoningEffort:response.reasoningEffort,owner});resumeCodexThread(stored.id).then(read=>codexRuntime.hydrateThread(read.thread,{model:read.model,reasoningEffort:read.reasoningEffort,owner})).catch(()=>undefined);setActiveThreadId(stored.id)}catch(error){setConnectionError(String(error instanceof Error?error.message:error))}};
  const answerApproval=(approval:CodexApproval,accept:boolean)=>codexRuntime.answerApproval(approval,accept);
  const pickProjectDirectory=async()=>{if(!("__TAURI_INTERNALS__" in window)){setConnectionError("浏览器预览不能选择本机目录，请使用 Windows 桌面版");return}setDirectoryPicking(true);try{const{invoke}=await import("@tauri-apps/api/core"),path=await invoke<string|null>("pick_project_directory");if(path){setProjectDirectory(path);setConnectionError("")}}catch(error){setConnectionError(`目录选择失败：${String(error)}`)}finally{setDirectoryPicking(false)}};
  const addNote=()=>setNodes(current=>[...current,hydrateNode({id:`note-${Date.now()}`,type:"note",position:{x:100+current.length*28,y:100+current.length*24},data:{title:"文字卡片",text:""},style:{width:260,height:180}})]);
  const addDoodle=()=>setNodes(current=>[...current,hydrateNode({id:`doodle-${Date.now()}`,type:"doodle",position:{x:420+current.length*18,y:150+current.length*18},data:{title:"自由涂鸦",strokes:[],stroke:"#171918"},style:{width:380,height:270},dragHandle:".project-canvas-node > header"})]);
  const addResponse=(entry:{id:string;role:"assistant";text:string})=>setNodes(current=>[...current,hydrateNode({id:`response-${Date.now()}`,type:"response",position:{x:180+current.length*24,y:140+current.length*22},data:{title:`${selectedProvider.label} 回复`,text:entry.text,threadId:usingCodex?activeThreadId||undefined:undefined},style:{width:340,height:220}})]);
  const addImageFile=(file:File,position?:{x:number;y:number})=>{if(!file.type.startsWith("image/"))return;const reader=new FileReader();reader.onload=()=>setNodes(current=>[...current,hydrateNode({id:`image-${Date.now()}`,type:"image",position:position||{x:140+current.length*24,y:120+current.length*22},data:{title:file.name,image:String(reader.result||"")},style:{width:340,height:260}})]);reader.readAsDataURL(file)};
  const pickImage=(event:ChangeEvent<HTMLInputElement>)=>{const file=event.target.files?.[0];if(file)addImageFile(file);event.target.value=""};
  const dropImage=(event:DragEvent<HTMLDivElement>)=>{event.preventDefault();const file=Array.from(event.dataTransfer.files).find(item=>item.type.startsWith("image/"));if(file)addImageFile(file,flow.screenToFlowPosition({x:event.clientX,y:event.clientY}))};
  const addChatImageFile=(file:File)=>{if(!file.type.startsWith("image/")){setConnectionError("只能附加图片文件");return}if(file.size>10*1024*1024){setConnectionError("图片不能超过 10 MB");return}const reader=new FileReader();reader.onload=()=>{setChatAttachment({name:file.name,url:String(reader.result||"")});setConnectionError("")};reader.onerror=()=>setConnectionError("图片读取失败，请重新选择");reader.readAsDataURL(file)};
  const pickChatImage=(event:ChangeEvent<HTMLInputElement>)=>{const file=event.target.files?.[0];if(file)addChatImageFile(file);event.target.value=""};
  const dropChatImage=(event:DragEvent<HTMLDivElement>)=>{event.preventDefault();if(!usingCodex)return;const file=Array.from(event.dataTransfer.files).find(item=>item.type.startsWith("image/"));if(file)addChatImageFile(file)};
  const onConnect=useCallback((connectionData:Connection)=>setEdges(current=>addEdge({...connectionData,id:`edge-${Date.now()}`,type:"smoothstep"},current)),[setEdges]);
  const connectNode=useCallback((_event:React.MouseEvent,node:CanvasNode)=>{if(!connectMode)return;if(!connectSource){setConnectSource(node.id);return}if(connectSource===node.id){setConnectSource(null);return}setEdges(current=>addEdge({id:`edge-${Date.now()}`,source:connectSource,target:node.id,type:"smoothstep"},current));setConnectSource(null)},[connectMode,connectSource,setEdges]);
  const toggleConnectMode=()=>{setConnectMode(value=>!value);setConnectSource(null)};
  const renameSelected=()=>{const node=selectedNodes[0];if(!node)return;const next=window.prompt("重命名画布卡片",node.data.title||"")?.trim();if(next)updateNode(node.id,{title:next})};
  const clearSelection=()=>setNodes(current=>current.map(node=>node.selected?{...node,selected:false}:node));
  const deleteSelection=()=>{
    const ids=new Set(selectedNodes.map(node=>node.id));
    let changed=true;
    while(changed){changed=false;for(const node of nodesRef.current)if(node.parentId&&ids.has(node.parentId)&&!ids.has(node.id)){ids.add(node.id);changed=true}}
    setNodes(current=>current.filter(node=>!ids.has(node.id)));
    setEdges(current=>current.filter(edge=>!ids.has(edge.source)&&!ids.has(edge.target)));
  };
  const createGroup=()=>{
    if(groupableSelection.length<2)return;
    const positions=groupableSelection.map(node=>({node,position:absoluteNodePosition(node,nodes)}));
    const left=Math.min(...positions.map(item=>item.position.x)),top=Math.min(...positions.map(item=>item.position.y)),right=Math.max(...positions.map(item=>item.position.x+nodeWidth(item.node))),bottom=Math.max(...positions.map(item=>item.position.y+nodeHeight(item.node)));
    const fallback={x:left,y:top,width:right-left,height:bottom-top},measured=flow.getNodesBounds(groupableSelection),bounds=measured.width>0&&measured.height>0?measured:fallback;
    const groupX=bounds.x-28,groupY=bounds.y-54,groupId=`group-${nodes.length+1}-${groupableSelection.map(node=>node.id).join("-")}`,groupWidth=Math.max(320,bounds.width+56),groupHeight=Math.max(164,bounds.height+78),selectedIds=new Set(groupableSelection.map(node=>node.id));
    const group=hydrateNode({id:groupId,type:"group",position:{x:groupX,y:groupY},data:{title:"新编组",groupColor:groupColors[0]},style:{width:groupWidth,height:groupHeight},draggable:true,selectable:true,connectable:false,deletable:true,dragHandle:".project-group-header",zIndex:0});
    setNodes(current=>sortCanvasNodes([group,...current.map(node=>selectedIds.has(node.id)?{...node,parentId:groupId,extent:"parent" as const,position:{x:absoluteNodePosition(node,nodes).x-groupX,y:absoluteNodePosition(node,nodes).y-groupY},zIndex:1}:node)]));
  };
  const ungroupSelection=()=>{
    if(!ungroupIds.length)return;
    const targets=new Set(ungroupIds);
    setNodes(current=>sortCanvasNodes(current.filter(node=>!targets.has(node.id)).map(node=>{
      if(!node.parentId||!targets.has(node.parentId))return node;
       return {...node,position:absoluteNodePosition(node,current),parentId:undefined,extent:undefined};
    })));
  };
  const setSelectedGroupColor=(color:string)=>selectedGroups.forEach(node=>updateNode(node.id,{groupColor:color}));
  type LayerAction="front"|"up"|"down"|"back";
  const changeLayer=(action:LayerAction)=>{
    const selectedIds=new Set(selectedNodes.map(node=>node.id));
    if(!selectedIds.size)return;
    setNodes(current=>{
      const groups=new Map<string,CanvasNode[]>();
      current.forEach(node=>{const key=node.parentId||"__root__";groups.set(key,[...(groups.get(key)||[]),node])});
      const replacements=new Map<string,CanvasNode>();
      for(const siblings of groups.values()){
        if(!siblings.some(node=>selectedIds.has(node.id)))continue;
        const ordered=siblings.map((node,index)=>({node,index})).sort((left,right)=>{const zLeft=typeof left.node.zIndex==="number"?left.node.zIndex:0,zRight=typeof right.node.zIndex==="number"?right.node.zIndex:0;return zLeft-zRight||left.index-right.index}).map(item=>item.node);
        if(action==="front"){const chosen=ordered.filter(node=>selectedIds.has(node.id));ordered.splice(0,ordered.length,...ordered.filter(node=>!selectedIds.has(node.id)),...chosen)}
        if(action==="back"){const chosen=ordered.filter(node=>selectedIds.has(node.id));ordered.splice(0,ordered.length,...chosen,...ordered.filter(node=>!selectedIds.has(node.id)))}
        if(action==="up")for(let index=ordered.length-2;index>=0;index--)if(selectedIds.has(ordered[index].id)&&!selectedIds.has(ordered[index+1].id))[ordered[index],ordered[index+1]]=[ordered[index+1],ordered[index]];
        if(action==="down")for(let index=1;index<ordered.length;index++)if(selectedIds.has(ordered[index].id)&&!selectedIds.has(ordered[index-1].id))[ordered[index],ordered[index-1]]=[ordered[index-1],ordered[index]];
        const start=siblings[0]?.parentId?1:0;ordered.forEach((node,index)=>replacements.set(node.id,{...node,zIndex:start+index}));
      }
      return current.map(node=>replacements.get(node.id)||node);
    });
  };
  const exportCanvasJson=()=>{
    const payload={format:"terminal-workbench-canvas",version:1,projectId:project.id,projectTitle:project.title,exportedAt:new Date().toISOString(),nodes:serializableCanvasNodes(nodes),edges};
    downloadFile(`${safeFilename(project.title)}-canvas.json`,JSON.stringify(payload,null,2),"application/json;charset=utf-8");
  };
  const exportCanvasSvg=()=>downloadFile(`${safeFilename(project.title)}-canvas.svg`,buildCanvasSvg(project,nodes,edges),"image/svg+xml;charset=utf-8");

  return <main className={`project-workspace ${leftOpen?"left-open":"left-closed"} ${rightOpen?"right-open":"right-closed"}`}>
    <header className="project-workspace-head"><button onClick={close} className="project-back">← 项目列表</button><ProjectTitleEditor title={project.title} rename={rename}/><div className="project-directory"><FolderOpen size={15}/><input value={projectDirectory} onChange={event=>setProjectDirectory(event.target.value)} placeholder="设置本机项目目录，例如 G:\\Git_project\\..."/><button onClick={pickProjectDirectory} disabled={directoryPicking} title="选择本机项目目录"><FolderOpen size={16}/></button></div><div className="project-ai-status">{usingCodex&&activeThread&&<span className="codex-model-chip">{modelSummary}</span>}<span className={`codex-connection ${connection}`}><i/>{connection==="online"?"CODEX ONLINE":connection==="connecting"?"CONNECTING":"CODEX OFFLINE"}</span><button onClick={()=>setSettingsOpen(true)} title="AI 服务设置"><Settings2 size={16}/></button></div></header>
    <aside className="project-thread-rail"><header><button onClick={()=>setLeftOpen(value=>!value)} title={leftOpen?"收起对话栏":"展开对话栏"}><PanelLeftClose size={17}/></button>{leftOpen&&<><b>项目对话</b><button onClick={createThread} title="新建 Codex 对话"><MessageSquarePlus size={17}/></button></>}</header>{leftOpen&&<div className="project-thread-list">{threads.map(thread=><article key={thread.id} className={thread.id===activeThreadId?"active":""}><button className="thread-main" onClick={()=>openThread(thread.id)}><span><Bot size={14}/></span><b>{thread.name}</b><p>{thread.preview||"等待对话"}</p><time>{new Date(thread.updatedAt).toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})}</time></button><div><button onClick={()=>renameThread(thread.id)} title="重命名对话"><PencilLine size={13}/></button><button onClick={()=>forkThread(thread.id)} title="分叉对话"><GitFork size={13}/></button><button onClick={()=>archiveThread(thread.id)} title="归档对话"><Archive size={13}/></button></div></article>)}{!threads.length&&<div className="thread-empty"><Bot size={24}/><p>设置项目目录后，即可创建多个独立 Codex 对话。</p><button onClick={createThread}><Plus size={14}/>新建对话</button></div>}</div>}</aside>
    <section className="project-canvas"><header><div><button onClick={addNote} title="添加文字卡片"><StickyNote size={16}/>文字</button><button onClick={()=>imagePicker.current?.click()} title="添加图片"><ImagePlus size={16}/>图片</button><button onClick={addDoodle} title="添加自由涂鸦"><Brush size={16}/>涂鸦</button><button className={connectMode?"active":""} onClick={toggleConnectMode} title={connectMode?"退出连线模式":"进入连线模式；依次点击两个卡片"}><Waypoints size={16}/>连线</button><div className="project-canvas-export" aria-label="导出画布"><button onClick={exportCanvasJson} title="导出可恢复的 JSON 数据"><FileJson size={15}/>JSON</button><button onClick={exportCanvasSvg} title="导出画布 SVG 结构快照"><ImageDown size={15}/>SVG</button></div><input ref={imagePicker} type="file" accept="image/*" hidden onChange={pickImage}/></div><span>{connectMode?(connectSource?"LINE / 选择终点":"LINE / 选择起点"):`CANVAS / ${nodes.length} ITEMS · 可直接拖入图片`}</span><button onClick={()=>setRightOpen(value=>!value)} title={rightOpen?"收起 AI 面板":"展开 AI 面板"}><PanelRightClose size={17}/></button></header>{selectedNodes.length>0&&<div className="project-selection-toolbar nodrag nopan"><b>已选 {selectedNodes.length} 项</b>{selectedNodes.length===1&&<button onClick={renameSelected} title="重命名"><PencilLine size={13}/>重命名</button>}{groupableSelection.length>=2&&<button onClick={createGroup} title="将选中的卡片编组"><GitFork size={13}/>编组</button>}{ungroupIds.length>0&&<button onClick={ungroupSelection} title="解除编组"><Waypoints size={13}/>解除编组</button>}{<div className="project-layer-controls" aria-label="图层顺序"><button onClick={()=>changeLayer("front")} title="置顶"><BringToFront size={13}/>置顶</button><button onClick={()=>changeLayer("up")} title="上移一层"><ArrowUp size={13}/>上移</button><button onClick={()=>changeLayer("down")} title="下移一层"><ArrowDown size={13}/>下移</button><button onClick={()=>changeLayer("back")} title="置底"><SendToBack size={13}/>置底</button></div>}{selectedGroups.length>0&&<div className="project-group-colors" aria-label="编组颜色">{groupColors.map(color=><button key={color} className="project-group-color" style={{background:color}} onClick={()=>setSelectedGroupColor(color)} aria-label={`设置编组颜色 ${color}`} />)}</div>}<button onClick={deleteSelection} title="删除选中项"><Trash2 size={13}/>删除</button><button onClick={clearSelection} title="清除选择"><X size={13}/></button></div>}<div className={`project-flow ${connectMode?"connecting":""}`} onDragOver={event=>{event.preventDefault();event.dataTransfer.dropEffect="copy"}} onDrop={dropImage}><ReactFlow nodes={nodes.map(node=>connectSource===node.id?{...node,className:"connect-source"}:node)} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={connectNode} onPaneClick={()=>setConnectSource(null)} selectionOnDrag selectionKeyCode={["Shift","Meta"]} multiSelectionKeyCode={["Control","Shift","Meta"]} selectionMode={SelectionMode.Partial} panOnDrag={[1,2]} connectionMode={ConnectionMode.Loose} defaultEdgeOptions={{type:"smoothstep",style:{stroke:"#171918",strokeWidth:2}}} connectionLineStyle={{stroke:"#f2d600",strokeWidth:2}} snapToGrid snapGrid={[12,12]} fitView minZoom={.15} maxZoom={2}><Background variant={BackgroundVariant.Dots} gap={24} size={1}/><MiniMap pannable zoomable/><Controls showInteractive={false}/></ReactFlow></div></section>
    <aside className="project-codex-panel">{rightOpen&&<>
      <header><div><small>{usingCodex?modelSummary:"TEXT ASSISTANT"}</small><b>{usingCodex?activeThread?.name||"未选择对话":`${selectedProvider.label} / ${aiSettings.model}`}</b></div>{usingCodex&&<button className="operation-visibility" onClick={()=>setShowAllOperations(value=>!value)} title={showAllOperations?"精简操作记录":"显示全部操作"}><ListFilter size={14}/><span>{showAllOperations?"精简":"显示全部操作"}</span></button>}{usingCodex&&activeThread&&<button onClick={()=>renameThread(activeThread.id)} title="重命名当前对话"><PencilLine size={16}/></button>}<button onClick={()=>setSettingsOpen(true)} title="AI 服务设置"><Settings2 size={16}/></button></header>
      {visibleConnectionError&&<div className="codex-error"><b>{usingCodex?"CODEX CONNECTION":`${selectedProvider.label.toUpperCase()} CONNECTION`}</b><p>{visibleConnectionError}</p><div>{usingCodex?<><code>内置进程 / 网页桥接</code><button onClick={retryCodex}>重新连接</button></>:<button onClick={()=>setSettingsOpen(true)}>检查设置</button>}</div></div>}
      <div className="project-chat">{activeEntries.map(entry=>entry.role==="activity"?<ChatActivity key={`${entry.id}-${entry.status}`} entry={entry} showAll={showAllOperations}/>:<article key={entry.id} className={entry.role}><header>{entry.role==="user"&&<span>你</span>}{entry.role==="assistant"&&<button onClick={()=>addResponse(entry)} title="固定到画布"><Pin size={13}/></button>}</header>{entry.text&&<p>{entry.text}</p>}{entry.role==="user"&&"imageUrl" in entry&&entry.imageUrl&&<figure className="chat-image"><img src={entry.imageUrl} alt={entry.imageName||"对话图片"}/></figure>}</article>)}{!activeEntries.length&&<div className="project-chat-empty"><Bot size={32}/><b>{usingCodex?(activeThread?"开始与 Codex 协作":"选择或创建一个项目对话"):`开始与 ${selectedProvider.label} 对话`}</b><p>{usingCodex?"对话共享当前项目目录，但每个线程拥有独立上下文。":"文本助手不会直接读取、修改本机项目文件。"}</p></div>}{activeApprovals.map(approval=><article key={String(approval.requestId)} className="approval"><header><span>APPROVAL REQUIRED</span></header><p>{approval.method.includes("fileChange")?"Codex 请求修改项目文件。":"Codex 请求执行本机命令。"}</p><pre>{JSON.stringify(approval.params,null,2)}</pre><footer><button onClick={()=>answerApproval(approval,false)}>拒绝</button><button onClick={()=>answerApproval(approval,true)}>批准</button></footer></article>)}</div>
      <div className="project-composer" onDragOver={event=>{if(usingCodex){event.preventDefault();event.dataTransfer.dropEffect="copy"}}} onDrop={usingCodex?dropChatImage:undefined}>
        {chatAttachment&&<div className="chat-attachment"><img src={chatAttachment.url} alt={chatAttachment.name}/><span>{chatAttachment.name}</span><button onClick={()=>setChatAttachment(null)} title="移除图片"><X size={14}/></button></div>}
        <input ref={chatImagePicker} type="file" accept="image/*" hidden onChange={pickChatImage}/>
        <div className="project-composer-main"><textarea value={draft} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();send()}}} placeholder={usingCodex?(activeThread?"向当前 Codex 对话发送任务...":"先创建或选择对话"):`向 ${selectedProvider.label} 发送消息...`}/>{usingCodex&&<button className="chat-image-trigger" onClick={()=>chatImagePicker.current?.click()} disabled={Boolean(activeTurnId)} title="附加图片"><ImagePlus size={17}/></button>}</div>
        {activeTurnId?<button className="stop" onClick={stop} title="停止任务"><Square size={17}/></button>:assistantBusy?<button disabled title="等待回复"><LoaderCircle className="spin" size={17}/></button>:<button onClick={send} disabled={usingCodex?!draft.trim()&&!chatAttachment:!draft.trim()} title="发送"><Send size={17}/></button>}
      </div>
    </>}</aside>
    {settingsOpen&&<AiSettingsModal client={client} connected={connection==="online"} settings={aiSettings} close={()=>setSettingsOpen(false)} onSave={settings=>{setAiSettings(settings);setConnectionError("")}}/>}
  </main>;
}

export default function ProjectWorkspace(props:{project:ProjectWorkspaceProject;rename:(title:string)=>void;close:()=>void}) {
  return <ReactFlowProvider><ProjectWorkspaceInner {...props}/></ReactFlowProvider>;
}
