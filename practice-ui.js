import { PRACTICE_STORAGE_KEY, DRAFT_LIMIT, freshExercise, readPractice, checkNumericAnswer, exerciseStatus } from './practice-core.js?v=1.4.0';

const E = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kindNames = { calculation: 'Расчёт', diagnostic: 'Диагностика', design: 'Проектирование', coding: 'Программирование', planning: 'Планирование' };
const link = (label, route, type = 'secondary') => `<a class="button ${type}" href="#${E(route)}">${E(label)}</a>`;
const heading = (title, text) => `<div class="page-heading"><div><p class="eyebrow">Инженерная практика</p><h1>${E(title)}</h1><p class="lead">${E(text)}</p></div></div>`;

export function createPracticeUI({ main, data, announce, onStorageError, startQuiz, sources }) {
  const exercises = new Map(data.exercises.map(t => [t.id, t]));
  const blocks = new Map(data.blocks.map(b => [b.id, b]));
  let storage;
  try { storage = window.localStorage; } catch { /* Reported when saving. */ }
  const loaded = readPractice(storage, data.exercises);
  const progress = loaded.progress;
  if (loaded.error) onStorageError('Не удалось прочитать черновики практики. Прогресс тестов сохранён отдельно.');
  let current = null;
  function persist() {
    try {
      if (!storage) throw new Error('No storage');
      storage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify(progress));
      const status = main.querySelector('#practice-save');
      if (status) status.textContent = 'Черновик сохранён на этом устройстве';
    } catch {
      onStorageError('Не удалось сохранить черновик практики. Он доступен до закрытия страницы.');
      const status = main.querySelector('#practice-save');
      if (status) status.textContent = 'Черновик только в текущем сеансе';
    }
  }
  function glossary(items) {
    return `<div class="practice-glossary">${items.map(g => `<details><summary>${E(g.term)}</summary><p>${E(g.definition)}</p></details>`).join('')}</div>`;
  }
  function questionGlossary(id) {
    const block = data.blocks.find(b => b.question_ids.includes(id));
    return block ? `<details class="practice-question-terms"><summary>Разобраться в терминах</summary>${glossary(block.glossary)}</details>` : '';
  }
  function taskCard(t) {
    const status = exerciseStatus(t, progress.exercises[t.id]);
    return `<a class="card calc-card" href="#exercise/${E(t.id)}"><span class="small-label">${E(kindNames[t.kind])} · ${E(t.id)} · уровень ${t.difficulty}</span><h3>${E(t.title)}</h3><p class="note">${E(blocks.get(t.block_id).name)}</p><span class="calc-card-status${status.complete ? ' done' : ''}">${E(status.label)}</span></a>`;
  }
  function blockCard(b) {
    return `<section class="card practice-block"><p class="eyebrow">5 вопросов · ${b.exercise_ids.length} задач</p><h3>${E(b.name)}</h3><div class="button-row">${link('Открыть блок', `practice-block/${b.id}`)}</div></section>`;
  }
  function list(roleId = '') {
    current = null;
    const role = data.role_paths.find(r => r.id === roleId);
    const selected = role ? role.block_ids.map(id => blocks.get(id)) : data.blocks;
    const tasks = data.exercises.filter(t => selected.some(b => b.id === t.block_id));
    const done = tasks.filter(t => exerciseStatus(t, progress.exercises[t.id]).complete).length;
    main.innerHTML = heading('От вопроса к решению', 'Выберите профиль или прикладной блок. Решайте задачи здесь, проверяйте вычисления и разбирайте ход рассуждений.') +
      `<section class="plain-panel"><div class="filters"><label for="practice-role">Профиль подготовки</label><select class="field" id="practice-role"><option value="">Все направления</option>${data.role_paths.map(r => `<option value="${E(r.id)}"${role?.id === r.id ? ' selected' : ''}>${E(r.name)}</option>`).join('')}</select></div>${role ? `<p class="note">${E(role.note)}</p>` : '<p class="note">12 прикладных блоков · 20 задач · 6 цепочек. Уровень показывает сложность задания.</p>'}<p class="practice-counter">Самопроверка: ${done} из ${tasks.length} задач</p></section>
      <div class="section-title"><h2>${role ? 'Блоки в порядке маршрута' : 'Прикладные блоки'}</h2></div><div class="card-grid">${selected.map(blockCard).join('')}</div>
      <div class="section-title"><h2>Практические задачи</h2><span>${tasks.length} задач</span></div><div class="calc-grid">${tasks.map(taskCard).join('')}</div>
      <details class="plain-panel practice-chains"><summary>Шесть коротких цепочек по инженерным ситуациям</summary><div class="card-grid">${data.learning_chains.map(c => `<section class="card"><h3>${E(c.title)}</h3><button class="button secondary" data-practice-action="chain" data-id="${E(c.id)}">Пройти 5 вопросов</button><div class="practice-related">${c.exercise_ids.map(id => link(exercises.get(id).title, `exercise/${id}`, 'quiet')).join('')}</div></section>`).join('')}</div></details>`;
  }
  function block(id) {
    current = null;
    const b = blocks.get(id);
    if (!b) return missing();
    main.innerHTML = '<a class="calc-back" href="#practice">← Все направления практики</a>' + heading(b.name, 'Начните со словаря, пройдите пять вопросов, затем примените знания в задаче.') +
      `<section class="plain-panel"><h2>Термины по нажатию</h2>${glossary(b.glossary)}<div class="button-row"><button class="button primary" data-practice-action="block-quiz" data-id="${E(b.id)}">Начать 5 вопросов</button>${b.topic_ids.map(id => link('К основной теме', `topic/${id}`, 'quiet')).join('')}</div></section>
      ${b.exercise_ids.length ? `<div class="section-title"><h2>Примените на практике</h2></div><div class="calc-grid">${b.exercise_ids.map(id => taskCard(exercises.get(id))).join('')}</div>` : '<p class="note">Практику диагностики и проверки требований продолжайте в соседних блоках своего профильного маршрута.</p>'}`;
  }
  function missing() {
    current = null;
    main.innerHTML = heading('Задача не найдена', 'Выберите задачу из списка.') + link('К практике', 'practice');
  }
  function exercise(id) {
    const task = exercises.get(id);
    if (!task) return missing();
    current = task;
    const entry = progress.exercises[id] ||= freshExercise(task);
    const numeric = task.numeric_checks.length > 0;
    main.innerHTML = `<a class="calc-back" href="#practice-block/${E(task.block_id)}">← ${E(blocks.get(task.block_id).name)}</a>` + heading(task.title, `${kindNames[task.kind]} · ${task.id} · уровень ${task.difficulty}`) +
      `<section class="plain-panel"><h2>Условие</h2><p class="practice-prompt">${E(task.prompt)}</p>${task.id === 'TASK-019' ? graph() : ''}<details class="practice-question-terms"><summary>Термины этой задачи</summary>${glossary(blocks.get(task.block_id).glossary)}</details><div class="question-tools"><span>${E(task.id)}</span><button class="text-button" data-feedback="error" data-question="${E(task.id)}">Сообщить об ошибке в задаче</button></div></section>
      <section class="plain-panel"><h2>${task.kind === 'coding' ? 'Ваш код и пояснения' : 'Ваш ход решения'}</h2><label class="practice-draft-label" for="practice-draft">${task.kind === 'coding' ? 'Запишите код или псевдокод и граничные тесты' : 'Запишите формулы, предположения и промежуточные шаги'}</label><textarea class="field practice-draft${task.kind === 'coding' ? ' code-draft' : ''}" id="practice-draft" rows="7" maxlength="${DRAFT_LIMIT}" spellcheck="${task.kind !== 'coding'}">${E(entry.draft)}</textarea><p id="practice-save" class="note">Черновик сохраняется на этом устройстве по мере ввода</p><p class="note">${task.kind === 'coding' ? 'Код сохраняется как текст. Сверьте его с учебным примером и граничными тестами в разборе.' : 'Свободный текст проверяется вами по критериям ниже.'}</p></section>
      ${numeric ? `<section class="calc-steps"><h2>Проверка вычислений</h2><p class="note">Можно вводить число, дробь или выражение: 2/3, 0,05*(8+12)/2. Единица указана у поля; для квадратного корня введите численное приближение. Допуск — 0,1%; количества тиков и байтов проверяются точно.</p>${task.numeric_checks.map((check, i) => `<div class="calc-step"><label for="practice-${E(check.name)}"><span class="calc-step-number">${i + 1}</span>${E(check.label)} (${E(check.display_unit)})</label><div class="calc-input-row"><div class="calc-field-wrap"><input id="practice-${E(check.name)}" type="text" inputmode="text" maxlength="160" autocomplete="off" data-practice-field="${E(check.name)}" value="${E(entry.answers[check.name] || '')}" aria-describedby="result-${E(check.name)}"><span class="calc-unit" aria-hidden="true">${E(check.display_unit)}</span></div><button class="button secondary" data-practice-action="check-one" data-id="${E(check.name)}" aria-label="Проверить: ${E(check.label)}">Проверить</button></div><p class="calc-result" id="result-${E(check.name)}" aria-live="polite"></p></div>`).join('')}<button class="button primary" data-practice-action="check-all">Проверить все числа</button><p id="practice-numbers-summary" class="calc-summary" role="status"></p></section>` : ''}
      <section class="plain-panel practice-review"><h2>Проверьте рассуждение</h2><p class="note">Отметьте то, что выполнено в вашем решении. Это ваша самопроверка; автоматическая проверка относится только к числовым полям.</p><div class="practice-checklist">${task.acceptance_checks.map((text, i) => `<label><input type="checkbox" data-practice-criterion="${i}"${entry.checks[i] ? ' checked' : ''}><span>${E(text)}</span></label>`).join('')}</div><p id="practice-completion" class="practice-counter" role="status"></p></section>
      <details class="plain-panel practice-solution" id="practice-solution"${entry.revealed ? ' open' : ''}><summary>Разбор и типичные ошибки</summary><p class="note">Открытие разбора отмечается в прогрессе задачи.</p><ol>${task.solution_steps.map(s => `<li>${E(s)}</li>`).join('')}</ol><p><strong>Результат:</strong> ${E(task.expected_result)}</p><h3>Частые ошибки</h3><ul>${task.common_mistakes.map(s => `<li>${E(s)}</li>`).join('')}</ul>${task.reference_code ? `<details><summary>Учебный пример на Python</summary><pre class="practice-code"><code>${E(task.reference_code)}</code></pre></details>` : ''}<details><summary>Источники</summary><ul class="source-list">${sources(task.source_ids)}</ul></details></details>
      <div class="button-row practice-navigation"><button class="button secondary" data-practice-action="related" data-id="${E(task.id)}">Повторить связанные вопросы</button>${link('Все задачи', 'practice', 'quiet')}</div>`;
    main.querySelector('#practice-solution').addEventListener('toggle', event => {
      if (current?.id !== id || !event.target.open || entry.revealed) return;
      entry.revealed = true; persist(); updateCompletion();
    });
    if (entry.checked && numeric) showNumbers();
    updateCompletion();
  }
  function graph() {
    return `<figure class="practice-graph"><svg viewBox="0 0 460 230" role="img" aria-label="Граф: A соединена с B, B соединена с C и боковым карманом D"><path d="M70 65H390M230 65V175" fill="none" stroke="currentColor" stroke-width="3"/>${[['A',70,65],['B',230,65],['C',390,65],['D',230,175]].map(([label,x,y]) => `<circle cx="${x}" cy="${y}" r="24" fill="white" stroke="currentColor" stroke-width="2"/><text x="${x}" y="${y+6}" text-anchor="middle">${label}</text>`).join('')}</svg><figcaption>R1: A → C. R2: C → A. D — боковой карман.</figcaption></figure>`;
  }
  function showCheck(check) {
    const entry = progress.exercises[current.id];
    const result = checkNumericAnswer(check, entry.answers[check.name]);
    const output = main.querySelector(`#result-${check.name}`);
    output.textContent = result.message;
    output.className = `calc-result ${result.ok ? 'correct' : 'incorrect'}`;
    main.querySelector(`#practice-${check.name}`).setAttribute('aria-invalid', String(!result.ok));
    return result.ok;
  }
  function showNumbers() {
    const correct = current.numeric_checks.map(showCheck).filter(Boolean).length;
    const text = `${correct} из ${current.numeric_checks.length} числовых шагов верны.${correct === current.numeric_checks.length ? ' Теперь проверьте объяснение и ограничения модели.' : ' Исправьте отмеченные шаги.'}`;
    main.querySelector('#practice-numbers-summary').textContent = text;
    announce.textContent = text;
  }
  function updateCompletion() {
    if (!current) return;
    const status = exerciseStatus(current, progress.exercises[current.id]);
    main.querySelector('#practice-completion').textContent = status.complete ? status.label : 'Чтобы завершить самопроверку, проверьте числа и отметьте выполненные критерии.';
  }
  main.addEventListener('click', event => {
    const trigger = event.target.closest('[data-practice-action]');
    if (!trigger) return;
    const { practiceAction: action, id } = trigger.dataset;
    if (action === 'block-quiz') {
      const b = blocks.get(id); if (b) startQuiz(b.question_ids, b.name, `PRACTICE-${b.id}`); return;
    }
    if (action === 'chain') {
      const c = data.learning_chains.find(c => c.id === id); if (c) startQuiz(c.question_ids, c.title, c.id); return;
    }
    if (action === 'related') {
      const t = exercises.get(id); if (t) startQuiz(t.related_question_ids, `Повторение: ${t.title}`, null); return;
    }
    if (!current) return;
    if (action === 'check-one') {
      const check = current.numeric_checks.find(c => c.name === id); if (check) showCheck(check);
    }
    if (action === 'check-all') { progress.exercises[current.id].checked = true; showNumbers(); persist(); updateCompletion(); }
  });
  main.addEventListener('input', event => {
    if (!current) return;
    const entry = progress.exercises[current.id];
    if (event.target.id === 'practice-draft') {
      entry.draft = event.target.value.slice(0, DRAFT_LIMIT);
      entry.checks = [];
      for (const checkbox of main.querySelectorAll('[data-practice-criterion]')) checkbox.checked = false;
    }
    else if (event.target.dataset.practiceField && current.numeric_checks.some(c => c.name === event.target.dataset.practiceField)) {
      entry.answers[event.target.dataset.practiceField] = event.target.value.slice(0, 160);
      entry.checked = false;
      for (const check of current.numeric_checks) {
        main.querySelector(`#result-${check.name}`).textContent = '';
        main.querySelector(`#practice-${check.name}`).removeAttribute('aria-invalid');
      }
      main.querySelector('#practice-numbers-summary').textContent = '';
    } else return;
    persist(); updateCompletion();
  });
  main.addEventListener('change', event => {
    if (event.target.id === 'practice-role') { location.hash = event.target.value ? `practice/${event.target.value}` : 'practice'; return; }
    if (!current || !event.target.hasAttribute('data-practice-criterion')) return;
    const index = Number(event.target.dataset.practiceCriterion);
    if (!Number.isInteger(index) || index < 0 || index >= current.acceptance_checks.length) return;
    progress.exercises[current.id].checks[index] = event.target.checked; persist(); updateCompletion();
  });
  return { list, block, exercise, questionGlossary,
    topicLinks(id) {
      const linked = data.blocks.filter(b => b.topic_ids.includes(id));
      return linked.length ? `<section class="plain-panel"><h2>Примените эту тему</h2><div class="button-row">${linked.map(b => link(b.name, `practice-block/${b.id}`)).join('')}</div></section>` : '';
    },
    continuation(resourceId) {
      const chain = data.learning_chains.find(c => c.id === resourceId);
      const block = data.blocks.find(b => `PRACTICE-${b.id}` === resourceId);
      const ids = chain?.exercise_ids || block?.exercise_ids || [];
      return ids.length ? `<section class="plain-panel"><h2>Теперь решите задачу</h2><div class="button-row">${ids.map(id => link(exercises.get(id).title, `exercise/${id}`)).join('')}</div></section>` : '';
    },
    report(id) { const t = exercises.get(id); return t ? { id:t.id, question:t.prompt, revision:t.revision, topic_id:t.topic_id, type:'practice' } : null; }
  };
}
