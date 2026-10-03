import { STORAGE_KEY, freshProgress, readProgress, shuffle, createSession, submitAnswer, finishSession, sessionScore, validateActive, summarize, buildIssueDraft } from './core.js?v=1.2.1';

const ASSET_VERSION = '1.2.1';

const isAndroid = window.ROBOTICS_ANDROID === true;
const main = document.getElementById('main');
const announce = document.getElementById('announcement');
const dialog = document.getElementById('replace-session');
const supportDialog = document.getElementById('support-dialog');
const supportMessage = document.getElementById('support-message');
const supportDraft = document.getElementById('support-draft');
const supportStatus = document.getElementById('support-status');
const supportDrafts = new Map();
let supportContext = null;
let supportInvoker = null;
let bank, paths, beginnerTickets, mixedTickets, studyPlan, questionMap, topicMap, sourceMap;
let progress = freshProgress();
let storage;
let ticketMode = 'learn';
let topicDifficulty = '1';
let pendingStart = null;
const E = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const date = value => new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short' }).format(value);
const button = (label, action, id = '', type = 'primary') => `<button class="button ${type}" data-action="${E(action)}" data-id="${E(id)}">${E(label)}</button>`;
const heading = (title, text = '', label = '') => `<div class="page-heading"><div>${label ? `<p class="eyebrow">${E(label)}</p>` : ''}<h1>${E(title)}</h1>${text ? `<p class="lead">${E(text)}</p>` : ''}</div></div>`;
const topicName = id => topicMap.get(id)?.name || id;
const trackName = id => bank.tracks.find(t => t.id === id)?.name || '';
const questionCount = count => `${count} ${{ one: 'вопрос', few: 'вопроса', many: 'вопросов', other: 'вопроса' }[new Intl.PluralRules('ru').select(count)]}`;
const reportButton = q => `<div class="question-tools"><span>${E(q.id)}</span><button class="text-button" data-feedback="error" data-question="${E(q.id)}">Сообщить об ошибке в вопросе</button></div>`;
function updateSupportDraft() {
  if (!supportContext) return;
  supportDrafts.set(supportContext.key, supportMessage.value);
  const draft = buildIssueDraft({ ...supportContext, message: supportMessage.value, bankVersion: bank?.metadata.bank_version, platform: isAndroid ? 'Android' : 'Сайт' });
  supportDraft.value = draft.text;
  const link = document.getElementById('support-open');
  link.href = draft.url;
  // A main-frame, user-initiated HTTPS link is handled by the offline Android wrapper.
  link.target = isAndroid ? '_self' : '_blank';
  document.getElementById('support-long').hidden = !draft.needsPaste;
  if (draft.needsPaste) document.getElementById('support-preview').open = true;
}
function openSupport(kind, questionId, invoker) {
  const q = kind === 'error' ? questionMap?.get(questionId) : null;
  if (kind === 'error' && !q) return;
  supportInvoker = invoker;
  supportContext = { kind, question: q, topic: q ? topicName(q.topic_id) : '', key: q ? `error:${q.id}` : 'suggestion' };
  document.getElementById('support-title').textContent = q ? 'Сообщить об ошибке в вопросе' : 'Предложить улучшение';
  document.getElementById('support-label').textContent = q ? 'Что нужно исправить?' : 'Ваша идея';
  const context = document.getElementById('support-context');
  context.hidden = !q;
  context.textContent = q ? `${q.id} · ${topicName(q.topic_id)}\n${q.question}` : '';
  supportMessage.placeholder = q ? 'Что кажется неверным? Какой ответ или объяснение вы предлагаете?' : 'Новая тема, формат задания или удобная функция — расскажите, чего не хватает.';
  supportMessage.value = supportDrafts.get(supportContext.key) || '';
  supportStatus.textContent = '';
  document.getElementById('support-preview').open = false;
  updateSupportDraft();
  supportDialog.showModal();
  supportMessage.focus();
}
document.addEventListener('click', event => {
  const trigger = event.target.closest('[data-feedback]');
  if (trigger) openSupport(trigger.dataset.feedback, trigger.dataset.question, trigger);
});
supportMessage.addEventListener('input', () => { supportStatus.textContent = ''; updateSupportDraft(); });
document.getElementById('support-close').addEventListener('click', () => supportDialog.close());
supportDialog.addEventListener('close', () => { if (supportInvoker?.isConnected) supportInvoker.focus({ preventScroll: true }); });
document.getElementById('support-copy').addEventListener('click', async () => {
  const text = supportDraft.value;
  try {
    await navigator.clipboard.writeText(text);
    supportStatus.textContent = 'Текст скопирован. Обращение ещё не отправлено.';
  } catch {
    document.getElementById('support-preview').open = true;
    supportDraft.focus();
    supportDraft.select();
    supportDraft.setSelectionRange(0, text.length);
    supportStatus.textContent = 'Текст выделен. Скопируйте его через меню устройства или Ctrl+C / ⌘C.';
  }
});
function storageWarning(text) {
  const warning = document.getElementById('storage-warning');
  warning.textContent = text;
  warning.hidden = false;
  document.getElementById('save-status').textContent = 'Прогресс только в текущем сеансе';
}
function persist() {
  try {
    if (!storage) throw new Error('No storage');
    storage.setItem(STORAGE_KEY, JSON.stringify(progress));
    document.getElementById('save-status').textContent = 'Прогресс сохранён';
  } catch {
    storageWarning(isAndroid ? 'Не удалось сохранить прогресс на устройстве. Ответы останутся до закрытия приложения. Проверьте свободное место.' : 'Браузер не позволяет сохранить прогресс. Ответы останутся до закрытия страницы. Для сохранения откройте сайт в обычном режиме браузера.');
  }
  updateNav();
}
function stats() { return summarize(progress, questionMap); }
function updateNav() {
  const route = location.hash.slice(1).split('/')[0] || 'first-steps';
  const nav = ['path', 'session', 'results'].includes(route) ? (progress.active?.origin || 'first-steps') : route === 'topic' ? 'topics' : route;
  for (const link of document.querySelectorAll('[data-route]')) {
    if (link.dataset.route === nav) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  document.getElementById('mistakes-count').textContent = stats().mistakes.length;
}
function go(route) {
  if (location.hash === `#${route}`) { render(); main.focus({ preventScroll: true }); window.scrollTo(0, 0); }
  else location.hash = route;
}
function resumeBanner() {
  const s = progress.active;
  if (!s || s.finishedAt !== null) return '';
  return `<div class="resume-banner"><div><strong>Продолжить: ${E(s.title)}</strong><p>Ответов ${Object.keys(s.answers).length} из ${s.questionIds.length} · ваш подход сохранён</p></div>${button('Продолжить', 'resume', '', 'secondary')}</div>`;
}
function topicProgress(id) {
  const questions = bank.questions.filter(q => q.topic_id === id);
  const learned = questions.filter(q => progress.questions[q.id]?.lastCorrect && !progress.questions[q.id]?.lastHinted).length;
  return { learned, total: questions.length, percent: Math.round(learned / questions.length * 100) };
}
function firstSteps() {
  const ordered = studyPlan.recommended_path_order.map(id => paths.find(p => p.id === id)).filter(Boolean);
  const next = ordered.find(p => !progress.completed[p.id]) || ordered[0];
  const completed = ordered.filter(p => progress.completed[p.id]).length;
  main.innerHTML = heading('Учитесь небольшими шагами', 'Пять вопросов за подход. Разберитесь в одном понятии и сразу проверьте себя.', 'С чего начать') + resumeBanner() +
    `<section class="start-card" aria-label="Следующая цепочка"><div><p class="eyebrow">${completed === ordered.length ? 'Можно повторить' : 'Ваш следующий шаг'}</p><h2>${E(next.title)}</h2><p>Короткий словарь · 5 вопросов · объяснение своими словами</p></div>${button(completed ? 'Продолжить обучение' : 'Начать с основ', 'open-path', next.id)}</section>
    <div class="stats-strip"><div class="stat-inline"><strong>${bank.questions.length}</strong><span>вопросов в банке</span></div><div class="stat-inline"><strong>${bank.topics.length}</strong><span>учебных тем</span></div><div class="stat-inline"><strong>${completed} / ${paths.length}</strong><span>цепочек пройдено</span></div></div>
    <section class="plain-panel engineering-intro"><p class="eyebrow">Дальше — инженерная практика</p><h2>От модели к работающему роботу</h2><p class="note">60 новых вопросов: расчёты, выбор решений и проверка ограничений. Начните с математики и координат, затем переходите к манипуляторам, датчикам и движению.</p><div class="engineering-links">${bank.topics.filter(t => t.track_id === 'engineering').map(t => `<a class="button secondary" href="#topic/${E(t.id)}">${E(t.name)}</a>`).join('')}</div></section><div class="section-title"><h2>От электрической цепи к роботу</h2><span>Рекомендуемый порядок</span></div><div class="card-grid">${bank.topics.filter(t => paths.some(p => p.topic_id === t.id)).map((t, i) => {
      const ps = paths.filter(p => p.topic_id === t.id);
      const s = topicProgress(t.id);
      return `<section class="card topic-card"><div class="card-top"><span class="topic-number">ТЕМА ${String(i + 1).padStart(2, '0')}</span><span class="tag">${E(trackName(t.track_id))}</span></div><h3>${E(t.name)}</h3>${ps.map((p, j) => `<button class="path-link" data-action="open-path" data-id="${E(p.id)}"><span class="path-step">${progress.completed[p.id] ? '✓' : j + 1}</span><span class="path-name">${E(p.title)}</span><span class="path-size">5 вопр.</span></button>`).join('')}<div class="topic-footer"><span>${s.learned} / ${s.total} отвечено верно</span><div class="tiny-progress" aria-hidden="true"><span style="width:${s.percent}%"></span></div></div></section>`;
    }).join('')}</div>`;
}
function pathIntro(id) {
  const p = paths.find(p => p.id === id);
  if (!p) return missing();
  main.innerHTML = `<div class="page-heading"><div class="path-intro-heading"><p class="eyebrow">Первые шаги · ${E(topicName(p.topic_id))}</p><h1>${E(p.title)}</h1><p class="lead">Прочитайте словарь, затем решите пять вопросов по порядку. Если трудно, можно открыть подсказку.</p></div></div>
    <section class="plain-panel"><h2>Слова, которые пригодятся</h2><dl class="glossary">${p.glossary.map(g => `<div><dt>${E(g.term)}</dt><dd>${E(g.definition)}</dd></div>`).join('')}</dl><div class="button-row">${button('Начать 5 вопросов', 'begin-path', p.id)}<a class="button quiet" href="#first-steps">Все цепочки</a></div></section>
    <section class="plain-panel"><h2>Что вы сможете объяснить</h2><p class="interview-prompt">${E(p.interview_prompt)}</p><p class="note">После вопросов попробуйте ответить своими словами. Затем можно будет открыть пример и проверить, все ли мысли вы назвали.</p></section>`;
}
function ticketCard(t, beginner = false, i = 0) {
  const history = progress.sessions.filter(s => s.resourceId === t.id);
  const best = history.length ? Math.max(...history.map(s => s.correct)) : null;
  return `<section class="card ticket-card"><div class="card-top"><span class="ticket-number">${String(i + 1).padStart(2, '0')}</span><span class="tag${progress.completed[t.id] ? ' done' : ''}">${progress.completed[t.id] ? 'Пройден' : beginner ? 'Основы' : t.category === 'engineering' ? 'Инженерная практика' : 'Базовые темы'}</span></div><h3>${E(beginner ? topicName(t.topic_id) : t.title)}</h3><p>${t.question_ids.length} вопросов · ${beginner || ticketMode === 'learn' ? 'разбор после каждого ответа' : 'разбор после завершения'}</p>${best !== null ? `<div class="ticket-score">Лучший результат: ${best} / ${t.question_ids.length}</div>` : ''}${button(beginner || ticketMode === 'learn' ? 'Учить билет' : 'Решить билет', beginner ? 'begin-beginner' : 'begin-ticket', t.id, 'secondary')}</section>`;
}
function ticketsPage() {
  const foundation = mixedTickets.filter(t => t.category !== 'engineering');
  const engineering = mixedTickets.filter(t => t.category === 'engineering');
  main.innerHTML = heading('Билеты для практики', 'Начните с вводного билета по знакомой теме. Смешанные билеты пригодятся, когда освоите основы.', 'По одному подходу') + resumeBanner() +
    `<div class="section-title"><h2>Вводные билеты</h2><span>${beginnerTickets.length} билетов по 10 вопросов</span></div><div class="ticket-grid">${beginnerTickets.map((t, i) => ticketCard(t, true, i)).join('')}</div>
    <div class="section-title"><h2>Смешанные билеты</h2><span>${foundation.length} билетов по 20 вопросов</span></div><div class="filters"><label for="ticket-mode">Как решать</label><select class="field" id="ticket-mode"><option value="learn"${ticketMode === 'learn' ? ' selected' : ''}>Обучение — объяснения сразу</option><option value="exam"${ticketMode === 'exam' ? ' selected' : ''}>Самопроверка — ответы в конце</option></select></div><div class="ticket-grid">${foundation.map((t, i) => ticketCard(t, false, i)).join('')}</div><div class="section-title"><h2>Инженерная практика</h2><span>${engineering.length} билета по 20 вопросов</span></div><p class="note">Математика, координаты, манипуляторы, оценка состояния, зрение и планирование. Дополнительно — задачи по механике, управлению, ПО и испытаниям.</p><div class="ticket-grid">${engineering.map((t, i) => ticketCard(t, false, i)).join('')}</div><p class="note">В самопроверке цель — 18 правильных ответов из 20. Это ориентир для учёбы. Время не ограничено.</p>`;
}
function topicsPage() {
  main.innerHTML = heading('Тренировка по темам', 'Краткая теория, полезные формулы и вопросы выбранного уровня.', 'От основ к инженерным задачам') + resumeBanner() + `<div class="card-grid">${bank.topics.map((t, i) => {
    const s = topicProgress(t.id);
    return `<section class="card topic-card"><div class="card-top"><span class="topic-number">${String(i + 1).padStart(2, '0')} / ${bank.topics.length}</span><span class="tag">${E(trackName(t.track_id))}</span></div><h3>${E(t.name)}</h3><p class="note">${E(t.learning_goals[0])}</p>${t.engineering_question_count ? `<p class="engineering-count">${questionCount(t.engineering_question_count)} инженерной практики</p>` : ''}<div class="topic-footer"><span>${s.learned} / ${s.total} отвечено верно</span><div class="tiny-progress" aria-hidden="true"><span style="width:${s.percent}%"></span></div></div><div style="margin-top:20px">${button('Открыть тему', 'open-topic', t.id, 'secondary')}</div></section>`;
  }).join('')}</div>`;
}
function topicIntro(id) {
  const t = topicMap.get(id);
  if (!t) return missing();
  const count = bank.questions.filter(q => q.topic_id === id && (topicDifficulty === 'all' || q.difficulty === Number(topicDifficulty))).length;
  main.innerHTML = heading(t.name, '', trackName(t.track_id)) + `<section class="plain-panel"><h2>Коротко о теме</h2><p class="lesson" style="margin-top:15px">${E(t.mini_lesson)}</p>${t.formulas?.length ? `<ul class="formula-list">${t.formulas.map(f => `<li>${E(f)}</li>`).join('')}</ul>` : ''}<p class="note"><strong>Частая ошибка:</strong> ${E(t.common_error)}</p></section><section class="plain-panel"><h2>Выберите уровень</h2><div class="filters"><label for="topic-difficulty">Сложность</label><select class="field" id="topic-difficulty" data-topic="${E(id)}"><option value="1"${topicDifficulty === '1' ? ' selected' : ''}>Базовый</option><option value="2"${topicDifficulty === '2' ? ' selected' : ''}>Прикладной</option><option value="3"${topicDifficulty === '3' ? ' selected' : ''}>Повышенный</option><option value="all"${topicDifficulty === 'all' ? ' selected' : ''}>Все уровни</option></select><span class="note" style="margin:0">${questionCount(count)}</span></div><div class="button-row">${button('Начать тренировку', 'begin-topic', id)}<a class="button quiet" href="#topics">Все темы</a></div></section>`;
}
function sources(ids) {
  return [...new Set(ids)].map(id => sourceMap.get(id)).filter(Boolean).map(s => {
    let href = '';
    try { const url = new URL(s.url); if (url.protocol === 'https:' || url.protocol === 'http:') href = url.href; } catch {}
    return `<li>${href ? `<a href="${E(href)}" target="_blank" rel="noopener noreferrer">${E(s.title)}</a>` : E(s.title)}<br><span>${E(s.organization)}${s.role === 'interview_inspiration' ? ' · источник темы' : ''}</span></li>`;
  }).join('');
}
function feedback(q, answer, hinted = false) {
  const correct = answer === q.correct_option_id;
  const chosen = q.options.find(o => o.id === answer);
  const explanation = q.beginner_explanation || q.explanation;
  return `<section class="feedback${correct ? '' : ' wrong'}" aria-label="Разбор ответа"><h3>${correct ? (hinted ? 'Верно, с подсказкой' : 'Верно') : 'Пока неверно — разберёмся'}</h3><p>${E(explanation)}</p>${!correct ? `<p class="selected-reason"><strong>Почему выбранный ответ не подходит:</strong> ${E(chosen?.explanation)}</p>` : ''}${hinted ? '<p class="note">Этот вопрос останется в повторении. Попробуйте ещё раз без подсказки.</p>' : ''}<details><summary>Разбор всех вариантов</summary><ul class="option-reasons">${q.options.map(o => `<li><strong>${E(o.text)}${o.id === q.correct_option_id ? ' — верно' : ''}.</strong> ${E(o.explanation)}</li>`).join('')}</ul></details><details><summary>Источники и подробное объяснение</summary>${q.beginner_explanation ? `<p style="margin-top:12px">${E(q.explanation)}</p>` : ''}<ul class="source-list">${sources(q.source_ids)}</ul></details></section>`;
}
function begin(config, replace = false) {
  if (!config.questions.length) return;
  if (!replace && progress.active && progress.active.finishedAt === null) {
    pendingStart = config;
    dialog.showModal();
    return;
  }
  progress.active = createSession(config);
  persist();
  go('session');
}
function sessionPage() {
  const s = progress.active;
  if (!s) return emptySession();
  if (s.finishedAt !== null) return resultsPage();
  const q = questionMap.get(s.questionIds[s.index]);
  const answer = s.answers[q.id];
  const answered = Object.hasOwn(s.answers, q.id);
  const showFeedback = answered && s.mode !== 'exam';
  const order = s.optionOrders[q.id];
  const options = order.map(id => q.options.find(o => o.id === id));
  const answeredCount = Object.keys(s.answers).length;
  const allAnswered = answeredCount === s.questionIds.length;
  main.innerHTML = `<div class="page-heading"><div><p class="eyebrow">${s.mode === 'exam' ? 'Самопроверка' : 'Обучение'}</p><h1>${E(s.title)}</h1></div>${button('Сохранить и выйти', 'pause', '', 'quiet')}</div>
    <div class="session-layout"><section class="quiz-panel"><div class="question-meta"><span class="question-index">Вопрос ${s.index + 1} из ${s.questionIds.length}</span><span class="tag">${E(bank.difficulty_levels.find(d => d.id === q.difficulty)?.name)}</span></div><h2 class="question-title" id="question-title">${E(q.question)}</h2><div class="options" aria-labelledby="question-title">${options.map((o, i) => {
      let cls = answer === o.id ? ' selected' : '';
      let label = '';
      if (showFeedback) {
        if (o.id === q.correct_option_id) { cls = ' correct'; label = 'Правильный ответ'; }
        else if (o.id === answer) { cls = ' incorrect'; label = 'Ваш ответ'; }
      } else if (o.id === answer) label = 'Ваш выбор';
      return `<button class="answer${cls}" data-action="answer" data-id="${E(o.id)}" aria-pressed="${answer === o.id}"${showFeedback ? ' disabled' : ''}><span class="answer-key" aria-hidden="true">${i + 1}</span><span class="answer-text">${E(o.text)}${label ? `<span class="answer-state">${E(label)}</span>` : ''}</span></button>`;
    }).join('')}</div>${!answered && s.mode !== 'exam' && q.hint ? (s.hints[q.id] ? `<p class="hint"><strong>Подсказка:</strong> ${E(q.hint)}</p>` : '<button class="hint-button" data-action="hint">Нужна подсказка</button>') : ''}${showFeedback ? feedback(q, answer, Boolean(s.hints[q.id])) : s.mode === 'exam' ? '<p class="note">Можно изменить выбранный вариант. Разбор появится после завершения всего билета.</p>' : ''}
    <div class="quiz-controls"><button class="button quiet" data-action="previous"${s.index === 0 ? ' disabled' : ''}>Назад</button><button id="next-question" class="button primary" data-action="next"${!answered ? ' disabled' : ''}>${allAnswered ? 'Завершить подход' : s.index === s.questionIds.length - 1 ? 'К неотвеченным' : 'Следующий вопрос'}</button></div>${reportButton(q)}</section>
    <aside class="session-sidebar"><section class="card"><h3>${s.mode === 'exam' ? 'Ваш билет' : 'Ваш подход'}</h3><p>Ответов: ${answeredCount} / ${s.questionIds.length}</p><div class="question-grid" aria-label="Переход к вопросу">${s.questionIds.map((id, i) => {
      const a = Object.hasOwn(s.answers, id);
      const state = !a ? '' : s.mode === 'exam' ? ' answered' : s.answers[id] === questionMap.get(id).correct_option_id ? ' right' : ' wrong';
      const word = !a ? 'без ответа' : s.mode === 'exam' ? 'ответ выбран' : state === ' right' ? 'верный ответ' : 'ошибка';
      return `<button class="question-dot${state}${i === s.index ? ' current' : ''}" data-action="jump" data-id="${i}" aria-label="Вопрос ${i + 1}: ${word}"${i === s.index ? ' aria-current="step"' : ''}>${i + 1}</button>`;
    }).join('')}</div><button class="button secondary" data-action="finish"${!allAnswered ? ' disabled' : ''}>Завершить</button><span class="session-mode">${s.mode === 'exam' ? 'Ответы — в конце' : 'Разбор — после ответа'}<br>Без ограничения времени</span></section></aside></div>`;
}
function resultsPage() {
  const s = progress.active;
  if (!s || s.finishedAt === null) return emptySession();
  const score = sessionScore(s, questionMap);
  const wrong = s.questionIds.filter(id => s.answers[id] !== questionMap.get(id).correct_option_id);
  const p = paths.find(p => p.id === s.pathId);
  const nextPath = p && paths[paths.indexOf(p) + 1];
  const hinted = s.questionIds.filter(id => s.hints[id]).length;
  const pass = s.mode === 'exam' && s.questionIds.length === 20;
  main.innerHTML = heading('Подход завершён', s.title, 'Результат') + `<section class="score-panel"><div class="score-value">${score}<span> / ${s.questionIds.length}</span></div><div><h2>${pass ? score >= 18 ? 'Цель достигнута' : 'Продолжайте тренироваться' : wrong.length ? 'Каждая ошибка — повод разобраться' : 'Все ответы верные'}</h2><p>${wrong.length ? `Вопросов для разбора: ${wrong.length}. Они добавлены в работу над ошибками.` : 'Можно переходить дальше или закрепить тему.'}${hinted ? ` С подсказкой: ${hinted}. Повторите эти вопросы самостоятельно.` : ''}</p></div></section>
    <div class="button-row result-actions">${wrong.length ? button('Повторить ошибки', 'retry-wrong') : ''}${nextPath ? button('Следующая цепочка', 'open-path', nextPath.id, wrong.length ? 'secondary' : 'primary') : ''}${button('Повторить подход', 'retry', '', 'secondary')}<a class="button quiet" href="#${E(s.origin)}">К разделу</a></div>
    ${p ? `<section class="plain-panel"><p class="eyebrow">Теперь своими словами</p><h2>Попробуйте ответить как на собеседовании</h2><p class="interview-prompt">${E(p.interview_prompt)}</p><label for="interview-answer">Ваш ответ — для самопроверки</label><textarea id="interview-answer" class="field text-answer" placeholder="Объясните так, как объяснили бы знакомому…">${E(s.draft)}</textarea><p class="note">Ответ сохраняется в текущем подходе. Оценки за формулировку нет.</p><details><summary>Сравнить с примером ответа</summary><p class="lesson" style="margin-top:15px">${E(p.plain_answer)}</p><h3 style="margin-top:18px">Проверьте, что вы назвали</h3><ul class="checklist">${p.answer_checklist.map(item => `<li>${E(item)}</li>`).join('')}</ul><p class="note">Не нужно запоминать пример дословно. Важно правильно объяснить смысл.</p></details></section>` : ''}
    <div class="section-title"><h2>${s.mode === 'exam' ? 'Разбор билета' : 'Все ответы подхода'}</h2><span>${score} верно · ${wrong.length} ошибок</span></div><div class="result-review">${s.questionIds.map((id, i) => {
      const q = questionMap.get(id);
      const answer = s.answers[id];
      const correct = answer === q.correct_option_id;
      return `<article class="review-card"><span class="review-label${correct ? ' right' : ''}">Вопрос ${i + 1} · ${correct ? 'Верно' : 'Ошибка'}${s.hints[id] ? ' · с подсказкой' : ''}</span><h3 class="question-title">${E(q.question)}</h3><p><strong>Ваш ответ:</strong> ${E(q.options.find(o => o.id === answer)?.text)}</p>${!correct ? `<p><strong>Правильный ответ:</strong> ${E(q.options.find(o => o.id === q.correct_option_id)?.text)}</p>` : ''}<p class="explanation">${E(q.beginner_explanation || q.explanation)}</p><details><summary>Почему подходят или не подходят другие варианты</summary><ul class="option-reasons">${q.options.map(o => `<li><strong>${E(o.text)}.</strong> ${E(o.explanation)}</li>`).join('')}</ul><ul class="source-list">${sources(q.source_ids)}</ul></details>${reportButton(q)}</article>`;
    }).join('')}</div>`;
}
function mistakesPage() {
  const s = stats();
  main.innerHTML = heading('Работа над ошибками', 'Повторите вопросы, в которых ошиблись или использовали подсказку. Самостоятельный верный ответ уберёт вопрос из этого списка.', 'Закрепить знания') + resumeBanner() +
    (s.mistakes.length ? `<section class="start-card"><div><p class="eyebrow">Повторите без подсказки</p><h2>${s.mistakes.length} вопросов ждут разбора</h2><p>Разбор открывается сразу после выбора ответа.</p></div>${button('Разобрать ошибки', 'begin-mistakes')}</section><div class="section-title"><h2>По темам</h2></div><div class="card-grid">${bank.topics.map(t => {
      const count = s.mistakes.filter(id => questionMap.get(id).topic_id === t.id).length;
      if (!count) return '';
      return `<section class="card"><h3>${E(t.name)}</h3><p class="note">Вопросов для повторения: ${count}</p><div style="margin-top:17px">${button('Повторить тему', 'begin-mistakes', t.id, 'secondary')}</div></section>`;
    }).join('')}</div>` : `<section class="empty"><h2>${s.seen ? 'Ошибок для повторения нет' : 'Здесь появятся вопросы для повторения'}</h2><p>${s.seen ? 'Когда ошибётесь или воспользуетесь подсказкой, вопрос попадёт сюда.' : 'Начните с короткой цепочки. Ошибаться можно: к каждому ответу есть объяснение.'}</p><a class="button primary" href="#first-steps">Первые шаги</a></section>`) +
    (s.due.length ? `<section class="plain-panel"><h2>Пора освежить в памяти</h2><p class="note">Ещё ${s.due.length} вопросов вы решали верно. Пришло время повторить их.</p><div style="margin-top:17px">${button('Повторить изученное', 'begin-review', '', 'secondary')}</div></section>` : '');
}
function progressPage() {
  const s = stats();
  const completedPaths = paths.filter(p => progress.completed[p.id]).length;
  main.innerHTML = heading('Ваш прогресс', isAndroid ? 'Результаты сохраняются в приложении на этом устройстве. После закрытия можно продолжить незавершённый подход.' : 'Результаты сохраняются в этом браузере. После перезагрузки можно продолжить незавершённый подход.', 'Шаг за шагом') + resumeBanner() + `<div class="progress-stats"><div class="stat-card"><strong>${s.seen} / ${bank.questions.length}</strong><span>вопросов попробовано</span></div><div class="stat-card"><strong>${s.attempts ? `${s.accuracy}%` : '—'}</strong><span>верных ответов за всё время</span></div><div class="stat-card"><strong>${completedPaths} / ${paths.length}</strong><span>цепочек завершено</span></div><div class="stat-card"><strong>${s.mistakes.length}</strong><span>вопросов для повторения</span></div></div><section class="plain-panel"><h2>Прогресс по темам</h2><p class="note">Учитывается последний самостоятельный ответ на каждый вопрос.</p>${bank.topics.map(t => {
    const p = topicProgress(t.id);
    return `<div class="progress-row"><span>${E(t.name)}</span><div class="tiny-progress" aria-hidden="true"><span style="width:${p.percent}%"></span></div><span>${p.learned} / ${p.total}</span></div>`;
  }).join('')}</section><section class="plain-panel"><h2>Последние подходы</h2>${progress.sessions.length ? `<ul class="history-list">${progress.sessions.slice(0, 12).map(s => `<li><div>${E(s.title)}<small>${E(date(s.finishedAt))} · ${s.mode === 'exam' ? 'самопроверка' : 'обучение'}</small></div><strong>${s.correct} / ${s.total}</strong></li>`).join('')}</ul>` : '<p class="note">После первого завершённого подхода здесь появится результат.</p>'}</section><p class="note">${isAndroid ? 'На другом устройстве будет отдельный прогресс. Удаление приложения или очистка его данных удалит сохранённые результаты.' : 'На другом устройстве будет отдельный прогресс. При очистке данных сайта браузер удалит сохранённые результаты.'}</p>`;
}
function missing() { main.innerHTML = heading('Этот раздел не найден') + '<a class="button primary" href="#first-steps">К первым шагам</a>'; }
function emptySession() { main.innerHTML = heading('Выберите подход для тренировки') + '<a class="button primary" href="#first-steps">Начать с основ</a>'; }
function registerWebTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  const tools = [
    {
      name: 'read_training_progress',
      description: 'Read the current device-local learning progress without changing results.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input !== 'object' || Object.keys(input).length) throw new Error('Expected an empty object');
        const s = stats();
        return { attemptedQuestions: s.seen, totalQuestions: bank.questions.length, accuracy: s.accuracy, questionsToReview: s.mistakes.length, completedPaths: paths.filter(p => progress.completed[p.id]).length };
      }
    },
    {
      name: 'open_learning_path',
      description: 'Navigate to the glossary of a chosen five-question learning path. This does not answer questions or replace an active session.',
      inputSchema: { type: 'object', properties: { pathId: { type: 'string', enum: paths.map(p => p.id) } }, required: ['pathId'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input !== 'object' || Object.keys(input).length !== 1 || !paths.some(p => p.id === input.pathId)) throw new Error('Unknown learning path');
        go(`path/${input.pathId}`);
        render();
        return { pathId: input.pathId, view: 'glossary' };
      }
    }
  ];
  for (const tool of tools) {
    try { Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch {}
  }
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
}
function render() {
  const [route = 'first-steps', id] = (location.hash.slice(1) || 'first-steps').split('/');
  updateNav();
  switch (route) {
    case 'first-steps': firstSteps(); break;
    case 'path': pathIntro(id); break;
    case 'tickets': ticketsPage(); break;
    case 'topics': topicsPage(); break;
    case 'topic': topicIntro(id); break;
    case 'mistakes': mistakesPage(); break;
    case 'progress': progressPage(); break;
    case 'session': sessionPage(); break;
    case 'results': resultsPage(); break;
    default: missing();
  }
  const title = main.querySelector('h1')?.textContent || 'Робототехника';
  document.title = `${title} — Робототехника, билеты`;
}
function selectedQuestions(ids) { return ids.map(id => questionMap.get(id)).filter(Boolean); }
main.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target || target.disabled) return;
  const { action, id } = target.dataset;
  const s = progress.active;
  switch (action) {
    case 'open-path': go(`path/${id}`); break;
    case 'open-topic': topicDifficulty = '1'; go(`topic/${id}`); break;
    case 'begin-path': {
      const p = paths.find(p => p.id === id);
      if (p) begin({ questions: selectedQuestions(p.question_ids), title: p.title, resourceId: p.id, pathId: p.id, origin: 'first-steps' });
      break;
    }
    case 'begin-beginner': case 'begin-ticket': {
      const t = (action === 'begin-beginner' ? beginnerTickets : mixedTickets).find(t => t.id === id);
      if (t) begin({ questions: selectedQuestions(t.question_ids), mode: action === 'begin-beginner' ? 'learn' : ticketMode, title: t.title, resourceId: t.id, origin: 'tickets' });
      break;
    }
    case 'begin-topic': begin({ questions: shuffle(bank.questions.filter(q => q.topic_id === id && (topicDifficulty === 'all' || q.difficulty === Number(topicDifficulty)))), title: topicName(id), origin: 'topics' }); break;
    case 'begin-mistakes': begin({ questions: selectedQuestions(stats().mistakes.filter(q => !id || questionMap.get(q).topic_id === id)), title: id ? `Ошибки: ${topicName(id)}` : 'Работа над ошибками', origin: 'mistakes' }); break;
    case 'begin-review': begin({ questions: selectedQuestions(stats().due), title: 'Повторение изученного', origin: 'mistakes' }); break;
    case 'resume': go('session'); break;
    case 'pause': persist(); go(s.origin); break;
    case 'answer': {
      const q = questionMap.get(s.questionIds[s.index]);
      if (submitAnswer(progress, s, q, id)) {
        persist(); sessionPage();
        announce.textContent = s.mode === 'exam' ? 'Ответ выбран. Результат будет после завершения.' : id === q.correct_option_id ? 'Верно. Ниже объяснение ответа.' : 'Пока неверно. Ниже объяснение и правильный ответ.';
        if (s.mode !== 'exam') document.getElementById('next-question').focus({ preventScroll: true });
        else main.querySelector(`.answer[data-id="${id}"]`)?.focus({ preventScroll: true });
      }
      break;
    }
    case 'hint': s.hints[s.questionIds[s.index]] = true; persist(); sessionPage(); announce.textContent = 'Подсказка открыта.'; break;
    case 'previous': s.index = Math.max(0, s.index - 1); persist(); sessionPage(); main.focus({ preventScroll: true }); break;
    case 'jump': s.index = Number(id); persist(); sessionPage(); main.focus({ preventScroll: true }); window.scrollTo(0, 0); break;
    case 'next': {
      if (s.questionIds.every(id => Object.hasOwn(s.answers, id))) { finishSession(progress, s, questionMap); persist(); go('results'); }
      else { s.index = s.index < s.questionIds.length - 1 ? s.index + 1 : s.questionIds.findIndex(id => !Object.hasOwn(s.answers, id)); persist(); sessionPage(); main.focus({ preventScroll: true }); window.scrollTo(0, 0); }
      break;
    }
    case 'finish': if (s.questionIds.every(id => Object.hasOwn(s.answers, id))) { finishSession(progress, s, questionMap); persist(); go('results'); } break;
    case 'retry': begin({ questions: selectedQuestions(s.questionIds), title: s.title, mode: s.mode, resourceId: s.resourceId, pathId: s.pathId, origin: s.origin }); break;
    case 'retry-wrong': begin({ questions: selectedQuestions(s.questionIds.filter(id => s.answers[id] !== questionMap.get(id).correct_option_id)), title: 'Разбор ошибок прошлого подхода', origin: 'mistakes' }); break;
  }
});
main.addEventListener('change', event => {
  if (event.target.id === 'ticket-mode') { ticketMode = event.target.value; ticketsPage(); document.getElementById('ticket-mode').focus({ preventScroll: true }); }
  if (event.target.id === 'topic-difficulty') { topicDifficulty = event.target.value; topicIntro(event.target.dataset.topic); document.getElementById('topic-difficulty').focus({ preventScroll: true }); }
});
main.addEventListener('input', event => {
  if (event.target.id === 'interview-answer' && progress.active) { progress.active.draft = event.target.value; persist(); }
});
document.getElementById('keep-session').addEventListener('click', () => { dialog.close(); pendingStart = null; go('session'); });
document.getElementById('new-session').addEventListener('click', () => { dialog.close(); const config = pendingStart; pendingStart = null; if (config) begin(config, true); });
document.getElementById('cancel-session').addEventListener('click', () => { dialog.close(); pendingStart = null; });
dialog.addEventListener('cancel', () => { pendingStart = null; });
window.addEventListener('hashchange', () => { if (supportDialog.open) supportDialog.close(); if (bank) { render(); main.focus({ preventScroll: true }); window.scrollTo(0, 0); } });

// Android Back pauses the approach without deleting any answers.
window.roboticsNativeBack = () => {
  if (supportDialog.open) { supportDialog.close(); return true; }
  if (!bank) return false;
  if (dialog.open) {
    dialog.dispatchEvent(new Event('cancel'));
    dialog.close();
    return true;
  }
  const route = (location.hash.slice(1) || 'first-steps').split('/')[0];
  if (route === 'first-steps') return false;
  if (route === 'session' || route === 'results') {
    persist();
    go(progress.active?.origin || 'first-steps');
  } else go(route === 'topic' ? 'topics' : 'first-steps');
  return true;
};

async function load() {
  try {
    const files = ['question_bank.json', 'interview_paths.json', 'beginner_tickets.json', 'tickets.json', 'study_plan.json'];
    const data = await Promise.all(files.map(async name => {
      const response = await fetch(new URL(`./data/${name}?v=${ASSET_VERSION}`, import.meta.url));
      if (!response.ok) throw new Error(`Data unavailable: ${name}`);
      return response.json();
    }));
    [bank, { paths }, { tickets: beginnerTickets }, { tickets: mixedTickets }, studyPlan] = data;
    questionMap = new Map(bank.questions.map(q => [q.id, q]));
    topicMap = new Map(bank.topics.map(t => [t.id, t]));
    sourceMap = new Map(bank.sources.map(s => [s.id, s]));
    try {
      storage = window.localStorage;
      const saved = readProgress(storage);
      progress = saved.progress;
      if (saved.error) storageWarning('Сохранение недоступно или повреждено. Начните новый подход; исправные результаты будут сохраняться, если браузер разрешит.');
    } catch { storageWarning('Браузер не позволяет сохранить прогресс. Откройте сайт в обычном режиме браузера.'); }
    if (progress.active && !validateActive(progress.active, questionMap)) { progress.active = null; persist(); }
    document.getElementById('bank-version').textContent = bank.metadata.bank_version;
    render();
    registerWebTools();
  } catch (error) {
    console.error('Не удалось загрузить банк вопросов', error);
    main.innerHTML = heading('Не удалось загрузить вопросы', isAndroid ? 'Перезапустите приложение. Прогресс останется на устройстве. Если ошибка повторяется, сообщите разработчику.' : 'Проверьте соединение и обновите страницу. Прогресс останется в браузере.') + '<button class="button primary" id="reload">Попробовать ещё раз</button>';
    document.getElementById('reload').addEventListener('click', () => location.reload());
  }
}
load();
