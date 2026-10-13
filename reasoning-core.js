import { mobileDefaults, conveyorDefaults, mobileControls, conveyorControls, experiments, causes, fixes, reasoningCases } from './reasoning-data.js?v=1.6.0';

export const REASONING_KEY = 'robototehnika-bileti-ru:reasoning:v1';
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
const finite=(x,d)=>typeof x==='number'&&Number.isFinite(x)?x:d;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const fmt=(x,d=2)=>new Intl.NumberFormat('ru',{maximumFractionDigits:d}).format(Math.abs(x)<1e-8?0:x);
const deg=r=>r*180/Math.PI;
export function normalize(kind, raw={}) {
  const d=kind==='mobile'?mobileDefaults:conveyorDefaults, out={...d};
  if(!obj(raw))return out;
  for(const [key,,min,max] of kind==='mobile'?mobileControls:conveyorControls)out[key]=clamp(finite(raw[key],d[key]),min,max);
  if(kind==='conveyor'){out.mode=raw.mode==='level'?'level':'edge';out.sensor=raw.sensor!==false;out.phase%=out.scan;}
  return out;
}

// Exact integration of constant wheel velocities. SI units inside the kinematic model.
export function poseAt(v,w,t){return Math.abs(w)<1e-10?{x:v*t,y:0,angle:w*t}:{x:v*Math.sin(w*t)/w,y:v*(1-Math.cos(w*t))/w,angle:w*t};}
export function simulateMobile(raw={}) {
  const p=normalize('mobile',raw),traction=1-p.slip/100;
  const vl=p.left*p.radiusLeft/1000*traction,vr=p.right*p.radiusRight/1000*traction;
  const v=(vl+vr)/2,w=(vr-vl)/(p.base/1000);
  const ol=p.left*p.odomRadius/1000,or=p.right*p.odomRadius/1000,ov=(ol+or)/2,ow=(or-ol)/(p.odomBase/1000);
  const points=Array.from({length:101},(_,i)=>{const t=p.seconds*i/100;return {t,actual:poseAt(v,w,t),odom:poseAt(ov,ow,t)};});
  return {kind:'mobile',p,points,actual:points.at(-1).actual,odom:points.at(-1).odom,distance:Math.abs(v)*p.seconds,estimatedDistance:Math.abs(ov)*p.seconds,vl,vr,v,w,ov,ow};
}

// Three clean pulses, symmetric stable-state filter, then periodic input sampling.
export function simulateConveyor(raw={}) {
  const p=normalize('conveyor',raw),width=p.length/p.speed*1000,gap=200/p.speed*1000;
  const physical=Array.from({length:3},(_,i)=>[13.5/p.speed*1000+i*gap,13.5/p.speed*1000+i*gap+width]);
  const pulses=p.sensor?physical:[],filtered=pulses.filter(([a,b])=>b-a+1e-9>=p.filter).map(([a,b])=>[a+p.filter,b+p.filter]);
  const duration=physical.at(-1)[1]+p.filter+2*p.scan+50;
  let previous=false,count=0;
  const samples=[];
  for(let i=0;p.phase+i*p.scan<=duration;i++){
    const t=p.phase+i*p.scan,high=filtered.some(([a,b])=>t>=a-1e-9&&t<b-1e-9),increment=high&&(p.mode==='level'||!previous);
    if(increment)count++;
    samples.push({t,high,increment,count});previous=high;
  }
  return {kind:'conveyor',p,width,gap,physical,pulses,filtered,samples,count,duration};
}

export const initialCaseParameters=s=>normalize(s.kind,{...(s.kind==='mobile'?mobileDefaults:conveyorDefaults),...s.fault});
export function repairedParameters(s,repair) {
  const p=initialCaseParameters(s);
  const changes=s.kind==='mobile'?{wheels:{radiusLeft:100,radiusRight:100},radius:{odomRadius:100},base:{odomBase:500},traction:{slip:0}}:{sensor:{sensor:true},filter:{filter:5},scan:{scan:2},edge:{mode:'edge'}};
  return normalize(s.kind,{...p,...(Object.hasOwn(changes,repair)?changes[repair]:{})});
}
const straightCode=r=>Math.abs(r.actual.angle)>.01?'curve':Math.abs(r.distance-r.estimatedDistance)<.01?'match':r.estimatedDistance<r.distance?'short':'long';
export function mobileReadings(r){return [
  ['По полу: длина пути центра',`${fmt(r.distance)} м`],['По энкодерам: длина пути центра',`${fmt(r.estimatedDistance)} м`],
  ['По полу: X; Y',`${fmt(r.actual.x)}; ${fmt(r.actual.y)} м`],['По полу: угол',`${fmt(deg(r.actual.angle))}°`],['По одометрии: угол',`${fmt(deg(r.odom.angle))}°`],
  ['Обороты левого; правого колеса',`${fmt(r.p.left*r.p.seconds/(2*Math.PI))}; ${fmt(r.p.right*r.p.seconds/(2*Math.PI))}`]
];}
export function conveyorReadings(r){return [
  ['Деталей прошло', '3'],['Импульсов датчика',String(r.pulses.length)],['Импульсов после фильтра',String(r.filtered.length)],['Итог счётчика',String(r.count)],
  ['Длительность импульса',`${fmt(r.width)} мс`],['Фильтр / период опроса',`${fmt(r.p.filter)} / ${fmt(r.p.scan)} мс`]
];}
export function runExperiment(s,id) {
  const test=experiments[s.kind].find(t=>t.id===id);if(!test)throw Error('Unknown experiment');
  const p=initialCaseParameters(s);
  if(s.kind==='mobile'){
    if(id==='geometry')return {kind:'geometry',code:p.radiusLeft!==p.radiusRight?'unequal':p.odomRadius!==p.radiusLeft?'radius-setting':p.odomBase!==p.base?'base-setting':'equal',rows:[['Радиусы: левый; правый',`${p.radiusLeft}; ${p.radiusRight} мм`],['Радиус в одометрии',`${p.odomRadius} мм`],['База: измеренная; в одометрии',`${p.base}; ${p.odomBase} мм`]],result:null};
    const command=id==='turn'?{left:-2,right:2,seconds:Math.PI/1.6}:id==='floor'?{slip:0}:{};
    const r=simulateMobile({...p,...command});
    const code=id==='turn'?Math.hypot(r.actual.x,r.actual.y)>.005?'drift':Math.abs(r.actual.angle-r.odom.angle)<.01?'match':r.odom.angle>r.actual.angle?'over':'under':straightCode(r);
    return {kind:'mobile',code,rows:mobileReadings(r),result:r};
  }
  const r=simulateConveyor({...p,...(id==='slow'?{speed:250}:id==='fastscan'?{scan:2}:{})});
  return {kind:'conveyor',code:r.count===3?'correct':r.count<3?'missing':'extra',rows:conveyorReadings(r),result:r};
}

export function verifyRepair(s,repair) {
  const p=repairedParameters(s,repair);
  if(s.kind==='mobile')return [
    {name:'Прямой проезд: 2 м',r:simulateMobile({...p,left:4,right:4,seconds:5}),target:0},
    {name:'Поворот: 90°',r:simulateMobile({...p,left:-2,right:2,seconds:Math.PI/1.6}),target:Math.PI/2}
  ].map(({name,r,target})=>({name,result:r,pass:target===0?Math.abs(r.actual.x-2)<.01&&Math.abs(r.actual.y)<.01&&Math.abs(r.actual.angle)<.01&&Math.abs(r.odom.x-2)<.01:Math.hypot(r.actual.x,r.actual.y)<.01&&Math.abs(r.actual.angle-target)<.01&&Math.abs(r.odom.angle-target)<.01,detail:target===0?`По полу X = ${fmt(r.actual.x)} м, Y = ${fmt(r.actual.y)} м; одометрия X = ${fmt(r.odom.x)} м`:`По полу ${fmt(deg(r.actual.angle))}°; одометрия ${fmt(deg(r.odom.angle))}°`}));
  // Different scan phases guard against a lucky alignment of a pulse with a sample.
  return [500,700].map(speed=>{
    const results=[0,.25,.5,.75].map(f=>simulateConveyor({...p,speed,phase:p.scan*f}));
    return {name:`${speed} мм/с: 3 детали, 4 фазы опроса`,pass:results.every(r=>r.count===3),result:results[0],detail:`Отсчёты при четырёх фазах: ${results.map(r=>r.count).join(', ')}. Требуется по 3.`};
  });
}

export const freshReasoningCase=()=>({hypothesis:'',conclusion:'',notes:'',experiments:{},repair:'',verifiedRepair:'',hint:false,revealed:false});
export const freshReasoning=()=>({labs:{mobile:{parameters:{...mobileDefaults},notes:''},conveyor:{parameters:{...conveyorDefaults},notes:''}},cases:{}});
export function recordExperiment(s,e,id,prediction) {
  const t=experiments[s.kind].find(x=>x.id===id);
  if(!t||!causes[s.kind].some(([c])=>c===e.hypothesis)||!['unsure',...t.predictions.map(([k])=>k)].includes(prediction))return false;
  if(!Object.hasOwn(e.experiments,id))e.experiments[id]={prediction,hypothesis:e.hypothesis};
  return true;
}
export function assessReasoning(s,e) {
  const missing=s.required.filter(id=>!Object.hasOwn(e.experiments,id));
  const evidence=missing.length===0,cause=e.hypothesis===s.cause,conclusion=e.conclusion==='evidence';
  const verified=!!e.repair&&e.verifiedRepair===e.repair&&verifyRepair(s,e.repair).every(t=>t.pass);
  return {complete:evidence&&cause&&conclusion&&verified,evidence,cause,conclusion,verified,missing,assisted:e.hint||e.revealed};
}
export function readReasoning(storage) {
  const state=freshReasoning();
  try{
    const raw=storage?.getItem(REASONING_KEY);if(!raw)return {state,error:false};
    if(raw.length>100000)throw Error('Oversized state');
    const saved=JSON.parse(raw);if(!obj(saved))throw Error('Invalid state');
    const note=x=>typeof x==='string'?x.slice(0,2000):'';
    for(const kind of ['mobile','conveyor'])if(obj(saved.labs?.[kind]))state.labs[kind]={parameters:normalize(kind,saved.labs[kind].parameters),notes:note(saved.labs[kind].notes)};
    for(const s of reasoningCases){
      const rawCase=saved.cases?.[s.id];if(!obj(rawCase))continue;
      const e=freshReasoningCase(),known=(list,value)=>list.some(([id])=>id===value)?value:'';
      e.hypothesis=known(causes[s.kind],rawCase.hypothesis);e.conclusion=known(s.conclusions,rawCase.conclusion);e.repair=known(fixes[s.kind],rawCase.repair);
      e.verifiedRepair=rawCase.verifiedRepair===e.repair?e.repair:'';e.notes=note(rawCase.notes);e.hint=rawCase.hint===true;e.revealed=rawCase.revealed===true;
      for(const t of experiments[s.kind]){
        const record=rawCase.experiments?.[t.id];if(!obj(record))continue;
        const old=e.hypothesis;e.hypothesis=known(causes[s.kind],record.hypothesis);recordExperiment(s,e,t.id,record.prediction);e.hypothesis=old;
      }
      state.cases[s.id]=e;
    }
    return {state,error:false};
  }catch{return {state,error:true};}
}
