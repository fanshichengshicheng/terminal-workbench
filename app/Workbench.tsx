"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Kind = "idea" | "project";
type Entry = {
  id: string; kind: Kind; title: string; tags: string[]; createdAt: string;
  lastViewed: string; cover?: string; source?: string; pinned?: boolean; originId?: string;
};
type Bubble = { id: string; x: number; y: number; vx: number; vy: number; size: number; base: number; variant: number };

const DAY = 86400000;
const initial: Entry[] = [
  { id: "MEM-024", kind: "idea", title: "个人工作台", tags: ["PRODUCT", "UI"], createdAt: "2026-08-09", lastViewed: "2026-08-09", pinned: true },
  { id: "MEM-018", kind: "idea", title: "会呼吸的桌面", tags: ["INTERACTION"], createdAt: "2026-07-28", lastViewed: "2026-08-03" },
  { id: "MEM-015", kind: "idea", title: "城市声音地图", tags: ["MAP", "AUDIO"], createdAt: "2026-07-19", lastViewed: "2026-07-22" },
  { id: "MEM-012", kind: "idea", title: "机械结构生成器", tags: ["TOOL", "CAD"], createdAt: "2026-06-30", lastViewed: "2026-07-08" },
  { id: "MEM-009", kind: "idea", title: "空间音频可视化", tags: ["AUDIO", "VISUAL"], createdAt: "2026-06-12", lastViewed: "2026-06-20" },
  { id: "MEM-006", kind: "idea", title: "模块化家具", tags: ["DESIGN"], createdAt: "2026-05-04", lastViewed: "2026-05-12" },
  { id: "MEM-003", kind: "idea", title: "电影中的控制台", tags: ["REFERENCE", "UI"], createdAt: "2026-03-17", lastViewed: "2026-04-01" },
  { id: "MEM-001", kind: "idea", title: "未完成的远行计划", tags: ["LIFE"], createdAt: "2026-01-08", lastViewed: "2026-01-18" },
];

function daysSince(date: string) { return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / DAY)); }
function makeBubbles(entries: Entry[], width = 1100, height = 650): Bubble[] {
  return entries.map((e, i) => {
    const age = daysSince(e.lastViewed);
    const base = e.pinned ? 126 : Math.max(64, 124 - age * .42);
    return { id: e.id, x: 90 + (i * 173) % Math.max(240, width - 210), y: 80 + (i * 127) % Math.max(220, height - 190), vx: (i % 2 ? 1 : -1) * (.13 + (i % 4) * .025), vy: (i % 3 ? 1 : -1) * (.09 + (i % 3) * .025), size: base, base, variant: i % 3 };
  });
}

export default function Workbench() {
  const [entries, setEntries] = useState<Entry[]>(initial);
  const [section, setSection] = useState<Kind>("idea");
  const [mode, setMode] = useState<"drift" | "hold" | "index">("drift");
  const [drawer, setDrawer] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [density, setDensity] = useState(12);
  const [bubbles, setBubbles] = useState<Bubble[]>(() => makeBubbles(initial));
  const [mouse, setMouse] = useState({ x: -999, y: -999 });
  const zoneRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef(bubbles);
  const hoverRef = useRef<string | null>(null);
  const entriesRef = useRef(entries);

  useEffect(() => {
    const saved = localStorage.getItem("memory-workbench-entries");
    if (saved) { try { setEntries(JSON.parse(saved)); } catch {} }
  }, []);
  useEffect(() => { entriesRef.current = entries; localStorage.setItem("memory-workbench-entries", JSON.stringify(entries)); }, [entries]);
  useEffect(() => { bubbleRef.current = bubbles; }, [bubbles]);
  useEffect(() => { setBubbles(makeBubbles(entries.filter(e => e.kind === "idea").slice(0, density))); }, [entries, density]);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const zone = zoneRef.current;
      if (zone && mode === "drift") {
        const w = zone.clientWidth, h = zone.clientHeight;
        const next = bubbleRef.current.map(b => ({ ...b }));
        for (const b of next) {
          const dx = mouse.x - b.x, dy = mouse.y - b.y, dist = Math.hypot(dx, dy);
          const proximity = dist < 150 ? Math.max(.08, dist / 150) : 1;
          const target = hoverRef.current === b.id ? 0 : proximity;
          b.vx *= .999; b.vy *= .999;
          b.x += b.vx * target; b.y += b.vy * target;
          const age = daysSince(entriesRef.current.find(e => e.id === b.id)?.lastViewed || new Date().toISOString());
          if (age > 75) b.y += .025;
          const r = b.size / 2;
          if (b.x < r + 12) { b.x = r + 12; b.vx = Math.abs(b.vx); }
          if (b.x > w - r - 12) { b.x = w-r-12; b.vx = -Math.abs(b.vx); }
          if (b.y < r + 12) { b.y = r+12; b.vy = Math.abs(b.vy); }
          if (b.y > h-r-42) { b.y = h-r-42; b.vy = -Math.abs(b.vy) * .65; }
        }
        for (let i=0;i<next.length;i++) for (let j=i+1;j<next.length;j++) {
          const a=next[i], b=next[j], dx=b.x-a.x, dy=b.y-a.y, d=Math.hypot(dx,dy)||1, min=(a.size+b.size)/2+8;
          if(d<min){ const nx=dx/d, ny=dy/d, push=(min-d)/2; a.x-=nx*push; a.y-=ny*push; b.x+=nx*push; b.y+=ny*push; const av=a.vx*nx+a.vy*ny, bv=b.vx*nx+b.vy*ny; a.vx+=(bv-av)*nx*.55; a.vy+=(bv-av)*ny*.55; b.vx+=(av-bv)*nx*.55; b.vy+=(av-bv)*ny*.55; }
        }
        bubbleRef.current = next; setBubbles(next);
      }
      frame = requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick); return()=>cancelAnimationFrame(frame);
  }, [mode, mouse]);

  const ideas = entries.filter(e => e.kind === "idea");
  const projects = entries.filter(e => e.kind === "project");
  const filtered = useMemo(() => ideas.filter(e => [e.title, ...e.tags, e.createdAt].join(" ").toLowerCase().includes(query.toLowerCase())), [ideas, query]);
  const current = entries.find(e => e.id === selected);
  const detailEntry = entries.find(e => e.id === detail);

  function open(id: string) {
    const today = new Date().toISOString().slice(0,10);
    setEntries(v => v.map(e => e.id === id ? {...e, lastViewed: today} : e)); setDetail(id); setSelected(null);
  }
  function convert(id: string) {
    setEntries(v => v.map(e => e.id === id ? {...e, id: `PRJ-${String(v.filter(x=>x.kind==="project").length+1).padStart(3,"0")}`, kind:"project", originId:id} : e));
    setSelected(null); setDetail(null); setSection("project");
  }
  function addIdea(title: string, source: string) {
    if(!title.trim()) return;
    const n=entries.filter(e=>e.kind==="idea").length+25, today=new Date().toISOString().slice(0,10);
    setEntries(v=>[{id:`MEM-${String(n).padStart(3,"0")}`,kind:"idea",title:title.trim(),tags:["NEW"],createdAt:today,lastViewed:today,source:source||undefined},...v]); setAdding(false);
  }

  if(detailEntry) return <main className="detail-page">
    <header className="detail-head"><button onClick={()=>setDetail(null)}>← RETURN / 返回</button><span>{detailEntry.id}</span></header>
    <div className="detail-grid"><aside><b>{detailEntry.kind==="idea"?"MEMORY DATA":"PROJECT DATA"}</b><small>ENTRY / {detailEntry.id}</small></aside><section><p className="eyebrow">{detailEntry.kind==="idea"?"灵感档案":"项目档案"}</p><h1>{detailEntry.title}</h1><div className="yellow-line"/><p className="empty-copy">CONTENT MODULE NOT DEPLOYED<br/>内容模块暂未部署</p>{detailEntry.kind==="idea"&&<button className="primary" onClick={()=>convert(detailEntry.id)}>CONVERT TO PROJECT / 转化为项目</button>}</section></div>
  </main>;

  return <main className="shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">W</span><div><b>WORKBENCH</b><small>个人终端工作台 / LOCAL SYSTEM</small></div></div><div className="system"><span>SYS.ONLINE</span><b>{String(entries.length).padStart(3,"0")}</b><span>{new Date().toLocaleDateString("zh-CN")}</span></div></header>
    <nav className="nav"><button className={section==="project"?"active":""} onClick={()=>setSection("project")}><i>01</i> 项目 <em>PROJECT</em></button><button className={section==="idea"?"active":""} onClick={()=>setSection("idea")}><i>02</i> 灵感 <em>MEMORY</em></button><span className="nav-rule"/><button className="square" onClick={()=>setAdding(true)}>＋</button></nav>

    {section === "project" ? <section className="project-page"><div className="section-label"><span>01 / PROJECT DATABASE</span><b>{projects.length} UNITS</b></div>{projects.length===0?<div className="empty"><span>NO DEPLOYED PROJECT</span><h2>暂无已部署项目</h2><p>将灵感转化为项目后，它会在这里形成结构化档案。</p><button onClick={()=>setSection("idea")}>OPEN MEMORY / 前往灵感</button></div>:<div className="project-grid">{projects.map(p=><button key={p.id} className="project-card" onClick={()=>setDetail(p.id)}><small>{p.id} / ACTIVE</small><h3>{p.title}</h3><div><span>SOURCE</span><b>{p.originId||"MANUAL"}</b></div><i>OPEN →</i></button>)}</div>}</section> :
    <section className="memory-page"><div className="section-label"><span>02 / MEMORY FIELD</span><b>{ideas.length} RECORDS</b></div><div className="viewbar"><div><button className={!drawer?"active":""} onClick={()=>setDrawer(false)}>DRIFT / 忆泡</button><button className={drawer?"active":""} onClick={()=>setDrawer(true)}>INDEX / 检索</button></div><span>FIELD DENSITY {density}</span></div>
      <div ref={zoneRef} className={`memory-zone ${mode} ${selected?"focused":""}`} onMouseMove={e=>{const r=e.currentTarget.getBoundingClientRect();setMouse({x:e.clientX-r.left,y:e.clientY-r.top})}} onMouseLeave={()=>setMouse({x:-999,y:-999})}>
        <div className="zone-code">MEMORY FIELD // SAFE AREA<br/>X.024 Y.086</div><div className="dormant-label">DORMANT MEMORY / 静默记忆</div>
        {bubbles.map((b,i)=>{const e=ideas.find(x=>x.id===b.id); if(!e)return null; const indexed=mode==="index"; const cols=Math.max(3,Math.floor((zoneRef.current?.clientWidth||900)/170)); const x=indexed?100+(i%cols)*165:b.x, y=indexed?115+Math.floor(i/cols)*165:b.y;
          return <button key={b.id} className={`bubble v${b.variant} ${selected===b.id?"selected":""} ${selected&&selected!==b.id?"dim":""}`} style={{width:b.size,height:b.size,transform:`translate3d(${x-b.size/2}px,${y-b.size/2}px,0)`}} onMouseEnter={()=>hoverRef.current=b.id} onMouseLeave={()=>hoverRef.current=null} onClick={()=>setSelected(b.id)}><span className="bubble-id">{b.id.replace("MEM-","")}</span><b>{e.title}</b><i/></button>})}
        {current&&<div className="inspector"><small>IDENTIFIED / {current.id}</small><h3>{current.title}</h3><dl><div><dt>CREATED</dt><dd>{current.createdAt}</dd></div><div><dt>LAST VIEW</dt><dd>{daysSince(current.lastViewed)} DAYS AGO</dd></div><div><dt>TAG</dt><dd>{current.tags.join(" / ")}</dd></div></dl><div className="inspector-actions"><button onClick={()=>open(current.id)}>OPEN / 打开</button><button onClick={()=>convert(current.id)}>CONVERT / 转项目</button></div><button className="close" onClick={()=>setSelected(null)}>×</button></div>}
        <div className="controls"><button onClick={()=>setMode(mode==="hold"?"drift":"hold")} className={mode==="hold"?"on":""}>{mode==="hold"?"▶":"Ⅱ"}<span>{mode==="hold"?"RESUME":"HOLD"}</span></button><button onClick={()=>setMode(mode==="index"?"drift":"index")} className={mode==="index"?"on":""}>▦<span>INDEX</span></button><button onClick={()=>setBubbles(makeBubbles(ideas.slice(0,density)))}>↻<span>REFRESH</span></button></div>
      </div>
      <aside className={`drawer ${drawer?"open":""}`}><header><div><small>MEMORY RETRIEVAL</small><h2>灵感检索</h2></div><button onClick={()=>setDrawer(false)}>×</button></header><label><span>&gt;</span><input autoFocus={drawer} value={query} onChange={e=>setQuery(e.target.value)} placeholder="输入名称、标签或时间"/></label><div className="filters"><button>ALL</button><button>RECENT</button><button>TAG</button><button>DORMANT</button></div><p className="result-count">RESULT / {String(filtered.length).padStart(3,"0")}</p><div className="results">{filtered.map(e=><button key={e.id} onClick={()=>{setSelected(e.id);setDrawer(false)}}><b>{e.id}</b><span>{e.title}<small>{e.tags.join(" · ")}</small></span><time>{e.createdAt.replaceAll("-",".")}</time></button>)}</div></aside>
    </section>}
    {adding&&<AddDialog onClose={()=>setAdding(false)} onAdd={addIdea}/>}<footer><span>UNOFFICIAL PERSONAL WORKBENCH</span><span>LOCAL STORAGE / READY</span><span>BUILD 0.1.0</span></footer>
  </main>;
}

function AddDialog({onClose,onAdd}:{onClose:()=>void;onAdd:(t:string,s:string)=>void}){
  const [title,setTitle]=useState(""); const [source,setSource]=useState("");
  return <div className="modal-back" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="add-modal"><small>NEW MEMORY / 快速捕获</small><h2>记录一个新灵感</h2><label>NAME / 名称<input autoFocus value={title} onChange={e=>setTitle(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")onAdd(title,source)}} placeholder="它叫什么？"/></label><label>SOURCE / 来源链接<input value={source} onChange={e=>setSource(e.target.value)} placeholder="https://  可选"/></label><div><button onClick={onClose}>CANCEL</button><button className="primary" onClick={()=>onAdd(title,source)}>SAVE MEMORY</button></div></div></div>
}
