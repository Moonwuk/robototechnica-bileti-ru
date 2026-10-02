export const STORAGE_KEY = 'robototehnika-bileti-ru:progress:v1';
const DAY = 86400000;
export function freshProgress() {
  return { version: 1, questions: {}, sessions: [], completed: {}, active: null };
}
export function readProgress(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { progress: freshProgress(), error: false };
    const value = JSON.parse(raw);
    if (value.version !== 1 || !value.questions || typeof value.questions !== 'object' || Array.isArray(value.questions) || !Array.isArray(value.sessions)) throw new Error('Invalid progress');
    if (!value.completed || typeof value.completed !== 'object' || Array.isArray(value.completed)) value.completed = {};
    return { progress: value, error: false };
  } catch {
    return { progress: freshProgress(), error: true };
  }
}
export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function createSession({ questions, mode = 'learn', title, resourceId = null, pathId = null, origin = 'first-steps' }, now = Date.now()) {
  if (!questions.length) throw new Error('Empty session');
  return {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`, title, mode,
    resourceId, pathId, origin, questionIds: questions.map(q => q.id),
    optionOrders: Object.fromEntries(questions.map(q => [q.id, shuffle(q.options.map(o => o.id))])),
    answers: {}, hints: {}, index: 0, startedAt: now, finishedAt: null, recorded: false, draft: ''
  };
}
export function recordAnswer(progress, question, optionId, hinted = false, now = Date.now()) {
  const previous = progress.questions[question.id] || { attempts: 0, correct: 0, streak: 0, needsReview: false };
  const correct = optionId === question.correct_option_id;
  const streak = correct && !hinted ? previous.streak + 1 : 0;
  const next = { ...previous, attempts: previous.attempts + 1, correct: previous.correct + Number(correct), streak, lastOptionId: optionId, lastCorrect: correct, lastHinted: hinted, lastAt: now };
  next.needsReview = !correct || hinted;
  next.reviewAt = now + (correct && !hinted ? [1, 3, 7, 14][Math.min(streak - 1, 3)] * DAY : 0);
  progress.questions[question.id] = next;
  return correct;
}
export function submitAnswer(progress, session, question, optionId, now = Date.now()) {
  if (!question.options.some(o => o.id === optionId)) throw new Error('Unknown answer');
  if (session.finishedAt !== null) return false;
  if (session.mode !== 'exam' && Object.hasOwn(session.answers, question.id)) return false;
  session.answers[question.id] = optionId;
  if (session.mode !== 'exam') recordAnswer(progress, question, optionId, Boolean(session.hints[question.id]), now);
  return true;
}
export function sessionScore(session, questionMap) {
  return session.questionIds.reduce((n, id) => n + Number(session.answers[id] === questionMap.get(id)?.correct_option_id), 0);
}
export function finishSession(progress, session, questionMap, now = Date.now()) {
  if (session.finishedAt !== null) return sessionScore(session, questionMap);
  if (session.questionIds.some(id => !Object.hasOwn(session.answers, id))) throw new Error('Unanswered questions');
  if (session.mode === 'exam' && !session.recorded) {
    for (const id of session.questionIds) recordAnswer(progress, questionMap.get(id), session.answers[id], Boolean(session.hints[id]), now);
  }
  session.recorded = true;
  session.finishedAt = now;
  const score = sessionScore(session, questionMap);
  progress.sessions.unshift({ id: session.id, title: session.title, mode: session.mode, resourceId: session.resourceId, pathId: session.pathId, correct: score, total: session.questionIds.length, finishedAt: now });
  progress.sessions = progress.sessions.slice(0, 100);
  if (session.resourceId) progress.completed[session.resourceId] = now;
  return score;
}
export function validateActive(active, questionMap) {
  return Boolean(active && typeof active.title === 'string' && ['learn', 'exam'].includes(active.mode) && Array.isArray(active.questionIds) && active.questionIds.length && Number.isInteger(active.index) && active.index >= 0 && active.index < active.questionIds.length && active.answers && typeof active.answers === 'object' && active.hints && typeof active.hints === 'object' && active.optionOrders && active.questionIds.every(id => {
    const q = questionMap.get(id);
    const order = active.optionOrders[id];
    return q && Array.isArray(order) && order.length === q.options.length && new Set(order).size === q.options.length && order.every(o => q.options.some(p => p.id === o)) && (!Object.hasOwn(active.answers, id) || q.options.some(o => o.id === active.answers[id]));
  }));
}
export function summarize(progress, questionMap, now = Date.now()) {
  const rows = Object.entries(progress.questions).filter(([id]) => questionMap.has(id));
  const attempts = rows.reduce((n, [, r]) => n + (Number(r.attempts) || 0), 0);
  const correct = rows.reduce((n, [, r]) => n + (Number(r.correct) || 0), 0);
  return {
    seen: rows.length, attempts, correct, accuracy: attempts ? Math.round(correct / attempts * 100) : 0,
    learned: rows.filter(([, r]) => r.lastCorrect && !r.lastHinted).length,
    mistakes: rows.filter(([, r]) => r.needsReview).map(([id]) => id),
    due: rows.filter(([, r]) => !r.needsReview && r.reviewAt <= now).map(([id]) => id)
  };
}
