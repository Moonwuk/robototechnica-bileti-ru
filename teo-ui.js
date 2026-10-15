import { TEO_STORAGE_KEY, TEO_DRAFT_LIMIT, freshTeoTask, readTeoProgress, submitTeoNumber, teoTaskStatus, checkTeoNumber } from './teo-core.js?v=1.9.0';

const E = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const link = (text, route, type = 'secondary') => `<a class="button ${type}" href="#${E(route)}">${E(text)}</a>`;
const lines = (items, ordered = false) => `<${ordered ? 'ol' : 'ul'} class="teo-lines">${items.map(item => `<li>${E(item)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`;
const heading = (title, subtitle = '') => `<div class="page-heading"><div><p class="eyebrow">Теоретические основы электротехники</p><h1>${E(title)}</h1><p class="lead">${E(subtitle)}</p></div></div>`;
const quizButton = (label, topic, kind = 'all', mode = 'learn') => `<button class="button ${mode === 'exam' ? 'secondary' : 'primary'}" data-teo-quiz="${E(topic)}" data-teo-kind="${E(kind)}" data-teo-mode="${mode}">${E(label)}</button>`;

export function createTeoUI({ main, data, announce, onStorageError, sources, startQuiz, onQuizAssistance }) {
  const topics = new Map(data.bank.topics.map(t => [t.id, t]));
  const questions = new Map(data.bank.questions.map(q => [q.id, q]));
  const applications = new Map(data.applications.map(a => [a.id, a]));
  const calculations = data.bank.questions.filter(q => q.numeric_answer);
  const count = (topicId, kind) => data.bank.questions.filter(q => (!topicId || q.topic_id === topicId) && (!kind || q.kind === kind)).length;
  let storage;
  try { storage = window.localStorage; } catch { /* Saving reports the unavailable storage. */ }
  const loaded = readTeoProgress(storage, calculations.map(q => q.id), [...applications.keys()]);
  const progress = loaded.progress;
  if (loaded.error) onStorageError('Не удалось прочитать черновики электротехники. Прогресс билетов хранится отдельно.');
  function persist() {
    const status = main.querySelector('#teo-save');
    try {
      if (!storage) throw new Error('No storage');
      storage.setItem(TEO_STORAGE_KEY, JSON.stringify(progress));
      if (status) status.textContent = 'Черновик сохранён на этом устройстве';
    } catch {
      onStorageError('Не удалось сохранить черновик электротехники. Он доступен до закрытия страницы.');
      if (status) status.textContent = 'Черновик только в текущем сеансе';
    }
  }
  const task = id => progress.calculations[id] ||= freshTeoTask();
  const missing = () => { main.innerHTML = heading('Материал не найден') + link('Все темы электротехники', 'teo'); };
  const glossary = topicId => `<dl class="glossary">${data.glossary.filter(g => !topicId || g.topic_id === topicId).map(g => `<div><dt>${E(g.term)}</dt><dd>${E(g.definition)}</dd></div>`).join('')}</dl>`;
  const reportButton = id => `<div class="question-tools"><span>${E(id)}</span><button class="text-button" data-feedback="error" data-question="${E(id)}">Сообщить об ошибке в материале</button></div>`;
  function summary() {
    const states = calculations.map(q => teoTaskStatus(progress.calculations[q.id]).state);
    return { total: calculations.length, correct: states.filter(s => s === 'correct').length,
      assisted: states.filter(s => s === 'assisted').length, wrong: states.filter(s => s === 'wrong').length };
  }
  function progressPanel() {
    const s = summary();
    return `<section class="plain-panel teo"><h2>Электротехника: самостоятельные расчёты</h2><p>Из ${s.total} задач: ${s.correct} решено без просмотра решения, ${s.assisted} — после разбора, ${s.wrong} ожидают исправления.</p><p class="note">Это отдельная практика с вводом числа, а не дополнительные вопросы банка. Просмотр разбора и ответ своими словами не засчитываются автоматически как освоенный навык.</p>${link('Открыть электротехнику', 'teo')}</section>`;
  }
  function list() {
    main.innerHTML = heading('От закона — к инженерной задаче', `${topics.size} учебных модуля: короткая теория → понимание → расчёт → инженерная ситуация → разбор применения.`) +
      `<div class="teo"><section class="plain-panel"><p>${questions.size} заданий: ${count(null,'concept')} на понимание, ${calculations.length} расчётных и ${count(null,'scenario')} ситуационных. Расчёт можно решить числом без вариантов ответа. В каждом разделе — словарь и применение в робототехнике.</p><p class="note">${E(data.bank.metadata.scope_note)} ${E(data.bank.metadata.safety_note)}</p><details><summary>Как подготовлены материалы</summary><p>${E(data.bank.metadata.provenance_note)}</p></details><div class="button-row">${link(`Словарь: ${data.glossary.length} терминов`, 'teo-glossary')}${link('Все вопросы приложения', 'topics', 'quiet')}</div></section>
      <details class="plain-panel teo-course"><summary>Программа курса — 19 тем</summary><p class="note">Каждая строка ведёт к теории, вопросам на понимание, расчётам и применению. Смежные темы используют общие модули.</p><ol>${(data.routes.course19 || []).map(row => `<li data-course-topic="${row.number}"><strong>${E(row.title)}</strong><div class="button-row">${row.topic_ids.map(id => link(topics.get(id).name, `teo-topic/${id}`, 'quiet')).join('')}</div></li>`).join('')}</ol></details>
      <section class="plain-panel"><h2>Что пригодится перед началом</h2>${lines(data.routes.math_prerequisites)}</section>
      <label for="teo-search">Найти тему, термин или применение</label><input class="field teo-search" id="teo-search" type="search" placeholder="Например: фильтр, ШИМ, магнитный захват">
      <p class="note" id="teo-no-results" hidden>По этому запросу ничего не найдено.</p><div class="card-grid">${data.bank.topics.map(t => {
        const a = data.applications.find(item => item.topic_id === t.id);
        const haystack = [t.name, t.mini_lesson, a.title, ...data.glossary.filter(g => g.topic_id === t.id).map(g => g.term)].join(' ').toLocaleLowerCase('ru');
        return `<section class="card" data-teo-search="${E(haystack)}"><span class="tag">${E(a.section)} · заданий: ${count(t.id)}</span><h2>${E(t.name)}</h2><p class="note">Применение: ${E(a.title)}</p><div class="button-row">${link('Открыть тему', `teo-topic/${t.id}`, 'primary')}</div></section>`;
      }).join('')}</div>${progressPanel()}</div>`;
  }
  function topic(id) {
    const t = topics.get(id);
    if (!t) return missing();
    const a = data.applications.find(item => item.topic_id === id);
    const qs = calculations.filter(q => q.topic_id === id);
    const prior = (t.prerequisites || []).map(p => topics.get(p)).filter(Boolean);
    main.innerHTML = heading(t.name, 'Читайте по шагам или сразу проверьте знакомую тему.') + `<div class="teo"><div class="button-row">${link('Все темы электротехники', 'teo', 'quiet')}</div>
      ${prior.length ? `<section class="plain-panel"><h2>Предыдущие темы</h2><div class="button-row">${prior.map(p => link(p.name, `teo-topic/${p.id}`, 'quiet')).join('')}</div></section>` : ''}
      <section class="plain-panel"><h2>1. Разберитесь в основных связях</h2><p class="lesson">${E(t.mini_lesson)}</p>${lines(t.formulas)}<p class="note"><strong>Частая ошибка:</strong> ${E(t.common_error)}</p><details><summary>Словарь темы</summary>${glossary(id)}</details></section>
      <section class="plain-panel"><h2>2. Проверьте понимание</h2><p>Вопросов: ${count(id,'concept')}. После ответа — объяснение и разбор ошибочных вариантов.</p>${quizButton(`Проверить понимание (${count(id,'concept')})`, id, 'concept')}</section>
      <section class="plain-panel"><h2>3. Решите без подсказки вариантов</h2><p class="note">Расчётных задач: ${qs.length}. Ввод числа, единицы измерения, черновик и пошаговое решение. Просмотр решения и проверка промежуточных шагов учитываются как помощь.</p><div class="teo-task-list">${qs.map(q => {
        const state = teoTaskStatus(progress.calculations[q.id]);
        return `<a class="card teo-task" href="#teo-calc/${E(q.id)}"><span class="small-label">${E(q.id)} · уровень ${q.difficulty}</span><h3>${E(q.learning_objective)}</h3><span class="tag ${state.state === 'correct' ? 'done' : ''}">${E(state.label)}</span></a>`;
      }).join('')}</div></section>
      <section class="plain-panel"><h2>4. Выберите инженерное решение</h2><p>Ситуаций: ${count(id,'scenario')}. Подходящая модель, ограничения и следующий шаг диагностики.</p>${quizButton(`Разобрать ситуации (${count(id,'scenario')})`, id, 'scenario')}</section>
      <section class="plain-panel"><h2>5. Посмотрите применение</h2><p>${E(a.title)}</p>${link('Открыть подробный разбор', `teo-application/${a.id}`)}</section>
      <section class="plain-panel"><h2>Проверка всей темы</h2><p>Вопросов: ${count(id)}. Без таймера. В самопроверке ответы и объяснения доступны только после завершения билета. Проходного балла для этого раздела нет.</p><div class="button-row">${quizButton(`Учить тему (${count(id)})`, id)}${quizButton(`Самопроверка (${count(id)})`, id, 'all', 'exam')}</div></section></div>`;
  }
  function calculation(id, invalid = false) {
    const q = questions.get(id);
    if (!q?.numeric_answer) return missing();
    const row = task(id);
    const state = teoTaskStatus(row);
    const currentResult = row.lastResult !== null && row.answer === row.checkedAnswer;
    main.innerHTML = heading('Расчёт без вариантов ответа', topics.get(q.topic_id).name) + `<div class="teo"><div class="button-row">${link('К теме', `teo-topic/${q.topic_id}`, 'quiet')}</div>
      <section class="plain-panel"><span class="small-label">${E(q.id)} · уровень ${q.difficulty}</span><h2>${E(q.question)}</h2><p class="note"><strong>Где применяется:</strong> ${E(q.application)}</p>
      <form data-teo-check="${E(id)}" novalidate><label for="teo-reasoning">Ход решения — необязательный черновик</label><textarea class="field text-answer" id="teo-reasoning" rows="4" maxlength="${TEO_DRAFT_LIMIT}" data-teo-draft="${E(id)}">${E(row.reasoning)}</textarea><p class="note">Черновик сохраняется, но автоматически не оценивается.</p>
      ${q.numeric_steps?.length ? `<fieldset class="teo-steps"><legend>Найдите ошибку в промежуточных шагах</legend><p class="note">Необязательно. Проверка шагов считается помощью; полный разбор остаётся закрыт.</p>${q.numeric_steps.map(step => `<label for="teo-${E(step.id)}">${E(step.label)} (${E(step.unit)})</label><input class="field" type="text" inputmode="decimal" maxlength="64" id="teo-${E(step.id)}" data-teo-step="${E(step.id)}" data-teo-step-question="${E(id)}" value="${E(row.steps?.[step.id] || '')}">`).join('')}<button class="button secondary" type="button" data-teo-step-check="${E(id)}">Проверить шаги</button><div id="teo-step-feedback" tabindex="-1" role="status">${row.stepsChecked ? stepFeedback(q,row) : ''}</div></fieldset>` : ''}
      <label for="teo-number">Ваш результат, ${E(q.numeric_answer.unit)}</label><input class="field" id="teo-number" type="text" inputmode="decimal" maxlength="64" autocomplete="off" spellcheck="false" aria-describedby="teo-number-help" data-teo-number="${E(id)}" value="${E(row.answer)}"><p class="note" id="teo-number-help">Введите только число в указанных единицах. Можно использовать точку, запятую или запись 1e-3. Формулы и единицы в поле не вводятся.</p><button class="button primary" type="submit">Проверить число</button></form>
      <p id="teo-save" class="note" role="status"></p><div id="teo-feedback" tabindex="-1" role="status">${invalid ? '<p class="hint">Нужно конечное число без формулы и обозначения единицы. Пустая строка не считается нулём.</p>' : currentResult ? `<p class="hint"><strong>${E(state.label)}.</strong> ${row.lastResult ? 'Сравните ход решения с разбором.' : 'Проверьте модель, единицы и порядок вычислений. Можно исправить ответ.'}</p>` : ''}</div>
      <details class="teo-solution" data-teo-solution="${E(id)}"><summary>Открыть пошаговое решение — будет отмечено как помощь</summary>${lines(q.worked_solution, true)}<p><strong>Ответ:</strong> ${E(q.numeric_answer.display)}</p><p>${E(q.explanation)}</p><p class="note">Допуск проверки: ±${E(q.numeric_answer.absolute_tolerance)} ${E(q.numeric_answer.unit)}. Если решение уже открывалось, последующие ответы отмечаются как выполненные после разбора.</p><ul class="source-list">${sources(q.source_ids)}</ul></details>${reportButton(id)}</section></div>`;
  }
  function application(id) {
    const a = applications.get(id);
    if (!a) return missing();
    main.innerHTML = heading(a.title, 'Постановка → допущения → метод → расчёт → вывод → ограничения.') + `<div class="teo"><div class="button-row">${link('К теме', `teo-topic/${a.topic_id}`, 'quiet')}</div>
      <section class="plain-panel"><h2>Задача</h2><p>${E(a.brief)}</p><h2>Что предполагает модель</h2>${lines(a.assumptions)}</section>
      <section class="plain-panel"><h2>Как подойти к решению</h2>${lines(a.method, true)}<h2>Разобранный пример</h2>${lines(a.worked_example, true)}<h2>Инженерный вывод</h2><p>${E(a.engineering_conclusion)}</p></section>
      <section class="plain-panel"><h2>Границы применимости</h2>${lines(a.limitations)}<p class="note">Это теоретический разбор, а не инструкция по выполнению работ на оборудовании.</p></section>
      <section class="plain-panel"><h2>Объясните своими словами</h2><p>${E(a.oral_check.question)}</p><label for="teo-oral">Ваш ответ для самопроверки</label><textarea class="field text-answer" id="teo-oral" rows="5" maxlength="${TEO_DRAFT_LIMIT}" data-teo-oral="${E(id)}">${E(progress.oral[id] || '')}</textarea><p id="teo-save" class="note" role="status"></p><p class="note">Текст хранится только на этом устройстве. Совпадение слов не оценивается; баллы за чтение не начисляются.</p><details><summary>Какие мысли важно упомянуть</summary>${lines(a.oral_check.rubric)}</details></section>
      <section class="plain-panel"><h2>Закрепите на вопросах</h2><div class="button-row">${quizButton(`Вопросы по теме (${count(a.topic_id)})`, a.topic_id)}${link('К теме', `teo-topic/${a.topic_id}`, 'quiet')}</div><details><summary>Технические источники</summary><ul class="source-list">${sources(a.source_ids)}</ul></details>${reportButton(id)}</section></div>`;
  }
  function dictionary() {
    main.innerHTML = heading('Словарь электротехники', `${data.glossary.length} терминов с объяснениями простыми словами.`) + `<div class="teo">${link('К темам', 'teo', 'quiet')}${data.bank.topics.map(t => `<section class="plain-panel"><h2>${E(t.name)}</h2>${glossary(t.id)}${link('Изучить тему', `teo-topic/${t.id}`, 'quiet')}</section>`).join('')}</div>`;
  }
  function stepFeedback(q, row) {
    return q.numeric_steps.map(step => {
      const result = checkTeoNumber(row.steps?.[step.id] || '',step);
      return `<p><strong>${E(step.label)}:</strong> ${result.correct ? 'Шаг верен.' : !result.valid ? 'Введите конечное число в указанных единицах.' : `Пока не сходится. ${E(step.hint)}`}</p>`;
    }).join('');
  }
  main.addEventListener('click', event => {
    const id = event.target.closest('[data-teo-step-check]')?.dataset.teoStepCheck;
    const q = questions.get(id);
    if (!q?.numeric_steps?.length) return;
    const row = task(id); row.stepsChecked = true; row.stepsUsed = true; persist();
    main.querySelector('#teo-step-feedback').innerHTML = stepFeedback(q,row);
    main.querySelector('#teo-step-feedback').focus({preventScroll:true});
    announce.textContent = 'Шаги проверены. Следующий ответ будет отмечен как выполненный с помощью.';
  });
  function topicLinks(id) { return topics.has(id) ? `<section class="plain-panel"><h2>Примените эту теорию</h2><p>Расчёты с вводом числа, словарь, инженерные ситуации и подробное применение.</p>${link('Открыть учебный модуль', `teo-topic/${id}`)}</section>` : ''; }
  function questionGlossary(id) {
    const q = questions.get(id);
    return q ? `<details class="practice-question-terms" data-teo-question-terms="${E(id)}"><summary>Разобраться в терминах — с подсказкой</summary>${glossary(q.topic_id)}</details>` : '';
  }
  function questionReview(id) {
    const q = questions.get(id);
    return q ? `<details class="teo-review"><summary>Применение и пошаговый разбор</summary><p><strong>Применение:</strong> ${E(q.application)}</p>${lines(q.worked_solution, true)}${link('Учебный модуль', `teo-topic/${q.topic_id}`, 'quiet')}</details>` : '';
  }
  function continuation() { return `<div class="plain-panel">${link('Перейти к расчётам и применениям', 'teo')}</div>`; }
  main.addEventListener('click', event => {
    const target = event.target.closest('[data-teo-quiz]');
    if (!target) return;
    const t = topics.get(target.dataset.teoQuiz);
    if (!t) return;
    const kind = target.dataset.teoKind;
    const qs = data.bank.questions.filter(q => q.topic_id === t.id && (kind === 'all' || q.kind === kind));
    const ticket = data.tickets.find(item => item.topic_id === t.id);
    startQuiz(qs.map(q => q.id), t.name, kind === 'all' ? ticket.id : `TEO-${t.id}-${kind}`, target.dataset.teoMode === 'exam' ? 'exam' : 'learn');
  });
  main.addEventListener('input', event => {
    const target = event.target;
    const stepId = target.dataset.teoStep, stepQuestion = questions.get(target.dataset.teoStepQuestion);
    if (stepQuestion?.numeric_steps?.some(s => s.id === stepId)) {
      const row = task(stepQuestion.id); row.steps ||= {}; row.steps[stepId] = target.value.slice(0,64); row.stepsChecked = false;
      main.querySelector('#teo-step-feedback').textContent = ''; persist();
    }
    if (target.id === 'teo-search') {
      const query = target.value.trim().toLocaleLowerCase('ru');
      const cards = [...main.querySelectorAll('[data-teo-search]')];
      cards.forEach(card => { card.hidden = !card.dataset.teoSearch.includes(query); });
      main.querySelector('#teo-no-results').hidden = cards.some(card => !card.hidden);
    }
    const numberId = target.dataset.teoNumber;
    const draftId = target.dataset.teoDraft;
    const oralId = target.dataset.teoOral;
    if (questions.get(numberId)?.numeric_answer) {
      task(numberId).answer = target.value.slice(0, 64);
      const feedback = main.querySelector('#teo-feedback');
      if (feedback) feedback.textContent = ''; // Do not show an old verdict for edited input.
      persist();
    }
    if (questions.get(draftId)?.numeric_answer) { task(draftId).reasoning = target.value.slice(0, TEO_DRAFT_LIMIT); persist(); }
    if (applications.has(oralId)) { progress.oral[oralId] = target.value.slice(0, TEO_DRAFT_LIMIT); persist(); }
  });
  main.addEventListener('submit', event => {
    const id = event.target.dataset.teoCheck;
    const q = questions.get(id);
    if (!q?.numeric_answer) return;
    event.preventDefault();
    const result = submitTeoNumber(task(id), q);
    calculation(id, !result.valid);
    if (result.valid) persist();
    announce.textContent = result.valid ? teoTaskStatus(task(id)).label : 'Введите число в указанных единицах.';
    main.querySelector('#teo-feedback').focus({ preventScroll: true });
  });
  main.addEventListener('toggle', event => {
    if (!event.target.open) return;
    const id = event.target.dataset.teoSolution;
    if (questions.get(id)?.numeric_answer) { task(id).solutionSeen = true; persist(); }
    const questionId = event.target.dataset.teoQuestionTerms;
    if (questions.has(questionId)) onQuizAssistance(questionId);
  }, true);
  function report(id) {
    const a = applications.get(id);
    return a ? { id, topic_id: a.topic_id, type: 'teo-application', revision: 1, question: `${a.title}\n${a.brief}` } : null;
  }
  function backRoute(route, id) {
    if (route === 'teo-calc') return questions.has(id) ? `teo-topic/${questions.get(id).topic_id}` : 'teo';
    if (route === 'teo-application') return applications.has(id) ? `teo-topic/${applications.get(id).topic_id}` : 'teo';
    return 'teo';
  }
  return { list, topic, calculation, application, dictionary, topicLinks, questionGlossary, questionReview, summary, progressPanel, continuation, report, backRoute };
}
