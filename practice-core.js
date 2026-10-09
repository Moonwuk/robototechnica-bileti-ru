import { expression, formatNumber } from './circuits-core.js?v=1.4.0';

export const PRACTICE_STORAGE_KEY = 'robototehnika-bileti-ru:practice:v1';
export const DRAFT_LIMIT = 12000;
const unitAliases = {
  rpm: [['об/мин', 1], ['rpm', 1]], tick: [['тиков', 1], ['tick', 1]],
  us: [['мкс', 1], ['us', 1], ['мс', 1000], ['ms', 1000], ['с', 1e6], ['s', 1e6]],
  ohm: [['Ом', 1], ['ohm', 1], ['кОм', 1000]], A: [['А', 1], ['A', 1], ['мА', .001], ['mA', .001]],
  W: [['Вт', 1], ['W', 1]], N: [['Н', 1], ['N', 1]],
  'N*m': [['Н·м', 1], ['Н*м', 1], ['N*m', 1], ['N·m', 1]], V: [['В', 1], ['V', 1], ['мВ', .001]],
  m: [['м', 1], ['m', 1], ['см', .01], ['cm', .01], ['мм', .001], ['mm', .001]],
  'm/s': [['м/с', 1], ['m/s', 1], ['см/с', .01], ['км/ч', 1 / 3.6]],
  'rad/s': [['рад/с', 1], ['rad/s', 1]], 'm^2': [['м²', 1], ['m²', 1], ['м^2', 1], ['m^2', 1]],
  B: [['байт', 1], ['B', 1]], 'B/s': [['байт/с', 1], ['B/s', 1]],
  'Mbit/s': [['Мбит/с', 1], ['Mbit/s', 1]], s: [['с', 1], ['s', 1], ['мс', .001], ['ms', .001]]
};
export function practiceQuantity(input, unit) {
  if (typeof input !== 'string' || input.length > 160) throw new Error('Допустимо до 160 символов.');
  let source = input.trim(), scale = 1;
  const aliases = [...(unitAliases[unit] || [])].sort((a, b) => b[0].length - a[0].length);
  for (const [suffix, multiplier] of aliases) {
    const matches = ['B', 'B/s'].includes(suffix) ? source.endsWith(suffix) : source.toLowerCase().endsWith(suffix.toLowerCase());
    if (matches) {
      source = source.slice(0, -suffix.length).trim(); scale = multiplier; break;
    }
  }
  const value = expression(source).constant * scale;
  if (!Number.isFinite(value) || Math.abs(value) > 1e12) throw new Error('Слишком большое число.');
  return value;
}
export function checkNumericAnswer(check, input) {
  if (typeof input !== 'string' || !input.trim()) return { ok: false, code: 'empty', message: 'Сначала запишите результат этого шага.' };
  try {
    const actual = practiceQuantity(input, check.unit);
    const tolerance = Math.max(check.absolute_tolerance, Math.abs(check.value) * check.relative_tolerance);
    const close = expected => Math.abs(actual - expected) <= tolerance + Number.EPSILON * Math.max(1, Math.abs(expected));
    if (close(check.value)) return { ok: true, code: 'correct', message: `Верно: ${formatNumber(actual)} ${check.display_unit}.` };
    if (check.value !== 0 && close(-check.value)) return { ok: false, code: 'sign', message: 'Модуль совпадает, но знак обратный. Проверьте направление оси и движения.' };
    if (check.value !== 0 && [1000, .001, 100, .01].some(k => close(check.value * k))) return { ok: false, code: 'unit', message: `Проверьте перевод единиц. Здесь результат в ${check.display_unit}; можно указать единицу после числа.` };
    return { ok: false, code: 'value', message: `Пока не совпадает. ${check.hint}` };
  } catch (error) {
    return { ok: false, code: 'syntax', message: `${error.message} Число или выражение + − * / со скобками; для корня введите численное приближение.` };
  }
}
export function freshExercise(exercise) {
  return { revision: exercise.revision, answers: {}, draft: '', checks: [], checked: false, revealed: false };
}
export function readPractice(storage, exercises) {
  const result = { version: 1, exercises: {} };
  try {
    const raw = storage?.getItem(PRACTICE_STORAGE_KEY);
    if (!raw) return { progress: result, error: false };
    if (raw.length > 600000) throw new Error('Oversized progress');
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !value.exercises || typeof value.exercises !== 'object' || Array.isArray(value.exercises)) throw new Error('Invalid progress');
    for (const exercise of exercises) {
      const saved = value.exercises[exercise.id];
      if (!saved || typeof saved !== 'object' || saved.revision !== exercise.revision) continue;
      const entry = freshExercise(exercise);
      entry.draft = typeof saved.draft === 'string' ? saved.draft.slice(0, DRAFT_LIMIT) : '';
      for (const check of exercise.numeric_checks) {
        const answer = saved.answers?.[check.name];
        if (typeof answer === 'string') entry.answers[check.name] = answer.slice(0, 160);
      }
      entry.checks = exercise.acceptance_checks.map((_, i) => saved.checks?.[i] === true);
      entry.checked = saved.checked === true;
      entry.revealed = saved.revealed === true;
      result.exercises[exercise.id] = entry;
    }
    return { progress: result, error: false };
  } catch { return { progress: result, error: true }; }
}
export function exerciseStatus(exercise, entry) {
  if (!entry) return { complete: false, label: 'Открыть задачу' };
  const numeric = exercise.numeric_checks.length === 0 || (entry.checked && exercise.numeric_checks.every(c => checkNumericAnswer(c, entry.answers[c.name]).ok));
  const reviewed = exercise.acceptance_checks.every((_, i) => entry.checks[i] === true);
  const complete = Boolean(numeric && reviewed);
  return { complete, label: complete ? (entry.revealed ? 'Самопроверка с разбором' : 'Самопроверка выполнена') : entry.draft || Object.values(entry.answers).some(Boolean) ? 'Продолжить решение' : 'Открыть задачу' };
}
