"use client";

import { useEffect,useMemo,useRef,useState,type Dispatch,type FormEvent,type SetStateAction } from "react";

export type MilestonePriority="critical"|"high"|"normal";
export type Milestone={
 id:string;
 title:string;
 date:string;
 time:string;
 category:string;
 priority:MilestonePriority;
 projectId:string;
 notes:string;
 done:boolean;
};
export type MilestoneDraft=Omit<Milestone,"id"|"done">;
export type MilestoneProject={id:string;title:string};

const DAY=86400000,HOUR=3600000,MINUTE=60000;
const categoryOptions=["截止","学习","考试","约会","纪念日","旅行","生活","项目","竞赛","研究"];
const priorityMeta:Record<MilestonePriority,{label:string;code:string}>={critical:{label:"关键",code:"P0"},high:{label:"高",code:"P1"},normal:{label:"常规",code:"P2"}};
const localDateKey=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
const isValidDate=(value:unknown)=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(new Date(`${value}T12:00:00`).getTime());
const isValidTime=(value:unknown)=>typeof value==="string"&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export const milestoneTimestamp=(milestone:Pick<Milestone,"date"|"time">)=>new Date(`${milestone.date}T${milestone.time}:00`).getTime();

export function normalizeMilestones(value:unknown):Milestone[]{
 if(!Array.isArray(value))return[];
 return value.filter((item):item is Record<string,unknown>=>Boolean(item&&typeof item==="object")).map((item,index)=>({
  id:typeof item.id==="string"&&item.id.trim()?item.id:`MILE-${String(index+1).padStart(3,"0")}`,
  title:typeof item.title==="string"?item.title.trim():"",
  date:isValidDate(item.date)?String(item.date):"",
  time:isValidTime(item.time)?String(item.time):"23:59",
  category:typeof item.category==="string"&&item.category.trim()?item.category.trim():"项目",
  priority:item.priority==="critical"||item.priority==="high"?item.priority:"normal",
  projectId:typeof item.projectId==="string"?item.projectId:"",
  notes:typeof item.notes==="string"?item.notes.trim():"",
  done:Boolean(item.done)
 })).filter(item=>Boolean(item.title&&item.date));
}

export function nextMilestoneId(items:Milestone[]){
 const number=Math.max(0,...items.map(item=>Number.parseInt(item.id.replace(/\D/g,""),10)||0))+1;
 return `MILE-${String(number).padStart(3,"0")}`;
}

export function milestoneStatus(milestone:Milestone,now=Date.now()){
 if(milestone.done)return{tone:"done",label:"已完成",count:"DONE",detail:"节点已确认"};
 const target=milestoneTimestamp(milestone),difference=target-now,absolute=Math.abs(difference);
 const days=Math.floor(absolute/DAY),hours=Math.floor((absolute%DAY)/HOUR),minutes=Math.max(1,Math.floor((absolute%HOUR)/MINUTE));
 const count=days?`${String(days).padStart(2,"0")}D ${String(hours).padStart(2,"0")}H`:hours?`${String(hours).padStart(2,"0")}H ${String(minutes).padStart(2,"0")}M`:`${String(minutes).padStart(2,"0")} MIN`;
 if(difference<0)return{tone:"overdue",label:"已逾期",count,detail:`逾期 ${days?`${days} 天 ${hours} 小时`:hours?`${hours} 小时 ${minutes} 分钟`:`${minutes} 分钟`}`};
 if(milestone.date===localDateKey(new Date(now)))return{tone:"today",label:"今日节点",count,detail:"今天到达节点"};
 return{tone:"upcoming",label:"推进中",count,detail:`距离节点 ${days?`${days} 天 ${hours} 小时`:hours?`${hours} 小时 ${minutes} 分钟`:`${minutes} 分钟`}`};
}

export function MilestoneRail({milestones,setMilestones,projects,openEditor}:{milestones:Milestone[];setMilestones:Dispatch<SetStateAction<Milestone[]>>;projects:MilestoneProject[];openEditor:(milestone?:Milestone)=>void}){
 const[now,setNow]=useState(()=>Date.now()),[showAll,setShowAll]=useState(false);
 useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),MINUTE);return()=>window.clearInterval(timer)},[]);
 const ordered=useMemo(()=>[...milestones].sort((left,right)=>Number(left.done)-Number(right.done)||(left.done?milestoneTimestamp(right)-milestoneTimestamp(left):milestoneTimestamp(left)-milestoneTimestamp(right))),[milestones]);
 const active=ordered.filter(item=>!item.done),primary=active[0],sequencePool=ordered.filter(item=>item.id!==primary?.id),sequence=showAll?sequencePool:sequencePool.slice(0,4),completed=milestones.filter(item=>item.done).length;
 const projectName=(id:string)=>projects.find(project=>project.id===id)?.title||"独立事件";
 const toggle=(id:string)=>setMilestones(items=>items.map(item=>item.id===id?{...item,done:!item.done}:item));
 const remove=(milestone:Milestone)=>{if(!window.confirm(`确定删除里程碑「${milestone.title}」吗？此操作无法撤销。`))return;setMilestones(items=>items.filter(item=>item.id!==milestone.id))};
 const status=primary?milestoneStatus(primary,now):null;
 return <article className="overview-card milestone-rail"><header><span>04 / MILESTONE TRACK</span><b>{active.length} ACTIVE / {completed} DONE</b><button onClick={()=>openEditor()}>＋ 新增里程碑</button></header><div className="milestone-rail-body">{primary&&status?<section className={`milestone-primary ${status.tone}`}><div className="milestone-primary-code"><span>NEXT EVENT</span><b>{primary.id}</b></div><div className="milestone-countdown"><small>{status.label}</small><strong>{status.count}</strong><span>{status.detail}</span></div><div className="milestone-primary-copy"><button onClick={()=>openEditor(primary)}><small>{primary.category} / {projectName(primary.projectId)}</small><b>{primary.title}</b><time>{primary.date.replaceAll("-",".")} / {primary.time}</time>{primary.notes&&<p>{primary.notes}</p>}</button><div><em className={`priority-${primary.priority}`}>{priorityMeta[primary.priority].code} / {priorityMeta[primary.priority].label}</em><button onClick={()=>toggle(primary.id)}>标记完成</button><button className="danger" onClick={()=>remove(primary)} aria-label={`删除里程碑：${primary.title}`}>删除</button></div></div></section>:<section className="milestone-primary milestone-cleared"><div className="milestone-primary-code"><span>NEXT EVENT</span><b>--</b></div><div className="milestone-countdown"><small>STANDBY</small><strong>{milestones.length?"CLEAR":"EMPTY"}</strong><span>{milestones.length?"所有里程碑均已完成":"还没有待跟踪事件"}</span></div><div className="milestone-primary-copy"><b>{milestones.length?"当前事件已经清空":"从一个重要日期开始"}</b><p>{milestones.length?"可以新增下一个事件，或从右侧恢复已完成项目。":"考试、旅行、纪念日、比赛与项目交付都可以放在这里。"}</p><button onClick={()=>openEditor()}>＋ 建立第一个里程碑</button></div></section>}<section className="milestone-sequence"><header><span>SEQUENCE / {showAll?"全部事件":"后续事件"}</span><button onClick={()=>setShowAll(value=>!value)}>{showAll?"收起":"查看全部"}</button><b>{String(sequence.length).padStart(2,"0")}</b></header><div>{sequence.length?sequence.map((milestone,index)=>{const itemStatus=milestoneStatus(milestone,now);return <article key={milestone.id} className={`${itemStatus.tone} priority-${milestone.priority}`}><i><span>{String(index+1).padStart(2,"0")}</span></i><button className="milestone-sequence-open" onClick={()=>openEditor(milestone)}><small>{milestone.date.replaceAll("-",".")} / {milestone.time}</small><b>{milestone.title}</b><em>{projectName(milestone.projectId)} / {itemStatus.label}</em></button><button className="milestone-check" onClick={()=>toggle(milestone.id)} aria-label={`${milestone.done?"恢复":"完成"}里程碑：${milestone.title}`}>{milestone.done?"↺":"✓"}</button></article>}):<p>暂无后续事件</p>}</div></section></div></article>;
}

export function MilestoneDialog({milestone,projects,initialDate,close,save}:{milestone?:Milestone;projects:MilestoneProject[];initialDate?:string;close:()=>void;save:(draft:MilestoneDraft)=>void}){
 const existingCategory=milestone?.category||"截止",knownCategory=categoryOptions.includes(existingCategory);
 const[title,setTitle]=useState(milestone?.title||""),[date,setDate]=useState(milestone?.date||initialDate||localDateKey(new Date())),[time,setTime]=useState(milestone?.time||"23:59"),[category,setCategory]=useState(knownCategory?existingCategory:"自定义"),[customCategory,setCustomCategory]=useState(knownCategory?"":existingCategory),[priority,setPriority]=useState<MilestonePriority>(milestone?.priority||"normal"),[projectId,setProjectId]=useState(milestone?.projectId||""),[notes,setNotes]=useState(milestone?.notes||""),[error,setError]=useState("");
 const titleRef=useRef<HTMLInputElement>(null);
 useEffect(()=>{titleRef.current?.focus();const cancel=(event:KeyboardEvent)=>{if(event.key==="Escape")close()};window.addEventListener("keydown",cancel);return()=>window.removeEventListener("keydown",cancel)},[close]);
 const submit=(event?:FormEvent)=>{event?.preventDefault();const cleanTitle=title.trim(),cleanCategory=(category==="自定义"?customCategory:category).trim();if(!cleanTitle){setError("请输入里程碑名称");titleRef.current?.focus();return}if(!date){setError("请选择事件日期");return}if(!time){setError("请选择事件时间");return}if(!cleanCategory){setError("请输入事件类型");return}save({title:cleanTitle,date,time,category:cleanCategory,priority,projectId,notes:notes.trim()})};
 return <div className="modal-back milestone-modal-back"><button className="milestone-modal-dismiss" aria-label="关闭里程碑编辑" onClick={close}/><form className="add-modal milestone-modal" role="dialog" aria-modal="true" aria-labelledby="milestone-dialog-title" onSubmit={submit}><header><div><small>{milestone?"UPDATE MILESTONE":"NEW MILESTONE"}</small><h2 id="milestone-dialog-title">{milestone?"编辑里程碑":"新增里程碑"}</h2></div><button type="button" onClick={close} aria-label="关闭里程碑编辑">×</button></header><label>MILESTONE / 事件名称<input ref={titleRef} value={title} onChange={event=>{setTitle(event.target.value);setError("")}} placeholder="例如：考试、出发日期、生日或项目交付"/></label><div className="milestone-form-row"><label>DATE / 事件日期<input type="date" value={date} onChange={event=>{setDate(event.target.value);setError("")}}/></label><label>TIME / 事件时间<input type="time" value={time} onChange={event=>{setTime(event.target.value);setError("")}}/></label></div><div className="milestone-form-row"><label>TYPE / 事件类型<select value={category} onChange={event=>{setCategory(event.target.value);setError("")}}>{categoryOptions.map(option=><option key={option}>{option}</option>)}<option>自定义</option></select></label><label>PRIORITY / 优先级<select value={priority} onChange={event=>setPriority(event.target.value as MilestonePriority)}><option value="critical">P0 / 关键</option><option value="high">P1 / 高</option><option value="normal">P2 / 常规</option></select></label></div>{category==="自定义"&&<label>CUSTOM TYPE / 自定义类型<input value={customCategory} onChange={event=>{setCustomCategory(event.target.value);setError("")}} placeholder="输入事件类型"/></label>}<label>LINK PROJECT / 关联项目<select value={projectId} onChange={event=>setProjectId(event.target.value)}><option value="">不关联项目</option>{projects.map(project=><option key={project.id} value={project.id}>{project.title}</option>)}</select></label><label>NOTES / 备注<textarea value={notes} maxLength={280} onChange={event=>setNotes(event.target.value)} placeholder="地点、准备事项或其他说明（可选）"/></label><p className={`milestone-form-error ${error?"show":""}`} aria-live="polite">{error||"任意事件都会同步显示在工程总览和日历中"}</p><footer><button type="button" onClick={close}>取消</button><button type="submit" className="primary">{milestone?"保存修改":"建立里程碑"}</button></footer></form></div>;
}
