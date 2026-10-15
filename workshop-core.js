import { controls, defaults, scenarios, probes, repairs, hypotheses } from './workshop-data.js?v=1.9.0';

export const WORKSHOP_KEY = 'robototehnika-bileti-ru:workshop:v1';
export const MODEL = Object.freeze({ pickTime:.8, vacuumTime:1, tau:.35, maxVacuum:60, threshold:40, tolerance:8, pitch:100, palletX:650, palletY:105 });
const validId = (items, id) => items.some(x => x.id === id);
export function normalizeParameters(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {};
  const p = { ...defaults };
  for (const c of controls) if (typeof raw[c.key] === 'number' && Number.isFinite(raw[c.key])) p[c.key] = Math.min(c.max, Math.max(c.min, raw[c.key]));
  if (typeof raw.tracking === 'boolean') p.tracking = raw.tracking;
  if (['DI2','DI3'].includes(raw.input)) p.input = raw.input;
  return p;
}
export function initialParameters(scenario) { return normalizeParameters({ ...defaults, ...scenario.fault }); }
export function applyRepair(parameters, id) {
  const p = normalizeParameters(parameters);
  if (id === 'tcp') p.tcpX = 0;
  if (id === 'pallet') p.palletX = 0;
  if (id === 'vacuum') p.leak = 0;
  if (id === 'input') p.input = 'DI2';
  if (id === 'tracking') p.tracking = true;
  return p;
}
export function vacuumAt(t, p, contact = true) {
  return contact ? -MODEL.maxVacuum * (1 - p.leak / 100) * (1 - Math.exp(-Math.max(0,t) / MODEL.tau)) : 0;
}
export function simulateCell(parameters) {
  const p = normalizeParameters(parameters), age = p.delay / 1000;
  const actualPartX = 120 + p.speed * MODEL.pickTime;
  const measuredX = actualPartX - p.speed * age;
  const requestedX = measuredX + (p.tracking ? p.speed * age : 0);
  const actualToolX = requestedX - p.tcpX;
  const pickError = actualToolX - actualPartX;
  const contact = Math.abs(pickError) <= MODEL.tolerance;
  const pressure = vacuumAt(MODEL.vacuumTime,p,contact);
  const vacuumOK = -pressure >= MODEL.threshold;
  const inputOK = p.input === 'DI2' && vacuumOK;
  const placements = inputOK ? Array.from({length:4},(_,i)=>{
    const col=i%2,row=Math.floor(i/2),targetX=MODEL.palletX+col*MODEL.pitch,targetY=MODEL.palletY+row*MODEL.pitch;
    const x=MODEL.palletX+p.palletX+col*p.pitch-p.tcpX;
    return {x,y:targetY,targetX,targetY,error:x-targetX,good:Math.abs(x-targetX)<=MODEL.tolerance};
  }) : [];
  const good = placements.filter(x=>x.good).length;
  const status = !inputOK ? 'waiting-grip' : good!==4 ? 'layout-error' : 'complete';
  const trace = Array.from({length:21},(_,i)=>({time:i/20,pressure:vacuumAt(i/20,p,contact)}));
  const events = [
    {time:0,text:'Фотоэлектрический датчик: деталь обнаружена. Лента движется.'},
    {time:.8,text:'Подход к точке захвата; DO1 = 1 — включён вакуум.'},
    {time:1.8,text:`DI2 = ${vacuumOK?1:0}; программа ожидает ${p.input} = 1.`},
    {time:inputOK?2.4:2.8,text:inputOK?'Подтверждение получено. Перенос разрешён.':'Тайм-аут подтверждения захвата. Перенос не начат.'},
    ...(inputOK?[{time:3.2,text:'Укладка и DO1 = 0. Последовательность повторена для четырёх деталей.'}]:[])
  ];
  return {p,actualPartX,measuredX,requestedX,actualToolX,pickError,contact,pressure,vacuumOK,inputOK,placements,good,status,ok:status==='complete',trace,events};
}
export function measurements(id, parameters) {
  const r=simulateCell(parameters),p=r.p;
  const n=x=>new Intl.NumberFormat('ru',{maximumFractionDigits:1}).format(x);
  switch(id) {
    case 'tcp':return [['Настроенный TCP X',`${n(p.tcpX)} мм`],['Контрольное измерение TCP X','0 мм'],['Расхождение',`${n(p.tcpX)} мм`],['Ориентация инструмента','Фиксирована; ось X инструмента совпадает с X базы']];
    case 'pallet':return [['Метка 1: эталон / настройка',`${MODEL.palletX} / ${n(MODEL.palletX+p.palletX)} мм`],['Метка 2: эталон / настройка',`${MODEL.palletX+100} / ${n(MODEL.palletX+p.palletX+p.pitch)} мм`],['Шаг X: эталон / настройка',`100 / ${n(p.pitch)} мм`]];
    case 'vacuum':return [['Контакт с деталью',r.contact?'Есть':'Нет — захват вне допуска ±8 мм'],['Давление через 0,25 с',`${n(vacuumAt(.25,p,r.contact))} кПа`],['Давление через 1 с',`${n(r.pressure)} кПа`],['Порог реле','Давление ≤ −40 кПа'],['DI2: вакуум подтверждён',r.vacuumOK?'1':'0']];
    case 'signals':return [['DO1: команда вакуума','1'],['DI2: реле вакуума',r.vacuumOK?'1':'0'],['DI3: резервный вход','0'],['Условие программы',`${p.input} = 1`],['Перенос разрешён',r.inputOK?'Да':'Нет']];
    case 'timing':return [['Скорость энкодера',`${n(p.speed)} мм/с`],['Возраст координаты',`${n(p.delay)} мс`],['Измеренная координата',`${n(r.measuredX)} мм`],['Фактическая координата при захвате',`${n(r.actualPartX)} мм`],['Заданная координата TCP',`${n(r.requestedX)} мм`],['Учёт времени измерения',p.tracking?'Включён':'Выключен']];
    default:return [];
  }
}
export function freshCase() { return {tests:[],repairs:[],hypothesis:'',notes:'',baselineRun:false,lastRun:null,runs:0,hint:false,revealed:false}; }
export function caseParameters(scenario, entry) { return entry.repairs.reduce(applyRepair,initialParameters(scenario)); }
export function assessCase(scenario,entry) {
  const missing=scenario.evidence.filter(id=>!entry.tests.includes(id));
  const currentRun=entry.lastRun && JSON.stringify(entry.lastRun)===JSON.stringify(entry.repairs);
  const corrected=Boolean(currentRun && simulateCell(caseParameters(scenario,entry)).ok);
  const diagnosed=entry.hypothesis===scenario.cause;
  return {complete:Boolean(entry.baselineRun && !missing.length && diagnosed && corrected),missing,corrected,diagnosed,currentRun:Boolean(currentRun),assisted:entry.hint||entry.revealed};
}
export function readWorkshop(storage) {
  const state={version:1,lab:{parameters:{...defaults},prediction:''},cases:{}};
  try {
    const text=storage?.getItem(WORKSHOP_KEY);
    if(!text)return {state,error:false};
    if(text.length>70000)throw Error('Too much data');
    const v=JSON.parse(text);
    if(v?.version!==1||!v.cases||typeof v.cases!=='object'||Array.isArray(v.cases))throw Error('Invalid data');
    state.lab.parameters=normalizeParameters(v.lab?.parameters);
    state.lab.prediction=typeof v.lab?.prediction==='string'?v.lab.prediction.slice(0,2000):'';
    for(const s of scenarios){
      const x=v.cases[s.id];if(!x||typeof x!=='object')continue;
      const e=freshCase();
      e.tests=Array.isArray(x.tests)?[...new Set(x.tests.filter(id=>validId(probes,id)))].slice(0,probes.length):[];
      e.repairs=Array.isArray(x.repairs)?x.repairs.filter(id=>validId(repairs,id)).slice(0,20):[];
      e.lastRun=Array.isArray(x.lastRun)&&x.lastRun.length<=20&&x.lastRun.every(id=>validId(repairs,id))?[...x.lastRun]:null;
      e.hypothesis=validId(hypotheses,x.hypothesis)?x.hypothesis:'';
      e.notes=typeof x.notes==='string'?x.notes.slice(0,2000):'';
      e.baselineRun=x.baselineRun===true;
      e.runs=Number.isInteger(x.runs)?Math.max(0,Math.min(999,x.runs)):0;
      e.hint=x.hint===true;e.revealed=x.revealed===true;
      state.cases[s.id]=e;
    }
    return {state,error:false};
  } catch {return {state:{version:1,lab:{parameters:{...defaults},prediction:''},cases:{}},error:true};}
}

// A schematic 2-link arm with a vertical tool; independent of process acceptance.
export function armJoints(x,y) {
  const bx=450,by=390,l1=290,l2=260,dx=x-bx,dy=y-by,d=Math.hypot(dx,dy);
  const reachable=d<=l1+l2&&d>=Math.abs(l1-l2);
  const cos=Math.max(-1,Math.min(1,(dx*dx+dy*dy-l1*l1-l2*l2)/(2*l1*l2)));
  const q2=Math.acos(cos),q1=Math.atan2(dy,dx)-Math.atan2(l2*Math.sin(q2),l1+l2*Math.cos(q2));
  return {base:{x:bx,y:by},elbow:{x:bx+l1*Math.cos(q1),y:by+l1*Math.sin(q1)},tip:{x,y},reachable};
}
