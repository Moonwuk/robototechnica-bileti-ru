// Original DC exercises. Diagrams and answers share explicit physical parameters.
const num = (id, label, unit, answer, hint, extra = {}) => ({ id, label, unit, answer, hint, type: 'number', ...extra });
const eq = (id, label, answer, variables, hint) => ({ id, label, answer, variables, hint, type: 'equation' });
const v = n => String(Number(n.toPrecision(9)));
export const circuitSources = [
  { title: 'OpenStax · University Physics 2, §10.3: законы Кирхгофа и правила знаков', url: 'https://openstax.org/books/university-physics-volume-2/pages/10-3-kirchhoffs-rules' },
  { title: 'MIT OpenCourseWare · 6.002, лекция 2: анализ цепей с KCL и KVL', url: 'https://ocw.mit.edu/courses/6-002-circuits-and-electronics-spring-2007/resources/6002_l2/' }
];
export const circuitGroups = [
  { id: 'node', title: '01 · Токи в узле', description: 'Первый закон Кирхгофа: сколько тока входит, столько выходит.' },
  { id: 'loop', title: '02 · Напряжения в контуре', description: 'Второй закон Кирхгофа: алгебраическая сумма изменений потенциала равна нулю.' },
  { id: 'mesh', title: '03 · Метод контурных токов', description: 'Два уравнения, два контурных тока и одна общая ветвь.' }
];
function node(id, title, incoming, outgoing, extra = {}) {
  const sum = a => a.reduce((s, n) => s + n, 0);
  const current = sum(incoming) - sum(outgoing);
  const balance = `${incoming.join('+')}=${outgoing.join('+')}+i`;
  return { id, title, kind: 'node', revision: 1, minutes: '3–5 мин', params: { incoming, outgoing }, ...extra,
    prompt: extra.prompt || `В узел A входят токи ${incoming.join(' А и ')} А. Из узла выходят ${outgoing.join(' А и ')} А и неизвестный ток i. Найдите i по стрелке на схеме.`,
    steps: [ ...(extra.steps || []),
      eq('balance', 'Уравнение для узла A', balance, ['i'], 'Входящие токи запишите с одной стороны равенства, выходящие — с другой. В уравнении все токи в амперах.'),
      num('i', 'Неизвестный ток i', 'A', current, 'Вычтите сумму известных выходящих токов из суммы входящих.', { derive: { fields: ['balance'], variable: 'i' }, signHint: 'Отрицательный результат означает ток против нарисованной стрелки.' })
    ],
    solution: [ `Баланс узла: ${balance}.`, `i = (${incoming.join(' + ')}) − (${outgoing.join(' + ')}) = ${v(current)} А.`, current < 0 ? 'Знак минус сохраняем: фактический ток входит в узел, хотя стрелка i направлена из него.' : 'Положительный ток направлен из узла, как показано стрелкой.' ]
  };
}
function loop(id, title, e1, e2, r1, r2) {
  const emf = e1 + e2, resistance = r1 + r2, current = emf / resistance;
  const equation = `${e1}+(${e2})-${r1}*i-${r2}*i=0`;
  return { id, title, kind: 'loop', revision: 1, minutes: '5–8 мин', params: { e1, e2, r1, r2 },
    prompt: `Идеальный источник E1 = ${e1} В, R1 = ${r1} Ом, R2 = ${r2} Ом.${e2 ? ` Второй источник E2 = ${Math.abs(e2)} В включён ${e2 > 0 ? 'согласно' : 'встречно'} при обходе по часовой стрелке.` : ''} Ток i и обход выбраны по часовой стрелке. Найдите ток и напряжения на резисторах.`,
    steps: [
      num('emf', 'Суммарная ЭДС по обходу', 'V', emf, 'Переход через источник от − к + даёт плюс; от + к − даёт минус.'),
      num('rsum', 'Сопротивление всего контура', 'Ω', resistance, 'Резисторы соединены последовательно: сложите сопротивления.'),
      eq('balance', 'Уравнение по второму закону Кирхгофа', equation, ['i'], 'ЭДС учитывайте по полярности. Падения на R1 и R2 при обходе по стрелке i входят со знаком минус.'),
      num('i', 'Ток i по выбранной стрелке', 'A', current, 'Решите уравнение контура: суммарную ЭДС разделите на R1 + R2.', { derive: { fields: ['balance'], variable: 'i' }, signHint: 'Суммарная ЭДС может быть отрицательной: тогда ток течёт против выбранной стрелки.' }),
      num('u1', 'Напряжение U1 = i · R1', 'V', current * r1, 'Умножьте ток в амперах на R1. U1 считаем слева направо на верхнем резисторе.', { derive: { fields: ['i'], expression: `${r1}*i` } }),
      num('u2', 'Напряжение U2 = i · R2', 'V', current * r2, 'Умножьте ток в амперах на R2. U2 считаем справа налево на нижнем резисторе.', { derive: { fields: ['i'], expression: `${r2}*i` } })
    ],
    solution: [ `ЭДС = ${e1} + (${e2}) = ${emf} В; RΣ = ${r1} + ${r2} = ${resistance} Ом.`, `Уравнение: ${equation}.`, `i = ${emf}/${resistance} = ${v(current)} А.`, `U1 = i · ${r1} = ${v(current * r1)} В; U2 = i · ${r2} = ${v(current * r2)} В.`, `Проверка: ЭДС − U1 − U2 = 0.${current < 0 ? ' Отрицательный ток и отрицательные U1, U2 соответствуют выбранным направлениям; менять их на модули нельзя.' : ''}` ]
  };
}
function mesh(id, title, e1, e2, r1, r2, shared) {
  const a = r1 + shared, d = r2 + shared, det = a * d - shared * shared;
  const i1 = (e1 * d + shared * e2) / det, i2 = (a * e2 + shared * e1) / det;
  const left = `${r1}*i1+${shared}*(i1-i2)=${e1}`;
  const right = `${r2}*i2+${shared}*(i2-i1)=${e2}`;
  return { id, title, kind: 'mesh', revision: 1, minutes: '8–12 мин', params: { e1, e2, r1, r2, shared },
    prompt: `Два соседних контура: R1 = ${r1} Ом, R2 = ${r2} Ом, общий R3 = ${shared} Ом. Оба контурных тока i1 и i2 выбраны по часовой стрелке. E1 = ${e1} В, E2 = ${Math.abs(e2)} В; полярности показаны на схеме. Найдите оба контурных тока, ток и напряжение общей ветви от A к B.`,
    steps: [
      eq('left', 'Уравнение левого контура', left, ['i1', 'i2'], 'Через R1 идёт i1, а через общий R3 вниз идёт i1 − i2. Учтите оба падения напряжения.'),
      eq('right', 'Уравнение правого контура', right, ['i1', 'i2'], `Для правого контура в общей ветви ток равен i2 − i1. При обходе E2 даёт ${e2 < 0 ? 'отрицательную' : 'положительную'} ЭДС.`),
      num('i1', 'Контурный ток i1', 'A', i1, 'Решите систему двух уравнений. Можно исключить одну неизвестную подстановкой.', { derive: { fields: ['left', 'right'], variable: 'i1' } }),
      num('i2', 'Контурный ток i2', 'A', i2, 'Подставьте i1 в любое уравнение системы и найдите i2.', { derive: { fields: ['left', 'right'], variable: 'i2' }, signHint: 'Контурный ток может быть отрицательным — это направление против выбранной стрелки.' }),
      num('branch', 'Ток I3 общей ветви от A к B', 'A', i1 - i2, 'Общая ветвь: i1 направлен вниз, i2 — вверх. Ток от A к B равен i1 − i2.', { derive: { fields: ['i1', 'i2'], expression: 'i1-i2' }, signHint: 'От A к B идёт i1 − i2. Отрицательный ответ означает фактическое направление от B к A.' }),
      num('u3', 'Напряжение UAB = VA − VB', 'V', shared * (i1 - i2), 'Умножьте ток от A к B на R3, сохранив знак.', { derive: { fields: ['branch'], expression: `${shared}*branch` } })
    ],
    solution: [ `Левый контур: ${left}; после раскрытия скобок ${a}*i1 − ${shared}*i2 = ${e1}.`, `Правый контур: ${right}; после раскрытия скобок −${shared}*i1 + ${d}*i2 = ${e2}.`, `Умножим первое уравнение на ${d}, второе на ${shared} и сложим: ${det}*i1 = ${e1 * d + shared * e2}.`, `i1 = ${e1 * d + shared * e2}/${det} А; i2 = ${a * e2 + shared * e1}/${det} А.`, `I3 = i1 − i2 = ${Number((i1 - i2).toPrecision(6))} А; UAB = ${shared} · I3 = ${Number((shared * (i1 - i2)).toPrecision(6))} В.`, 'Проверьте оба контурных уравнения подстановкой. I3 — ток ветви, он не равен одному из контурных токов. При отрицательном I3 реальное направление — от B к A.' ]
  };
}
export const circuitProblems = [
  node('kcl-01', 'Одна неизвестная ветвь', [5], [2]),
  node('kcl-02', 'Два входящих тока', [1.2, .8], [.5]),
  node('kcl-03', 'Ток против стрелки', [2], [3]),
  node('kcl-04', 'Амперы и миллиамперы', [.45], [.12, .08], { displayIncoming: ['450 мА'], prompt: 'В узел входят 450 мА. Выходят 0,12 А, 0,08 А и неизвестный ток i. Сначала переведите входящий ток в амперы, затем запишите баланс узла.', steps: [num('convert', 'Входящий ток в амперах', 'A', .45, '1000 мА = 1 А. Разделите 450 на 1000.')] }),
  loop('kvl-01', 'Два резистора последовательно', 12, 0, 2, 4),
  loop('kvl-02', 'Небольшой ток в цепи', 9, 0, 100, 200),
  loop('kvl-03', 'Источники включены встречно', 12, -6, 2, 1),
  loop('kvl-04', 'Обратный ток в контуре', 6, -12, 2, 1),
  mesh('mesh-01', 'Первые два контура', 10, 4, 2, 2, 2),
  mesh('mesh-02', 'Общая ветвь меняет направление', 3, 4, 3, 1, 2),
  mesh('mesh-03', 'Нулевой ток общей ветви', 12, 12, 4, 4, 2),
  mesh('mesh-04', 'Развёрнутый источник', 3, -5, 2, 3, 1)
];
