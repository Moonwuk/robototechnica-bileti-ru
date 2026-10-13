const f=x=>Number(x.toFixed(2));
const E=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const style='<style>text{font-family:Arial,sans-serif;fill:#c9dbe4;font-size:13px}.axis{fill:#8da9b7;font-size:11px}.title{fill:#fff;font-size:17px;font-weight:700}.label{fill:#fff;font-size:12px}</style>';
const svg=(label,body,height=480)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 ${height}" role="img" aria-label="${E(label)}">${style}<rect width="800" height="${height}" rx="16" fill="#102b3d"/>${body}</svg>`;

export function mobileScene(r,frame=100) {
  const index=Math.max(0,Math.min(100,Math.round(frame))),points=r.points,now=points[index];
  const all=points.flatMap(p=>[p.actual,p.odom]);
  const xmin=Math.min(-.65,...all.map(p=>p.x-.35)),xmax=Math.max(2.5,...all.map(p=>p.x+.35));
  const ymin=Math.min(-.9,...all.map(p=>p.y-.35)),ymax=Math.max(.9,...all.map(p=>p.y+.35));
  const scale=Math.min(680/(xmax-xmin),300/(ymax-ymin));
  const X=x=>f(400+(x-(xmin+xmax)/2)*scale),Y=y=>f(237-(y-(ymin+ymax)/2)*scale);
  const step=xmax-xmin>5?1:.5;let grid='';
  for(let x=Math.ceil(xmin/step)*step;x<=xmax;x+=step)grid+=`<path d="M${X(x)} 77V397" stroke="#244456"/><text x="${X(x)}" y="415" class="axis" text-anchor="middle">${f(x)}</text>`;
  for(let y=Math.ceil(ymin/step)*step;y<=ymax;y+=step)grid+=`<path d="M56 ${Y(y)}H744" stroke="#244456"/><text x="46" y="${Y(y)+4}" class="axis" text-anchor="end">${f(y)}</text>`;
  const path=key=>points.slice(0,index+1).map((p,i)=>`${i?'L':'M'}${X(p[key].x)},${Y(p[key].y)}`).join(' ');
  const robot=`<g transform="translate(${X(now.actual.x)} ${Y(now.actual.y)}) rotate(${-f(now.actual.angle*180/Math.PI)})"><rect x="-21" y="-24" width="24" height="8" rx="3" fill="#060f17" stroke="#8da9b7"/><rect x="-21" y="16" width="24" height="8" rx="3" fill="#060f17" stroke="#8da9b7"/><rect x="-27" y="-17" width="54" height="34" rx="9" fill="#ef9b42" stroke="#ffd4a2" stroke-width="2"/><rect x="-16" y="-11" width="25" height="22" rx="3" fill="#a56634"/><path d="M13 -6L21 0L13 6" stroke="#fff" fill="none" stroke-width="2"/></g>`;
  return svg('Транспортная тележка: измеренная траектория и одометрия',`<text x="28" y="35" class="title">AGV · ПОДАЧА КОМПЛЕКТУЮЩИХ</text><text x="772" y="35" text-anchor="end">Вид сверху · ${f(now.t)} с</text>${grid}<path d="${path('odom')}" fill="none" stroke="#7bdfdf" stroke-width="3" stroke-dasharray="9 6"/><path d="${path('actual')}" fill="none" stroke="#efa451" stroke-width="4"/><circle cx="${X(0)}" cy="${Y(0)}" r="5" fill="#fff"/><text x="${X(0)-8}" y="${Y(0)+40}" text-anchor="end">Старт</text><path d="M${X(2)} ${Y(.22)}V${Y(-.22)}" stroke="#8295a1" stroke-dasharray="4 3"/><text x="${X(2)}" y="${Y(-.22)+20}" text-anchor="middle" class="axis">Отметка 2 м</text><circle cx="${X(now.odom.x)}" cy="${Y(now.odom.y)}" r="9" fill="none" stroke="#7bdfdf" stroke-width="2"/>${robot}<text x="748" y="415" class="axis">X, м</text><text x="20" y="64" class="axis">Y, м</text><path d="M30 447h27" stroke="#efa451" stroke-width="4"/><text x="68" y="452">Измерение по полу</text><path d="M302 447h27" stroke="#7bdfdf" stroke-width="3" stroke-dasharray="7 4"/><text x="340" y="452">Одометрия по энкодерам</text>`);
}

export function conveyorScene(r,frame=100) {
  const time=r.duration*Math.max(0,Math.min(100,frame))/100,X=t=>f(144+620*t/r.duration);
  const signal=(intervals,y)=>{
    let d=`M144 ${y+22}`;
    for(const [a,b] of intervals)d+=`H${X(a)}V${y}H${X(b)}V${y+22}`;
    return d+'H764';
  };
  const countAt=r.samples.filter(s=>s.t<=time).at(-1)?.count||0;
  const high=r.pulses.some(([a,b])=>time>=a&&time<b);
  let belt='<rect x="34" y="65" width="514" height="88" rx="12" fill="#2c4b5d" stroke="#6a8798"/>';
  for(let x=50;x<540;x+=26)belt+=`<path d="M${x} 76v66" stroke="#4d6b7c"/>`;
  for(const [a] of r.physical){const x=260+(time-a)*r.p.speed/1000*.8;if(x>=45&&x<=520)belt+=`<rect x="${f(x-r.p.length*.8)}" y="91" width="${r.p.length*.8}" height="35" rx="3" fill="#eda452" stroke="#ffd4a2"/>`;}
  let chart='';
  for(const [label,intervals,y,color] of [['Датчик',r.pulses,227,'#efa451'],['После фильтра',r.filtered,283,'#7bdfdf']])chart+=`<text x="22" y="${y+17}">${label}</text><path d="${signal(intervals,y)}" stroke="${color}" fill="none" stroke-width="2.5"/>`;
  // Every high input sample is represented; overlaps at dense settings are intentional.
  chart+=`<text x="22" y="353">Опрос входа 1</text><path d="M144 349H764" stroke="#3e6175"/>`+r.samples.filter(s=>s.high).map(s=>`<circle cx="${X(s.t)}" cy="349" r="2.5" fill="${s.increment?'#eda452':'#7bdfdf'}"/>`).join('');
  let steps='M144 405';const max=Math.max(3,r.count);
  for(const s of r.samples)if(s.increment)steps+=`H${X(s.t)}V${f(405-s.count/max*28)}`;
  chart+=`<text x="22" y="398">Счётчик: ${r.count}</text><path d="${steps}H764" stroke="#cedee8" fill="none" stroke-width="2"/>`;
  for(let i=0;i<=4;i++)chart+=`<text x="${X(r.duration*i/4)}" y="439" text-anchor="middle" class="axis">${Math.round(r.duration*i/4)}</text>`;
  return svg('Конвейер, датчик, фильтрация входа и счётчик ПЛК',`<text x="28" y="34" class="title">КОНВЕЙЕР · УЧЁТ ДЕТАЛЕЙ</text>${belt}<path d="M260 60V158" stroke="${high?'#ffbd61':'#728ba0'}" stroke-width="3" stroke-dasharray="5 4"/><rect x="247" y="47" width="26" height="16" rx="3" fill="${high?'#eda452':'#386075'}"/><text x="260" y="183" text-anchor="middle">Фотоэлектрический датчик</text><path d="M290 55H592V94" fill="none" stroke="#7bdfdf" stroke-width="2"/><rect x="578" y="66" width="194" height="96" rx="10" fill="#1c3e51" stroke="#678a9d"/><text x="598" y="91" class="label">ПЛК · СЧЁТ ДЕТАЛЕЙ</text><text x="598" y="135" style="font-size:30px;fill:#fff">${countAt}</text><text x="750" y="136" text-anchor="end">из 3</text>${chart}<path d="M${X(time)} 214V414" stroke="#fff" opacity=".6" stroke-dasharray="4 4"/><text x="30" y="466" class="axis">Точки: опросы единицы · оранжевая точка увеличивает счётчик</text><text x="766" y="466" text-anchor="end" class="axis">Время, мс</text>`);
}
