#!/usr/bin/env python3
"""Offline arithmetic regression for TEO; no eval/exec and no third-party dependencies."""
from __future__ import annotations
import ast, json, math, operator
from pathlib import Path
OPS={ast.Add:operator.add,ast.Sub:operator.sub,ast.Mult:operator.mul,ast.Div:operator.truediv,ast.Pow:operator.pow}
FUNCS={'sqrt':math.sqrt,'exp':math.exp,'log':math.log}

def arithmetic(expression:str)->float:
    if not isinstance(expression,str) or len(expression)>600:
        raise ValueError('Invalid arithmetic expression')
    tree=ast.parse(expression,mode='eval')
    if sum(1 for _ in ast.walk(tree))>120:
        raise ValueError('Expression too complex')
    def walk(n:ast.AST)->float:
        if isinstance(n,ast.Expression): return walk(n.body)
        if isinstance(n,ast.Constant) and type(n.value) in (int,float):
            return float(n.value)
        if isinstance(n,ast.Name) and n.id=='pi': return math.pi
        if isinstance(n,ast.UnaryOp) and isinstance(n.op,(ast.UAdd,ast.USub)):
            return walk(n.operand)*(1 if isinstance(n.op,ast.UAdd) else -1)
        if isinstance(n,ast.BinOp) and type(n.op) in OPS:
            a,b=walk(n.left),walk(n.right)
            if isinstance(n.op,ast.Pow) and abs(b)>100: raise ValueError('Exponent too large')
            return OPS[type(n.op)](a,b)
        if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id in FUNCS and len(n.args)==1 and not n.keywords:
            return FUNCS[n.func.id](walk(n.args[0]))
        raise ValueError('Unsupported arithmetic syntax')
    value=walk(tree)
    if not isinstance(value,(int,float)) or not math.isfinite(value): raise ValueError('Nonfinite answer')
    return float(value)

ROOT = Path(__file__).resolve().parent.parent
bank = json.loads((ROOT / 'data/teo/question_bank.json').read_text())
checks = json.loads((ROOT / 'tests/fixtures/teo-numeric-checks.json').read_text())
questions = {q['id']: q for q in bank['questions']}
applications = {a['id'] for a in json.loads((ROOT / 'data/teo/applications.json').read_text())['applications']}
assert len(checks['question_checks']) == 76
assert len(checks['application_checks']) == 42
assert len(checks['step_checks']) == 26
assert {c['question_id'] for c in checks['question_checks']} == {q['id'] for q in bank['questions'] if q['kind'] == 'calculation'}
for c in checks['question_checks'] + checks['application_checks']:
    actual = arithmetic(c['expression'])
    assert math.isclose(actual, c['expected'], rel_tol=1e-9, abs_tol=1e-8), c
    if 'question_id' in c:
        answer = questions[c['question_id']]['numeric_answer']
        for source, field in [('expected', 'value'), ('unit', 'unit'), ('absolute_tolerance', 'absolute_tolerance')]:
            assert c[source] == answer[field], (c['question_id'], field)
    else:
        assert c['guide_id'] in applications
for c in checks['step_checks']:
    step = next(s for s in questions[c['question_id']]['numeric_steps'] if s['id'] == c['step_id'])
    assert math.isclose(arithmetic(c['expression']), c['expected'], rel_tol=1e-9, abs_tol=1e-12), c
    assert step['value'] == c['expected'], c
    assert step['absolute_tolerance'] < abs(step['value']) / 10, c
print('TEO: 76 numeric answers, 26 intermediate steps and 42 application expressions passed.')
