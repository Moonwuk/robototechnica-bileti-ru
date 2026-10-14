import { armJoints, MODEL } from './workshop-core.js?v=1.8.0';

export function cycleFrames(result) {
  const home={x:430,y:310},pick={x:result.actualToolX,y:160};
  const frames=[{...home,phase:'Готов к подаче',placed:0,item:0,carrying:false}];
  for(let i=0;i<(result.inputOK?4:1);i++) {
    const slot=result.placements[i];
    frames.push({...home,phase:'Подача детали',placed:i,item:i,carrying:false});
    frames.push({...pick,phase:'Подход к детали',placed:i,item:i,carrying:false});
    frames.push({...pick,phase:'Набор вакуума / ожидание входа',placed:i,item:i,carrying:false});
    if(!result.inputOK) { frames.push({...pick,phase:`Ожидание ${result.p.input} · тайм-аут`,placed:i,item:i,carrying:false});break; }
    frames.push({x:470,y:230,phase:'Перенос детали',placed:i,item:i,carrying:true});
    frames.push({x:slot.x,y:slot.y,phase:'Подход к месту укладки',placed:i,item:i,carrying:true});
    frames.push({x:slot.x,y:slot.y,phase:'Укладка / отпускание',placed:i+1,item:i,carrying:false});
    frames.push({...home,phase:i===3?'Четыре детали перенесены':'Возврат за следующей деталью',placed:i+1,item:i,carrying:false});
  }
  return frames;
}
const f=n=>Number(n).toFixed(2);
const box=(x,y,cls='')=>`<g class="ws-box ${cls}" transform="translate(${f(x)} ${f(y)})"><rect x="-19" y="-16" width="38" height="32" rx="3"/><path d="M-19 0H19M0-16V16"/></g>`;
export function scene(result, frame=cycleFrames(result)[0]) {
  const a=armJoints(frame.x,frame.y),positions=Array.from({length:4},(_,i)=>({x:MODEL.palletX+i%2*100,y:MODEL.palletY+Math.floor(i/2)*100}));
  const showOnBelt=frame.phase==='Подача детали'||frame.phase==='Подход к детали'||frame.phase.includes('вакуум')||frame.phase.includes('тайм-аут');
  return `<svg viewBox="0 0 920 490" role="img" aria-labelledby="ws-scene-title ws-scene-desc"><title id="ws-scene-title">Роботизированная ячейка: вид сверху</title><desc id="ws-scene-desc">Слева конвейер и датчик детали, в центре промышленный манипулятор с вакуумным захватом, справа поддон с четырьмя местами. ${frame.placed} деталей уложено.</desc>
    <defs><pattern id="ws-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#294458" stroke-width="1"/></pattern><marker id="ws-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="none" stroke="#81d9e3" stroke-width="1.3"/></marker></defs>
    <rect width="920" height="490" rx="16" fill="#102c3e"/><rect x="20" y="44" width="880" height="410" rx="12" fill="url(#ws-grid)"/>
    <path d="M34 260V62H884V440H550M34 260V440H345" fill="none" stroke="#65737e" stroke-width="5" stroke-dasharray="12 5"/>
    <text x="34" y="28" class="ws-svg-label">ЯЧЕЙКА 01 · ВИД СВЕРХУ</text><text x="665" y="28" class="ws-svg-label">УЧЕБНАЯ СИМУЛЯЦИЯ</text>
    <rect x="45" y="108" width="332" height="106" rx="9" fill="#203e4e" stroke="#8fa8b8" stroke-width="3"/>
    ${Array.from({length:14},(_,i)=>`<path d="M${55+i*24} 119V204" stroke="#456272" stroke-width="5"/>`).join('')}
    <path d="M73 235H335" stroke="#81d9e3" stroke-width="2" marker-end="url(#ws-arrow)"/>
    <path d="M120 102V220" stroke="#7de2ed" stroke-width="1.6" stroke-dasharray="4 4"/><rect x="110" y="86" width="20" height="20" rx="3" fill="#69ccd9"/><text x="61" y="78" class="ws-svg-small">Датчик детали</text>
    <rect x="606" y="70" width="190" height="180" rx="4" fill="#786448" stroke="#c3aa7b" stroke-width="3"/>
    ${[620,656,692,728,764,790].map(x=>`<path d="M${x} 78V243" stroke="#aa9066" stroke-width="8"/>`).join('')}
    ${positions.map(p=>`<rect x="${p.x-23}" y="${p.y-20}" width="46" height="40" rx="3" fill="#15384a" stroke="#99dfd4" stroke-width="2" stroke-dasharray="5 3"/>`).join('')}
    <text x="617" y="278" class="ws-svg-label">ПОДДОН · 2 × 2</text>
    <path d="M605 311H664" stroke="#81d9e3" stroke-width="2" marker-end="url(#ws-arrow)"/><path d="M605 311V294" stroke="#81d9e3" stroke-width="2" marker-end="url(#ws-arrow)"/><text x="674" y="316" class="ws-svg-small">X базы</text><text x="584" y="296" class="ws-svg-small">Y</text>
    ${result.placements.slice(0,frame.placed).map(p=>box(p.x,p.y,p.good?'':'ws-box-error')).join('')}
    ${showOnBelt?box(frame.phase==='Подача детали'?120:result.actualPartX,160):''}
    <ellipse cx="450" cy="398" rx="51" ry="35" fill="#071c29"/><rect x="408" y="361" width="84" height="65" rx="15" fill="#60717b" stroke="#aec0ca" stroke-width="3"/>
    <path d="M450 390L${f(a.elbow.x)} ${f(a.elbow.y)}L${f(frame.x)} ${f(frame.y)}" fill="none" stroke="#071c29" stroke-width="37" stroke-linecap="round"/>
    <path d="M450 390L${f(a.elbow.x)} ${f(a.elbow.y)}" fill="none" stroke="#d98738" stroke-width="28" stroke-linecap="round"/>
    <path d="M${f(a.elbow.x)} ${f(a.elbow.y)}L${f(frame.x)} ${f(frame.y)}" fill="none" stroke="#efb05a" stroke-width="22" stroke-linecap="round"/>
    ${[{x:450,y:390},a.elbow].map(p=>`<circle cx="${f(p.x)}" cy="${f(p.y)}" r="15" fill="#233b4b" stroke="#e4b37a" stroke-width="4"/><circle cx="${f(p.x)}" cy="${f(p.y)}" r="5" fill="#b6c5ce"/>`).join('')}
    ${frame.carrying?box(frame.x,frame.y):''}
    <circle cx="${f(frame.x)}" cy="${f(frame.y)}" r="12" fill="#284956" stroke="#b3ece5" stroke-width="3"/><path d="M${f(frame.x-18)} ${f(frame.y)}h36M${f(frame.x)} ${f(frame.y-18)}v36" stroke="#b3ece5" stroke-width="1"/>
    <rect x="65" y="244" width="235" height="23" rx="4" fill="#102c3e" fill-opacity=".92"/><text x="75" y="259" class="ws-svg-label">КОНВЕЙЕР · ${result.p.speed} мм/с</text>
    <text x="337" y="466" class="ws-svg-label">МАНИПУЛЯТОР · ВАКУУМНЫЙ ЗАХВАТ</text>
  </svg>`;
}
export function vacuumChart(result) {
  const points=result.trace.map(p=>`${50+p.time*380},${165+p.pressure*2}`).join(' ');
  return `<svg viewBox="0 0 480 210" role="img" aria-label="Давление после включения вакуума, от нуля до одной секунды; пунктиром порог −40 кПа"><path d="M50 25V165H435" fill="none" stroke="#7e929d"/>
    <path d="M50 85H435" stroke="#bd6639" stroke-dasharray="5 4"/>
    <polyline points="${points}" fill="none" stroke="#087b8b" stroke-width="3"/>
    <g fill="#395568" font-size="13"><text x="10" y="170">0</text><text x="4" y="90">−40</text><text x="4" y="50">−60</text><text x="48" y="188">0</text><text x="395" y="188">1 с</text><text x="55" y="18">Давление, кПа</text><text x="290" y="76">Порог реле</text></g></svg>`;
}
