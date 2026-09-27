const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const KEY = "sankalp_v1";

const defaultState = {
  goal: 120,
  theme: "dark",
  classes: [],
  docs: [],
  sessions: [],
  quoteIndex: 0
};

let state = loadState();
let timer = { running:false, startedAt:0, elapsed:0, interval:null };

const quotes = [
  "Small progress is still progress.",
  "You do not need a perfect day. You need a focused one.",
  "Start before you feel ready.",
  "Your future self will thank you for today's effort.",
  "One chapter. One session. One step.",
  "Consistency makes ordinary effort extraordinary.",
  "Protect your focus. Your goal deserves it.",
  "Do less, but do it with full attention."
];

function loadState(){
  try { return {...defaultState, ...JSON.parse(localStorage.getItem(KEY) || "{}")}; }
  catch { return {...defaultState}; }
}
function save(){ localStorage.setItem(KEY, JSON.stringify(state)); }
function toast(msg){
  const t=$("#toast"); t.textContent=msg; t.classList.add("show");
  clearTimeout(toast.t); toast.t=setTimeout(()=>t.classList.remove("show"),2200);
}
function todayKey(d=new Date()){
  return d.toISOString().slice(0,10);
}
function fmtMin(min){
  min=Math.max(0,Math.round(min));
  const h=Math.floor(min/60), m=min%60;
  return h ? `${h}h ${String(m).padStart(2,"0")}m` : `${m}m`;
}
function fmtSec(sec){
  sec=Math.max(0,Math.floor(sec));
  const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60;
  return [h,m,s].map(v=>String(v).padStart(2,"0")).join(":");
}
function dayName(i){ return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][i]; }
function dayIndex(d=new Date()){ return d.getDay(); }

function studiedMinutes(date=todayKey()){
  return state.sessions.filter(s=>s.date===date).reduce((a,s)=>a+s.minutes,0);
}
function updateGreeting(){
  const h=new Date().getHours();
  $("#greeting").textContent = h<12 ? "GOOD MORNING" : h<18 ? "GOOD AFTERNOON" : "GOOD EVENING";
}
function updateGoal(){
  const studied=studiedMinutes(), goal=state.goal;
  const pct=Math.min(100, Math.round((studied/goal)*100));
  $("#goalText").textContent=fmtMin(goal);
  $("#goalPercent").textContent=pct+"%";
  $("#studiedToday").textContent=fmtMin(studied);
  $("#remainingToday").textContent=studied>=goal ? "Done" : fmtMin(goal-studied);
  $("#goalRing").style.background=`conic-gradient(var(--accent) ${pct*3.6}deg,var(--line) 0deg)`;
  $("#focusToday").textContent=fmtMin(studied);
  $("#focusGoalLabel").textContent=`${pct}% of your goal`;
  $("#focusBar").style.width=pct+"%";
  $("#settingsGoal").textContent=fmtMin(goal);
}
function renderNextClass(){
  const now=new Date(), today=dayIndex();
  const classes=state.classes.filter(c=>c.day===today).sort((a,b)=>a.time.localeCompare(b.time));
  const upcoming=classes.find(c=>c.time>=now.toTimeString().slice(0,5)) || classes[0];
  const box=$("#nextClass");
  if(!upcoming){ box.innerHTML='No classes added yet.<br><button class="text-btn" data-go="timetable">Add timetable →</button>'; bindNav(); return; }
  box.innerHTML=`<div><div class="time">${upcoming.time}</div><strong>${escapeHtml(upcoming.subject)}</strong><div>${escapeHtml(upcoming.meta||"Today")}</div></div>`;
}
function renderTimetable(){
  const strip=$("#weekStrip");
  strip.innerHTML=Array.from({length:7},(_,i)=>{
    const d=new Date(); d.setDate(d.getDate()+(i-d.getDay()));
    return `<button class="day-pill ${i===dayIndex()?"active":""}" data-day="${i}"><b>${dayName(i)}</b><small>${d.getDate()}</small></button>`;
  }).join("");
  $$(".day-pill").forEach(b=>b.onclick=()=>renderClassDay(Number(b.dataset.day)));
  renderClassDay(dayIndex());
}
function renderClassDay(day){
  const list=$("#classList");
  const classes=state.classes.filter(c=>c.day===day).sort((a,b)=>a.time.localeCompare(b.time));
  if(!classes.length){list.innerHTML=`<div class="empty-state" style="padding:45px;text-align:center">No classes for ${dayName(day)}.<br><button class="text-btn" id="emptyAdd">＋ Add a class</button></div>`; $("#emptyAdd").onclick=()=>openModal("classModal"); return;}
  list.innerHTML=classes.map(c=>`<div class="class-row"><div class="class-time">${c.time}</div><div><b>${escapeHtml(c.subject)}</b><small>${escapeHtml(c.meta||"")}</small></div><button class="delete-btn" data-delete-class="${c.id}">✕</button></div>`).join("");
  $$("[data-delete-class]").forEach(b=>b.onclick=()=>{state.classes=state.classes.filter(c=>c.id!==b.dataset.deleteClass);save();renderAll();toast("Class removed");});
}
function renderDocuments(filter=""){
  const list=$("#documentsList"), q=filter.toLowerCase();
  const docs=state.docs.filter(d=>(d.name+" "+d.category).toLowerCase().includes(q));
  if(!docs.length){list.innerHTML='<div class="empty-state" style="grid-column:1/-1;text-align:center;padding:55px">No matching documents.<br>Add your own study files with <b>＋ Add document</b>.</div>';return;}
  list.innerHTML=docs.map(d=>`<article class="document-card"><div class="file-top"><div class="doc-icon">📄</div><small>${escapeHtml(d.category)}</small></div><h3>${escapeHtml(d.name)}</h3><small>${escapeHtml(d.fileName)} · ${fmtBytes(d.size)}</small><div class="doc-actions"><button class="small-btn" data-open-doc="${d.id}">Open</button><button class="small-btn danger" data-delete-doc="${d.id}">Delete</button></div></article>`).join("");
  $$("[data-delete-doc]").forEach(b=>b.onclick=()=>{state.docs=state.docs.filter(d=>d.id!==b.dataset.deleteDoc);save();renderAll();toast("Document removed");});
  $$("[data-open-doc]").forEach(b=>b.onclick=()=>openDocument(b.dataset.openDoc));
}
function renderRecent(){
  const box=$("#recentDocs"), docs=state.docs.slice(-4).reverse();
  if(!docs.length){box.innerHTML='<div class="empty-state">No documents yet.</div>';return;}
  box.innerHTML=docs.map(d=>`<button class="doc-row" data-open-doc="${d.id}"><span class="doc-icon">📄</span><span><b>${escapeHtml(d.name)}</b><small>${escapeHtml(d.category)}</small></span></button>`).join("");
  $$("[data-open-doc]").forEach(b=>b.onclick=()=>openDocument(b.dataset.openDoc));
}
function renderCategories(){
  const cats=["All","Question Papers","Notes","Assignments","Syllabus","Practical","Other"];
  $("#docCategories").innerHTML=cats.map((c,i)=>`<button class="${i===0?"active":""}" data-cat="${c}">${c}</button>`).join("");
  $$("#docCategories button").forEach(b=>b.onclick=()=>{
    $$("#docCategories button").forEach(x=>x.classList.remove("active")); b.classList.add("active");
    $("#docSearch").value=b.dataset.cat==="All"?"":b.dataset.cat; renderDocuments($("#docSearch").value);
  });
}
function renderProgress(){
  const total=state.sessions.reduce((a,s)=>a+s.minutes,0);
  $("#totalStudy").textContent=fmtMin(total);
  $("#sessionCount").textContent=state.sessions.length;
  const byDay={}; state.sessions.forEach(s=>byDay[s.date]=(byDay[s.date]||0)+s.minutes);
  const vals=Object.values(byDay); $("#bestDay").textContent=fmtMin(vals.length?Math.max(...vals):0);
  let streak=0; for(let i=0;i<365;i++){const d=new Date();d.setDate(d.getDate()-i);if((byDay[todayKey(d)]||0)>0)streak++;else break;}
  $("#streak").textContent=streak+" day"+(streak===1?"":"s");
  const days=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));return d});
  const max=Math.max(60,...days.map(d=>byDay[todayKey(d)]||0));
  $("#weeklyTotal").textContent=fmtMin(days.reduce((a,d)=>a+(byDay[todayKey(d)]||0),0));
  $("#chart").innerHTML=days.map(d=>{const v=byDay[todayKey(d)]||0;return `<div class="bar-wrap"><span class="muted" style="font-size:10px">${v?fmtMin(v):""}</span><div class="bar" style="height:${Math.max(2,(v/max)*170)}px"></div><small>${dayName(d.getDay())}</small></div>`}).join("");
  const sessions=state.sessions.slice(-8).reverse();
  $("#sessionList").innerHTML=sessions.length?sessions.map(s=>`<div class="session-row"><div><b>${escapeHtml(s.subject||"Study session")}</b><small>${s.date}</small></div><strong>${fmtMin(s.minutes)}</strong></div>`).join(""):'<div class="empty-state" style="padding:20px 0">Complete a study session to see it here.</div>';
}
function renderQuote(){ $("#quote").textContent="“"+quotes[state.quoteIndex%quotes.length]+"”"; }
function renderAll(){
  updateGreeting();updateGoal();renderNextClass();renderTimetable();renderCategories();renderDocuments($("#docSearch")?.value||"");renderRecent();renderProgress();renderQuote();applyTheme();
}
function applyTheme(){document.documentElement.dataset.theme=state.theme;}
function openModal(id){$("#"+id).classList.add("open")}
function closeModal(id){$("#"+id).classList.remove("open")}
function bindNav(){
  $$("[data-go]").forEach(b=>b.onclick=()=>showPage(b.dataset.go));
}
function showPage(page){
  $$(".page").forEach(p=>p.classList.remove("active")); $("#page-"+page).classList.add("active");
  $$(".nav-item").forEach(n=>n.classList.toggle("active",n.dataset.page===page));
  window.scrollTo({top:0,behavior:"smooth"});
  if(page==="progress")renderProgress();
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function fmtBytes(n){if(!n)return "0 B";const u=["B","KB","MB","GB"];let i=0,x=n;while(x>=1024&&i<3){x/=1024;i++}return `${x<10&&i?x.toFixed(1):Math.round(x)} ${u[i]}`}
function startTimer(){
  if(timer.running)return;
  timer.running=true; timer.startedAt=Date.now()-timer.elapsed*1000;
  $("#timerBtn").textContent="Pause"; $("#focusStatus").textContent="FOCUSING";
  timer.interval=setInterval(updateTimer,500); updateTimer();
}
function pauseTimer(){
  if(!timer.running)return;
  timer.elapsed=Math.floor((Date.now()-timer.startedAt)/1000);
  timer.running=false;clearInterval(timer.interval);$("#timerBtn").textContent="Resume";$("#focusStatus").textContent="PAUSED";
}
function updateTimer(){
  if(timer.running)timer.elapsed=Math.floor((Date.now()-timer.startedAt)/1000);
  $("#timer").textContent=fmtSec(timer.elapsed);
}
function resetTimer(){
  if(timer.elapsed>20){ if(confirm("End this session and save the time?")) finishSession(); else return; }
  timer.running=false;clearInterval(timer.interval);timer.elapsed=0;$("#timer").textContent="00:00:00";$("#timerBtn").textContent="Start session";$("#focusStatus").textContent="READY TO FOCUS";
}
function finishSession(){
  if(timer.running)pauseTimer();
  const mins=Math.max(1,Math.round(timer.elapsed/60));
  state.sessions.push({id:Date.now().toString(),date:todayKey(),minutes:mins,subject:$("#subjectInput").value.trim()||"Study session"});
  save();timer.elapsed=0;$("#timer").textContent="00:00:00";$("#timerBtn").textContent="Start session";$("#focusStatus").textContent="SESSION SAVED";$("#subjectInput").value="";renderAll();toast(`Saved ${fmtMin(mins)} of study time`);
}
function openDocument(id){
  const d=state.docs.find(x=>x.id===id); if(!d)return;
  try{
    const bytes=atob(d.data), arr=new Uint8Array(bytes.length);for(let i=0;i<bytes.length;i++)arr[i]=bytes.charCodeAt(i);
    const blob=new Blob([arr],{type:d.type||"application/octet-stream"});const url=URL.createObjectURL(blob);window.open(url,"_blank");setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch{toast("This document could not be opened.");}
}
function dataUrlSize(data){return Math.max(0,Math.floor((data.length*3)/4))}
function readFile(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)})}

$$(".nav-item").forEach(b=>b.onclick=()=>showPage(b.dataset.page));
bindNav();

$("#themeBtn").onclick=()=>{state.theme=state.theme==="dark"?"light":"dark";save();applyTheme()};
$("#settingsThemeBtn").onclick=()=>{$("#themeBtn").click()};
$("#profileBtn").onclick=()=>showPage("settings");
$("#newQuote").onclick=()=>{state.quoteIndex++;save();renderQuote()};
$("#editGoal").onclick=()=>openModal("goalModal");
$("#settingsGoalBtn").onclick=()=>openModal("goalModal");
$("#addClassBtn").onclick=()=>openModal("classModal");
$("#addDocBtn").onclick=()=>openModal("docModal");
$("#addDocQuick").onclick=()=>openModal("docModal");
$("#blockerInfo").onclick=()=>toast("Native Android blocker will be added in the Android version.");
$("#timerBtn").onclick=()=>timer.running?pauseTimer():startTimer();
$("#resetTimer").onclick=resetTimer;

$$("[data-close]").forEach(b=>b.onclick=()=>closeModal(b.dataset.close));
$$(".modal").forEach(m=>m.addEventListener("click",e=>{if(e.target===m)m.classList.remove("open")}));

$$(".goal-options button").forEach(b=>b.onclick=()=>{$("#customGoal").value=Number(b.dataset.hours)*60});
$("#saveGoal").onclick=()=>{
  const mins=Number($("#customGoal").value);
  if(!mins||mins<15){toast("Choose at least 15 minutes.");return}
  state.goal=Math.min(1440,mins);save();closeModal("goalModal");renderAll();toast("Daily goal updated");
};

const days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
$("#classDay").innerHTML=days.map((d,i)=>`<option value="${i}">${d}</option>`).join("");
$("#saveClass").onclick=()=>{
  const subject=$("#classSubject").value.trim(), time=$("#classTime").value, day=Number($("#classDay").value);
  if(!subject||!time){toast("Add a subject and time.");return}
  state.classes.push({id:Date.now().toString(),subject,time,day,meta:$("#classMeta").value.trim()});
  save();closeModal("classModal");$("#classSubject").value="";$("#classTime").value="";$("#classMeta").value="";renderAll();toast("Class added");
};

let selectedFile=null;
$("#pickFile").onclick=()=>$("#fileInput").click();
$("#fileInput").onchange=e=>{selectedFile=e.target.files[0]||null;$("#chosenFile").textContent=selectedFile?`${selectedFile.name} · ${fmtBytes(selectedFile.size)}`:"No file selected";if(selectedFile&&!$("#docName").value)$("#docName").value=selectedFile.name.replace(/\.[^/.]+$/,"")};
$("#saveDoc").onclick=async()=>{
  if(!selectedFile){toast("Choose a file first.");return}
  if(selectedFile.size>7*1024*1024){toast("For this prototype, keep files under 7 MB.");return}
  try{
    const data=await readFile(selectedFile);
    state.docs.push({id:Date.now().toString(),name:$("#docName").value.trim()||selectedFile.name,fileName:selectedFile.name,category:$("#docCategory").value,size:selectedFile.size,type:selectedFile.type,data});
    save();closeModal("docModal");selectedFile=null;$("#fileInput").value="";$("#chosenFile").textContent="No file selected";$("#docName").value="";renderAll();toast("Document saved on this device");
  }catch{toast("Could not save that file.");}
};
$("#docSearch").oninput=e=>renderDocuments(e.target.value);

$("#clearData").onclick=()=>{
  if(confirm("Clear all SANKALP data from this browser? This cannot be undone.")){localStorage.removeItem(KEY);state={...defaultState};location.reload();}
};

applyTheme();renderAll();
