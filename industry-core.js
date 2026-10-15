// Deliberately small, deterministic models. Quantities and assumptions are shown in the UI.
const rounded = n => Number(n.toFixed(3));
export function simulateIndustry(kind, p) {
  let ok = false, rows = [], trace = [], columns = [], caption = '', metrics = {};
  switch (kind) {
    case 'throughput': {
      const phases = [['Перемещение', p.motion], ['Захват', p.grip], ['Обработка', p.process], ['Ожидание обмена', p.wait]];
      let time = 0;
      for (const [name, duration] of phases) { trace.push([name, rounded(time), rounded(time + duration), duration]); time += duration; }
      const rate = 3600 / time;
      ok = rate + 1e-9 >= p.target;
      metrics = { cycle: time, rate, targetCycle: 3600 / p.target };
      rows = [['Цикл / допустимо, с', `${rounded(time)} / ${rounded(3600 / p.target)}`], ['Выпуск / план, деталей/ч', `${rounded(rate)} / ${p.target}`]];
      columns = ['Этап', 'Начало, с', 'Конец, с', 'Длительность, с']; caption = 'Хронограмма одного последовательного цикла'; break;
    }
    case 'tcp': {
      const a = p.angle * Math.PI / 180, x = p.baseX + p.toolX * Math.cos(a), y = p.baseY + p.toolX * Math.sin(a);
      ok = Math.hypot(x, y) <= .5;
      metrics = { x, y };
      rows = [['Ориентация инструмента', `${p.angle}°`], ['Ошибка X / Y в системе базы, мм', `${rounded(x)} / ${rounded(y)}`], ['Норма ошибки / допуск, мм', `${rounded(Math.hypot(x, y))} / 0.5`]]; break;
    }
    case 'vacuum': {
      const force = p.pressure * p.area * .1 * p.seal, required = p.mass * (9.81 + p.acceleration) * p.safety;
      ok = force >= required;
      metrics = { force, required };
      rows = [['Разрежение / эффективная доля площади', `${p.pressure} кПа / ${p.seal}`], ['Расчётная сила / требуется с запасом', `${rounded(force)} / ${rounded(required)} Н`], ['Масса / ускорение вверх', `${p.mass} кг / ${p.acceleration} м/с²`]]; break;
    }
    case 'plc': {
      let state = 'IDLE', previous = 0, starts = 0;
      const events = [[0,1,'scan'],[20,1,'done'],[30,1,'fault'],[40,1,'reset'],[40+p.hold,1,'scan'],[50+p.hold,0,'scan'],[60+p.hold,1,'scan']];
      for (const [t, start, event] of events) {
        const rising = !!start && !previous;
        if (event === 'fault') state = 'FAULT';
        else if (event === 'reset' && state === 'FAULT') state = 'IDLE';
        else if (event === 'done' && state === 'RUN') state = 'IDLE';
        // Reset and completion do not launch a cycle in the same scan.
        else if (state === 'IDLE' && p.enabled && start && (!p.edge || rising)) { state = 'RUN'; starts++; }
        trace.push([t,event,start,state,starts]); previous = start;
      }
      ok = starts === 2 && trace[4][4] === 1 && state === 'RUN';
      metrics = { starts, afterReset: trace[4][4] };
      rows = [['Запусков / ожидается', `${starts} / 2`], ['Запусков до отпускания Start / ожидается', `${trace[4][4]} / 1`], ['Последний новый фронт принят', state === 'RUN' && trace[6][4] > trace[5][4] ? 'Да' : 'Нет']];
      columns = ['t, мс','Событие','Start','Состояние','Запусков']; caption = 'Сканирование: удержание Start, авария, сброс, отпускание и новый запуск'; break;
    }
    case 'navigation': {
      const odom = p.distance * p.scale, lidar = p.distance, map = odom + p.frameOffset, residual = map - lidar;
      ok = Math.abs(residual) <= .05;
      metrics = { odom, lidar, map, residual };
      rows = [['Независимое расстояние по меткам', `${p.distance} м`], ['Колёсная одометрия', `${rounded(odom)} м`], ['Лидарная оценка в map', `${lidar} м`], ['odom + заданное смещение map→odom', `${rounded(map)} м`], ['Расхождение с лидаром / допуск', `${rounded(residual)} / 0.05 м`]]; break;
    }
    case 'fleet': {
      // Upper bounds from fleet work, single-lane passage and one charger, then arbitration losses.
      const fleet = p.robots * 3600 / p.trip, aisle = 3600 / p.passage, charger = 3600 * p.tripsPerCharge / p.charge;
      const contention = p.reservation ? 0 : Math.max(0,p.robots-2) * p.conflict;
      const capacity = Math.min(fleet, aisle, charger) * p.passage / (p.passage + contention);
      ok = capacity + 1e-9 >= p.target;
      metrics = { fleet, aisle, charger, capacity };
      rows = [['Предел по числу роботов', `${rounded(fleet)} миссий/ч`], ['Предел узкого прохода', `${rounded(aisle)} миссий/ч`], ['Предел одной зарядной станции', `${rounded(charger)} миссий/ч`], ['Потери на конфликт в расчёте на проход', `${rounded(contention)} с`], ['Выпуск / требуется', `${rounded(capacity)} / ${p.target} миссий/ч`]]; break;
    }
    case 'timing': {
      const delays = [p.base, p.base+p.jitter, Math.max(0,p.base-p.jitter), p.base+p.jitter];
      const missed = delays.filter(x=>x>p.deadline).length;
      ok = missed === 0;
      metrics = { missed, maximum: Math.max(...delays), mean: delays.reduce((a,b)=>a+b,0)/delays.length };
      rows = [['Соединение / потери пакетов','Установлено / 0'], ['Максимальная задержка / дедлайн',`${rounded(metrics.maximum)} / ${p.deadline} мс`], ['Просроченных команд',missed]];
      trace = delays.map((d,i)=>[i+1,rounded(d),d<=p.deadline?'В срок':'Просрочено']);
      columns = ['Команда','Задержка, мс','Результат']; caption = 'Четыре контрольных доставки'; break;
    }
    default: return null;
  }
  return { p, ok, rows, trace, columns, caption, metrics };
}
