// Additive content integration. Existing question IDs and progress storage stay intact.
export const TEO_STORAGE_KEY = 'robototehnika-bileti-ru:teo:v1';
export const TEO_DRAFT_LIMIT = 4000;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function mergeTeoBank(base, extension) {
  const result = { ...base };
  for (const key of ['questions', 'topics', 'sources']) {
    if (!Array.isArray(base[key]) || !Array.isArray(extension[key])) throw new Error(`Invalid ${key}`);
    const seen = new Set(base[key].map(item => item.id));
    const extra = extension[key].map((item, index) => {
      if (!item.id || seen.has(item.id)) throw new Error(`Duplicate ${key} ID: ${item.id}`);
      seen.add(item.id);
      // Source pack orders start at 13; the live app already has more topics.
      return key === 'topics' ? { ...item, order: base.topics.length + index + 1 } : item;
    });
    result[key] = [...base[key], ...extra];
  }
  const counts = key => result.questions.reduce((all, q) => {
    all[q[key]] = (all[q[key]] || 0) + 1;
    return all;
  }, {});
  result.metadata = { ...base.metadata,
    bank_version: `${base.metadata.bank_version}+teo.${extension.metadata.bank_version}`,
    question_count: result.questions.length, topic_count: result.topics.length,
    source_count: result.sources.length, teo_question_count: extension.questions.length,
    difficulty_counts: counts('difficulty'), kind_counts: counts('kind'),
    description: `${base.metadata.description} Дополнительно: ${extension.questions.length} заданий по теоретическим основам электротехники.`,
    content_extensions: [...(base.metadata.content_extensions || []), { id: 'teo', version: extension.metadata.bank_version }]
  };
  return result;
}

// Accept decimal comma, decimal point, a Unicode minus and scientific notation.
// Never evaluate expressions or strip arbitrary characters / unit suffixes.
export function parseTeoNumber(input) {
  if (typeof input !== 'string' || input.length > 64) return null;
  const value = input.trim().replaceAll('\u2212', '-').replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function checkTeoNumber(input, answer) {
  if (!answer || !Number.isFinite(answer.value) || !Number.isFinite(answer.absolute_tolerance) || answer.absolute_tolerance < 0) throw new Error('Invalid numeric answer');
  const value = parseTeoNumber(input);
  if (value === null) return { valid: false, correct: false };
  const rounding = Number.EPSILON * Math.max(1, Math.abs(answer.value), Math.abs(value)) * 4;
  return { valid: true, correct: Math.abs(value - answer.value) <= answer.absolute_tolerance + rounding, value };
}
export function freshTeoTask() {
  return { answer: '', reasoning: '', steps: {}, stepsChecked: false, stepsUsed: false, attempts: 0, lastResult: null,
    checkedAnswer: '', lastAssisted: false, solutionSeen: false };
}
export function freshTeoProgress() { return { version: 1, calculations: {}, oral: {} }; }
export function readTeoProgress(storage, questionIds, applicationIds) {
  const progress = freshTeoProgress();
  try {
    const raw = storage?.getItem(TEO_STORAGE_KEY);
    if (!raw) return { progress, error: false };
    const parsed = JSON.parse(raw);
    if (!record(parsed) || parsed.version !== 1 || !record(parsed.calculations) || !record(parsed.oral)) throw new Error('Invalid TEO progress');
    for (const id of questionIds) {
      const row = parsed.calculations[id];
      if (!record(row)) continue;
      progress.calculations[id] = { ...freshTeoTask(),
        answer: typeof row.answer === 'string' ? row.answer.slice(0, 64) : '',
        reasoning: typeof row.reasoning === 'string' ? row.reasoning.slice(0, TEO_DRAFT_LIMIT) : '',
        steps: record(row.steps) ? Object.fromEntries(Object.entries(row.steps).filter(([k,v]) => /^step[1-5]$/.test(k) && typeof v === 'string').map(([k,v]) => [k,v.slice(0,64)])) : {},
        stepsChecked: row.stepsChecked === true, stepsUsed: row.stepsUsed === true,
        attempts: Number.isSafeInteger(row.attempts) && row.attempts >= 0 ? row.attempts : 0,
        lastResult: typeof row.lastResult === 'boolean' ? row.lastResult : null,
        checkedAnswer: typeof row.checkedAnswer === 'string' ? row.checkedAnswer.slice(0, 64) : '',
        lastAssisted: row.lastAssisted === true, solutionSeen: row.solutionSeen === true
      };
    }
    for (const id of applicationIds) {
      if (typeof parsed.oral[id] === 'string') progress.oral[id] = parsed.oral[id].slice(0, TEO_DRAFT_LIMIT);
    }
    return { progress, error: false };
  } catch { return { progress, error: true }; }
}
export function submitTeoNumber(task, question) {
  const result = checkTeoNumber(task.answer, question.numeric_answer);
  if (!result.valid) return result;
  task.attempts += 1;
  task.checkedAnswer = task.answer;
  task.lastResult = result.correct;
  task.lastAssisted = task.solutionSeen || task.stepsUsed;
  return result;
}
export function teoTaskStatus(task) {
  if (!task || task.lastResult === null) return { state: 'new', label: 'Ещё не проверено' };
  if (!task.lastResult) return { state: 'wrong', label: 'Нужен разбор' };
  return task.lastAssisted
    ? { state: 'assisted', label: 'Верно после просмотра решения или проверки шагов' }
    : { state: 'correct', label: 'Верно без просмотра решения' };
}
