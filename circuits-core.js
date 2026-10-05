// A small arithmetic/linear-equation grammar. User input is never JavaScript.
export const CIRCUIT_STORAGE_KEY = 'robototehnika-bileti-ru:circuits:v1';
export const INPUT_LIMIT = 160;
const fail = message => { throw new Error(message); };
const scalar = n => ({ constant: n, terms: {} });
const clean = value => {
  if (![value.constant, ...Object.values(value.terms)].every(n => Number.isFinite(n) && Math.abs(n) <= 1e12)) fail('Слишком большое число или деление на ноль.');
  for (const key of Object.keys(value.terms)) if (value.terms[key] === 0) delete value.terms[key];
  return value;
};
const add = (a, b, sign = 1) => {
  const terms = { ...a.terms };
  for (const [key, n] of Object.entries(b.terms)) terms[key] = (terms[key] || 0) + sign * n;
  return clean({ constant: a.constant + sign * b.constant, terms });
};
const scale = (a, n) => clean({ constant: a.constant * n, terms: Object.fromEntries(Object.entries(a.terms).map(([key, v]) => [key, v * n])) });
export function expression(source, variables = []) {
  if (typeof source !== 'string' || !source.trim()) fail('Запишите выражение.');
  if (source.length > INPUT_LIMIT) fail('Выражение длиннее 160 символов.');
  const text = source.toLowerCase().replace(/,/g, '.').replace(/[−–]/g, '-').replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/[₀-₉]/g, c => String(c.charCodeAt(0) - 8320));
  const tokens = [];
  let p = 0;
  while (p < text.length) {
    if (/\s/.test(text[p])) { p++; continue; }
    const number = text.slice(p).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/);
    const word = text.slice(p).match(/^[a-z][a-z0-9]*/);
    const token = number?.[0] || word?.[0] || text[p];
    if (!number && !word && !'+-*/()'.includes(token)) fail('Допустимы числа, + − * /, скобки и указанные латинские переменные.');
    tokens.push({ type: number ? 'number' : word ? 'word' : token, value: token });
    p += token.length;
  }
  if (tokens.length > 100) fail('Слишком длинное выражение.');
  let index = 0, depth = 0;
  const peek = () => tokens[index]?.type;
  function atom() {
    if (++depth > 20) fail('Слишком много вложенных скобок или знаков.');
    let result;
    const token = tokens[index++];
    if (!token) fail('Выражение не закончено.');
    if (token.type === '+' || token.type === '-') result = scale(atom(), token.type === '-' ? -1 : 1);
    else if (token.type === 'number') result = clean(scalar(Number(token.value)));
    else if (token.type === 'word') {
      if (!variables.includes(token.value)) fail(`Неизвестная переменная «${token.value}». Используйте ${variables.join(', ') || 'только числа'}.`);
      result = { constant: 0, terms: { [token.value]: 1 } };
    } else if (token.type === '(') {
      result = sum();
      if (peek() !== ')') fail('Проверьте закрывающую скобку.');
      index++;
    } else fail('Здесь ожидается число, переменная или скобка.');
    depth--;
    return result;
  }
  function product() {
    let value = atom();
    while (['*', '/', 'word', '('].includes(peek())) {
      const op = ['*', '/'].includes(peek()) ? tokens[index++].type : '*';
      const right = atom();
      if (op === '/') {
        if (Object.keys(right.terms).length) fail('Деление на переменную не поддерживается. Перенесите её в числитель.');
        if (right.constant === 0) fail('На ноль делить нельзя.');
        value = scale(value, 1 / right.constant);
      } else {
        if (Object.keys(value.terms).length && Object.keys(right.terms).length) fail('Нужны линейные уравнения: не умножайте неизвестные друг на друга.');
        value = Object.keys(right.terms).length ? scale(right, value.constant) : scale(value, right.constant);
      }
    }
    return value;
  }
  function sum() {
    let value = product();
    while (peek() === '+' || peek() === '-') { const sign = tokens[index++].type === '+' ? 1 : -1; value = add(value, product(), sign); }
    return value;
  }
  const value = sum();
  if (index !== tokens.length) fail('Проверьте знаки операций и скобки.');
  return value;
}
export function equation(text, variables) {
  if (typeof text !== 'string' || text.length > INPUT_LIMIT) fail('Уравнение должно быть короче 161 символа.');
  const sides = text.split('=');
  if (sides.length !== 2) fail('Запишите одно уравнение со знаком =.');
  return add(expression(sides[0], variables), expression(sides[1], variables), -1);
}
export function equivalentEquations(a, b, variables) {
  const first = [...variables.map(v => a.terms[v] || 0), a.constant];
  const second = [...variables.map(v => b.terms[v] || 0), b.constant];
  const norm = Math.max(...first.map(Math.abs));
  const referenceNorm = Math.max(...second.map(Math.abs));
  if (!norm || !referenceNorm) return false; // 0 = 0 is not a circuit equation.
  const pivot = second.findIndex(n => Math.abs(n) === referenceNorm);
  const sign = Math.sign(first[pivot] * second[pivot]);
  return sign !== 0 && first.every((n, i) => Math.abs(n / norm - sign * second[i] / referenceNorm) < 1e-8);
}
const units = {
  A: { a: 1, 'а': 1, ma: .001, 'ма': .001, ua: 1e-6, 'мка': 1e-6, 'µa': 1e-6, 'μa': 1e-6 },
  V: { v: 1, 'в': 1, mv: .001, 'мв': .001, kv: 1000, 'кв': 1000 },
  'Ω': { 'ω': 1, ohm: 1, 'ом': 1, 'kω': 1000, kohm: 1000, 'ком': 1000 }
};
export function quantity(text, unit = '') {
  if (typeof text !== 'string' || text.length > INPUT_LIMIT) fail('Допустимо до 160 символов.');
  const suffix = text.trim().match(/([a-zа-яωµμ]+)$/i);
  let multiplier = 1, source = text;
  if (suffix) {
    const symbol = suffix[1].toLowerCase();
    if (!units[unit] || !Object.hasOwn(units[unit], symbol)) fail(`Укажите величину в ${unit || 'числах без единиц'}: проверьте единицы измерения.`);
    multiplier = units[unit][symbol];
    source = text.trim().slice(0, -suffix[1].length);
  }
  return clean(scalar(expression(source).constant * multiplier)).constant;
}
export const closeNumber = (actual, expected) => Math.abs(actual - expected) <= Math.max(1e-9, Math.abs(expected) * .001);
export const formatNumber = value => new Intl.NumberFormat('ru', { maximumSignificantDigits: 6 }).format(value);
export function solveLinear(rows, variables) {
  if (variables.length === 1) {
    const c = rows[0].terms[variables[0]] || 0;
    if (!c) return null;
    return { [variables[0]]: -rows[0].constant / c };
  }
  if (variables.length !== 2 || rows.length !== 2) return null;
  const [x, y] = variables, [a, b] = rows;
  const det = (a.terms[x] || 0) * (b.terms[y] || 0) - (a.terms[y] || 0) * (b.terms[x] || 0);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  return {
    [x]: (-a.constant * (b.terms[y] || 0) + b.constant * (a.terms[y] || 0)) / det,
    [y]: (-(a.terms[x] || 0) * b.constant + (b.terms[x] || 0) * a.constant) / det
  };
}
function derivedValue(step, problem, answers) {
  if (!step.derive) return null;
  const dep = step.derive;
  const fields = dep.fields.map(id => problem.steps.find(s => s.id === id));
  if (fields.some(s => !s || !answers[s.id]?.trim())) return null;
  try {
    if (dep.variable) {
      const solution = solveLinear(fields.map(s => equation(answers[s.id], s.variables)), fields[0].variables);
      return solution?.[dep.variable] ?? null;
    }
    const values = Object.fromEntries(fields.map(s => [s.id, quantity(answers[s.id], s.unit)]));
    const parsed = expression(dep.expression, dep.fields);
    return parsed.constant + Object.entries(parsed.terms).reduce((total, [key, n]) => total + n * values[key], 0);
  } catch { return null; }
}
export function checkStep(problem, step, answers) {
  const text = answers[step.id] || '';
  if (!text.trim()) return { ok: false, code: 'empty', message: 'Сначала запишите свой шаг решения.' };
  try {
    if (step.type === 'equation') {
      const actual = equation(text, step.variables);
      const expected = equation(step.answer, step.variables);
      return equivalentEquations(actual, expected, step.variables)
        ? { ok: true, code: 'correct', message: 'Уравнение верное. Другая запись и перенос слагаемых тоже подходят.' }
        : { ok: false, code: 'equation', message: `Проверьте уравнение. ${step.hint}` };
    }
    const actual = quantity(text, step.unit);
    if (closeNumber(actual, step.answer)) return { ok: true, code: 'correct', message: `Верно: ${formatNumber(actual)} ${step.unit}.` };
    const propagated = derivedValue(step, problem, answers);
    if (propagated !== null && closeNumber(actual, propagated)) return { ok: false, code: 'upstream', message: `Этот результат согласуется с вашими предыдущими данными. Исправьте сначала шаги: ${step.derive.fields.map(id => problem.steps.find(s => s.id === id).label).join('; ')}.` };
    if (step.answer !== 0 && closeNumber(actual, -step.answer)) return { ok: false, code: 'sign', message: `Модуль верный, но знак обратный. ${step.signHint || 'Сверьте направление стрелки и полярность источника.'}` };
    if (step.answer !== 0 && (closeNumber(actual, step.answer * 1000) || closeNumber(actual, step.answer / 1000))) return { ok: false, code: 'unit', message: `Похоже на ошибку перевода единиц в 1000 раз. Здесь ${step.unit}; можно явно написать, например, 30 мА или 0,03 А.` };
    return { ok: false, code: 'number', message: `Результат пока не совпадает. ${step.hint}` };
  } catch (error) { return { ok: false, code: 'syntax', message: error.message }; }
}
export function readCircuitProgress(storage, problems) {
  const state = { version: 1, tasks: {} };
  try {
    const raw = storage?.getItem(CIRCUIT_STORAGE_KEY);
    if (!raw) return { state, error: !storage };
    if (raw.length > 200000) throw new Error('Too much data');
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1 || !parsed.tasks || typeof parsed.tasks !== 'object') throw new Error('Invalid data');
    for (const problem of problems) {
      const saved = parsed.tasks[problem.id];
      if (!saved || typeof saved !== 'object' || saved.revision !== problem.revision) continue;
      const task = { revision: problem.revision, answers: {}, checked: {}, notes: typeof saved.notes === 'string' ? saved.notes.slice(0, 4000) : '', revealed: saved.revealed === true };
      for (const step of problem.steps) {
        if (typeof saved.answers?.[step.id] === 'string') task.answers[step.id] = saved.answers[step.id].slice(0, INPUT_LIMIT);
        task.checked[step.id] = saved.checked?.[step.id] === true;
      }
      state.tasks[problem.id] = task;
    }
    return { state, error: false };
  } catch { return { state, error: true }; }
}
