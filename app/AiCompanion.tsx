"use client";

import { useCallback,useEffect,useMemo,useRef,useState,type FormEvent } from "react";
import { Activity,CheckCircle2,ChevronRight,LoaderCircle,MessageSquare,Settings2,ShieldAlert,Square,Utensils,X } from "lucide-react";
import AiSettingsModal from "./AiSettingsModal";
import { loadAiSettings,providerInfo,type AiSettings } from "./ai-provider";
import type { CodexThread } from "./codex-client";
import { codexRuntime,type CodexChatEntry,type CodexRuntimeSnapshot } from "./codex-runtime";
import { runAiChat } from "./desktop-ai";
import { loadProjectWorkspace,saveProjectWorkspace } from "./project-storage";
import QixunDormAvatar,{type QixunDormAvatarHandle} from "./QixunDormAvatar";
import { dispatchPetAction,loadSharedPetState,PET_STATE_EVENT,PET_STATE_KEY,updateSharedPetState,type SharedPetState } from "./pet-state";

type CompanionMode="task"|"chat"|"pet";
type CompanionProject={id:string;title:string;tags:string[]};
type CompanionPlan={id:string;date:string;title:string;done:boolean};
type CompanionMessage={id:string;role:"user"|"assistant";text:string;createdAt:number};
type Persona={name:string;identity:string;tone:string};
type CompanionState={mode:CompanionMode;selectedProjectId:string;lastTaskThreadId:string|null;chatThreadId:string|null;chatMessages:CompanionMessage[];persona:Persona};
type ThreadResponse={thread:CodexThread;model?:string|null;reasoningEffort?:string|null};

const STORAGE_KEY="workbench-ai-companion-v1";
const genericTaskPrompts=["把我接下来的想法整理成行动清单","比较两个方案的取舍并给出建议","帮我安排今天剩余时间的优先顺序"];
const projectTaskPrompts=["先检查项目现状并列出下一步计划","检查有没有明显 Bug，先报告问题不要改动","整理当前项目的待办与风险"];
const chatStarters=["陪我梳理一下今天的状态","我有个想法，想听听你的判断","随便聊聊，帮我换换脑子"];
const todayKey=()=>{const date=new Date();return`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`};
const defaultState:CompanionState={mode:"task",selectedProjectId:"",lastTaskThreadId:null,chatThreadId:null,chatMessages:[],persona:{name:"洛栖",identity:"驻留在个人工作台中的工程伴生智能，冷静、可靠，也保留一点好奇心。",tone:"简洁直接；闲聊时自然，不假装已经读取未授权的数据。"}};
const isObject=(value:unknown):value is Record<string,unknown>=>Boolean(value&&typeof value==="object"&&!Array.isArray(value));

function loadCompanionState():CompanionState{
 if(typeof window==="undefined")return defaultState;
 try{
  const value:unknown=JSON.parse(window.localStorage.getItem(STORAGE_KEY)||"null");
  if(!isObject(value))return defaultState;
  const persona=isObject(value.persona)?value.persona:{},messages=Array.isArray(value.chatMessages)?value.chatMessages:[];
  return{
   mode:value.mode==="chat"||value.mode==="pet"?value.mode:"task",
   selectedProjectId:typeof value.selectedProjectId==="string"?value.selectedProjectId:"",
   lastTaskThreadId:typeof value.lastTaskThreadId==="string"?value.lastTaskThreadId:null,
   chatThreadId:typeof value.chatThreadId==="string"?value.chatThreadId:null,
   chatMessages:messages.filter((item):item is Record<string,unknown>=>isObject(item)&&(item.role==="user"||item.role==="assistant")&&typeof item.text==="string").slice(-40).map((item,index)=>({id:typeof item.id==="string"?item.id:`message-${index}`,role:item.role as "user"|"assistant",text:String(item.text),createdAt:Number(item.createdAt)||Date.now()})),
   persona:{name:typeof persona.name==="string"&&persona.name.trim()?persona.name.trim():defaultState.persona.name,identity:typeof persona.identity==="string"?persona.identity:defaultState.persona.identity,tone:typeof persona.tone==="string"?persona.tone:defaultState.persona.tone}
  };
 }catch{return defaultState}
}

const personaInstruction=(persona:Persona)=>`你是「${persona.name}」。${persona.identity}\n表达要求：${persona.tone}\n人格聊天与项目任务完全隔离。不要声称读取了工作台、项目文件或隐私数据；除非用户在当前对话中明确提供。`;

export default function AiCompanion({projects,plans,plansLoaded,snapshot,openProject,openDorm}:{projects:CompanionProject[];plans:CompanionPlan[];plansLoaded:boolean;snapshot:CodexRuntimeSnapshot;openProject:(projectId:string)=>void;openDorm:()=>void}){
 const[state,setState]=useState<CompanionState>(loadCompanionState),[pet,setPet]=useState<SharedPetState>(loadSharedPetState),[open,setOpen]=useState(false),[taskDraft,setTaskDraft]=useState(""),[chatDraft,setChatDraft]=useState(""),[taskBusy,setTaskBusy]=useState(false),[assistantBusy,setAssistantBusy]=useState(false),[status,setStatus]=useState(""),[petNotice,setPetNotice]=useState("栖巡-07 正与宿舍同步"),[petPreviewState,setPetPreviewState]=useState<"loading"|"ready"|"error">("loading"),[editingPersona,setEditingPersona]=useState(false),[personaDraft,setPersonaDraft]=useState<Persona>(()=>loadCompanionState().persona),[settingsOpen,setSettingsOpen]=useState(false),[aiSettings,setAiSettings]=useState<AiSettings>(()=>loadAiSettings());
 const taskInput=useRef<HTMLTextAreaElement>(null),chatInput=useRef<HTMLTextAreaElement>(null),chatLog=useRef<HTMLDivElement>(null),resumeAttempts=useRef(new Set<string>()),petAvatar=useRef<QixunDormAvatarHandle>(null);
 const selectedProject=projects.find(project=>project.id===state.selectedProjectId);
 const taskItems=useMemo(()=>[...snapshot.tasks].sort((left,right)=>right.updatedAt-left.updatedAt).slice(0,4),[snapshot.tasks]);
 const currentTask=state.lastTaskThreadId?snapshot.tasks.find(task=>task.threadId===state.lastTaskThreadId):undefined,currentTaskEntries=state.lastTaskThreadId?snapshot.entries[state.lastTaskThreadId]||[]:[],currentTaskAnswer=[...currentTaskEntries].reverse().find((entry):entry is Extract<CodexChatEntry,{role:"assistant"}>=>entry.role==="assistant"),currentTaskTurn=state.lastTaskThreadId?snapshot.activeTurns[state.lastTaskThreadId]:undefined;
 const codexChatEntries=state.chatThreadId?(snapshot.entries[state.chatThreadId]||[]).filter((entry):entry is Exclude<CodexChatEntry,{role:"activity"}>=>entry.role!=="activity"):[];
 const chatEntries=aiSettings.provider==="codex"?codexChatEntries:state.chatMessages;
 const chatTurnId=state.chatThreadId?snapshot.activeTurns[state.chatThreadId]:undefined;
 const provider=providerInfo(aiSettings.provider),providerLabel=aiSettings.provider==="codex"?"Codex · 独立只读":provider.label,level=Math.floor(pet.xp/60)+1,levelProgress=pet.xp%60,today=todayKey(),todayDone=plans.filter(plan=>plan.date===today&&plan.done).length;
 const petLoadStateChanged=useCallback((next:"loading"|"ready"|"error",message?:string)=>{setPetPreviewState(next);if(next==="ready")setPetNotice("栖巡-07 已与宿舍同步");else if(next==="error"&&message)setPetNotice(message)},[]);
 const ignorePetManifest=useCallback(()=>{},[]),ignorePetAnimation=useCallback(()=>{},[]),ignorePetPosition=useCallback(()=>{},[]);

 useEffect(()=>{window.localStorage.setItem(STORAGE_KEY,JSON.stringify(state))},[state]);
 useEffect(()=>{const sync=(event:Event)=>setPet((event as CustomEvent<SharedPetState>).detail||loadSharedPetState()),storage=(event:StorageEvent)=>{if(event.key===PET_STATE_KEY)setPet(loadSharedPetState())};window.addEventListener(PET_STATE_EVENT,sync);window.addEventListener("storage",storage);return()=>{window.removeEventListener(PET_STATE_EVENT,sync);window.removeEventListener("storage",storage)}},[]);
 useEffect(()=>{if(!plansLoaded)return;const rewarded=new Set(pet.rewardedPlanIds),earned=plans.filter(plan=>plan.date===today&&plan.done&&!rewarded.has(plan.id));if(!earned.length)return;const frame=window.requestAnimationFrame(()=>{const earnedIds=earned.map(plan=>plan.id);updateSharedPetState(current=>{const unseen=earnedIds.filter(id=>!current.rewardedPlanIds.includes(id));return unseen.length?{...current,food:current.food+unseen.length,rewardedPlanIds:[...current.rewardedPlanIds,...unseen]}:current});setPetNotice(`今日任务完成奖励 +${earned.length} 份补给`)});return()=>window.cancelAnimationFrame(frame)},[plans,plansLoaded,pet.rewardedPlanIds,today]);
 useEffect(()=>{if(!open)return;const close=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!settingsOpen)setOpen(false)};window.addEventListener("keydown",close);return()=>window.removeEventListener("keydown",close)},[open,settingsOpen]);
 useEffect(()=>{if(!open)return;window.setTimeout(()=>{if(state.mode==="task")taskInput.current?.focus();if(state.mode==="chat")chatInput.current?.focus()},80)},[open,state.mode]);
 useEffect(()=>{if(!open||state.mode!=="chat"||!chatLog.current)return;chatLog.current.scrollTop=chatLog.current.scrollHeight},[chatEntries.length,open,state.mode]);
 useEffect(()=>{const threadId=state.chatThreadId;if(!open||state.mode!=="chat"||aiSettings.provider!=="codex"||!threadId||snapshot.entries[threadId]!==undefined||resumeAttempts.current.has(threadId))return;resumeAttempts.current.add(threadId);codexRuntime.ensureConnected().then(()=>codexRuntime.client.request<ThreadResponse>("thread/resume",{threadId,approvalPolicy:"never",sandbox:"read-only"})).then(response=>codexRuntime.hydrateThread(response.thread,{model:response.model,reasoningEffort:response.reasoningEffort,owner:{projectId:"",projectTitle:"人格聊天",threadName:state.persona.name}})).catch(()=>setStatus("旧人格对话暂时无法恢复，发送消息时会自动新建"))},[aiSettings.provider,open,snapshot.entries,state.chatThreadId,state.mode,state.persona.name]);

 const changeMode=(mode:CompanionMode)=>{setState(current=>({...current,mode}));setStatus("")};
 const startTask=async(event:FormEvent)=>{
  event.preventDefault();const text=taskDraft.trim(),project=selectedProject;if(!text||taskBusy)return;
  setTaskBusy(true);setStatus("正在建立独立项目任务...");
  try{
   await codexRuntime.ensureConnected();
   const workspace=project?await loadProjectWorkspace(project.id):null;if(project&&!workspace?.projectDirectory.trim())throw new Error("请先进入该项目并设置本机项目目录");
   const response=await codexRuntime.client.request<ThreadResponse>("thread/start",project?{cwd:workspace!.projectDirectory.trim(),approvalPolicy:"on-request",sandbox:"workspace-write",developerInstructions:`你由终端工作台的 AI 悬浮窗调度，当前项目为「${project.title}」。任务只能作用于该项目目录；需要高风险操作时请求批准。`}:{approvalPolicy:"never",sandbox:"read-only",developerInstructions:"你正在处理个人工作台中的通用任务。不得读取项目、忆泡、计划或本机文件，不得执行命令或修改文件；只根据用户当前输入进行分析、规划和文本输出。"});
   const threadId=response.thread.id,threadName=`${project?"悬浮任务":"通用任务"} · ${text.slice(0,16)}`,owner={projectId:project?.id||"",projectTitle:project?.title||"通用任务",threadName};
   codexRuntime.hydrateThread(response.thread,{model:response.model,reasoningEffort:response.reasoningEffort,owner});
   codexRuntime.addUserMessage(threadId,{id:`user-${threadId}`,role:"user",text});
   await codexRuntime.client.request("thread/name/set",{threadId,name:threadName}).catch(()=>undefined);
   if(project&&workspace)await saveProjectWorkspace(project.id,{...workspace,threads:[{id:threadId,name:threadName,preview:text,updatedAt:response.thread.updatedAt||0},...workspace.threads.filter(thread=>thread.id!==threadId)],activeThreadId:threadId});
   const turn=await codexRuntime.client.request<{turn:{id:string}}>("turn/start",{threadId,input:[{type:"text",text,text_elements:[]}],...(project&&workspace?{cwd:workspace.projectDirectory.trim()}:{})});
   codexRuntime.markTurnStarted(threadId,turn.turn.id);setState(current=>({...current,lastTaskThreadId:threadId}));setTaskDraft("");setStatus(project?`任务已交给「${project.title}」`:"通用任务已启动，不会访问工作台数据");
  }catch(error){setStatus(String(error instanceof Error?error.message:error))}finally{setTaskBusy(false)}
 };
 const stopTask=()=>{if(state.lastTaskThreadId&&currentTaskTurn)codexRuntime.interrupt(state.lastTaskThreadId).catch(()=>{})};
 const newPersonaThread=async()=>{
  await codexRuntime.ensureConnected();
  const response=await codexRuntime.client.request<ThreadResponse>("thread/start",{approvalPolicy:"never",sandbox:"read-only",developerInstructions:`${personaInstruction(state.persona)}\n这是纯人格聊天线程：不要执行命令，不要修改文件，不要调用项目任务能力。`});
  const threadId=response.thread.id,owner={projectId:"",projectTitle:"人格聊天",threadName:state.persona.name};
  await codexRuntime.client.request("thread/name/set",{threadId,name:`人格 · ${state.persona.name}`}).catch(()=>undefined);
  codexRuntime.hydrateThread(response.thread,{model:response.model,reasoningEffort:response.reasoningEffort,owner});
  setState(current=>({...current,chatThreadId:threadId}));return threadId;
 };
 const getPersonaThread=async()=>{
  const existing=state.chatThreadId;if(!existing)return newPersonaThread();
  if(snapshot.entries[existing]!==undefined)return existing;
  try{const response=await codexRuntime.client.request<ThreadResponse>("thread/resume",{threadId:existing,approvalPolicy:"never",sandbox:"read-only"});codexRuntime.hydrateThread(response.thread,{model:response.model,reasoningEffort:response.reasoningEffort,owner:{projectId:"",projectTitle:"人格聊天",threadName:state.persona.name}});return existing}catch{return newPersonaThread()}
 };
 const sendChat=async(event:FormEvent)=>{
  event.preventDefault();const text=chatDraft.trim();if(!text||assistantBusy||chatTurnId)return;setStatus("");
  if(aiSettings.provider==="codex"){
   setAssistantBusy(true);
   try{await codexRuntime.ensureConnected();const threadId=await getPersonaThread();setChatDraft("");codexRuntime.addUserMessage(threadId,{id:`user-${Date.now()}`,role:"user",text});const response=await codexRuntime.client.request<{turn:{id:string}}>("turn/start",{threadId,input:[{type:"text",text,text_elements:[]}]});codexRuntime.markTurnStarted(threadId,response.turn.id)}catch(error){setStatus(String(error instanceof Error?error.message:error))}finally{setAssistantBusy(false)}return;
  }
  const user:CompanionMessage={id:`user-${Date.now()}`,role:"user",text,createdAt:Date.now()},history=[...state.chatMessages,user].slice(-40);setState(current=>({...current,chatMessages:history}));setChatDraft("");setAssistantBusy(true);
  try{const response=await runAiChat(aiSettings,[{role:"system",content:personaInstruction(state.persona)},...history.map(message=>({role:message.role,content:message.text}))]);setState(current=>({...current,chatMessages:[...current.chatMessages,{id:`assistant-${Date.now()}`,role:"assistant",text:response.content,createdAt:Date.now()}].slice(-40)}))}catch(error){setStatus(String(error instanceof Error?error.message:error))}finally{setAssistantBusy(false)}
 };
 const stopChat=()=>{if(state.chatThreadId&&chatTurnId)codexRuntime.interrupt(state.chatThreadId).catch(()=>{})};
 const resetChat=()=>{if(chatTurnId){setStatus("请先停止当前回复，再开启新对话");return}if(chatEntries.length&&!window.confirm("开启新对话后，当前人格聊天不会继续作为上下文。确定继续吗？"))return;if(state.chatThreadId)codexRuntime.removeThread(state.chatThreadId);setState(current=>({...current,chatThreadId:null,chatMessages:[]}));setStatus("已开启独立的新对话")};
 const savePersona=()=>{if(chatTurnId){setStatus("请先停止当前回复，再更新人格");return}if((chatEntries.length||state.chatMessages.length)&&!window.confirm("更新人格会同时开启一段新对话。确定继续吗？"))return;const clean={name:personaDraft.name.trim()||defaultState.persona.name,identity:personaDraft.identity.trim()||defaultState.persona.identity,tone:personaDraft.tone.trim()||defaultState.persona.tone};if(state.chatThreadId)codexRuntime.removeThread(state.chatThreadId);setState(current=>({...current,persona:clean,chatThreadId:null,chatMessages:[]}));setPersonaDraft(clean);setEditingPersona(false);setStatus("人格已更新，并建立了新的记忆边界")};
 const feedPet=()=>{if(!pet.food){setPetNotice("补给不足：完成一项今日计划可获得 1 份");return}updateSharedPetState(current=>current.food?{...current,food:current.food-1,satiety:Math.min(100,current.satiety+24),xp:current.xp+14}:current);petAvatar.current?.play("jump");dispatchPetAction("feed");setPetNotice("栖巡-07 接收补给，协同经验 +14")};
 const interactPet=()=>{const lines=["核心温度稳定，今天也会留在这里。","检测到一次友好互动，伴生信号增强。","如果遇到卡点，可以切到 CHAT 和我说。","我在记录你的行动节奏，不读取未授权内容。"],line=lines[pet.xp%lines.length];updateSharedPetState(current=>({...current,xp:current.xp+3}));petAvatar.current?.play("interact");dispatchPetAction("interact");setPetNotice(line)};
 const enterDorm=()=>{openDorm();setOpen(false)};

 return <><div className={`ai-companion ${open?"open":""}`} data-mode={state.mode}>
  {open&&<section className="companion-panel" role="dialog" aria-modal="false" aria-labelledby="companion-title">
   <header className="companion-head"><div className="companion-mini-core" aria-hidden="true"><i/><i/></div><div><small>FIELD COMPANION / {snapshot.connection==="online"?"ONLINE":"LOCAL"}</small><b id="companion-title">{state.persona.name}</b></div><span className={snapshot.connection}>{snapshot.connection==="online"?"LINKED":"LOCAL"}</span><button onClick={()=>setOpen(false)} aria-label="关闭 AI 伴生窗口"><X size={16}/></button></header>
   <div className="companion-modes" role="tablist" aria-label="AI 伴生模式">{([ ["task","TASK","交代任务"],["chat","CHAT","人格聊天"],["pet","PET","伴生体"]] as const).map(([mode,code,label])=><button key={mode} role="tab" aria-selected={state.mode===mode} className={state.mode===mode?"active":""} onClick={()=>changeMode(mode)}><b>{code}</b><span>{label}</span></button>)}<button className="companion-settings" onClick={()=>setSettingsOpen(true)} aria-label="打开 AI 模型设置"><Settings2 size={15}/></button></div>
   <div className="companion-body">
    {state.mode==="task"&&<div className="companion-task" role="tabpanel"><section className="companion-context"><small>TASK SCOPE / 任务权限</small><select value={selectedProject?.id||""} onChange={event=>setState(current=>({...current,selectedProjectId:event.target.value}))}><option value="">通用任务 / 不访问项目</option>{projects.map(project=><option key={project.id} value={project.id}>{project.title}</option>)}</select><span>{selectedProject?selectedProject.tags.slice(0,3).join(" / ")||"PROJECT WORKSPACE":"READ-ONLY / NO WORKBENCH DATA"}</span></section><form onSubmit={startTask} className="companion-task-form"><label htmlFor="companion-task-input">{selectedProject?"给项目 Agent 交代任务":"交代一个通用任务"}</label><textarea id="companion-task-input" ref={taskInput} value={taskDraft} onChange={event=>setTaskDraft(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();event.currentTarget.form?.requestSubmit()}}} placeholder={selectedProject?"描述要完成的结果、范围和限制……":"例如：整理思路、制定计划、比较方案或起草文本……"}/><div className="companion-suggestions" aria-label="任务模板">{(selectedProject?projectTaskPrompts:genericTaskPrompts).map(prompt=><button type="button" key={prompt} onClick={()=>setTaskDraft(prompt)}>{prompt}</button>)}</div><button disabled={!taskDraft.trim()||taskBusy}>{taskBusy?<LoaderCircle className="spin" size={16}/>:<Activity size={16}/>}发送任务</button></form>{state.lastTaskThreadId&&<section className="companion-task-result"><header><div><small>LATEST OUTPUT</small><b>{currentTask?.threadName||"最近任务"}</b></div>{currentTaskTurn&&<button onClick={stopTask}><Square size={11}/>停止</button>}</header><p>{currentTaskAnswer?.text||(currentTaskTurn?"Agent 正在处理，结果会显示在这里。":"当前任务还没有可显示的文本结果。")}</p></section>}<section className="companion-task-feed"><header><b>最近任务</b><span>{taskItems.length} / ACTIVE LOG</span></header>{taskItems.length?taskItems.map(task=><button key={task.threadId} onClick={()=>{if(task.projectId)openProject(task.projectId)}} disabled={!task.projectId}><i className={task.status}>{task.status==="waitingApproval"?<ShieldAlert size={13}/>:task.status==="completed"?<CheckCircle2 size={13}/>:<Activity size={13}/>}</i><span><b>{task.projectTitle}</b><small>{task.threadName||"Codex 任务"}</small></span><em>{task.status==="running"?"运行中":task.status==="waitingApproval"?"待批准":task.status==="completed"?"已完成":"失败"}</em>{task.projectId?<ChevronRight size={13}/>:<span/>}</button>):<p>交代任务后，可在这里查看运行状态；通用任务结果直接显示在上方。</p>}</section></div>}
    {state.mode==="chat"&&<div className="companion-chat" role="tabpanel"><header><div><small>PERSONA CHANNEL</small><b>{state.persona.name} · {providerLabel}</b></div><button onClick={()=>setEditingPersona(value=>!value)}>{editingPersona?"返回对话":"编辑人格"}</button><button onClick={resetChat}>新对话</button></header>{editingPersona?<section className="persona-editor"><label>NAME / 名称<input value={personaDraft.name} onChange={event=>setPersonaDraft(current=>({...current,name:event.target.value}))}/></label><label>IDENTITY / 身份<textarea value={personaDraft.identity} onChange={event=>setPersonaDraft(current=>({...current,identity:event.target.value}))}/></label><label>TONE / 说话方式<textarea value={personaDraft.tone} onChange={event=>setPersonaDraft(current=>({...current,tone:event.target.value}))}/></label><button onClick={savePersona}>保存并开启新对话</button></section>:<><div className="companion-chat-log" ref={chatLog}>{chatEntries.length?chatEntries.map(entry=><article key={entry.id} className={entry.role}><small>{entry.role==="user"?"YOU":state.persona.name.toLocaleUpperCase()}</small><p>{"text" in entry?entry.text:""}</p></article>):<div className="companion-chat-empty"><MessageSquare size={24}/><b>{state.persona.name} 已建立独立频道</b><p>{state.persona.identity}</p><span>这里不会自动读取项目或忆泡。</span><div>{chatStarters.map(prompt=><button key={prompt} onClick={()=>setChatDraft(prompt)}>{prompt}</button>)}</div></div>}{(assistantBusy||chatTurnId)&&<div className="companion-thinking"><i/><i/><i/><span>正在回应</span></div>}</div><form className="companion-chat-form" onSubmit={sendChat}><textarea ref={chatInput} value={chatDraft} onChange={event=>setChatDraft(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();event.currentTarget.form?.requestSubmit()}}} placeholder={`和 ${state.persona.name} 说点什么……`}/>{chatTurnId?<button type="button" className="stop" onClick={stopChat} aria-label="停止生成"><Square size={14}/></button>:<button disabled={!chatDraft.trim()||assistantBusy} aria-label="发送消息"><ChevronRight size={17}/></button>}</form></>}</div>}
    {state.mode==="pet"&&<div className="companion-pet" role="tabpanel"><section className="pet-stage"><div className="pet-scan"><i/><i/><i/></div><div className="pet-avatar-preview" aria-label="栖巡-07 动态预览"><QixunDormAvatar ref={petAvatar} reloadKey={0} onLoadState={petLoadStateChanged} onManifest={ignorePetManifest} onAnimation={ignorePetAnimation} onPosition={ignorePetPosition}/>{petPreviewState!=="ready"&&<span className={petPreviewState}>{petPreviewState==="loading"?"正在连接宿舍角色":"角色预览暂不可用"}</span>}</div><div className="pet-identity"><small>DORM OPERATOR / LV.{String(level).padStart(2,"0")}</small><h2>栖巡-07</h2><p>{pet.satiety>=80?"能量充足":pet.satiety>=40?"状态稳定":"需要补给"}</p></div></section><section className="pet-telemetry"><div><span>饱食度</span><b>{pet.satiety}%</b><i><i style={{width:`${pet.satiety}%`}}/></i></div><div><span>协同经验</span><b>{levelProgress} / 60</b><i><i style={{width:`${levelProgress/60*100}%`}}/></i></div></section><section className="pet-supplies"><div><Utensils size={16}/><span><small>DAILY SUPPLY</small><b>{pet.food} 份补给</b></span><em>{todayDone} 项今日任务已完成</em></div><p aria-live="polite">{petNotice}</p><div><button onClick={feedPet} disabled={!pet.food}>投喂一份</button><button onClick={interactPet}>互动</button><button onClick={enterDorm}>进入宿舍</button></div></section></div>}
   </div>
   <footer className="companion-status" aria-live="polite"><i className={status?"warn":""}/><span>{status||`${state.mode==="task"?"任务与项目上下文隔离":state.mode==="chat"?"人格记忆独立保存":"完成今日计划可获得补给"}`}</span><b>{state.mode.toLocaleUpperCase()} / 0{state.mode==="task"?1:state.mode==="chat"?2:3}</b></footer>
  </section>}
  <button className="companion-launcher" onClick={()=>setOpen(value=>!value)} aria-label={open?"收起 AI 伴生窗口":"打开 AI 伴生窗口"} aria-expanded={open}><span className="companion-core" aria-hidden="true"><i/><i/><b>AI</b></span>{pet.food>0&&<em>{pet.food}</em>}<small>{open?"CLOSE":state.persona.name}</small></button>
 </div>{settingsOpen&&<AiSettingsModal client={codexRuntime.client} connected={snapshot.connection==="online"} settings={aiSettings} close={()=>setSettingsOpen(false)} onSave={setAiSettings}/>}</>;
}
