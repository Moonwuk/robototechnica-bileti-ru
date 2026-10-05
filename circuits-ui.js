import { circuitProblems, circuitGroups, circuitSources } from './circuits-data.js?v=1.3.0';
import { CIRCUIT_STORAGE_KEY, readCircuitProgress, checkStep, formatNumber } from './circuits-core.js?v=1.3.0';

const E = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const number = n => formatNumber(n);
const wire = d => `<path d="${d}" class="circuit-wire"/>`;
const label = (x, y, text, anchor = 'middle') => `<text x="${x}" y="${y}" text-anchor="${anchor}">${E(text)}</text>`;
const resistor = (x, y, text, vertical = false) => `<rect x="${x - (vertical ? 12 : 40)}" y="${y - (vertical ? 30 : 12)}" width="${vertical ? 24 : 80}" height="${vertical ? 60 : 24}" class="circuit-resistor"/>${label(vertical ? x + 25 : x, vertical ? y - 55 : y - 25, text, vertical ? 'start' : 'middle')}`;
const source = (x, y, name, volts, positiveTop, side) => `<circle cx="${x}" cy="${y}" r="25" class="circuit-source"/>${label(x, y - 3, positiveTop ? '+' : '−')}${label(x, y + 17, positiveTop ? '−' : '+')}${label(x + (side === 'right' ? 40 : -40), y - 40, `${name} = ${number(Math.abs(volts))} В`, side === 'right' ? 'start' : 'end')}`;
export function circuitDiagram(problem) {
  const marker = `arrow-${problem.id}`;
  const arrow = d => `<path d="${d}" class="circuit-arrow" marker-end="url(#${marker})"/>`;
  const p = problem.params;
  let content = '', caption = '';
  if (problem.kind === 'node') {
    const ys = n => n === 1 ? [160] : n === 2 ? [90, 240] : [60, 160, 270];
    p.incoming.forEach((n, i) => {
      const y = ys(p.incoming.length)[i];
      content += wire(`M70 ${y} L300 160`) + arrow(`M140 ${y + (160-y)*70/230} L225 ${y + (160-y)*155/230}`) + label(80, y - 20, problem.displayIncoming?.[i] || `${number(n)} А`, 'start');
    });
    [...p.outgoing, null].forEach((n, i) => {
      const y = ys(p.outgoing.length + 1)[i];
      content += wire(`M300 160 L530 ${y}`) + arrow(`M355 ${160+(y-160)*55/230} L440 ${160+(y-160)*140/230}`) + label(450, y - 18, n === null ? 'i = ?' : `${number(n)} А`, 'start');
    });
    content += '<circle cx="300" cy="160" r="6" fill="currentColor"/>' + label(300, 135, 'A');
    caption = 'Стрелки показывают выбранные направления. Отрицательное i означает ток против стрелки.';
  } else if (problem.kind === 'loop') {
    content = wire('M70 135 V60 H530 V135 M530 185 V260 H70 V185') + (p.e2 ? '' : wire('M530 135 V185'));
    content += resistor(300, 60, `R1 = ${p.r1} Ом`) + resistor(300, 260, `R2 = ${p.r2} Ом`);
    content += source(70, 160, 'E1', p.e1, true, 'right');
    if (p.e2) content += source(530, 160, 'E2', p.e2, p.e2 < 0, 'left');
    content += arrow('M380 60 H445') + label(415, 40, 'i') + arrow('M260 192 C220 133 298 101 334 152') + label(296, 208, 'обход ↻');
    caption = 'Ток и обход — по часовой стрелке. U1: слева направо на R1; U2: справа налево на R2. Знаки источников показаны внутри кружков.';
  } else {
    content = wire('M70 135 V60 H530 V135 M530 185 V260 H70 V185 M300 60 V260');
    content += resistor(185, 60, `R1 = ${p.r1} Ом`) + resistor(415, 60, `R2 = ${p.r2} Ом`) + resistor(300, 160, `R3 = ${p.shared} Ом`, true);
    content += source(70, 160, 'E1', p.e1, true, 'right') + source(530, 160, 'E2', p.e2, p.e2 < 0, 'left');
    content += arrow('M164 211 C125 157 179 124 216 172') + label(185, 239, 'i1 ↻');
    content += arrow('M394 211 C355 157 409 124 446 172') + label(415, 239, 'i2 ↻');
    content += arrow('M300 198 V239') + label(323, 222, 'I3', 'start');
    content += '<circle cx="300" cy="60" r="5" fill="currentColor"/><circle cx="300" cy="260" r="5" fill="currentColor"/>' + label(300, 40, 'A') + label(300, 290, 'B');
    caption = 'Оба контурных тока — по часовой стрелке. В общей ветви от A к B: I3 = i1 − i2. UAB = VA − VB.';
  }
  return `<figure class="circuit-figure"><div class="circuit-scroll" tabindex="0" aria-label="Схема цепи; при необходимости прокрутите по горизонтали"><svg viewBox="0 0 600 320" role="img" aria-labelledby="diagram-title-${E(problem.id)} diagram-desc-${E(problem.id)}"><title id="diagram-title-${E(problem.id)}">${E(problem.title)}</title><desc id="diagram-desc-${E(problem.id)}">${E(problem.prompt)} ${E(caption)}</desc><defs><marker id="${E(marker)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="#167b88"/></marker></defs>${content}</svg></div><figcaption>${E(caption)}</figcaption></figure>`;
}
export function circuitReport(id) {
  const problem = circuitProblems.find(p => `calc:${p.id}` === id);
  return problem ? { id: problem.id, question: problem.prompt, revision: problem.revision, topic_id: 'circuits', type: 'circuit' } : null;
}
export function createCircuitUI({ main, announce, onStorageError }) {
  let storage;
  try { storage = window.localStorage; } catch { /* Work remains usable in memory. */ }
  const saved = readCircuitProgress(storage, circuitProblems);
  let state = saved.state, current = null;
  if (saved.error) onStorageError('Расчётные черновики недоступны или повреждены. Новые записи пока сохраняются в памяти страницы.');
  const taskFor = problem => {
    if (!state.tasks[problem.id]) state.tasks[problem.id] = { revision: problem.revision, answers: {}, checked: {}, notes: '', revealed: false };
    return state.tasks[problem.id];
  };
  const solved = (problem, task) => task && problem.steps.every(s => task.checked[s.id] && checkStep(problem, s, task.answers).ok);
  function save() {
    try {
      if (!storage) throw new Error('Storage unavailable');
      storage.setItem(CIRCUIT_STORAGE_KEY, JSON.stringify(state));
    } catch { onStorageError('Не удалось сохранить расчёты на устройстве. Черновик останется в памяти до закрытия страницы.'); }
  }
  function list() {
    current = null;
    const count = circuitProblems.filter(p => solved(p, state.tasks[p.id])).length;
    main.innerHTML = `<div class="page-heading"><div><p class="eyebrow">Практикум · постоянный ток</p><h1>Расчёты по шагам</h1><p class="lead">12 задач на законы Кирхгофа и контурные токи. Записывайте уравнения, считайте прямо в полях и находите первый неверный шаг.</p></div></div>
      <div class="calc-intro"><strong>${count} из ${circuitProblems.length} задач решено</strong><p>Идеальные источники и провода, линейные резисторы. Каждая задача независима. Решения сохраняются на этом устройстве.</p></div>
      ${circuitGroups.map(g => `<section><div class="section-title"><h2>${E(g.title)}</h2></div><p class="note">${E(g.description)}</p><div class="calc-grid">${circuitProblems.filter(p => p.kind === g.id).map(p => {
        const task = state.tasks[p.id], done = solved(p, task);
        const status = done ? (task.revealed ? 'Решено с разбором' : 'Решено') : task && (Object.values(task.answers).some(Boolean) || task.notes) ? 'Есть черновик' : 'Начать';
        return `<a class="card calc-card" href="#circuit/${E(p.id)}"><span class="small-label">${E(p.id.toUpperCase())} · ${E(p.minutes)}</span><h3>${E(p.title)}</h3><span class="calc-card-status${done ? ' done' : ''}">${status} →</span></a>`;
      }).join('')}</div></section>`).join('')}
      <details class="plain-panel calc-guide"><summary>Как вводить расчёты и читать проверку</summary>${guide()}</details>
      <p class="note">Учебные источники: ${circuitSources.map(s => `<a href="${E(s.url)}" target="_blank" rel="noopener noreferrer">${E(s.title)}</a>`).join(' · ')}. Числа, задачи и схемы этого практикума авторские.</p>`;
  }
  function guide() {
    return '<p>Числовые поля принимают выражения: <code>12/(2+4)</code>, <code>0,5</code>, <code>17/11</code>. Единицу можно добавить в конце: <code>30 мА</code>, <code>2 кОм</code>. Без единицы число считается в единицах рядом с полем.</p><p>В уравнениях используйте латинские <code>i</code>, <code>i1</code>, <code>i2</code> и один знак <code>=</code>. Можно писать <code>2*i</code> или <code>2i</code>. Подставляйте значения в А, В и Ом. Эквивалентные переносы и умножение всего уравнения на ненулевое число допустимы.</p><p>Проверяются линейные уравнения и числовые шаги. Свободные заметки автоматически не проверяются. Дроби можно не округлять; при округлении оставляйте хотя бы 4 значащие цифры. Допуск для ненулевого результата — 0,1%.</p>';
  }
  function exercise(id) {
    current = circuitProblems.find(p => p.id === id);
    if (!current) { main.innerHTML = '<h1>Задача не найдена</h1><p><a href="#circuits">Вернуться к расчётам</a></p>'; return; }
    const p = current, task = taskFor(p), idx = circuitProblems.indexOf(p);
    main.innerHTML = `<a class="calc-back" href="#circuits">← Все расчётные задачи</a><div class="page-heading"><div><p class="eyebrow">${E(p.id.toUpperCase())} · ${idx + 1} / ${circuitProblems.length}</p><h1>${E(p.title)}</h1><p class="lead">${E(p.prompt)}</p></div></div>
      <div class="calc-workspace"><section class="calc-circuit"><h2 class="sr-only">Схема и правила</h2>${circuitDiagram(p)}<details class="calc-guide"><summary>Памятка: знаки и запись решения</summary><p>Первый закон: сумма входящих токов равна сумме выходящих. Второй закон: сумма изменений потенциала за полный обход равна нулю. На резисторе по направлению тока — падение −IR; через источник от − к + — рост +E. Отрицательный ток означает направление против выбранной стрелки.</p>${guide()}</details></section>
      <section class="calc-steps" aria-labelledby="calc-steps-title"><h2 id="calc-steps-title">Ваше решение</h2><p class="note calc-input-help">Пишите числа или выражения. Например: <code>12/(2+4)</code>, <code>0,5</code>, <code>30 мА</code>. В уравнениях — А, В, Ом.</p>
      ${p.steps.map((s, i) => `<form class="calc-step" data-calc-step="${E(s.id)}"><label for="calc-${E(s.id)}"><span class="calc-step-number">${i + 1}</span>${E(s.label)}</label><div class="calc-input-row"><div class="calc-field-wrap"><input id="calc-${E(s.id)}" class="field" type="text" maxlength="160" spellcheck="false" autocomplete="off" autocapitalize="off" data-calc-input="${E(s.id)}" value="${E(task.answers[s.id] || '')}" aria-describedby="hint-${E(s.id)} result-${E(s.id)}" aria-label="${E(s.label)}${s.unit ? `, ${E(s.unit)}` : ''}" placeholder="${s.type === 'equation' ? `Уравнение с ${E(s.variables.join(', '))}` : 'Число или выражение'}">${s.unit ? `<span class="calc-unit" aria-hidden="true">${E(s.unit)}</span>` : ''}</div><button class="button secondary" type="submit" aria-label="Проверить шаг ${i + 1}">Проверить</button></div><p class="calc-step-hint" id="hint-${E(s.id)}">${s.type === 'equation' ? 'Составьте уравнение по схеме; неизвестные — латинскими буквами.' : `Без указанной единицы ответ принимается в ${E(s.unit)}.`}</p><p class="calc-result" id="result-${E(s.id)}" aria-live="polite"></p></form>`).join('')}
      <button class="button primary" type="button" data-calc-action="check-all">Проверить всё решение</button><p id="calc-summary" class="calc-summary" role="status"></p>
      <details class="calc-notes"><summary>Мой черновик — свободные заметки</summary><label class="sr-only" for="calc-notes">Черновик решения</label><textarea id="calc-notes" class="field text-answer" maxlength="4000" placeholder="Здесь можно записать ход мысли. Эти заметки не проверяются автоматически.">${E(task.notes)}</textarea></details>
      <details class="calc-solution" id="calc-solution"><summary>Показать полный разбор</summary><ol>${p.solution.map(text => `<li>${E(text)}</li>`).join('')}</ol><p class="note">После открытия разбора завершённая задача отмечается «Решено с разбором».</p></details>
      <div class="question-tools"><span>Редакция ${p.revision}</span><button class="text-button" data-feedback="error" data-question="calc:${E(p.id)}">Сообщить об ошибке в задаче</button></div>
      <div class="button-row calc-navigation"><a class="button quiet" href="#circuits">Все задачи</a>${idx < circuitProblems.length - 1 ? `<a class="button secondary" href="#circuit/${E(circuitProblems[idx+1].id)}">Следующая задача →</a>` : ''}</div></section></div>`;
    main.querySelector('#calc-solution').addEventListener('toggle', event => {
      if (event.target.open && !task.revealed) { task.revealed = true; save(); paint(); }
    });
    paint();
  }
  function paint() {
    if (!current || !main.querySelector('#calc-summary')) return;
    const task = taskFor(current);
    let passed = 0, firstWrong = null;
    for (const [i, step] of current.steps.entries()) {
      const result = main.querySelector(`#result-${step.id}`), input = main.querySelector(`#calc-${step.id}`);
      const checked = task.checked[step.id], verdict = checked ? checkStep(current, step, task.answers) : null;
      result.textContent = verdict ? `${verdict.ok ? '✓' : 'Проверьте:'} ${verdict.message}` : '';
      result.className = `calc-result${verdict ? verdict.ok ? ' correct' : ' incorrect' : ''}`;
      if (verdict && !verdict.ok) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
      if (verdict?.ok) passed++;
      if (checked && !verdict.ok && firstWrong === null) firstWrong = i + 1;
    }
    const all = passed === current.steps.length;
    const summary = main.querySelector('#calc-summary');
    summary.textContent = all ? `Все шаги верны. ${task.revealed ? 'Решено с разбором.' : 'Задача решена!'}` : `Проверено верно: ${passed} из ${current.steps.length}.${firstWrong !== null ? ` Начните исправление с шага ${firstWrong}.` : ''}`;
    summary.classList.toggle('correct', all);
  }
  main.addEventListener('input', event => {
    if (!current) return;
    const input = event.target, task = taskFor(current);
    if (input.id === 'calc-notes') { task.notes = input.value.slice(0, 4000); save(); return; }
    const id = input.dataset.calcInput;
    const index = current.steps.findIndex(s => s.id === id);
    if (index < 0) return;
    task.answers[id] = input.value.slice(0, 160);
    // Downstream checks must not remain green after an earlier value is edited.
    current.steps.slice(index).forEach(s => { task.checked[s.id] = false; });
    save(); paint();
  });
  main.addEventListener('submit', event => {
    const form = event.target.closest('[data-calc-step]');
    if (!form || !current) return;
    event.preventDefault();
    taskFor(current).checked[form.dataset.calcStep] = true;
    save(); paint();
  });
  main.addEventListener('click', event => {
    if (!event.target.closest('[data-calc-action="check-all"]') || !current) return;
    const task = taskFor(current);
    current.steps.forEach(s => { task.checked[s.id] = true; });
    save(); paint();
    announce.textContent = main.querySelector('#calc-summary').textContent;
    main.querySelector('[aria-invalid="true"]')?.focus({ preventScroll: true });
  });
  return { list, exercise };
}
