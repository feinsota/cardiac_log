
// ════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════════════
const DIURETIC_DRUGS=['Torsemide','Furosemide','Bumetanide','Metolazone','Spironolactone','Eplerenone','Other'];
const SYMPTOMS=['Palpitations','Dyspnea at rest','Dyspnea on exertion','Orthopnea','Fatigue','Chest tightness','Lightheadedness','Syncope/presyncope','Nausea','Increased thirst'];
const MEAL_NAMES=['Breakfast','Lunch','Dinner','Snack'];
const VOID_OPTIONS=[{label:'Drip / barely anything',ml:50},{label:'Small',ml:150},{label:'Medium',ml:300},{label:'Large',ml:500},{label:'Very large',ml:700}];
const EX_TYPES=['Walking','Light cardio','Moderate cardio','Vigorous cardio','Stress test','Strength training','Swimming','Cycling','Yoga / stretching','Other'];
const EX_INTENSITIES=['Light','Moderate','Vigorous','Maximal'];
const DRY_LOW=126, DRY_HIGH=129;
const STORAGE_KEY='cardiacLog_days';
const API_KEY_KEY='cardiacLogApiKey';
const FAV_KEY='cardiacLog_favorites';

// ════════════════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════════════════
let currentDate=todayStr();
let fluidEntries=[],outputEntries=[],bmEntries=[],diureticEntries=[],mealSections=[],exerciseEntries=[];
let mealCounter=0,fluidCounter=0,outputCounter=0,diureticCounter=0,foodCounter=0,exerciseCounter=0;
let fluidNutrition={};
let noDiureticsToday=false;
let apiKey=localStorage.getItem(API_KEY_KEY)||'';
let saveTimer=null;
let chartRangeDays=0;

// ════════════════════════════════════════════════════════════════════════
// DATE / TIME UTILS
// ════════════════════════════════════════════════════════════════════════
function todayStr(){
  const d=new Date();
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0');
  const day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function fmtDateLabel(iso){
  const[y,m,d]=iso.split('-').map(Number);
  return new Date(y,m-1,d).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
}
function nowTime(){
  const n=new Date();
  return String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0');
}

// ════════════════════════════════════════════════════════════════════════
// DATE NAV
// ════════════════════════════════════════════════════════════════════════
function updateDateBar(){
  document.getElementById('dateLabelText').textContent=fmtDateLabel(currentDate);
  document.getElementById('datePicker').value=currentDate;
  const isToday=currentDate===todayStr();
  document.getElementById('todayBadge').style.display=isToday?'':'none';
  document.getElementById('jumpTodayBtn').style.display=isToday?'none':'';
}
function shiftDate(delta){
  const[y,m,d]=currentDate.split('-').map(Number);
  const dt=new Date(y,m-1,d);dt.setDate(dt.getDate()+delta);
  const today=new Date();today.setHours(0,0,0,0);
  if(dt>today)return;
  const yr=dt.getFullYear(),mo=String(dt.getMonth()+1).padStart(2,'0'),dy=String(dt.getDate()).padStart(2,'0');
  currentDate=`${yr}-${mo}-${dy}`;
  loadDay(currentDate);
}
function onDatePickerChange(){
  const val=document.getElementById('datePicker').value;
  if(!val||val>todayStr())return;
  currentDate=val;loadDay(currentDate);
}
function jumpToToday(){currentDate=todayStr();loadDay(currentDate);}

// ════════════════════════════════════════════════════════════════════════
// STORAGE — safe migration layer
// ════════════════════════════════════════════════════════════════════════
function getAllDays(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY))||{};}catch{return{};}}
function saveDay(dateKey,data){const all=getAllDays();all[dateKey]=data;localStorage.setItem(STORAGE_KEY,JSON.stringify(all));}
function loadDayData(dateKey){return getAllDays()[dateKey]||null;}

// Safely extend an old data object with new fields without overwriting anything
function migrateDay(state){
  if(!state)return null;
  // Ensure all new fields have safe defaults if missing — never overwrites existing values
  if(!state.exercise)state.exercise=[];
  if(!state.labs)state.labs={k:'',na:'',cr:'',bnp:'',tsh:'',ft4:'',events:''};
  if(state.labs&&state.labs.events===undefined)state.labs.events='';
  if(state.noDiureticsToday===undefined)state.noDiureticsToday=false;
  // Migrate old diuretic format: "Torsemide 60mg" → {drug:'Torsemide',dose:'60'}
  if(state.diuretics){
    state.diuretics=state.diuretics.map(d=>{
      if(!d.drug&&d.name){
        const match=d.name.match(/^(\w+)\s+(\d+)mg?$/i);
        if(match)return{time:d.time||'',drug:match[1],dose:match[2]};
        return{time:d.time||'',drug:d.name||'',dose:d.dose||''};
      }
      return d;
    });
  }
  return state;
}

// ════════════════════════════════════════════════════════════════════════
// COLLECT / RESTORE / CLEAR STATE
// ════════════════════════════════════════════════════════════════════════
function collectState(){
  const diuretics=diureticEntries.map(id=>({
    time:document.getElementById('diu-time-'+id)?.value||'',
    drug:document.getElementById('diu-drug-'+id)?.value||'',
    dose:document.getElementById('diu-dose-'+id)?.value||''
  }));
  const fluids=fluidEntries.map(id=>({
    oz:document.getElementById('fl-oz-'+id)?.value||'',
    name:document.getElementById('fl-name-'+id)?.value||'',
    nutrition:fluidNutrition[id]||null
  }));
  const outputs=outputEntries.map(id=>({
    time:document.getElementById('out-time-'+id)?.value||'',
    vol:document.getElementById('out-vol-'+id)?.value||'300'
  }));
  const bms=bmEntries.map(id=>({time:document.getElementById('bm-time-'+id)?.value||''}));
  const meals=mealSections.map(m=>({
    id:m.id,
    name:document.getElementById('meal-name-'+m.id)?.value||'',
    foods:m.foods.map(fid=>({
      fid,
      name:document.getElementById('food-name-'+fid)?.value||'',
      kcal:document.getElementById('food-kcal-'+fid)?.value||'',
      sod:document.getElementById('food-sod-'+fid)?.value||'',
      carb:document.getElementById('food-carb-'+fid)?.value||'',
      prot:document.getElementById('food-prot-'+fid)?.value||'',
      fat:document.getElementById('food-fat-'+fid)?.value||''
    }))
  }));
  const symptoms=Array.from(document.querySelectorAll('#symptomChecks input:checked')).map(el=>el.parentElement.textContent.trim());
  const exercise=getExerciseState();
  const labs={
    k:document.getElementById('labK')?.value||'',
    na:document.getElementById('labNa')?.value||'',
    cr:document.getElementById('labCr')?.value||'',
    bnp:document.getElementById('labBNP')?.value||'',
    tsh:document.getElementById('labTSH')?.value||'',
    ft4:document.getElementById('labFT4')?.value||'',
    events:document.getElementById('labEvents')?.value||''
  };
  return{
    weightAM:document.getElementById('weightAM').value||'',
    weightPrior:document.getElementById('weightPrior').value||'',
    edema:document.getElementById('edema').value||'',
    funcStatus:document.getElementById('funcStatus').value||'',
    symptoms,notes:document.getElementById('notesField').value||'',
    diuretics,noDiureticsToday,fluids,outputs,bms,meals,exercise,labs
  };
}

function restoreState(raw){
  const state=migrateDay(raw);
  clearForm();
  document.getElementById('weightAM').value=state.weightAM||'';
  document.getElementById('weightPrior').value=state.weightPrior||'';
  document.getElementById('edema').value=state.edema||'';
  document.getElementById('funcStatus').value=state.funcStatus||'';
  document.getElementById('notesField').value=state.notes||'';
  document.querySelectorAll('#symptomChecks input').forEach(cb=>{
    cb.checked=(state.symptoms||[]).includes(cb.parentElement.textContent.trim());
    cb.closest('.sym-chip').classList.toggle('checked',cb.checked);
  });
  noDiureticsToday=state.noDiureticsToday||false;
  updateNoDiuBtn();
  (state.diuretics||[]).forEach(d=>addDiuretic(d.drug||'',d.dose||'',d.time||''));
  (state.exercise||[]).forEach(e=>addExercise(e.type||'',e.duration||'',e.intensity||'Moderate'));
  if(state.labs){
    const L=state.labs;
    const flds=['k','na','cr','bnp','tsh','ft4'];
    flds.forEach(f=>{
      const key='lab'+f.charAt(0).toUpperCase()+f.slice(1);
      const el=document.getElementById(key);
      if(el&&L[f])el.value=L[f];
    });
    const evEl=document.getElementById('labEvents');if(evEl&&L.events)evEl.value=L.events;
    checkLabFlags();
  }
  (state.fluids||[]).forEach(f=>{
    const id=++fluidCounter;fluidEntries.push(id);
    const list=document.getElementById('fluidList');
    const div=document.createElement('div');div.className='fluid-entry';div.id='fl-'+id;
    div.innerHTML=buildFluidHTML(id);
    list.appendChild(div);
    document.getElementById('fl-oz-'+id).value=f.oz||'';
    document.getElementById('fl-name-'+id).value=f.name||'';
    if(f.nutrition){
      fluidNutrition[id]=f.nutrition;
      const badge=document.getElementById('fl-badge-'+id);
      badge.textContent=`${Math.round(f.nutrition.kcal||0)} kcal · ${Math.round(f.nutrition.sodium_mg||0)}mg Na`;
      badge.className='fl-badge has-data';
    }
  });
  (state.outputs||[]).forEach(o=>{
    const id=++outputCounter;outputEntries.push(id);
    const log=document.getElementById('outputLog');
    const row=document.createElement('div');row.className='output-entry';row.id='out-'+id;
    const opts=VOID_OPTIONS.map(v=>`<option value="${v.ml}">${v.label}</option>`).join('');
    row.innerHTML=`<input type="time" value="${o.time||''}" id="out-time-${id}" onchange="autosave()"><select class="vol-select" id="out-vol-${id}" onchange="updateBalance();autosave()">${opts}</select><span class="ml-badge" id="out-ml-${id}">— mL</span><button class="remove-btn" onclick="removeOutput(${id})">×</button>`;
    log.appendChild(row);
    document.getElementById('out-vol-'+id).value=o.vol||'300';
    syncMlBadge(id);
    document.getElementById('out-vol-'+id).addEventListener('change',()=>syncMlBadge(id));
  });
  (state.bms||[]).forEach(b=>{
    const id=Date.now()+Math.random();bmEntries.push(id);
    const list=document.getElementById('bmList');
    const span=document.createElement('span');span.id='bm-'+id;
    span.style.cssText='display:flex;align-items:center;gap:4px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:4px 8px;';
    span.innerHTML=`<input type="time" value="${b.time||''}" id="bm-time-${id}" style="background:transparent;border:none;font-size:13px;color:var(--text);outline:none;width:78px;font-family:'Inter',sans-serif;" onchange="autosave()"><button class="remove-btn" onclick="removeBM(${id})">×</button>`;
    list.appendChild(span);
  });
  (state.meals||[]).forEach(m=>{
    const id=++mealCounter;mealSections.push({id,foods:[]});
    const container=document.getElementById('mealSections');
    const sec=document.createElement('div');sec.className='meal-section';sec.id='meal-'+id;
    sec.innerHTML=`<div class="meal-header"><input value="${m.name||'Meal'}" id="meal-name-${id}" oninput="autosave()"><button class="remove-btn" style="font-size:12px;" onclick="removeMeal(${id})">Remove</button></div><div id="meal-foods-${id}"></div><button class="add-btn" onclick="addAIFood(${id})">+ Add item</button><hr class="meal-divider">`;
    container.appendChild(sec);
    (m.foods||[]).forEach(f=>{
      const fid=++foodCounter;
      const meal=mealSections.find(ms=>ms.id===id);if(meal)meal.foods.push(fid);
      const fdiv=document.createElement('div');fdiv.className='ai-food-entry';fdiv.id='food-'+fid;
      fdiv.innerHTML=buildAIFoodHTML(fid,f.name||'');
      document.getElementById('meal-foods-'+id).appendChild(fdiv);
      if(f.kcal)setFoodField(fid,'kcal',f.kcal);
      if(f.sod)setFoodField(fid,'sod',f.sod);
      if(f.carb)setFoodField(fid,'carb',f.carb);
      if(f.prot)setFoodField(fid,'prot',f.prot);
      if(f.fat)setFoodField(fid,'fat',f.fat);
      if(f.kcal||f.sod){document.getElementById('food-result-'+fid)?.classList.add('show');}
      if(f.carb||f.prot||f.fat){document.getElementById('food-macros-'+fid)?.classList.add('show');}
    });
  });
  updateDelta();updateBalance();updateNutritionTotals();updateCompletion();
}

function setFoodField(fid,field,val){
  const el=document.getElementById(`food-${field}-${fid}`);
  if(el){el.value=val;el.classList.add('filled');}
}

function clearForm(){
  fluidEntries=[];outputEntries=[];bmEntries=[];diureticEntries=[];mealSections=[];exerciseEntries=[];
  mealCounter=0;fluidCounter=0;outputCounter=0;diureticCounter=0;foodCounter=0;exerciseCounter=0;
  fluidNutrition={};noDiureticsToday=false;
  ['diureticLog','fluidList','outputLog','bmList','mealSections','exerciseLog'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.innerHTML='';
  });
  ['weightAM','weightPrior','edema','funcStatus','notesField','labK','labNa','labCr','labBNP','labTSH','labFT4','labEvents'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.value='';
  });
  document.querySelectorAll('.lab-field input').forEach(el=>el.classList.remove('flagged-low','flagged-high'));
  document.querySelectorAll('#symptomChecks input').forEach(cb=>{
    cb.checked=false;cb.closest('.sym-chip')?.classList.remove('checked');
  });
  const dd=document.getElementById('deltaDisplay');if(dd){dd.textContent='—';dd.className='delta-display';}
  const ra=document.getElementById('reportArea');if(ra)ra.style.display='none';
  const rb=document.getElementById('reportBlockedMsg');if(rb)rb.style.display='none';
  updateNoDiuBtn();
}

function loadDay(dateKey){
  updateDateBar();
  const saved=loadDayData(dateKey);
  clearForm();
  if(saved){
    restoreState(saved);
    setSaveStatus('saved',`Saved — ${fmtDateLabel(dateKey)}`);
  } else {
    addDiuretic();addFluid();addOutput();addMealSection();
    setSaveStatus('saved','New day — changes will auto-save');
  }
  drawWeightChart();
  updateProgressTab();
}

// ════════════════════════════════════════════════════════════════════════
// SAVE BAR
// ════════════════════════════════════════════════════════════════════════
function setSaveStatus(state,label){
  const s=document.getElementById('saveStatus');
  const t=document.getElementById('saveStatusText');
  s.className='save-status '+state;
  t.textContent=label;
}
function manualSave(){
  if(saveTimer)clearTimeout(saveTimer);saveTimer=null;
  saveDay(currentDate,collectState());
  drawWeightChart();updateProgressTab();
  const t=new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  setSaveStatus('saved',`Saved at ${t}`);
  const btn=document.getElementById('saveNowBtn');
  btn.innerHTML='✓ Saved';btn.classList.add('saved-flash');
  setTimeout(()=>{
    btn.innerHTML=`<svg width="12" height="11" viewBox="0 0 100 90" fill="white"><path d="M50 85 L10 40 C-5 22 5 0 25 0 C37 0 46 8 50 16 C54 8 63 0 75 0 C95 0 105 22 90 40 Z"/></svg> Save progress`;
    btn.classList.remove('saved-flash');
  },2000);
}
function autosave(){
  setSaveStatus('unsaved','Unsaved changes');
  if(saveTimer)clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{
    saveDay(currentDate,collectState());
    drawWeightChart();updateProgressTab();
    const t=new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
    setSaveStatus('saved',`Auto-saved at ${t}`);
  },800);
}

// ════════════════════════════════════════════════════════════════════════
// DAILY COMPLETION SYSTEM
// ════════════════════════════════════════════════════════════════════════
function getCompletionStatus(){
  let totalOz=0;
  fluidEntries.forEach(id=>{totalOz+=parseFloat(document.getElementById('fl-oz-'+id)?.value||0)||0;});
  const w=document.getElementById('weightAM')?.value;
  return {
    weight:!!(w&&parseFloat(w)>0),
    intake:totalOz>0,
    output:outputEntries.length>0,
    diuretics:diureticEntries.length>0||noDiureticsToday
  };
}

function updateCompletion(){
  const s=getCompletionStatus();
  const items=[
    {key:'weight',label:'Weight'},
    {key:'intake',label:'Intake'},
    {key:'output',label:'Output'},
    {key:'diuretics',label:'Diuretics'}
  ];
  const doneCount=items.filter(i=>s[i.key]).length;
  const pct=Math.round((doneCount/items.length)*100);
  document.getElementById('ccPct').textContent=pct+'%';
  document.getElementById('ccBarFill').style.width=pct+'%';
  const container=document.getElementById('ccItems');
  container.innerHTML=items.map(item=>{
    const done=s[item.key];
    return `<span class="cc-item ${done?'done':'miss'}">${done?'✔':'✖'} ${item.label}</span>`;
  }).join('');
}

// ════════════════════════════════════════════════════════════════════════
// COLLAPSIBLE SECTIONS
// ════════════════════════════════════════════════════════════════════════
function toggleCollapse(bodyId,btnId){
  const body=document.getElementById(bodyId);
  const btn=document.getElementById(btnId);
  if(!body||!btn)return;
  const isHidden=body.style.display==='none';
  body.style.display=isHidden?'block':'none';
  btn.classList.toggle('open',isHidden);
}

// ════════════════════════════════════════════════════════════════════════
// WEIGHT CHART
// ════════════════════════════════════════════════════════════════════════
function setChartRange(days,btn){
  chartRangeDays=days;
  document.querySelectorAll('.range-btn').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  drawWeightChart();
}

function drawWeightChart(){
  const all=getAllDays();
  const allEntries=Object.entries(all)
    .map(([d,s])=>({date:d,w:parseFloat(s.weightAM)}))
    .filter(e=>!isNaN(e.w)&&e.w>0)
    .sort((a,b)=>a.date.localeCompare(b.date));
  let entries=allEntries;
  if(chartRangeDays>0){
    const cutoff=new Date();cutoff.setDate(cutoff.getDate()-chartRangeDays);
    const yr=cutoff.getFullYear(),mo=String(cutoff.getMonth()+1).padStart(2,'0'),dy=String(cutoff.getDate()).padStart(2,'0');
    const cutoffStr=`${yr}-${mo}-${dy}`;
    entries=allEntries.filter(e=>e.date>=cutoffStr);
    if(entries.length===0)entries=allEntries.slice(-chartRangeDays);
  }
  const noDataMsg=document.getElementById('noDataMsg');
  const canvas=document.getElementById('weightChart');
  if(allEntries.length<1){
    noDataMsg.style.display='';canvas.style.display='none';
    document.getElementById('trendStats').innerHTML='';return;
  }
  noDataMsg.style.display='none';canvas.style.display='block';
  const latest=allEntries[allEntries.length-1].w;
  const prev=allEntries.length>1?allEntries[allEntries.length-2].w:null;
  const delta=prev!==null?(latest-prev):null;
  const inTarget=latest>=DRY_LOW&&latest<=DRY_HIGH;
  document.getElementById('trendStats').innerHTML=
    `<div class="trend-stat"><div class="ts-val">${latest.toFixed(1)}</div><div class="ts-lbl">Latest</div></div>`+
    (delta!==null?`<div class="trend-stat"><div class="ts-val" style="color:${delta<0?'var(--accent)':delta>0?'var(--alert)':'var(--text)'}">${delta>=0?'+':''}${delta.toFixed(1)}</div><div class="ts-lbl">vs prev</div></div>`:'')+
    `<div class="trend-stat"><div class="ts-val" style="color:${inTarget?'var(--accent)':'var(--amber)'}">${inTarget?'✓ On target':'⚠ Off target'}</div><div class="ts-lbl">Dry wt</div></div>`+
    `<div class="trend-stat"><div class="ts-val">${allEntries.length}</div><div class="ts-lbl">Days</div></div>`;
  const dpr=window.devicePixelRatio||1;
  const W=canvas.parentElement.clientWidth-20;
  const H=180;
  canvas.width=W*dpr;canvas.height=H*dpr;canvas.style.width=W+'px';canvas.style.height=H+'px';
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
  const PAD={top:16,right:14,bottom:38,left:44};
  const gW=W-PAD.left-PAD.right,gH=H-PAD.top-PAD.bottom;
  const visWeights=entries.map(e=>e.w);
  const allVals=[...visWeights,DRY_LOW,DRY_HIGH];
  const lo=Math.min(...allVals)-1.5,hi=Math.max(...allVals)+1.5;
  const range=hi-lo;
  const xOf=i=>PAD.left+(entries.length===1?gW/2:(i/(entries.length-1))*gW);
  const yOf=w=>PAD.top+gH-((w-lo)/range)*gH;
  const cs=getComputedStyle(document.documentElement);
  const cText3=cs.getPropertyValue('--text3').trim()||'#718096';
  const cBorderS=cs.getPropertyValue('--border').trim()||'rgba(0,0,0,0.08)';
  const cPrimary=cs.getPropertyValue('--primary').trim()||'#2f6f95';
  const cAccent=cs.getPropertyValue('--accent').trim()||'#4caf8d';
  const cAlert=cs.getPropertyValue('--alert').trim()||'#c0392b';
  // target band
  const bandY1=yOf(DRY_HIGH),bandY2=yOf(DRY_LOW);
  ctx.fillStyle='rgba(76,175,141,0.07)';ctx.fillRect(PAD.left,bandY1,gW,bandY2-bandY1);
  ctx.strokeStyle='rgba(76,175,141,0.25)';ctx.lineWidth=1;ctx.setLineDash([4,3]);
  ctx.beginPath();ctx.moveTo(PAD.left,bandY1);ctx.lineTo(PAD.left+gW,bandY1);ctx.stroke();
  ctx.beginPath();ctx.moveTo(PAD.left,bandY2);ctx.lineTo(PAD.left+gW,bandY2);ctx.stroke();
  ctx.setLineDash([]);
  // y-axis
  ctx.font='9.5px Inter,sans-serif';ctx.textAlign='right';
  for(let i=0;i<=5;i++){
    const w=lo+(range/5)*i;const y=yOf(w);
    ctx.fillStyle=cBorderS;ctx.fillRect(PAD.left,y,gW,0.5);
    ctx.fillStyle=cText3;ctx.fillText(w.toFixed(1),PAD.left-4,y+3.5);
  }
  // line + gradient fill
  if(entries.length>1){
    ctx.strokeStyle=cPrimary;ctx.lineWidth=2;ctx.lineJoin='round';
    ctx.beginPath();entries.forEach((e,i)=>{const x=xOf(i),y=yOf(e.w);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});ctx.stroke();
    ctx.beginPath();entries.forEach((e,i)=>{const x=xOf(i),y=yOf(e.w);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});
    ctx.lineTo(xOf(entries.length-1),PAD.top+gH);ctx.lineTo(xOf(0),PAD.top+gH);ctx.closePath();
    const fg=ctx.createLinearGradient(0,PAD.top,0,PAD.top+gH);
    fg.addColorStop(0,cPrimary+'20');fg.addColorStop(1,cPrimary+'04');
    ctx.fillStyle=fg;ctx.fill();
  }
  // dots + labels
  ctx.textAlign='center';
  const totalPts=entries.length;
  const maxLabels=Math.max(2,Math.floor(gW/36));
  const labelStep=totalPts<=maxLabels?1:Math.ceil(totalPts/maxLabels);
  const dotR=totalPts>80?1.2:totalPts>40?2:3;
  entries.forEach((e,i)=>{
    const x=xOf(i),y=yOf(e.w);
    const inTgt=e.w>=DRY_LOW&&e.w<=DRY_HIGH;
    const isActive=e.date===currentDate;
    ctx.beginPath();ctx.arc(x,y,isActive?5:dotR,0,Math.PI*2);
    ctx.fillStyle=inTgt?cAccent:cPrimary;ctx.fill();
    if(isActive){ctx.strokeStyle='white';ctx.lineWidth=1.5;ctx.stroke();}
    if(isActive||(totalPts<=16)){ctx.fillStyle=cText3;ctx.font='9.5px Inter,sans-serif';ctx.fillText(e.w.toFixed(1),x,y-9);}
    const showLabel=isActive||i===0||i===totalPts-1||(i%labelStep===0);
    if(showLabel){
      const[,mm,dd]=e.date.split('-');
      ctx.fillStyle=isActive?cPrimary:cText3;
      ctx.font=isActive?'bold 9.5px Inter,sans-serif':'9.5px Inter,sans-serif';
      ctx.fillText(`${parseInt(mm)}/${parseInt(dd)}`,x,H-PAD.bottom+13);
    }
  });
}

// ════════════════════════════════════════════════════════════════════════
// FORM HELPERS
// ════════════════════════════════════════════════════════════════════════
function initApiBanner(){
  const banner=document.getElementById('apiBanner');
  if(apiKey){
    banner.className='api-banner set';
    banner.innerHTML=`<span>✓ API key active — AI features enabled</span><button onclick="clearApiKey()" style="background:none;border:1px solid var(--accent);border-radius:6px;color:var(--accent);padding:4px 10px;font-size:12px;cursor:pointer;font-family:'Inter',sans-serif;">Change</button>`;
  }
}
function saveApiKey(){
  const val=document.getElementById('apiKeyInput')?.value.trim();
  if(!val||!val.startsWith('sk-')){alert('Key should start with sk-ant-...');return;}
  apiKey=val;localStorage.setItem(API_KEY_KEY,apiKey);initApiBanner();
}
function clearApiKey(){
  apiKey='';localStorage.removeItem(API_KEY_KEY);
  document.getElementById('apiBanner').className='api-banner';
  document.getElementById('apiBanner').innerHTML=`<span>Enter Anthropic API key to enable AI food logging and clinical note generation</span><input type="password" id="apiKeyInput" placeholder="sk-ant-..."><button onclick="saveApiKey()">Save</button>`;
}
initApiBanner();

// Build symptom chips
const sc=document.getElementById('symptomChecks');
SYMPTOMS.forEach(s=>{
  const chip=document.createElement('label');chip.className='sym-chip';
  chip.innerHTML=`<input type="checkbox" onchange="this.closest('.sym-chip').classList.toggle('checked',this.checked);autosave()"> ${s}`;
  sc.appendChild(chip);
});

function switchTab(name,btn){
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('active');
  btn.classList.add('active');
  if(name==='io')updateBalance();
  if(name==='nutrition'){updateNutritionTotals();renderDrinkNutritionSummary();}
  if(name==='vitals')setTimeout(drawWeightChart,50);
  if(name==='progress')updateProgressTab();
}

function updateDelta(){
  const am=parseFloat(document.getElementById('weightAM').value);
  const pr=parseFloat(document.getElementById('weightPrior').value);
  const el=document.getElementById('deltaDisplay');
  if(!isNaN(am)&&!isNaN(pr)){
    const d=am-pr;
    el.textContent=(d>=0?'+':'')+d.toFixed(1)+' lb';
    el.className='delta-display '+(d<0?'delta-neg':d>0?'delta-pos':'');
  } else {el.textContent='—';el.className='delta-display';}
}

// ════════════════════════════════════════════════════════════════════════
// DIURETICS
// ════════════════════════════════════════════════════════════════════════
function addDiuretic(prefillDrug='',prefillDose='',prefillTime=''){
  const id=++diureticCounter;diureticEntries.push(id);
  const log=document.getElementById('diureticLog');
  const row=document.createElement('div');row.className='diuretic-entry';row.id='diu-'+id;
  const t=prefillTime||nowTime();
  row.innerHTML=`<input type="time" value="${t}" id="diu-time-${id}" onchange="autosave()"><select class="diu-drug-select" id="diu-drug-${id}" onchange="autosave()">${DIURETIC_DRUGS.map(d=>`<option${d===prefillDrug?' selected':''}>${d}</option>`).join('')}</select><input type="number" class="diu-dose-input" placeholder="mg" min="1" step="1" value="${prefillDose}" id="diu-dose-${id}" oninput="autosave()"><span class="diu-dose-unit">mg</span><button class="remove-btn" onclick="removeDiuretic(${id})">×</button>`;
  log.appendChild(row);
}
function removeDiuretic(id){
  document.getElementById('diu-'+id)?.remove();
  diureticEntries=diureticEntries.filter(x=>x!==id);
  updateCompletion();autosave();
}
function toggleNoDiuretics(){
  noDiureticsToday=!noDiureticsToday;
  updateNoDiuBtn();updateCompletion();autosave();
}
function updateNoDiuBtn(){
  const btn=document.getElementById('noDiuBtn');
  if(!btn)return;
  if(noDiureticsToday){btn.textContent='✓ No diuretics today';btn.classList.add('active');}
  else{btn.textContent='Mark as: no diuretics today';btn.classList.remove('active');}
}

// ════════════════════════════════════════════════════════════════════════
// EXERCISE
// ════════════════════════════════════════════════════════════════════════
function addExercise(prefillType='',prefillDur='',prefillInt='Moderate'){
  const id=++exerciseCounter;exerciseEntries.push(id);
  const log=document.getElementById('exerciseLog');
  const row=document.createElement('div');row.className='exercise-entry';row.id='ex-'+id;
  const isStressTest=prefillType==='Stress test';
  row.innerHTML=`<select class="ex-type" id="ex-type-${id}" onchange="onExTypeChange(${id});autosave()">${EX_TYPES.map(t=>`<option${t===prefillType?' selected':''}>${t}</option>`).join('')}</select><input type="number" class="ex-dur" placeholder="min" min="1" step="1" value="${prefillDur}" id="ex-dur-${id}" oninput="autosave()"><select class="ex-int" id="ex-int-${id}" onchange="autosave()">${EX_INTENSITIES.map(i=>`<option${i===prefillInt?' selected':''}>${i}</option>`).join('')}</select>${isStressTest?'<span class="ex-flag">🫀 Cardiac test</span>':''}<button class="remove-btn" onclick="removeExercise(${id})">×</button>`;
  log.appendChild(row);
}
function onExTypeChange(id){
  const val=document.getElementById('ex-type-'+id)?.value;
  const row=document.getElementById('ex-'+id);
  const existing=row.querySelector('.ex-flag');
  if(val==='Stress test'&&!existing){const span=document.createElement('span');span.className='ex-flag';span.textContent='🫀 Cardiac test';row.insertBefore(span,row.lastChild);}
  else if(val!=='Stress test'&&existing)existing.remove();
}
function removeExercise(id){document.getElementById('ex-'+id)?.remove();exerciseEntries=exerciseEntries.filter(x=>x!==id);autosave();}
function getExerciseState(){
  return exerciseEntries.map(id=>({
    type:document.getElementById('ex-type-'+id)?.value||'',
    duration:document.getElementById('ex-dur-'+id)?.value||'',
    intensity:document.getElementById('ex-int-'+id)?.value||'Moderate'
  })).filter(e=>e.type);
}

// ════════════════════════════════════════════════════════════════════════
// LABS
// ════════════════════════════════════════════════════════════════════════
function checkLabFlags(){
  const k=parseFloat(document.getElementById('labK')?.value);
  const na=parseFloat(document.getElementById('labNa')?.value);
  const cr=parseFloat(document.getElementById('labCr')?.value);
  const kEl=document.getElementById('labK');
  const naEl=document.getElementById('labNa');
  const crEl=document.getElementById('labCr');
  if(kEl){kEl.classList.remove('flagged-low','flagged-high');if(!isNaN(k)){kEl.classList.toggle('flagged-low',k<3.5);kEl.classList.toggle('flagged-high',k>5.5);}}
  if(naEl){naEl.classList.remove('flagged-low','flagged-high');if(!isNaN(na)){naEl.classList.toggle('flagged-low',na<135);naEl.classList.toggle('flagged-high',na>145);}}
  if(crEl){crEl.classList.remove('flagged-low','flagged-high');if(!isNaN(cr))crEl.classList.toggle('flagged-high',cr>1.5);}
}

// ════════════════════════════════════════════════════════════════════════
// FLUID / I/O
// ════════════════════════════════════════════════════════════════════════
function buildFluidHTML(id){
  return `<div class="fl-row1"><input type="number" placeholder="oz" min="0" step="0.5" id="fl-oz-${id}" oninput="updateBalance();updateNutritionTotals();renderDrinkNutritionSummary();updateCompletion();autosave()" style="width:60px;"><input class="fl-name" placeholder="Drink name" id="fl-name-${id}" oninput="autosave()"></div><button onclick="lookupFluidNutrition(${id})" style="background:var(--primary-light);border:1px solid var(--primary);border-radius:var(--radius-sm);color:var(--primary);padding:5px 10px;font-size:12px;cursor:pointer;white-space:nowrap;flex-shrink:0;font-family:'Inter',sans-serif;" id="fl-lookup-${id}">Look up</button><span class="fl-badge" id="fl-badge-${id}">no data</span><button class="remove-btn" onclick="removeFluid(${id})">×</button>`;
}
function addFluid(){
  const id=++fluidCounter;fluidEntries.push(id);
  const list=document.getElementById('fluidList');
  const div=document.createElement('div');div.className='fluid-entry';div.id='fl-'+id;
  div.innerHTML=buildFluidHTML(id);
  list.appendChild(div);
}
function removeFluid(id){
  document.getElementById('fl-'+id)?.remove();
  fluidEntries=fluidEntries.filter(x=>x!==id);
  delete fluidNutrition[id];
  updateBalance();updateNutritionTotals();renderDrinkNutritionSummary();updateCompletion();autosave();
}
async function lookupFluidNutrition(id){
  if(!apiKey){alert('Add your Anthropic API key first.');return;}
  const name=document.getElementById('fl-name-'+id)?.value?.trim();
  const oz=document.getElementById('fl-oz-'+id)?.value;
  if(!name){alert('Enter a drink name first.');return;}
  const btn=document.getElementById('fl-lookup-'+id);btn.disabled=true;btn.textContent='...';
  const prompt=`Clinical nutrition database. Drink: "${name}"${oz?` (${oz} fl oz)`:''}.Return ONLY valid JSON: {"kcal":0,"sodium_mg":0,"carbs_g":0,"sugar_g":0,"protein_g":0,"fat_g":0,"confidence":"high|medium|low","source_note":"brief note"}`;
  try{
    const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:300,messages:[{role:'user',content:prompt}]})});
    const data=await res.json();
    const parsed=JSON.parse((data.content?.[0]?.text||'').replace(/```json|```/g,'').trim());
    fluidNutrition[id]=parsed;
    const badge=document.getElementById('fl-badge-'+id);
    badge.textContent=`${Math.round(parsed.kcal||0)} kcal · ${Math.round(parsed.sodium_mg||0)}mg Na`;
    badge.className='fl-badge has-data';
    updateNutritionTotals();renderDrinkNutritionSummary();updateBalance();autosave();
  }catch(e){alert('Lookup failed.');}
  btn.disabled=false;btn.textContent='Look up';
}

function ozToMl(oz){return Math.round(oz*29.5735);}
function updateBalance(){
  let totalOz=0;
  fluidEntries.forEach(id=>{totalOz+=parseFloat(document.getElementById('fl-oz-'+id)?.value||0)||0;});
  const intakeMl=ozToMl(totalOz);
  let totalOutMl=0;
  outputEntries.forEach(id=>{totalOutMl+=getVoidMl(id);});
  const net=intakeMl-totalOutMl;
  document.getElementById('balIn').textContent=intakeMl+' mL';
  document.getElementById('balOut').textContent=totalOutMl+' mL';
  const netEl=document.getElementById('balNet');
  netEl.textContent=(net>=0?'+':'')+net+' mL';
  netEl.className='bc-val '+(net<=0?'bc-negative':'bc-positive');
  const totEl=document.getElementById('intakeTotal');
  if(fluidEntries.length>0){
    totEl.innerHTML=`<span>Total: <strong>${Math.round(totalOz)} oz / ${intakeMl} mL</strong></span>`;
    totEl.style.display='';
  } else totEl.style.display='none';
}
function getVoidMl(id){return parseInt(document.getElementById('out-vol-'+id)?.value||0)||0;}
function syncMlBadge(id){const ml=getVoidMl(id);const b=document.getElementById('out-ml-'+id);if(b)b.textContent=ml+' mL';}
function addOutput(){
  const id=++outputCounter;outputEntries.push(id);
  const log=document.getElementById('outputLog');
  const row=document.createElement('div');row.className='output-entry';row.id='out-'+id;
  const opts=VOID_OPTIONS.map(v=>`<option value="${v.ml}">${v.label}</option>`).join('');
  row.innerHTML=`<input type="time" value="${nowTime()}" id="out-time-${id}" onchange="autosave()"><select class="vol-select" id="out-vol-${id}" onchange="updateBalance();updateCompletion();autosave()">${opts}</select><span class="ml-badge" id="out-ml-${id}">300 mL</span><button class="remove-btn" onclick="removeOutput(${id})">×</button>`;
  log.appendChild(row);
  document.getElementById('out-vol-'+id).value='300';
  syncMlBadge(id);
  document.getElementById('out-vol-'+id).addEventListener('change',()=>syncMlBadge(id));
  updateBalance();updateCompletion();
}
function removeOutput(id){
  document.getElementById('out-'+id)?.remove();
  outputEntries=outputEntries.filter(x=>x!==id);
  updateBalance();updateCompletion();autosave();
}
function addBM(){
  const id=Date.now();bmEntries.push(id);
  const list=document.getElementById('bmList');
  const span=document.createElement('span');span.id='bm-'+id;
  span.style.cssText='display:flex;align-items:center;gap:4px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:4px 8px;';
  span.innerHTML=`<input type="time" value="${nowTime()}" id="bm-time-${id}" style="background:transparent;border:none;font-size:13px;color:var(--text);outline:none;width:78px;font-family:'Inter',sans-serif;" onchange="autosave()"><button class="remove-btn" onclick="removeBM(${id})">×</button>`;
  list.appendChild(span);autosave();
}
function removeBM(id){document.getElementById('bm-'+id)?.remove();bmEntries=bmEntries.filter(x=>x!==id);autosave();}

// ════════════════════════════════════════════════════════════════════════
// AI FOOD ENTRY
// ════════════════════════════════════════════════════════════════════════
function buildAIFoodHTML(fid,prefillName=''){
  return `
  <div class="aife-top">
    <textarea class="aife-desc" id="food-name-${fid}" placeholder="Describe food/portion/restaurant — e.g. 'By Antidote scallion pancake 2 pieces' or 'half a Sprite 7.5oz can'" oninput="autosave()">${prefillName}</textarea>
    <div class="aife-actions">
      <label class="aife-photo-btn" title="Upload nutrition label or plate photo" for="food-photo-${fid}">📷</label>
      <input type="file" accept="image/*" class="aife-photo-input" id="food-photo-${fid}" onchange="handleFoodPhoto(${fid},this)">
      <img class="aife-photo-preview" id="food-photo-prev-${fid}" onclick="clearFoodPhoto(${fid})">
      <button class="ai-lookup-btn" id="food-lookup-btn-${fid}" onclick="aiLookupFood(${fid})">♥ AI</button>
      <button class="ai-lookup-btn" id="food-manual-btn-${fid}" onclick="toggleManualMode(${fid})" style="background:var(--surface2);color:var(--text2);border:1px solid var(--border);box-shadow:none;">✏️</button>
      <button class="remove-btn" onclick="removeFoodByFid(${fid})" style="font-size:19px;">×</button>
    </div>
  </div>
  <div class="aife-result" id="food-result-${fid}">
    <div class="aife-conf-row" id="food-conf-row-${fid}">
      <span class="conf-badge conf-med" id="food-conf-${fid}">—</span>
      <span class="aife-note" id="food-note-${fid}"></span>
    </div>
    <div class="aife-fields">
      <div class="aife-field"><label>kcal</label><input type="number" id="food-kcal-${fid}" placeholder="0" min="0" oninput="updateNutritionTotals();autosave()"></div>
      <div class="aife-field"><label>sodium (mg)</label><input type="number" id="food-sod-${fid}" placeholder="0" min="0" oninput="updateNutritionTotals();autosave()"></div>
    </div>
    <button class="aife-macros-toggle" onclick="toggleAIFoodMacros(${fid},this)">+ carbs / protein / fat</button>
    <div class="aife-macros" id="food-macros-${fid}">
      <div class="aife-field"><label>carbs (g)</label><input type="number" id="food-carb-${fid}" placeholder="0" min="0" step="0.5" oninput="updateNutritionTotals();autosave()"></div>
      <div class="aife-field"><label>protein (g)</label><input type="number" id="food-prot-${fid}" placeholder="0" min="0" step="0.5" oninput="updateNutritionTotals();autosave()"></div>
      <div class="aife-field"><label>fat (g)</label><input type="number" id="food-fat-${fid}" placeholder="0" min="0" step="0.5" oninput="updateNutritionTotals();autosave()"></div>
    </div>
  </div>`;
}

function toggleAIFoodMacros(fid,btn){
  const el=document.getElementById('food-macros-'+fid);
  el.classList.toggle('show');
  btn.textContent=el.classList.contains('show')?'− hide macros':'+ carbs / protein / fat';
}
function handleFoodPhoto(fid,input){
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{const prev=document.getElementById('food-photo-prev-'+fid);prev.src=e.target.result;prev.style.display='block';};
  reader.readAsDataURL(file);
}
function clearFoodPhoto(fid){
  const inp=document.getElementById('food-photo-'+fid);if(inp)inp.value='';
  const prev=document.getElementById('food-photo-prev-'+fid);if(prev){prev.src='';prev.style.display='none';}
}
function getFoodPhotoBase64(fid){
  const prev=document.getElementById('food-photo-prev-'+fid);
  if(!prev||!prev.src||prev.style.display==='none')return null;
  if(!prev.src.startsWith('data:image'))return null;
  return{base64:prev.src.split(',')[1],mediaType:prev.src.split(';')[0].split(':')[1]};
}
function toggleManualMode(fid){
  const result=document.getElementById('food-result-'+fid);
  const confRow=document.getElementById('food-conf-row-'+fid);
  const isShowing=result.classList.contains('show');
  if(!isShowing){
    result.classList.add('show');
    if(confRow)confRow.style.display='none';
    const btn=document.getElementById('food-manual-btn-'+fid);
    if(btn){btn.textContent='✏️ on';btn.style.background='var(--accent)';btn.style.color='white';btn.style.border='none';}
  } else {
    result.classList.remove('show');
    const btn=document.getElementById('food-manual-btn-'+fid);
    if(btn){btn.textContent='✏️';btn.style.background='var(--surface2)';btn.style.color='var(--text2)';btn.style.border='1px solid var(--border)';}
  }
}

async function aiLookupFood(fid){
  if(!apiKey){alert('Add your Anthropic API key first.');return;}
  const name=document.getElementById('food-name-'+fid)?.value?.trim();
  const photo=getFoodPhotoBase64(fid);
  if(!name&&!photo){alert('Describe the food or upload a photo first.');return;}
  const btn=document.getElementById('food-lookup-btn-'+fid);
  btn.disabled=true;btn.textContent='...';
  const jsonI=`Return ONLY valid JSON, no explanation, no markdown:
{"kcal":0,"sodium_mg":0,"carbs_g":0,"sugar_g":0,"protein_g":0,"fat_g":0,"confidence":"high|medium|low","source_note":"brief note","range_note":"optional range if uncertain","portion_note":"optional — scaling applied if any"}`;
  let messages;
  if(photo){
    messages=[{role:'user',content:[
      {type:'image',source:{type:'base64',media_type:photo.mediaType,data:photo.base64}},
      {type:'text',text:`Nutrition label or food photo.${name?' User says: "${name}"':''}\n\nINSTRUCTIONS:\n1. If nutrition label: read per-serving values carefully\n2. Check description for portion language (half, 2 servings, about a third, few bites) — scale values accordingly\n3. Return nutrition for ACTUAL AMOUNT CONSUMED\n4. Set confidence "high" if reading from a clear label\n\n${jsonI}`}
    ]}];
  } else {
    messages=[{role:'user',content:`Clinical nutrition assistant. Patient consumed: "${name}".\n\nINSTRUCTIONS:\n1. PORTION SCALING: Check for portion language (half, ate half, 1.5 servings, about a third, few bites, 2 pieces). Scale all values. Note in portion_note.\n2. BRANDED/PACKAGED: Use USDA FoodData Central or manufacturer label data.\n3. RESTAURANT: If named restaurant (By Antidote, Flying Monk, O-Ku, Rodney Scott's, Pirates House, Annie O's, Kiss Cafe, Ombra, Sandbar, Vinnie's Van Go Go, etc) use menu knowledge.\n4. HOME COOKING: If ingredients listed, sum components.\n5. CONFIDENCE: high=label/database, medium=well-known, low=estimate.\n\n${jsonI}`}];
  }
  try{
    const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:400,messages})});
    const data=await res.json();
    const parsed=JSON.parse((data.content?.[0]?.text||'').replace(/```json|```/g,'').trim());
    const fill=(field,val)=>{const el=document.getElementById(`food-${field}-${fid}`);if(el&&val!=null){el.value=Math.round(val*10)/10;el.classList.add('filled');}};
    fill('kcal',parsed.kcal);fill('sod',parsed.sodium_mg);fill('carb',parsed.carbs_g);fill('prot',parsed.protein_g);fill('fat',parsed.fat_g);
    if(parsed.carbs_g||parsed.protein_g||parsed.fat_g){
      document.getElementById('food-macros-'+fid)?.classList.add('show');
      const mb=document.querySelector(`[onclick="toggleAIFoodMacros(${fid},this)"]`);
      if(mb)mb.textContent='− hide macros';
    }
    document.getElementById('food-result-'+fid).classList.add('show');
    const cc=parsed.confidence==='high'?'conf-high':parsed.confidence==='medium'?'conf-med':'conf-low';
    const cb=document.getElementById('food-conf-'+fid);cb.textContent=parsed.confidence+' confidence';cb.className='conf-badge '+cc;
    const nb=document.getElementById('food-note-'+fid);
    nb.textContent=parsed.source_note+(parsed.range_note?' — '+parsed.range_note:'')+(parsed.portion_note?' · '+parsed.portion_note:'');
    // add save-as-favorite
    const resultDiv=document.getElementById('food-result-'+fid);
    if(!resultDiv.querySelector('.save-fav-btn')){
      const savBtn=document.createElement('button');savBtn.className='save-fav-btn';savBtn.textContent='⭐ Save as favorite';
      savBtn.onclick=()=>saveFavoriteFromFid(fid);resultDiv.appendChild(savBtn);
    }
    updateNutritionTotals();autosave();
  }catch(e){alert('Lookup failed — check API key or try again.');}
  btn.disabled=false;btn.innerHTML='♥ AI';
}

function addMealSection(){
  const id=++mealCounter;mealSections.push({id,foods:[]});
  const container=document.getElementById('mealSections');
  const sec=document.createElement('div');sec.className='meal-section';sec.id='meal-'+id;
  const mealName=MEAL_NAMES[(id-1)%MEAL_NAMES.length];
  sec.innerHTML=`<div class="meal-header"><input value="${mealName}" id="meal-name-${id}" oninput="autosave()"><button class="remove-btn" style="font-size:12px;" onclick="removeMeal(${id})">Remove</button></div><div id="meal-foods-${id}"></div><button class="add-btn" onclick="addAIFood(${id})">+ Add item</button><hr class="meal-divider">`;
  container.appendChild(sec);
}
function removeMeal(id){document.getElementById('meal-'+id)?.remove();mealSections=mealSections.filter(m=>m.id!==id);updateNutritionTotals();autosave();}
function addAIFood(mealId){
  const fid=++foodCounter;
  const meal=mealSections.find(m=>m.id===mealId);if(meal)meal.foods.push(fid);
  const container=document.getElementById('meal-foods-'+mealId);
  const div=document.createElement('div');div.className='ai-food-entry';div.id='food-'+fid;
  div.innerHTML=buildAIFoodHTML(fid);
  container.appendChild(div);
  div.querySelector('.aife-desc')?.focus();
}
function removeFoodByFid(fid){
  document.getElementById('food-'+fid)?.remove();
  mealSections.forEach(m=>{m.foods=m.foods.filter(f=>f!==fid);});
  updateNutritionTotals();autosave();
}
function getAllFoodIds(){return mealSections.flatMap(m=>m.foods);}

// ════════════════════════════════════════════════════════════════════════
// NUTRITION TOTALS — includes fluid nutrition (auto-sync per spec)
// ════════════════════════════════════════════════════════════════════════
function updateNutritionTotals(){
  let kcal=0,carb=0,prot=0,fat=0,sod=0;
  // meal foods
  getAllFoodIds().forEach(fid=>{
    kcal+=parseFloat(document.getElementById('food-kcal-'+fid)?.value||0)||0;
    carb+=parseFloat(document.getElementById('food-carb-'+fid)?.value||0)||0;
    prot+=parseFloat(document.getElementById('food-prot-'+fid)?.value||0)||0;
    fat+=parseFloat(document.getElementById('food-fat-'+fid)?.value||0)||0;
    sod+=parseFloat(document.getElementById('food-sod-'+fid)?.value||0)||0;
  });
  // fluid nutrition AUTO-SYNC — spec Part 9: drinks auto-feed nutrition totals
  Object.values(fluidNutrition).forEach(n=>{
    if(n){kcal+=n.kcal||0;carb+=n.carbs_g||0;prot+=n.protein_g||0;fat+=n.fat_g||0;sod+=n.sodium_mg||0;}
  });
  document.getElementById('totKcal').textContent=Math.round(kcal);
  document.getElementById('totSod').textContent=Math.round(sod)+' mg';
  document.getElementById('totCarb').textContent=Math.round(carb)+'g';
  document.getElementById('totProt').textContent=Math.round(prot)+'g';
  document.getElementById('totFat').textContent=Math.round(fat)+'g';
  const bar=document.getElementById('sodiumBar');const sodCard=document.getElementById('sodCard');
  bar.style.width=Math.min((sod/1500)*100,100)+'%';
  if(sod>1500){sodCard.className='ns-card sodium warn';bar.className='sodium-bar-fill over';}
  else if(sod>1200){sodCard.className='ns-card sodium';bar.className='sodium-bar-fill warn';}
  else{sodCard.className='ns-card sodium';bar.className='sodium-bar-fill';}
}

// Render "Drinks from Fluid Intake" subsection in Food tab
function renderDrinkNutritionSummary(){
  const section=document.getElementById('drinkNutritionSection');
  const list=document.getElementById('drinkNutritionList');
  if(!section||!list)return;
  const caloric=fluidEntries.filter(id=>fluidNutrition[id]&&(fluidNutrition[id].kcal||0)>0);
  if(caloric.length===0){section.style.display='none';return;}
  section.style.display='';
  list.innerHTML=caloric.map(id=>{
    const n=fluidNutrition[id];
    const name=document.getElementById('fl-name-'+id)?.value||'Drink';
    const oz=document.getElementById('fl-oz-'+id)?.value||'';
    return `<div class="drink-nut-item"><span class="dn-name">${name}${oz?' ('+oz+' oz)':''}</span><span class="dn-stats">${Math.round(n.kcal||0)} kcal · ${Math.round(n.sodium_mg||0)}mg Na</span></div>`;
  }).join('');
}

function toggleMacroDetail(btn){
  const el=document.getElementById('macroDetailRow');
  const hidden=el.style.display==='none';
  el.style.display=hidden?'grid':'none';
  btn.textContent=hidden?'hide carbs / protein / fat':'show carbs / protein / fat';
}
function getCheckedSymptoms(){
  return Array.from(document.querySelectorAll('#symptomChecks input:checked')).map(el=>el.parentElement.textContent.trim());
}

// ════════════════════════════════════════════════════════════════════════
// SAVED FAVORITES
// ════════════════════════════════════════════════════════════════════════
function getFavorites(){try{return JSON.parse(localStorage.getItem(FAV_KEY))||[];}catch{return[];}}
function saveFavorites(favs){localStorage.setItem(FAV_KEY,JSON.stringify(favs));}
function saveFavoriteFromFid(fid){
  const name=document.getElementById('food-name-'+fid)?.value?.trim();
  if(!name){alert('Add a food name first.');return;}
  const fav={id:Date.now(),name,
    kcal:document.getElementById('food-kcal-'+fid)?.value||'0',
    sod:document.getElementById('food-sod-'+fid)?.value||'0',
    carb:document.getElementById('food-carb-'+fid)?.value||'0',
    prot:document.getElementById('food-prot-'+fid)?.value||'0',
    fat:document.getElementById('food-fat-'+fid)?.value||'0'
  };
  const favs=getFavorites();
  if(favs.some(f=>f.name.toLowerCase()===name.toLowerCase())){alert(`"${name}" already in favorites.`);return;}
  favs.push(fav);saveFavorites(favs);renderFavList();
  const btn=document.querySelector(`button[onclick="saveFavoriteFromFid(${fid})"]`);
  if(btn){btn.textContent='✓ Saved!';setTimeout(()=>btn.textContent='⭐ Save as favorite',2000);}
}
function deleteFavorite(id){const favs=getFavorites().filter(f=>f.id!==id);saveFavorites(favs);renderFavList();}
function applyFavoriteToCurrentMeal(fav){
  if(mealSections.length===0)addMealSection();
  const mealId=mealSections[mealSections.length-1].id;
  const fid=++foodCounter;
  const meal=mealSections.find(m=>m.id===mealId);if(meal)meal.foods.push(fid);
  const container=document.getElementById('meal-foods-'+mealId);
  const div=document.createElement('div');div.className='ai-food-entry';div.id='food-'+fid;
  div.innerHTML=buildAIFoodHTML(fid,fav.name);
  container.appendChild(div);
  setFoodField(fid,'kcal',fav.kcal);setFoodField(fid,'sod',fav.sod);
  setFoodField(fid,'carb',fav.carb);setFoodField(fid,'prot',fav.prot);setFoodField(fid,'fat',fav.fat);
  if(parseFloat(fav.carb)||parseFloat(fav.prot)||parseFloat(fav.fat)){
    document.getElementById('food-macros-'+fid)?.classList.add('show');
  }
  document.getElementById('food-result-'+fid).classList.add('show');
  updateNutritionTotals();autosave();
  // switch to nutrition tab
  document.querySelectorAll('.tab-btn').forEach(b=>{if(b.textContent.includes('Food'))b.click();});
}
function renderFavList(){
  const container=document.getElementById('favList');if(!container)return;
  const query=(document.getElementById('favSearch')?.value||'').toLowerCase();
  const favs=getFavorites().filter(f=>!query||f.name.toLowerCase().includes(query));
  if(favs.length===0){container.innerHTML=`<div class="fav-empty">${query?'No matches.':'No saved foods yet. Use "Save as favorite" after a lookup.'}</div>`;return;}
  container.innerHTML='';
  favs.forEach(fav=>{
    const item=document.createElement('div');item.className='fav-item';
    item.innerHTML=`<div class="fi-name">${fav.name}</div><div class="fi-stats">${fav.kcal} kcal · ${fav.sod}mg Na</div><button class="fi-del" onclick="event.stopPropagation();deleteFavorite(${fav.id})">×</button>`;
    item.addEventListener('click',()=>applyFavoriteToCurrentMeal(fav));
    container.appendChild(item);
  });
}
function toggleFavPanel(btn){
  const panel=document.getElementById('favPanel');
  const showing=panel.style.display!=='none';
  panel.style.display=showing?'none':'block';
  btn.textContent=showing?'⭐ Browse saved foods':'⭐ Hide saved foods';
  if(!showing)renderFavList();
}

// ════════════════════════════════════════════════════════════════════════
// PROGRESS TAB
// ════════════════════════════════════════════════════════════════════════
function updateProgressTab(){
  const all=getAllDays();
  const today=loadDayData(currentDate);
  const w=today?parseFloat(today.weightAM):NaN;

  // dry weight gap bar
  const gapEl=document.getElementById('dwGapNumber');
  const subEl=document.getElementById('dwGapSub');
  const barFill=document.getElementById('dwBarFill');
  document.getElementById('noteDate').textContent=fmtDateLabel(currentDate);

  if(!isNaN(w)&&w>0){
    const gap=w-127.5;
    const absGap=Math.abs(gap);
    if(w>=DRY_LOW&&w<=DRY_HIGH){
      gapEl.textContent='✓ In range';gapEl.className='dw-gap-number good';
      subEl.textContent=`${w.toFixed(1)} lb — within 126–129 lb target`;
    } else if(gap>0){
      gapEl.textContent=`+${gap.toFixed(1)} lb`;gapEl.className=`dw-gap-number ${gap>4?'bad':'warn'}`;
      subEl.textContent=`${w.toFixed(1)} lb — ${gap.toFixed(1)} lb above target`;
    } else {
      gapEl.textContent=`${gap.toFixed(1)} lb`;gapEl.className='dw-gap-number good';
      subEl.textContent=`${w.toFixed(1)} lb — ${absGap.toFixed(1)} lb below target`;
    }
    const barMin=120,barMax=155,barRange=barMax-barMin;
    barFill.style.width=Math.max(0,Math.min(100,((w-barMin)/barRange)*100))+'%';
    barFill.style.background=w>=DRY_LOW&&w<=DRY_HIGH?'var(--accent)':w>DRY_HIGH?'var(--amber-mid)':'var(--primary)';
    const zone=document.getElementById('dwTargetZone');
    zone.style.left=Math.max(0,((DRY_LOW-barMin)/barRange)*100)+'%';
    zone.style.width=((DRY_HIGH-DRY_LOW)/barRange)*100+'%';
  } else {
    gapEl.textContent='—';gapEl.className='dw-gap-number';
    subEl.textContent='Enter today\'s weight to see';barFill.style.width='0%';
  }

  // prediction engine
  const entries=Object.entries(all).map(([d,s])=>({date:d,w:parseFloat(s.weightAM),data:s})).filter(e=>!isNaN(e.w)&&e.w>0).sort((a,b)=>a.date.localeCompare(b.date));
  if(entries.length>=3){
    const recent=entries.slice(-7);
    const n=recent.length;
    const sumX=recent.reduce((s,_,i)=>s+i,0),sumY=recent.reduce((s,e)=>s+e.w,0);
    const sumXY=recent.reduce((s,e,i)=>s+i*e.w,0),sumX2=recent.reduce((s,_,i)=>s+i*i,0);
    const slope=(n*sumXY-sumX*sumY)/(n*sumX2-sumX*sumX);
    const intercept=(sumY-slope*sumX)/n;
    let predicted=intercept+slope*n;
    const trend7=entries.length>=7?(entries[entries.length-1].w-entries[entries.length-7].w):slope*7;
    const modifiers=[];let adj=0;
    // sodium
    let todaySod=0;
    if(today?.meals){today.meals.forEach(m=>(m.foods||[]).forEach(f=>todaySod+=parseFloat(f.sod||0)||0));}
    if(today?.fluids){today.fluids.forEach(f=>{if(f.nutrition)todaySod+=f.nutrition.sodium_mg||0;});}
    if(todaySod>3000){adj+=0.8;modifiers.push(`High Na (${Math.round(todaySod)}mg) → est. +0.5–1.0 lb fluid retention`);}
    else if(todaySod>2000){adj+=0.4;modifiers.push(`Elevated Na (${Math.round(todaySod)}mg) → mild retention expected`);}
    else if(todaySod>0&&todaySod<1000){adj-=0.2;modifiers.push(`Low Na day (${Math.round(todaySod)}mg) → favorable`);}
    // liquid carbs
    let liquidCarbs=0;
    Object.values(fluidNutrition).forEach(n=>{if(n)liquidCarbs+=n.carbs_g||0;});
    if(liquidCarbs>40){adj+=0.2;modifiers.push(`Liquid carbs ${Math.round(liquidCarbs)}g → possible transient glycogen-related increase`);}
    // I/O
    let totalOz=0,totalOutMl=0;
    if(today?.fluids)today.fluids.forEach(f=>totalOz+=parseFloat(f.oz||0)||0);
    if(today?.outputs)today.outputs.forEach(o=>totalOutMl+=parseInt(o.vol||0)||0);
    const netMl=Math.round(totalOz*29.5735)-totalOutMl;
    if(netMl>800){adj+=0.3;modifiers.push(`Net +I/O (~+${netMl}mL) → mild retention`);}
    else if(netMl<-500){adj-=0.3;modifiers.push(`Net −I/O (~${netMl}mL) → adequate diuresis`);}
    // exercise
    const exercise=today?.exercise||getExerciseState();
    if(exercise?.length>0){
      const hasStressTest=exercise.some(e=>e.type==='Stress test');
      const hasVigorous=exercise.some(e=>e.intensity==='Vigorous'||e.intensity==='Maximal');
      const totalMins=exercise.reduce((s,e)=>s+parseInt(e.duration||0),0);
      if(hasStressTest){adj-=0.5;modifiers.push('Stress test → transient dip from exertion/sweat');}
      else if(hasVigorous&&totalMins>30){adj-=0.3;modifiers.push(`Vigorous exercise ${totalMins}min → fluid loss effect`);}
    }
    predicted+=adj;
    const diff=predicted-(isNaN(w)?entries[entries.length-1].w:w);
    const confidence=modifiers.length>0?'moderate':'low';
    document.getElementById('predWeight').textContent=predicted.toFixed(1)+' lb';
    document.getElementById('predTrend').textContent=(trend7>=0?'+':'')+trend7.toFixed(1)+' lb';
    document.getElementById('predTrend').style.color=trend7<0?'var(--accent)':trend7>1?'var(--alert)':'var(--text)';
    const baseText=`${recent.length}-day trend: ${slope>=0?'+':''}${slope.toFixed(2)} lb/day. Predicted ${diff>=0?'+':''}${diff.toFixed(1)} lb from today. Confidence: ${confidence}.`;
    const modText=modifiers.length>0?' Factors: '+modifiers.join('; '):slope<0?' Downward trajectory — diuresis effective.':Math.abs(slope)<0.1?' Weight stable.':' Upward trajectory — monitor volume.';
    document.getElementById('predRationale').textContent=baseText+modText;
  } else {
    document.getElementById('predWeight').textContent='—';
    document.getElementById('predTrend').textContent='—';
    document.getElementById('predRationale').textContent='Log at least 3 days of weight data to generate a prediction.';
  }

  // sodium scorecard
  const sodContainer=document.getElementById('sodDays');sodContainer.innerHTML='';
  const last14=[];for(let i=13;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const yr=d.getFullYear(),mo=String(d.getMonth()+1).padStart(2,'0'),dy=String(d.getDate()).padStart(2,'0');last14.push(`${yr}-${mo}-${dy}`);}
  last14.forEach(date=>{
    const dd=all[date];let sod=0;
    if(dd?.meals)dd.meals.forEach(m=>(m.foods||[]).forEach(f=>sod+=parseFloat(f.sod||0)||0));
    if(dd?.fluids)dd.fluids.forEach(f=>{if(f.nutrition)sod+=f.nutrition.sodium_mg||0;});
    const hasSod=sod>0;const pct=sod===0?0:Math.min(100,(sod/2500)*100);
    const[,mm,dyy]=date.split('-');const isToday=date===todayStr();
    const div=document.createElement('div');div.className='sod-day'+(isToday?' today':'');
    div.innerHTML=`<div class="sd-bar-wrap"><div class="sd-bar" style="height:${pct}%;background:${sod===0?'var(--surface3)':sod<1500?'var(--accent)':sod<2000?'var(--amber-mid)':'var(--alert)'}"></div></div><div class="sd-date">${parseInt(mm)}/${parseInt(dyy)}</div>${hasSod?`<div class="sd-mg">${Math.round(sod)}</div>`:''}`;
    sodContainer.appendChild(div);
  });

  generateClinicalNote();
}

// ════════════════════════════════════════════════════════════════════════
// CLINICAL NOTE — full ACHD case context
// ════════════════════════════════════════════════════════════════════════
function generateClinicalNote(){
  const all=getAllDays();
  const today=loadDayData(currentDate);
  const noteEl=document.getElementById('clinicalNote');if(!noteEl)return;
  if(!today){noteEl.textContent='No data logged for this date.';return;}
  noteEl.textContent='Generating...';
  const w=parseFloat(today.weightAM)||null;
  const wPrior=parseFloat(today.weightPrior)||null;
  const wDelta=w&&wPrior?w-wPrior:null;
  const edema=today.edema||'Not assessed';
  const func=today.funcStatus||'Not assessed';
  const symptoms=(today.symptoms||[]);
  const notes=today.notes||'';
  const labEvents=today.labs?.events||'';
  const labK=today.labs?.k,labNa=today.labs?.na,labCr=today.labs?.cr;
  const labBNP=today.labs?.bnp,labTSH=today.labs?.tsh,labFT4=today.labs?.ft4;
  const diuLines=(today.diuretics||[]).map(d=>`${d.drug||d.name||''} ${d.dose||''}mg at ${d.time||'—'}`).filter(Boolean);
  let totalOz=0;(today.fluids||[]).forEach(f=>totalOz+=parseFloat(f.oz||0)||0);
  const intakeMl=Math.round(totalOz*29.5735);
  let totalOutMl=0;(today.outputs||[]).forEach(o=>totalOutMl+=parseInt(o.vol||0)||0);
  const netMl=intakeMl-totalOutMl;
  let kcal=0,sod=0,prot=0,liquidCarbs=0;
  (today.meals||[]).forEach(m=>(m.foods||[]).forEach(f=>{kcal+=parseFloat(f.kcal||0)||0;sod+=parseFloat(f.sod||0)||0;prot+=parseFloat(f.prot||0)||0;}));
  (today.fluids||[]).forEach(f=>{if(f.nutrition){kcal+=f.nutrition.kcal||0;sod+=f.nutrition.sodium_mg||0;liquidCarbs+=f.nutrition.carbs_g||0;}});
  const exercise=(today.exercise||[]);
  const entries=Object.entries(all).map(([d,s])=>({date:d,w:parseFloat(s.weightAM)})).filter(e=>!isNaN(e.w)&&e.w>0).sort((a,b)=>a.date.localeCompare(b.date));
  const last7=entries.slice(-7);let slope7=null;
  if(last7.length>=3){const n=last7.length;const sumX=last7.reduce((s,_,i)=>s+i,0),sumY=last7.reduce((s,e)=>s+e.w,0),sumXY=last7.reduce((s,e,i)=>s+i*e.w,0),sumX2=last7.reduce((s,_,i)=>s+i*i,0);slope7=(n*sumXY-sumX*sumY)/(n*sumX2-sumX*sumX);}

  const SYSTEM=`You are a senior cardiologist / ACHD specialist writing a daily outpatient-equivalent progress note. Write exactly as a cardiology fellow or attending would document. Use standard abbreviations (s/p, c/b, w/, w/o, prn, d/c, QD, BID, RVR, NSR, SVT, AT, AF, HFpEF, ACHD, etc.), precise clinical language, organized note structure. No preamble. No "here is your note." Go straight into the note.

FULL CASE SUMMARY:
28 y.o. male
Dx: Shone complex — congenital aortic stenosis + parachute mitral valve / ACHD / HFpEF / Paroxysmal AF/AT / Hypothyroidism s/p total thyroidectomy 12/8/2025 / ICD (2012)

SURGICAL HISTORY (3 sternotomies):
• BAV ×2 (1997, 1998, BCH) + rescue atrial septostomy (1997)
• Surgical AR repair (1999, BCH)
• t-AVR (21mm Magna) + MV repair + annuloplasty (BCH)
• Ross/Konno + MAZE + EFE resection (Bacha, 9/2024, CUMC) — c/b difficulty weaning from bypass, biventricular failure, slow wean of RV/LV support, recurrent paroxysmal AF w/ RVR

ICD/EP HISTORY:
• ICD implant 2012. Inappropriate shocks (2022, 7/2024, 9/2025 — at least one confirmed AF)
• 9/8–13/2025 ablation: PVI + CTI + vein of Marshall. Persistent peri-mitral flutter not ablated (mitral ring)
• 9/27–10/6/2025: ICD shocks ×7, thyrotoxicosis (amiodarone-related ± dye). IV diltiazem → hypotension. Converted NSR. Metoprolol → propranolol. Methimazole + prednisone started.
• 10/16–18/2025: Second ablation — mitral isthmus (transseptal), peri-SVC, CTI, PVI. Multiple micro-reentrant circuits.

THYROID: Previous amiodarone thyrotoxicosis + dye thyroiditis. 12/8/2025: total thyroidectomy (uncomplicated). Levo started 12/9. TSH course: 1.6 (12/16) → 9.86 (12/18) → 7.27 (1/30) → 9.93 (2/13). Dose adjusted multiple times. Current: levo 75mcg 6×/wk (~3/30/2026).

STEROIDS: Prednisone peak ~50mg (9/27/2025). Tapered → hydrocortisone → d/c 1/27/2026. Residual weight above dry weight target attributed to steroid effects still resolving.

CURRENT MEDS: Tikosyn 250mcg BID, Xarelto 20mg QD PM, Propranolol XL 240mg, Digoxin 125mcg, Torsemide variable dose, Eplerenone 75mg BID, Losartan 12.5mg, Jardiance 10mg, KCl 100mEq/day, Levo 75mcg 6×/wk, Pantoprazole 40mg, Cymbalta 20mg BID, Vit D2 50K IU weekly.

VOLUME MGMT: Dry weight target 126–129 lb. Na target <1,500 mg/day. No fluid restriction. Daily AM weights.

TODAY'S DATA:
Date: ${fmtDateLabel(currentDate)}
Weight: AM ${w?w.toFixed(1)+' lb':'not recorded'}, prior ${wPrior?wPrior.toFixed(1)+' lb':'not recorded'}, delta ${wDelta!==null?(wDelta>=0?'+':'')+wDelta.toFixed(1)+' lb':'—'}
7-day slope: ${slope7!==null?(slope7>=0?'+':'')+slope7.toFixed(2)+' lb/day (n='+last7.length+')':'insufficient data'}
vs mid-target (127.5 lb): ${w?(w-127.5>=0?'+':'')+(w-127.5).toFixed(1)+' lb':'—'}
Diuretics: ${diuLines.length?diuLines.join('; '):'none logged'}
Intake: ${Math.round(totalOz)} fl oz (${intakeMl} mL), UO: ~${totalOutMl} mL, Net: ${netMl>=0?'+':''}${netMl} mL
BMs: ${(today.bms||[]).length||'none logged'}
Nutrition: ~${Math.round(kcal)} kcal, Na ~${Math.round(sod)} mg, protein ~${Math.round(prot)} g, liquid carbs ~${Math.round(liquidCarbs)} g
Symptoms: ${symptoms.length?symptoms.join(', '):'none reported'}
Edema: ${edema}, Functional status: ${func}
Activity: ${exercise.length?exercise.map(e=>e.type+(e.duration?' '+e.duration+'min':'')+' ('+e.intensity+')').join('; '):'none'}
Labs: ${[labK?'K '+labK:'',labNa?'Na '+labNa:'',labCr?'Cr '+labCr:'',labBNP?'BNP '+labBNP:'',labTSH?'TSH '+labTSH:'',labFT4?'FT4 '+labFT4:''].filter(Boolean).join(', ')||'none'}
Clinical events: ${labEvents||'none'}
Notes: ${notes||'none'}

Write SUBJECTIVE / OBJECTIVE / ASSESSMENT / PLAN.
ASSESSMENT: address volume status + weight trajectory vs dry target, diuresis adequacy, sodium compliance impact, thyroid/levo status if relevant, arrhythmia if symptoms/events, any flagged labs. Use specific clinical reasoning referencing this patient's ACHD/surgical history.
PLAN: numbered, actionable, specific to today's data. Include diuretic guidance, Na target, escalation threshold, thyroid/EP follow-up if relevant.
350–500 words. Attending-level precision.`;

  if(!apiKey){
    noteEl.textContent=generateClinicalNoteTemplate(w,wPrior,wDelta,slope7,intakeMl,totalOutMl,netMl,sod,kcal,prot,edema,func,symptoms,diuLines,labK,labNa,labCr,labBNP,labTSH,exercise,notes,labEvents);
    return;
  }
  fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
    body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:1000,messages:[{role:'user',content:SYSTEM}]})
  }).then(r=>r.json()).then(data=>{
    noteEl.textContent=data.content?.[0]?.text||'Error generating note.';
  }).catch(()=>{
    noteEl.textContent=generateClinicalNoteTemplate(w,wPrior,wDelta,slope7,intakeMl,totalOutMl,netMl,sod,kcal,prot,edema,func,symptoms,diuLines,labK,labNa,labCr,labBNP,labTSH,exercise,notes,labEvents);
  });
}

function generateClinicalNoteTemplate(w,wPrior,wDelta,slope7,intakeMl,outMl,netMl,sod,kcal,prot,edema,func,symptoms,diuLines,labK,labNa,labCr,labBNP,labTSH,exercise,notes,labEvents){
  const dateStr=fmtDateLabel(currentDate);
  const gap=w?w-127.5:null;
  const sodStatus=sod>2000?'significantly above 2,000mg — excess Na likely driving retention':sod>1500?'above 1,500mg daily target':sod>0?'within target (<1,500mg)':'not recorded';
  const netStr=netMl>500?'net positive — warrants monitoring':netMl<-500?'net negative — adequate diuretic response':'near-even';
  const trendStr=slope7!==null?(slope7<-0.1?'downward trajectory consistent with effective diuresis':slope7>0.1?'upward trajectory — fluid accumulation likely':'weight stable over observed interval'):'insufficient data for trend analysis';
  const volStr=gap!==null?(gap>4?'significantly above dry weight — clinically meaningful hypervolemia; residual steroid-related volume overload on background of HFpEF':gap>2?'moderately above dry weight — volume overload probable':gap>0?'mildly above target — borderline; trend monitoring warranted':gap===0?'at dry weight target — euvolemic':gap<-2?'below dry weight range — assess for intravascular depletion':'near dry weight — volume status appropriate'):'weight not recorded';

  return `PROGRESS NOTE — ${dateStr}
28M — Shone complex / ACHD / HFpEF / s/p Ross-Konno+MAZE (9/2024) / s/p total thyroidectomy (12/2025) / Paroxysmal AF on Tikosyn / ICD

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUBJECTIVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${symptoms.length?'Pt reports: '+symptoms.join(', '):notes||'No acute complaints volunteered.'} ${notes&&symptoms.length?'\nNotes: '+notes:''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OBJECTIVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Weight:      ${w?w.toFixed(1)+' lb':'not recorded'} (${wDelta!==null?(wDelta>=0?'+':'')+wDelta.toFixed(1)+' lb from prior':'prior not recorded'})
Dry weight:  126–129 lb target (${gap!==null?(gap>=0?'+':'')+gap.toFixed(1)+' lb from mid-target':'—'})
7-day slope: ${slope7!==null?(slope7>=0?'+':'')+slope7.toFixed(2)+' lb/day':'insufficient data'}
Edema:       ${edema}
NYHA class:  ${func||'not assessed'}

Diuretics:
${diuLines.length?diuLines.map(d=>'  '+d).join('\n'):'  None logged'}

I/O:
  Intake:  ${Math.round(intakeMl/29.5735)} fl oz (${intakeMl} mL)
  UO:      ~${outMl} mL (estimated)
  Net:     ${netMl>=0?'+':''}${netMl} mL (${netStr})

Nutrition:
  Calories: ~${Math.round(kcal)} kcal
  Sodium:   ~${Math.round(sod)} mg (${sodStatus})
  Protein:  ~${Math.round(prot)} g

Labs: ${[labK?'K '+labK+' mEq/L'+(parseFloat(labK)<3.5?' [LOW]':parseFloat(labK)>5.5?' [HIGH]':''):'',labNa?'Na '+labNa+' mEq/L':'',labCr?'Cr '+labCr+' mg/dL'+(parseFloat(labCr)>1.5?' [↑]':''):'',labBNP?'BNP '+labBNP:'',labTSH?'TSH '+labTSH+' mIU/L':''].filter(Boolean).join(' | ')||'None'}
Activity: ${exercise.length?exercise.map(e=>e.type+(e.duration?' '+e.duration+'min':'')+' ('+e.intensity+')').join('; '):'None logged'}
${labEvents?'Clinical events: '+labEvents:''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ASSESSMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Volume status: ${volStr}. Weight ${trendStr}. In context of HFpEF s/p Ross-Konno (9/2024) c/b biventricular failure; residual steroid-related weight burden (hydrocortisone d/c 1/27/2026) still likely contributing to weight above target.

2. Diuresis: ${outMl>800?'UO suggests adequate diuretic response.':outMl>0?'UO logged; response may be subtherapeutic — assess dose timing.':'UO not logged — cannot assess response.'} Net I/O ${netStr}.

3. Sodium: ${sodStatus}. ${sod>1500?'Excess Na likely driving fluid retention — reinforce strict restriction.':'Na adherence supports volume goals.'}

4. Thyroid: s/p total thyroidectomy 12/8/2025, on levo 75mcg 6×/wk (dose adjusted per TSH course since 12/2025). ${labTSH?'TSH today: '+labTSH+' mIU/L — review trend w/ endocrinology.':'TSH not checked today — monitor per endo schedule.'} Fatigue/cold intolerance may reflect thyroid disequilibrium vs volume-related sx.

5. Arrhythmia: Paroxysmal AF/AT on Tikosyn 250mcg BID + Propranolol XL 240mg + Digoxin 125mcg + Xarelto. ICD active. ${symptoms.includes('Palpitations')?'Palpitations reported today — consider reviewing remote ICD transmission.':'No palpitations reported.'}

6. Functional status: ${func||'not formally assessed today'}.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PLAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Torsemide: Continue ${diuLines.length?diuLines[0]:'current regimen'}. ${gap!==null&&gap>2?'Weight above target — consider uptitrating PM dose if no improvement by AM.':'Reassess if weight rises >2 lb over 24–48h.'}
2. Na target: <1,500 mg/day strictly. ${sod>1500?'Today exceeded target — strict restriction tomorrow.':'Maintain adherence.'}
3. Daily AM weights — contact ACHD team if ≥2 lb above today's reading.
4. Levo 75mcg 6×/wk — continue. TSH/FT4 per endocrinology schedule.
5. Tikosyn 250mcg BID + Propranolol XL 240mg + Digoxin 125mcg — continue. No dose changes today. Remote ICD monitoring ongoing.
6. Xarelto 20mg QD PM + Jardiance 10mg QD — continue.
7. ${gap!==null&&gap>4?'Weight significantly above dry weight — same-day ACHD outreach recommended.':gap!==null&&gap>2?'Moderate hypervolemia — follow closely, contact ACHD if no improvement by tomorrow AM.':'Continue current regimen.'}
${labEvents?'8. Follow up: '+labEvents:''}`;
}

// ════════════════════════════════════════════════════════════════════════
// REPORT GENERATION
// ════════════════════════════════════════════════════════════════════════
function generateReport(){
  // check completion first
  const s=getCompletionStatus();
  const missing=[];
  if(!s.weight)missing.push('Morning weight');
  if(!s.intake)missing.push('Fluid intake');
  if(!s.output)missing.push('Urine output');
  if(!s.diuretics)missing.push('Diuretics (or mark as none)');
  const blockedEl=document.getElementById('reportBlockedMsg');
  if(missing.length>0){
    blockedEl.style.display='';
    blockedEl.innerHTML=`<strong>Missing required data — report generation blocked:</strong><ul>${missing.map(m=>`<li>${m}</li>`).join('')}</ul>`;
    document.getElementById('reportArea').style.display='none';
    return;
  }
  blockedEl.style.display='none';

  const now=new Date();const dateStr=fmtDateLabel(currentDate);const timeStr=now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  const weightAM=document.getElementById('weightAM').value||'—';
  const weightPrior=document.getElementById('weightPrior').value||'—';
  let delta='—';if(weightAM!=='—'&&weightPrior!=='—'){const d=parseFloat(weightAM)-parseFloat(weightPrior);delta=(d>=0?'+':'')+d.toFixed(1)+' lb';}
  let totalOz=0;fluidEntries.forEach(id=>{totalOz+=parseFloat(document.getElementById('fl-oz-'+id)?.value||0)||0;});
  const intakeMl=ozToMl(totalOz);let totalOutMl=0;
  const voidLines=outputEntries.map(id=>{const time=document.getElementById('out-time-'+id)?.value||'—';const sel=document.getElementById('out-vol-'+id);const ml=getVoidMl(id);totalOutMl+=ml;const label=sel?.options[sel.selectedIndex]?.text||'—';return `    ${time}    ${label}  (~${ml} mL)`;});
  const bmLines=bmEntries.map(id=>`    ${document.getElementById('bm-time-'+id)?.value||'—'}`);
  const net=intakeMl-totalOutMl;const netStr=(net>=0?'+':'')+net+' mL';
  const netFlag=net>500?'  [POSITIVE — monitor]':net<-500?'  [NEGATIVE — adequate diuresis]':'  [NEAR EVEN]';
  const diuLines=diureticEntries.map(id=>{const time=document.getElementById('diu-time-'+id)?.value||'—';const drug=document.getElementById('diu-drug-'+id)?.value||'';const dose=document.getElementById('diu-dose-'+id)?.value||'';return `    ${time}    ${drug} ${dose}mg`;});
  let kcal=0,carb=0,prot=0,fat=0,sod=0,liqCarb=0;
  const mealBlocks=mealSections.map(m=>{let mk=0,mc=0,mp=0,mf=0,ms=0;m.foods.forEach(fid=>{mk+=parseFloat(document.getElementById('food-kcal-'+fid)?.value||0)||0;mc+=parseFloat(document.getElementById('food-carb-'+fid)?.value||0)||0;mp+=parseFloat(document.getElementById('food-prot-'+fid)?.value||0)||0;mf+=parseFloat(document.getElementById('food-fat-'+fid)?.value||0)||0;ms+=parseFloat(document.getElementById('food-sod-'+fid)?.value||0)||0;});kcal+=mk;carb+=mc;prot+=mp;fat+=mf;sod+=ms;const name=document.getElementById('meal-name-'+m.id)?.value||'Meal';const foods=m.foods.map(fid=>{const fname=document.getElementById('food-name-'+fid)?.value||'Item';return `      · ${fname}`;}).join('\n');return `  ${name.toUpperCase()}\n${foods||'    (no items)'}\n    ${Math.round(mk)} kcal  |  Na: ${Math.round(ms)} mg  |  C:${Math.round(mc)}g  P:${Math.round(mp)}g  F:${Math.round(mf)}g`;});
  let flKcal=0,flSod=0;Object.values(fluidNutrition).forEach(n=>{if(n){flKcal+=n.kcal||0;flSod+=n.sodium_mg||0;liqCarb+=n.carbs_g||0;}});
  kcal+=flKcal;sod+=flSod;
  const labK=document.getElementById('labK')?.value;const labNa=document.getElementById('labNa')?.value;
  const labCr=document.getElementById('labCr')?.value;const labBNP=document.getElementById('labBNP')?.value;
  const labTSH=document.getElementById('labTSH')?.value;const labFT4=document.getElementById('labFT4')?.value;
  const labEvents=document.getElementById('labEvents')?.value||'None documented';
  const labLines=[labK?`    K:          ${labK} mEq/L${parseFloat(labK)<3.5?' ⚠ LOW':parseFloat(labK)>5.5?' ⚠ HIGH':''}`:null,labNa?`    Na:         ${labNa} mEq/L`:null,labCr?`    Creatinine: ${labCr} mg/dL${parseFloat(labCr)>1.5?' ⚠':''}`:'',labBNP?`    BNP/NTpro:  ${labBNP}`:null,labTSH?`    TSH:        ${labTSH} mIU/L`:null,labFT4?`    Free T4:    ${labFT4}`:null].filter(Boolean).join('\n')||'  No labs logged';
  const exState=getExerciseState();
  const exLines=exState.length?exState.map(e=>`    ${e.type}${e.duration?' — '+e.duration+' min':''} (${e.intensity})`).join('\n'):'  None logged';
  const edema=document.getElementById('edema').value||'Not assessed';
  const func=document.getElementById('funcStatus').value||'Not assessed';
  const symptoms=getCheckedSymptoms();
  const notesVal=document.getElementById('notesField').value||'None documented';
  const gap=parseFloat(weightAM)-127.5;
  const sodFlag=sod>2000?'  [EXCEEDS 2,000mg TARGET ⚠]':sod>1500?'  [EXCEEDS 1,500mg TARGET]':'  [WITHIN TARGET]';

  // 3-day and 7-day trends for report
  const all=getAllDays();
  const wEntries=Object.entries(all).map(([d,s])=>({date:d,w:parseFloat(s.weightAM)})).filter(e=>!isNaN(e.w)&&e.w>0).sort((a,b)=>a.date.localeCompare(b.date));
  const trend3=wEntries.length>=3?(wEntries[wEntries.length-1].w-wEntries[wEntries.length-3].w):null;
  const trend7=wEntries.length>=7?(wEntries[wEntries.length-1].w-wEntries[wEntries.length-7].w):null;

  const report=`═══════════════════════════════════════════════════
CARDIAC CLINICAL SUMMARY
${dateStr}
Generated: ${timeStr}
═══════════════════════════════════════════════════

PATIENT
  28 y.o. M — Shone complex / ACHD / HFpEF
  s/p Ross-Konno+MAZE (9/2024, CUMC)
  s/p Total thyroidectomy (12/2025)
  Paroxysmal AF — Tikosyn + Xarelto
  ICD (2012), last inappropriate shock 9/2025

───────────────────────────────────────────────────
WEIGHT

  Today (AM):       ${weightAM} lb
  Yesterday:        ${weightPrior} lb
  24-hr delta:      ${delta}
  Dry weight target: 126–129 lb
  Gap from mid-target: ${!isNaN(gap)?(gap>=0?'+':'')+gap.toFixed(1)+' lb':'—'}

TRENDS
  3-day:   ${trend3!==null?(trend3>=0?'+':'')+trend3.toFixed(1)+' lb':'insufficient data'}
  7-day:   ${trend7!==null?(trend7>=0?'+':'')+trend7.toFixed(1)+' lb':'insufficient data'}

───────────────────────────────────────────────────
DIURETICS ADMINISTERED

${diuLines.length?diuLines.join('\n'):'  None recorded'}${noDiureticsToday?'\n  [Explicitly marked: no diuretics today]':''}

───────────────────────────────────────────────────
INTAKE / OUTPUT

  Oral intake:   ${Math.round(totalOz)} fl oz  (${intakeMl} mL)

  Urine output:
${voidLines.length?voidLines.join('\n'):'    None recorded'}
  Total UO:      ~${totalOutMl} mL (estimated by description)

  Bowel movement:
${bmLines.length?bmLines.join('\n'):'    None recorded'}

  FLUID BALANCE
    Intake:   ${intakeMl} mL
    Output:   ~${totalOutMl} mL
    Net:      ${netStr}${netFlag}

───────────────────────────────────────────────────
ACTIVITY

${exLines}

───────────────────────────────────────────────────
CLINICAL OBSERVATIONS

  Edema:              ${edema}
  Functional status:  ${func}
  Symptoms:           ${symptoms.length?symptoms.join(', '):'None reported'}

───────────────────────────────────────────────────
LABS & CLINICAL EVENTS

${labLines}

  Clinical events / procedures:
  ${labEvents}

───────────────────────────────────────────────────
NUTRITION

${mealBlocks.length?mealBlocks.join('\n\n'):'  No meals recorded'}
${flKcal>0?`\n  Beverage nutrition (from Fluid Intake):   ${Math.round(flKcal)} kcal  |  Na: ${Math.round(flSod)} mg  |  Liquid carbs: ${Math.round(liqCarb)} g`:''}

  DAILY TOTALS
    Calories:   ~${Math.round(kcal)} kcal
    Sodium:     ~${Math.round(sod)} mg${sodFlag}
    Carbs:      ~${Math.round(carb)} g${liqCarb>0?`  (incl. ${Math.round(liqCarb)}g liquid)`:''}
    Protein:    ~${Math.round(prot)} g
    Fat:        ~${Math.round(fat)} g

───────────────────────────────────────────────────
NOTES / SUBJECTIVE

  ${notesVal}

───────────────────────────────────────────────────
ASSESSMENT & PLAN

  [ ] Continue diuretic regimen per current dosing
  [ ] Na target: <1,500 mg/day
  [ ] Weigh tomorrow AM — target 126–129 lb
  [ ] Contact ACHD if AM weight up ≥2 lb from today
  [ ] Tikosyn compliance — strict BID dosing, no missed doses
  [ ] TSH monitoring per endocrinology schedule
  [ ] Remote ICD transmission ongoing

═══════════════════════════════════════════════════`;

  document.getElementById('reportText').textContent=report;
  document.getElementById('reportArea').style.display='';
}

function copyReport(){
  navigator.clipboard.writeText(document.getElementById('reportText').textContent).then(()=>{
    const btn=document.getElementById('copyBtn');btn.textContent='✓ Copied';btn.classList.add('copied');
    setTimeout(()=>{btn.textContent='📋 Copy';btn.classList.remove('copied');},2000);
  });
}
function printReport(){window.print();}
async function shareReport(){
  const text=document.getElementById('reportText')?.textContent;
  if(!text)return;
  if(navigator.share){
    try{await navigator.share({title:'Cardiac Report — '+fmtDateLabel(currentDate),text});}
    catch(e){}
  } else {
    navigator.clipboard.writeText(text).then(()=>alert('Report copied to clipboard.'));
  }
}

// ════════════════════════════════════════════════════════════════════════
// 7-DAY WEEKLY SUMMARY
// ════════════════════════════════════════════════════════════════════════
function generate7DaySummary(){
  const all=getAllDays();
  const days=[];
  for(let i=6;i>=0;i--){
    const d=new Date();d.setDate(d.getDate()-i);
    const yr=d.getFullYear(),mo=String(d.getMonth()+1).padStart(2,'0'),dy=String(d.getDate()).padStart(2,'0');
    days.push(`${yr}-${mo}-${dy}`);
  }
  const records=days.map(date=>({date,data:all[date]||null}));
  const withWeight=records.filter(r=>r.data&&parseFloat(r.data.weightAM)>0);
  const weights=withWeight.map(r=>parseFloat(r.data.weightAM));
  const avgW=weights.length?weights.reduce((a,b)=>a+b,0)/weights.length:null;
  const minW=weights.length?Math.min(...weights):null;
  const maxW=weights.length?Math.max(...weights):null;
  const wTrend=weights.length>=2?(weights[weights.length-1]-weights[0]):null;

  let totalSod=0,sodDays=0,totalKcal=0,totalIntake=0,totalOut=0,ioDays=0;
  records.forEach(r=>{
    if(!r.data)return;
    let daySod=0,dayKcal=0;
    (r.data.meals||[]).forEach(m=>(m.foods||[]).forEach(f=>{daySod+=parseFloat(f.sod||0)||0;dayKcal+=parseFloat(f.kcal||0)||0;}));
    (r.data.fluids||[]).forEach(f=>{if(f.nutrition){daySod+=f.nutrition.sodium_mg||0;dayKcal+=f.nutrition.kcal||0;}});
    if(daySod>0){totalSod+=daySod;sodDays++;}
    if(dayKcal>0)totalKcal+=dayKcal;
    let oz=0;(r.data.fluids||[]).forEach(f=>oz+=parseFloat(f.oz||0)||0);
    let out=0;(r.data.outputs||[]).forEach(o=>out+=parseInt(o.vol||0)||0);
    if(oz>0||out>0){totalIntake+=Math.round(oz*29.5735);totalOut+=out;ioDays++;}
  });
  const avgSod=sodDays>0?Math.round(totalSod/sodDays):null;
  const avgKcal=sodDays>0?Math.round(totalKcal/sodDays):null;
  const avgIn=ioDays>0?Math.round(totalIntake/ioDays):null;
  const avgOut=ioDays>0?Math.round(totalOut/ioDays):null;
  const daysLogged=records.filter(r=>r.data&&r.data.weightAM).length;

  const lines=records.map(r=>{
    if(!r.data)return `  ${r.date}    — no data —`;
    const w=r.data.weightAM?parseFloat(r.data.weightAM).toFixed(1)+' lb':'—';
    let sod=0;(r.data.meals||[]).forEach(m=>(m.foods||[]).forEach(f=>sod+=parseFloat(f.sod||0)||0));
    (r.data.fluids||[]).forEach(f=>{if(f.nutrition)sod+=f.nutrition.sodium_mg||0;});
    const sodStr=sod>0?Math.round(sod)+'mg Na':'—';
    const diuStr=(r.data.diuretics||[]).map(d=>`${d.drug||''} ${d.dose||''}mg`).filter(Boolean).join(', ')||'—';
    return `  ${r.date}    Wt: ${w.padEnd(9)} Na: ${sodStr.padEnd(10)} Diuretics: ${diuStr}`;
  }).join('\n');

  const now=new Date();
  const summary=`═══════════════════════════════════════════════
WEEKLY CARDIAC SUMMARY
${fmtDateLabel(days[0])} → ${fmtDateLabel(days[6])}
Generated: ${now.toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}
═══════════════════════════════════════════════

WEIGHT
  Days logged:  ${daysLogged} of 7
  Range:        ${minW!==null?minW.toFixed(1)+' – '+maxW.toFixed(1)+' lb':'insufficient data'}
  Average:      ${avgW!==null?avgW.toFixed(1)+' lb':'—'}
  7-day delta:  ${wTrend!==null?(wTrend>=0?'+':'')+wTrend.toFixed(1)+' lb':'—'}
  Dry wt target: 126–129 lb

DAILY LOG
${lines}

AVERAGES (logged days only)
  Avg sodium:   ${avgSod!==null?avgSod+' mg/day ('+(avgSod<1500?'✓ within target':'⚠ above 1,500mg target')+')':'—'}
  Avg calories: ${avgKcal!==null?avgKcal+' kcal/day':'—'}
  Avg intake:   ${avgIn!==null?avgIn+' mL/day':'—'}
  Avg UO:       ${avgOut!==null?avgOut+' mL/day':'—'}
  Avg net I/O:  ${avgIn!==null&&avgOut!==null?(avgIn-avgOut>=0?'+':'')+(avgIn-avgOut)+' mL/day':'—'}

ASSESSMENT
  ${wTrend!==null?
    wTrend<-0.5?'Weight trending downward over the week — diuresis effective.':
    wTrend>1.5?'Weight trending upward over the week — review sodium and fluid balance.':
    Math.abs(wTrend)<0.5?'Weight stable over 7-day window.':
    wTrend>0?'Mild upward weight trend — continue monitoring.':'Mild downward trend — on track.':
    'Insufficient weight data for trend assessment.'}
  ${avgSod!==null?avgSod>1800?'Mean sodium intake elevated — strict adherence to <1,500 mg/day target recommended.':avgSod>1500?'Mean sodium mildly above target — some dietary sodium excess detected.':'Mean sodium within daily target. Good compliance.':'Sodium data insufficient for weekly assessment.'}

──────────────────────────────────────────────
28M — Shone complex / ACHD / HFpEF / Tikosyn
═══════════════════════════════════════════════`;

  document.getElementById('summaryText').textContent=summary;
  document.getElementById('summaryArea').style.display='';
}
function copySummary(){
  navigator.clipboard.writeText(document.getElementById('summaryText').textContent).then(()=>{
    const btn=document.getElementById('copySummaryBtn');btn.textContent='✓ Copied';
    setTimeout(()=>btn.textContent='📋 Copy',2000);
  });
}
async function shareSummary(){
  const text=document.getElementById('summaryText')?.textContent;
  if(!text)return;
  if(navigator.share){try{await navigator.share({title:'7-Day Cardiac Summary',text});}catch(e){}}
  else{navigator.clipboard.writeText(text).then(()=>alert('Summary copied to clipboard.'));}
}

// ════════════════════════════════════════════════════════════════════════
// LAB IMPORT — paste / screenshot parsing
// ════════════════════════════════════════════════════════════════════════
const LAB_PATTERNS=[
  {key:'k',   label:'Potassium (K)',   unit:'mEq/L', patterns:[/potassium[:\s]+([0-9.]+)/i,/\bK[:\s]+([0-9.]+)\s*m?eq/i,/\bK\b[:\s]+([0-9.]+)/i]},
  {key:'na',  label:'Sodium (Na)',     unit:'mEq/L', patterns:[/sodium[:\s]+([0-9.]+)/i,/\bNa[:\s]+([0-9.]+)/i]},
  {key:'cr',  label:'Creatinine',      unit:'mg/dL', patterns:[/creatinine[:\s]+([0-9.]+)/i,/\bCr[:\s]+([0-9.]+)/i]},
  {key:'bnp', label:'BNP/NT-proBNP',  unit:'',       patterns:[/\bBNP[:\s]+([0-9.]+)/i,/NT.?proBNP[:\s]+([0-9.]+)/i,/pro.?BNP[:\s]+([0-9.]+)/i]},
  {key:'tsh', label:'TSH',             unit:'mIU/L', patterns:[/\bTSH[:\s]+([0-9.]+)/i,/thyroid.stimulating[:\s]+([0-9.]+)/i]},
  {key:'ft4', label:'Free T4',         unit:'ng/dL', patterns:[/free\s*T4[:\s]+([0-9.]+)/i,/FT4[:\s]+([0-9.]+)/i,/free\s*thyroxine[:\s]+([0-9.]+)/i]},
];

function parseLabText(){
  const text=document.getElementById('labPasteInput')?.value||'';
  if(!text.trim()){alert('Paste some lab text first.');return;}
  const found=[];
  LAB_PATTERNS.forEach(lab=>{
    for(const pat of lab.patterns){
      const m=text.match(pat);
      if(m){found.push({key:lab.key,label:lab.label,unit:lab.unit,value:m[1]});break;}
    }
  });
  renderLabParseResult(found,text);
}

async function handleLabUpload(input){
  const file=input.files[0];if(!file)return;
  if(!apiKey){alert('Add your Anthropic API key to enable lab screenshot parsing.');return;}
  if(file.type.startsWith('image/')){
    const reader=new FileReader();
    reader.onload=async e=>{
      const base64=e.target.result.split(',')[1];
      const mt=e.target.result.split(';')[0].split(':')[1];
      const btn=document.querySelector('[for="labImageUpload"]');if(btn)btn.textContent='⏳ Parsing...';
      try{
        const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:500,messages:[{role:'user',content:[{type:'image',source:{type:'base64',media_type:mt,data:base64}},{type:'text',text:`This is a lab result. Extract ONLY: Sodium, Potassium, Creatinine, BNP/NT-proBNP, TSH, Free T4. Return ONLY JSON: [{"key":"na|k|cr|bnp|tsh|ft4","label":"full name","value":"numeric string","unit":"unit string"},...]. Only include values that are clearly present. No commentary.`}]}]})});
        const data=await res.json();
        const raw=(data.content?.[0]?.text||'').replace(/```json|```/g,'').trim();
        const parsed=JSON.parse(raw);
        renderLabParseResult(parsed,'');
      }catch(err){alert('Failed to parse lab image. Try pasting text instead.');}
      if(btn)btn.textContent='📷 Upload screenshot';
    };
    reader.readAsDataURL(file);
  } else {
    alert('For PDFs, please use copy-paste: open the PDF, select all text, and paste into the text box above.');
  }
  input.value='';
}

function renderLabParseResult(found,rawText){
  const container=document.getElementById('labParseResult');
  if(!found.length){
    container.style.display='';
    container.innerHTML=`<div style="font-size:13px;color:var(--text3);background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:9px 12px;">No recognized lab values found. Try adjusting the format or entering values manually in the Labs section on the Vitals tab.</div>`;
    return;
  }
  const flagStyle=v=>{
    const n=parseFloat(v);if(isNaN(n))return '';
    return '';
  };
  const flagText=(key,v)=>{
    const n=parseFloat(v);if(isNaN(n))return '';
    if(key==='k')return n<3.5?' ⚠ LOW':n>5.5?' ⚠ HIGH':'';
    if(key==='na')return n<135?' ⚠ LOW':n>145?' ⚠ HIGH':'';
    if(key==='cr')return n>1.5?' ⚠ ELEVATED':'';
    if(key==='tsh')return n<0.4?' ⚠ SUPPRESSED':n>4.5?' ⚠ ELEVATED':'';
    return '';
  };
  container.style.display='';
  container.innerHTML=`
    <div style="font-size:10.5px;font-weight:600;letter-spacing:0.09em;text-transform:uppercase;color:var(--text3);margin-bottom:8px;">Detected values — review and confirm</div>
    ${found.map((f,i)=>`
      <div style="display:flex;align-items:center;gap:8px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:7px 10px;margin-bottom:5px;" id="labrow-${i}">
        <div style="flex:1;font-size:13px;color:var(--text2);">${f.label}</div>
        <input type="number" value="${f.value}" id="labparse-val-${i}" step="0.01" style="width:74px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:4px 7px;font-size:13px;font-family:'JetBrains Mono',monospace;color:var(--text);outline:none;">
        <span style="font-size:11px;color:var(--text3);min-width:42px;">${f.unit}</span>
        <span style="font-size:11px;color:var(--alert);min-width:60px;" id="labparse-flag-${i}">${flagText(f.key,f.value)}</span>
        <button onclick="discardLabRow(${i})" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px;padding:0 2px;">×</button>
      </div>
    `).join('')}
    <div style="display:flex;gap:7px;margin-top:8px;">
      <button class="ai-lookup-btn" onclick="applyParsedLabs(${JSON.stringify(found).replace(/"/g,'&quot;')})">✓ Apply to today's labs</button>
      <button onclick="document.getElementById('labParseResult').style.display='none';" style="background:none;border:1px solid var(--border-med);border-radius:var(--radius-sm);color:var(--text3);padding:6px 12px;font-size:12.5px;cursor:pointer;font-family:'Inter',sans-serif;">Discard</button>
    </div>
    ${rawText?`<div style="margin-top:8px;font-size:11px;color:var(--text3);line-height:1.6;">Scroll to Vitals tab → Labs to enter any values not detected above.</div>`:''}
  `;
  // live flag update on edit
  found.forEach((_,i)=>{
    const inp=document.getElementById(`labparse-val-${i}`);
    if(inp)inp.oninput=()=>{const flag=document.getElementById(`labparse-flag-${i}`);if(flag)flag.textContent=flagText(found[i].key,inp.value);};
  });
}
function discardLabRow(i){document.getElementById('labrow-'+i)?.remove();}
function applyParsedLabs(found){
  const keyMap={k:'labK',na:'labNa',cr:'labCr',bnp:'labBNP',tsh:'labTSH',ft4:'labFT4'};
  let applied=0;
  found.forEach((f,i)=>{
    const row=document.getElementById('labrow-'+i);
    if(!row)return; // discarded
    const valEl=document.getElementById('labparse-val-'+i);
    const val=valEl?.value?.trim();
    const targetId=keyMap[f.key];
    if(targetId&&val){
      const el=document.getElementById(targetId);
      if(el){el.value=val;applied++;}
    }
  });
  checkLabFlags();autosave();
  // open labs section
  const labsBody=document.getElementById('labsBody');
  if(labsBody&&labsBody.style.display==='none'){
    toggleCollapse('labsBody','labsCollapseBtn');
  }
  // switch to vitals tab
  document.querySelectorAll('.tab-btn').forEach(b=>{if(b.textContent.includes('Vitals'))b.click();});
  document.getElementById('labParseResult').style.display='none';
  document.getElementById('labPasteInput').value='';
  if(applied>0){
    const notice=document.createElement('div');
    notice.style.cssText='position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--accent);color:white;padding:8px 18px;border-radius:20px;font-size:13px;font-weight:600;z-index:200;box-shadow:var(--shadow-md);';
    notice.textContent=`✓ ${applied} lab value${applied!==1?'s':''} applied to today`;
    document.body.appendChild(notice);setTimeout(()=>notice.remove(),2800);
  }
}


const HISTORY_WEIGHT=[
  ['2024-09-14',133.6,'Post-ablation #1 (9/11). Likely IV fluid puffiness.'],['2024-09-15',132.0,'Post-ablation #1. -1.6 lb.'],['2024-09-16',131.2,'Post-ablation #1.'],['2024-09-17',129.8,'Post-ablation #1.'],['2024-09-18',129.8,'Post-ablation #1.'],['2024-09-19',130.2,'Post-ablation #1.'],['2024-09-20',130.0,'Post-ablation #1.'],['2024-09-21',130.8,'Post-ablation #1.'],['2024-09-22',130.2,'Post-ablation #1.'],['2024-09-23',130.0,'Post-ablation #1.'],['2024-09-24',129.2,'Post-ablation #1.'],['2024-09-25',128.2,'Post-ablation #1.'],
  ['2024-10-05',127.8,'Prednisone started 9/27. s/p pred 50mg (9/29-10/2), pred 40mg (10/3). s/p methimazole 20mg.'],['2024-10-07',126.0,'Possible dry weight. d/c on methimazole 10mg daily, prednisone 30mg.'],['2024-10-08',126.6,''],['2024-10-09',127.4,''],['2024-10-10',127.4,''],['2024-10-11',126.6,''],['2024-10-12',127.2,''],['2024-10-13',127.6,''],['2024-10-14',128.8,''],['2024-10-16',127.4,''],['2024-10-17',134.7,'Ablation #2. Post-procedure weight w/ IV fluids.'],['2024-10-18',131.9,'Post-ablation #2.'],['2024-10-19',130.2,'Post-ablation #2.'],['2024-10-20',129.2,'Post-ablation #2.'],['2024-10-21',129.4,'Post-ablation #2.'],['2024-10-22',128.8,'Post-ablation #2.'],['2024-10-23',130.0,'Torsemide 100mg + extra K.'],['2024-10-24',129.6,''],['2024-10-25',130.2,''],['2024-10-26',130.6,'Torsemide 100mg + extra K.'],['2024-10-27',131.0,''],['2024-10-28',132.8,''],['2024-10-29',131.6,''],['2024-10-30',131.8,''],['2024-10-31',132.2,''],
  ['2024-11-01',132.0,''],['2024-11-02',133.8,''],['2024-11-03',132.2,''],['2024-11-04',132.8,''],['2024-11-05',132.2,''],['2024-11-06',133.6,''],['2024-11-07',134.0,''],['2024-11-08',133.2,''],['2024-11-09',134.0,''],['2024-11-10',133.2,''],['2024-11-11',133.6,''],['2024-11-12',135.2,''],['2024-11-13',136.6,''],['2024-11-14',135.2,''],['2024-11-15',132.8,'Metolazone 2.5mg. -2.4 lb.'],['2024-11-16',134.6,'+1.8 lb.'],['2024-11-17',132.6,'Metolazone 2.5mg. -2.0 lb.'],['2024-11-18',133.0,'In hospital.'],['2024-11-19',134.0,'In hospital.'],['2024-11-20',134.9,'In hospital.'],['2024-11-21',136.2,'In hospital.'],['2024-11-22',134.8,'In hospital. -1.4 lb.'],['2024-11-23',136.0,'+1.2 lb.'],['2024-11-24',135.0,'-1.0 lb.'],['2024-11-25',137.2,'+2.2 lb.'],['2024-11-26',137.2,''],['2024-11-27',137.4,''],['2024-11-28',137.6,''],['2024-11-29',138.2,'+0.6 lb.'],['2024-11-30',137.6,'-0.6 lb.'],
  ['2024-12-01',138.0,''],['2024-12-02',139.0,''],['2024-12-03',139.0,''],['2024-12-04',139.0,'Torsemide 120mg.'],['2024-12-05',138.4,'Torsemide 150mg.'],['2024-12-06',139.6,''],['2024-12-07',141.0,''],['2024-12-08',141.0,'Thyroidectomy today. Hydrocortisone 100mg IV.'],['2024-12-10',144.6,'+3.6 lb. Hydrocortisone 50mg q6h x24hrs.'],['2024-12-11',140.2,'-4.4 lb. Torsemide 140mg.'],['2024-12-12',142.6,'+2.4 lb. Torsemide 100mg, prednisone 30mg.'],['2024-12-13',141.8,'-0.8 lb. Torsemide 150mg, prednisone 25mg daily.'],['2024-12-14',142.4,'Torsemide 150mg.'],['2024-12-15',141.4,'Torsemide 150mg.'],['2024-12-16',142.4,'Torsemide 160mg. TSH 1.6 high sensitivity. Levo 100mcg started 12/9.'],['2024-12-17',142.2,'Torsemide 100mg, prednisone 20mg.'],['2024-12-18',142.4,'Torsemide 80mg. TSH 9.86.'],['2024-12-19',143.6,'Torsemide 60mg.'],['2024-12-20',142.6,'Torsemide 100mg.'],['2024-12-21',143.0,'Prednisone 15mg daily.'],['2024-12-22',142.8,'Levo switched to 100mcg 6x/week — FT4 slightly elevated at 1.98.'],['2024-12-23',143.6,''],['2024-12-24',143.8,''],['2024-12-25',144.2,'Started hydrocortisone 25mg AM / 15mg PM.'],['2024-12-26',146.2,''],['2024-12-27',146.2,''],['2024-12-28',147.6,'Hydrocortisone tapered to 15mg AM / 5mg PM.'],['2024-12-29',147.4,''],['2024-12-30',147.8,''],['2024-12-31',147.6,''],
  ['2025-01-01',148.4,'Hydrocortisone 15mg daily.'],['2025-01-02',148.6,''],['2025-01-03',149.0,'Hydrocortisone 15mg AM / 5mg PM.'],['2025-01-04',149.2,''],['2025-01-05',148.6,''],['2025-01-06',148.0,''],['2025-01-07',147.8,'Torsemide 100mg.'],['2025-01-08',147.8,''],['2025-01-09',148.0,''],['2025-01-10',148.0,''],['2025-01-11',148.6,''],['2025-01-12',146.4,''],['2025-01-13',146.8,''],['2025-01-14',146.2,''],['2025-01-15',146.6,'Hydrocortisone tapered to 7.5mg AM / 2.5mg PM.'],['2025-01-16',146.6,''],['2025-01-17',146.0,''],['2025-01-18',146.0,''],['2025-01-19',146.0,''],['2025-01-20',146.0,''],['2025-01-21',146.8,''],['2025-01-22',146.0,''],['2025-01-23',147.0,''],['2025-01-24',147.4,'Hydrocortisone down to 5mg daily.'],['2025-01-25',146.0,''],['2025-01-26',144.6,''],['2025-01-27',144.4,'Last dose of hydrocortisone. Steroid course ended.'],['2025-01-28',144.6,''],['2025-01-29',144.8,''],['2025-01-30',144.4,'TSH 7.27. Levo reduced to 88mcg 6 days/wk.'],['2025-01-31',144.6,''],
  ['2025-02-01',142.8,''],['2025-02-02',143.2,''],['2025-02-03',142.4,''],['2025-02-04',142.2,''],['2025-02-05',142.8,''],['2025-02-06',142.2,''],['2025-02-07',142.4,''],['2025-02-08',141.4,''],['2025-02-09',142.2,''],['2025-02-10',142.4,''],['2025-02-11',142.4,''],['2025-02-12',143.4,''],['2025-02-13',142.4,'TSH 9.93. Levo increased to 88mcg daily.'],['2025-02-14',142.2,''],['2025-02-15',143.2,''],['2025-02-16',143.2,''],['2025-02-17',142.4,''],['2025-02-18',142.2,''],['2025-02-19',142.0,''],['2025-02-20',142.0,''],['2025-02-21',141.8,''],['2025-02-22',141.2,''],['2025-02-23',140.8,''],['2025-02-24',141.2,''],['2025-02-25',140.8,''],['2025-02-26',140.6,''],['2025-02-27',140.8,''],['2025-02-28',140.2,''],
  ['2025-03-01',140.4,''],['2025-03-02',140.0,''],['2025-03-03',140.6,''],['2025-03-04',139.6,''],['2025-03-05',139.4,''],
  // Recovered from Apple Health — March 6 – April 15 2025
  ['2025-03-06',138.8,''],['2025-03-07',138.6,''],['2025-03-08',138.8,''],['2025-03-09',138.2,''],['2025-03-10',138.2,''],
  ['2025-03-11',137.8,''],['2025-03-12',138.0,''],['2025-03-13',137.6,''],['2025-03-14',137.6,''],['2025-03-15',137.2,''],
  ['2025-03-16',137.0,''],['2025-03-17',136.6,''],['2025-03-18',137.2,''],['2025-03-19',136.4,''],['2025-03-20',136.6,''],
  ['2025-03-21',136.6,''],['2025-03-22',136.4,'Torsemide 80mg.'],['2025-03-23',138.0,'Torsemide 80mg.'],
  ['2025-03-24',135.0,'Torsemide 100mg for day.'],['2025-03-25',135.2,'Torsemide 40mg eve.'],
  ['2025-03-26',134.8,'Torsemide 40mg eve.'],['2025-03-27',135.6,'Torsemide 50mg eve.'],
  ['2025-03-28',135.0,''],['2025-03-29',134.6,''],['2025-03-30',135.0,''],['2025-03-31',135.2,''],
  ['2025-04-01',134.2,''],['2025-04-02',134.8,'Pre-trip baseline. Travel day EWR.'],
  ['2025-04-09',137.0,'Post-trip.'],['2025-04-10',136.6,''],['2025-04-11',136.4,''],
  ['2025-04-12',135.6,''],['2025-04-13',135.2,''],['2025-04-14',134.4,''],['2025-04-15',133.4,''],
];

function runBuiltInImport(){
  const btn=document.getElementById('importHistoryBtn');
  btn.textContent='Importing...';btn.disabled=true;
  try{
    let all=getAllDays();let imported=0,skipped=0;
    HISTORY_WEIGHT.forEach(([date,weight,notes])=>{
      if(all[date]&&all[date].weightAM){skipped++;return;}
      const existing=all[date]||{};
      all[date]={...existing,weightAM:String(weight),weightPrior:existing.weightPrior||'',notes:notes&&!existing.notes?notes:existing.notes||'',edema:existing.edema||'',funcStatus:existing.funcStatus||'',symptoms:existing.symptoms||[],diuretics:existing.diuretics||[],fluids:existing.fluids||[],outputs:existing.outputs||[],bms:existing.bms||[],meals:existing.meals||[],exercise:existing.exercise||[],labs:existing.labs||{k:'',na:'',cr:'',bnp:'',tsh:'',ft4:'',events:''}};
      imported++;
    });
    localStorage.setItem(STORAGE_KEY,JSON.stringify(all));
    drawWeightChart();updateProgressTab();
    btn.textContent=`✓ ${imported} days loaded!`;btn.className='import-btn done';
    setTimeout(()=>{btn.textContent='History loaded ✓';btn.disabled=true;},3000);
  }catch(e){btn.textContent='Error — try again';btn.disabled=false;console.error(e);}
}

// Trip data April 2-8
const TRIP_DAYS={
  '2025-04-02':{weightAM:'134.8',weightPrior:'',notes:'Travel day to EWR. Baseline weight 134.8 lb pre-trip. Not dry weight — steroid belly residual.',diuretics:[],fluids:[],outputs:[],bms:[],meals:[]},
  '2025-04-03':{weightAM:'',weightPrior:'134.8',notes:'Travel EWR→SAV. High sodium day (~4,200mg). ~2,050 kcal. Expected fluid retention 2-4 lbs.',diuretics:[],fluids:[{id:801,oz:'12',name:'Pickle House tomato juice United Airlines',nutrition:{kcal:50,sodium_mg:600,carbs_g:10,protein_g:2,fat_g:0}}],outputs:[],bms:[],meals:[{id:901,name:"Lunch — EWR Nonna's",foods:[{fid:9001,name:'2 slices pizza (EWR Nonna\'s)',kcal:'600',sod:'1200',carb:'80',prot:'24',fat:'20'},{fid:9002,name:'Wedge salad with lemon vinaigrette',kcal:'200',sod:'300',carb:'12',prot:'6',fat:'14'}]},{id:902,name:'Dinner — Flying Monk SAV',foods:[{fid:9003,name:'Pad Thai (Flying Monk SAV)',kcal:'900',sod:'1500',carb:'110',prot:'28',fat:'30'},{fid:9004,name:'Fried vegetable dumplings',kcal:'300',sod:'600',carb:'36',prot:'8',fat:'12'}]}]},
  '2025-04-04':{weightAM:'',weightPrior:'',notes:'Savannah + Jekyll Island. ~3,120mg Na / ~2,400 kcal.',diuretics:[],fluids:[{id:801,oz:'16',name:'Savannah Sweet Tea bottle',nutrition:{kcal:150,sodium_mg:50,carbs_g:38,protein_g:0,fat_g:0}},{id:802,oz:'8',name:'Cranberry club soda w/ lime',nutrition:{kcal:100,sodium_mg:20,carbs_g:24,protein_g:0,fat_g:0}}],outputs:[],bms:[],meals:[{id:901,name:'Breakfast — Hyatt Regency SAV',foods:[{fid:9001,name:'3 slices toast w/ butter',kcal:'450',sod:'500',carb:'54',prot:'9',fat:'18'},{fid:9002,name:'Fresh fruit',kcal:'100',sod:'0',carb:'25',prot:'1',fat:'0'}]},{id:902,name:'Lunch — Corridor Z Kitchen Jekyll Island',foods:[{fid:9003,name:'Garden salad no egg honey vinaigrette',kcal:'250',sod:'300',carb:'20',prot:'4',fat:'14'},{fid:9004,name:'Fries w/ BBQ sauce',kcal:'300',sod:'400',carb:'42',prot:'4',fat:'12'}]},{id:903,name:'Snack',foods:[{fid:9005,name:"6 glazed pecans Buc-ee's",kcal:'250',sod:'50',carb:'18',prot:'3',fat:'18'}]},{id:904,name:"Dinner — Pirates House SAV",foods:[{fid:9006,name:'Chicken gumbo',kcal:'300',sod:'1000',carb:'28',prot:'22',fat:'10'},{fid:9007,name:'2 biscuits honey butter + orange marmalade',kcal:'500',sod:'800',carb:'62',prot:'8',fat:'22'}]}]},
  '2025-04-05':{weightAM:'',weightPrior:'',notes:"Savannah. Highest sodium day (~4,560mg). ~2,480 kcal. Annie O's dinner was high Na.",diuretics:[],fluids:[{id:801,oz:'8',name:"Pink lemonade 1/2 glass Vinnie's",nutrition:{kcal:80,sodium_mg:10,carbs_g:21,protein_g:0,fat_g:0}},{id:802,oz:'16',name:"Sweet tea Annie O's",nutrition:{kcal:150,sodium_mg:50,carbs_g:38,protein_g:0,fat_g:0}}],outputs:[],bms:[],meals:[{id:901,name:'Breakfast — Hyatt room service',foods:[{fid:9001,name:'2 slices bacon',kcal:'100',sod:'300',carb:'0',prot:'7',fat:'8'},{fid:9002,name:'Toast w/ butter',kcal:'300',sod:'400',carb:'36',prot:'6',fat:'14'}]},{id:902,name:"Lunch — Vinnie's Van Go Go SAV",foods:[{fid:9003,name:'Pizza slice green + black olives',kcal:'350',sod:'800',carb:'42',prot:'14',fat:'14'},{fid:9004,name:'6 mini Byrd cookies',kcal:'150',sod:'100',carb:'22',prot:'2',fat:'6'}]},{id:903,name:"Dinner — Annie O's Kitchen",foods:[{fid:9005,name:'Jumbo chicken strips',kcal:'600',sod:'1200',carb:'32',prot:'42',fat:'24'},{fid:9006,name:'BBQ sauce',kcal:'150',sod:'300',carb:'34',prot:'1',fat:'1'},{fid:9007,name:'Mac and cheese side',kcal:'400',sod:'800',carb:'48',prot:'14',fat:'18'},{fid:9008,name:'Baked beans side',kcal:'200',sod:'600',carb:'38',prot:'8',fat:'2'}]}]},
  '2025-04-06':{weightAM:'',weightPrior:'',notes:'Hilton Head. Highest calorie day (~3,660 kcal / ~5,010mg Na). Large dinner Ombra Italian.',diuretics:[],fluids:[{id:801,oz:'4',name:"Apple juice 1/2 glass Gringo's Diner",nutrition:{kcal:60,sodium_mg:10,carbs_g:15,protein_g:0,fat_g:0}},{id:802,oz:'8',name:'Cranberry club soda w/ lime Sandbar',nutrition:{kcal:100,sodium_mg:20,carbs_g:24,protein_g:0,fat_g:0}},{id:803,oz:'8',name:'Ginger Ale Ombra Italian',nutrition:{kcal:80,sodium_mg:25,carbs_g:21,protein_g:0,fat_g:0}}],outputs:[],bms:[],meals:[{id:901,name:"Breakfast — Gringo's Diner HH",foods:[{fid:9001,name:"3 silver dollar choc chip pancakes w/ Smucker's syrup",kcal:'400',sod:'500',carb:'60',prot:'8',fat:'12'}]},{id:902,name:'Lunch app — Sandbar Colony Plaza',foods:[{fid:9002,name:'1/2 soft pretzel w/ beer cheese',kcal:'400',sod:'900',carb:'52',prot:'12',fat:'16'}]},{id:903,name:'Lunch main — Sandbar',foods:[{fid:9003,name:'Caribbean chicken w/ jasmine rice, fries, mango salsa',kcal:'1000',sod:'1500',carb:'110',prot:'52',fat:'28'}]},{id:904,name:'Dinner — Ombra Italian HH',foods:[{fid:9004,name:'Panzanella alla Toscana',kcal:'300',sod:'400',carb:'28',prot:'8',fat:'16'},{fid:9005,name:'2 slices focaccia w/ EVOO dip',kcal:'300',sod:'300',carb:'36',prot:'6',fat:'14'},{fid:9006,name:'Fusilli alla Puttanesca',kcal:'800',sod:'1200',carb:'96',prot:'22',fat:'24'}]},{id:905,name:'Dessert',foods:[{fid:9007,name:'Turoni birthday cake chocolate slice',kcal:'400',sod:'200',carb:'56',prot:'6',fat:'18'}]}]},
  '2025-04-07':{weightAM:'',weightPrior:'',notes:'HH→Charleston. ~4,060mg Na / ~2,120 kcal. O-Ku high Na from miso + soy.',diuretics:[],fluids:[{id:801,oz:'8',name:'Gold Peak sweet tea Tide Me Over Disney HH',nutrition:{kcal:150,sodium_mg:50,carbs_g:38,protein_g:0,fat_g:0}},{id:802,oz:'8',name:'Fresh lemonade Charleston N Market',nutrition:{kcal:120,sodium_mg:10,carbs_g:30,protein_g:0,fat_g:0}},{id:803,oz:'8',name:'Cranberry club soda O-Ku Sushi',nutrition:{kcal:80,sodium_mg:20,carbs_g:20,protein_g:0,fat_g:0}}],outputs:[],bms:[],meals:[{id:901,name:'Breakfast — Tide Me Over Disney HH',foods:[{fid:9001,name:"Mickey waffle hollowed out w/ Smucker's syrup",kcal:'400',sod:'500',carb:'58',prot:'8',fat:'12'},{fid:9002,name:'2 slices bacon',kcal:'100',sod:'300',carb:'0',prot:'7',fat:'8'}]},{id:902,name:'Lunch — Magnolia Plantation Peacock Cafe',foods:[{fid:9003,name:'Turkey BLT (1/4 eaten)',kcal:'200',sod:'400',carb:'18',prot:'12',fat:'8'},{fid:9004,name:'Carolina BBQ chips 3/4 bag',kcal:'300',sod:'400',carb:'38',prot:'4',fat:'14'},{fid:9005,name:'Pepper Palace samples 1T',kcal:'15',sod:'80',carb:'3',prot:'0',fat:'0'}]},{id:903,name:'Dinner — O-Ku Sushi Charleston',foods:[{fid:9006,name:'Sunomono salad',kcal:'100',sod:'300',carb:'16',prot:'4',fat:'2'},{fid:9007,name:'Miso soup',kcal:'50',sod:'800',carb:'6',prot:'4',fat:'2'},{fid:9008,name:'1/2 spicy salmon + 1/2 eel fortune + 1/2 sweet potato roll',kcal:'500',sod:'1200',carb:'72',prot:'20',fat:'14'}]}]},
  '2025-04-08':{weightAM:'',weightPrior:'',notes:"Last trip day / travel home. Kiss Cafe breakfast (best bagels in SC). Rodney Scott's BBQ lunch. Light dinner travel. Begin low Na reset tomorrow.",diuretics:[],fluids:[{id:801,oz:'12',name:"Coca-Cola small fountain Rodney Scott's",nutrition:{kcal:140,sodium_mg:45,carbs_g:38,protein_g:0,fat_g:0}}],outputs:[],bms:[],meals:[{id:901,name:'Breakfast — Kiss Cafe Charleston',foods:[{fid:9001,name:'The Long Islander bagel sandwich (Kiss Cafe)',kcal:'550',sod:'900',carb:'62',prot:'28',fat:'18'},{fid:9002,name:'Biscuits (Kiss Cafe)',kcal:'350',sod:'500',carb:'44',prot:'8',fat:'16'},{fid:9003,name:'Potatoes (Kiss Cafe)',kcal:'200',sod:'300',carb:'38',prot:'4',fat:'6'}]},{id:902,name:"Lunch — Rodney Scott's BBQ",foods:[{fid:9004,name:"Rodney Scott's — 2.5 chicken tenders + few bites mac & cheese + 1/4 cornbread + 1-2T BBQ sauce",kcal:'650',sod:'1100',carb:'52',prot:'38',fat:'22'}]},{id:903,name:'Snack',foods:[{fid:9005,name:'1/2 scoop River Street sweet peach gelato',kcal:'120',sod:'30',carb:'20',prot:'2',fat:'4'}]},{id:904,name:'Dinner — travel',foods:[{fid:9006,name:'Few BK fries + 2 chicken nuggets',kcal:'250',sod:'450',carb:'34',prot:'8',fat:'10'}]}]},
};

function runTripImport(){
  const btn=document.getElementById('importTripBtn');
  btn.textContent='Importing...';btn.disabled=true;
  try{
    let all=getAllDays();let imported=0,skipped=0;
    Object.entries(TRIP_DAYS).forEach(([date,day])=>{
      if(all[date]&&all[date].meals&&all[date].meals.length>0){skipped++;return;}
      const existing=all[date]||{};
      const meals=(day.meals||[]).map(m=>({id:m.id,name:m.name,foods:(m.foods||[]).map(f=>({fid:f.fid,name:f.name,kcal:f.kcal||'0',sod:f.sod||'0',carb:f.carb||'0',prot:f.prot||'0',fat:f.fat||'0'}))}));
      all[date]={weightAM:existing.weightAM||day.weightAM||'',weightPrior:existing.weightPrior||day.weightPrior||'',edema:existing.edema||'',funcStatus:existing.funcStatus||'',symptoms:existing.symptoms||[],notes:existing.notes||day.notes||'',diuretics:existing.diuretics||[],fluids:(day.fluids||[]).map(f=>({id:f.id,oz:f.oz,name:f.name,nutrition:f.nutrition||null})),outputs:existing.outputs||[],bms:existing.bms||[],meals,exercise:existing.exercise||[],labs:existing.labs||{k:'',na:'',cr:'',bnp:'',tsh:'',ft4:'',events:''},noDiureticsToday:existing.noDiureticsToday||false};
      imported++;
    });
    localStorage.setItem(STORAGE_KEY,JSON.stringify(all));
    drawWeightChart();updateProgressTab();
    btn.textContent=`✓ ${imported} trip days loaded!`;btn.className='import-btn done';
    loadDay(currentDate);
    setTimeout(()=>{btn.textContent='Trip loaded ✓';btn.disabled=true;},3000);
  }catch(e){btn.textContent='Error — try again';btn.disabled=false;console.error(e);}
}



// ════════════════════════════════════════════════════════════════════════
// iOS INSTALL HINT — shows non-intrusive banner in mobile Safari
// when not already installed as a home screen PWA
// ════════════════════════════════════════════════════════════════════════
(function(){
  // Only show if: mobile Safari, not already standalone, not dismissed
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const isStandalone = ('standalone' in navigator) && navigator.standalone;
  const dismissed = localStorage.getItem('installHintDismissed');
  if(isIOS && isSafari && !isStandalone && !dismissed){
    const hint = document.getElementById('installHint');
    if(hint){
      hint.style.display = 'flex';
      // Dismiss and remember for 30 days
      const origClose = hint.querySelector('.install-hint-close');
      if(origClose){
        origClose.onclick = function(){
          hint.style.display = 'none';
          localStorage.setItem('installHintDismissed', Date.now());
        };
      }
    }
  }
})();

loadDay(currentDate);
window.addEventListener('resize',drawWeightChart);

(function checkImportsLoaded(){
  const all=getAllDays();
  const hasHistory=Object.keys(all).some(d=>d<'2025-01-01');
  const hBtn=document.getElementById('importHistoryBtn');
  if(hasHistory&&hBtn){hBtn.textContent='History loaded ✓';hBtn.disabled=true;hBtn.className='import-btn done';}
  const hasTrip=all['2025-04-03']&&all['2025-04-03'].meals&&all['2025-04-03'].meals.length>0;
  const tBtn=document.getElementById('importTripBtn');
  if(hasTrip&&tBtn){tBtn.textContent='Trip loaded ✓';tBtn.disabled=true;tBtn.className='import-btn done';}
})();

// ════════════════════════════════════════════════════════════════════════
// BACKUP & RESTORE — export/import all localStorage data
// ════════════════════════════════════════════════════════════════════════

function exportBackup(){
  const backup={
    version:1,
    exported:new Date().toISOString(),
    cardiacLog_days:JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'),
    cardiacLog_favorites:JSON.parse(localStorage.getItem(FAV_KEY)||'[]'),
  };
  const json=JSON.stringify(backup,null,2);
  const blob=new Blob([json],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  const now=new Date();
  const yr=now.getFullYear();
  const mo=String(now.getMonth()+1).padStart(2,'0');
  const dy=String(now.getDate()).padStart(2,'0');
  const hr=String(now.getHours()).padStart(2,'0');
  const mn=String(now.getMinutes()).padStart(2,'0');
  a.href=url;
  a.download=`cardiac-log-backup-${yr}-${mo}-${dy}-${hr}${mn}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  // Show confirmation toast
  showToast('✓ Backup downloaded — save to iCloud Drive or Files');
}

function importBackup(input){
  const file=input.files[0];
  if(!file){return;}
  const reader=new FileReader();
  reader.onload=function(e){
    try{
      const backup=JSON.parse(e.target.result);
      // Validate
      if(!backup.cardiacLog_days){
        alert('Invalid backup file — does not contain cardiac log data.');
        input.value='';
        return;
      }
      // Count days
      const dayCount=Object.keys(backup.cardiacLog_days).length;
      const favCount=(backup.cardiacLog_favorites||[]).length;
      // Confirm before overwriting
      const exportDate=backup.exported?new Date(backup.exported).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'}):'unknown date';
      const ok=confirm(`Restore backup from ${exportDate}?\n\nThis will restore:\n• ${dayCount} days of logged data\n• ${favCount} saved favorites\n\nYour current data will be replaced. This cannot be undone.`);
      if(!ok){input.value='';return;}
      // Restore
      localStorage.setItem(STORAGE_KEY,JSON.stringify(backup.cardiacLog_days));
      if(backup.cardiacLog_favorites){
        localStorage.setItem(FAV_KEY,JSON.stringify(backup.cardiacLog_favorites));
      }
      input.value='';
      // Reload
      loadDay(currentDate);
      drawWeightChart();
      updateProgressTab();
      showToast(`✓ Restored ${dayCount} days of data`);
      // Re-check import buttons
      checkImportsLoaded2();
    }catch(err){
      alert('Could not read backup file. Make sure it is a valid cardiac log backup JSON.');
      input.value='';
    }
  };
  reader.readAsText(file);
}

function showToast(msg){
  const t=document.createElement('div');
  t.style.cssText='position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--accent);color:white;padding:10px 20px;border-radius:24px;font-size:13px;font-weight:600;z-index:999;box-shadow:0 4px 16px rgba(0,0,0,0.18);white-space:nowrap;max-width:90vw;text-align:center;';
  t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),3200);
}

function checkImportsLoaded2(){
  const all=getAllDays();
  const hasHistory=Object.keys(all).some(d=>d<'2025-01-01');
  const hBtn=document.getElementById('importHistoryBtn');
  if(hasHistory&&hBtn){hBtn.textContent='History loaded ✓';hBtn.disabled=true;hBtn.className='import-btn done';}
  const hasTrip=all['2025-04-03']&&all['2025-04-03'].meals&&all['2025-04-03'].meals.length>0;
  const tBtn=document.getElementById('importTripBtn');
  if(hasTrip&&tBtn){tBtn.textContent='Trip loaded ✓';tBtn.disabled=true;tBtn.className='import-btn done';}
}
