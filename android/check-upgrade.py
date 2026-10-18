#!/usr/bin/env python3
"""Exercise real package updates with retained WebView/localStorage data."""
from pathlib import Path
import argparse
import json
import re
import subprocess
import time
import xml.etree.ElementTree as ET

PACKAGE='ru.moongametechnology.robotics.tickets'
OUT=Path('test-results/android-upgrade');OUT.mkdir(parents=True,exist_ok=True)
launcher_dialog_closed=False

def adb(*args,check=True):
    return subprocess.run(['adb',*map(str,args)],check=check,capture_output=True,text=True).stdout

def screen():
    global launcher_dialog_closed
    adb('shell','rm','-f','/sdcard/upgrade-window.xml')
    adb('shell','uiautomator','dump','/sdcard/upgrade-window.xml',check=False)
    xml=adb('shell','cat','/sdcard/upgrade-window.xml',check=False)
    # Reinstallation briefly detaches accessibility even after Activity.start returns.
    if not xml.lstrip().startswith('<?xml'):
        return '<hierarchy />'
    try: tree=ET.fromstring(xml)
    except ET.ParseError: return '<hierarchy />'
    if any(n.get('text')=="Pixel Launcher isn't responding" for n in tree.iter('node')):
        if launcher_dialog_closed:raise AssertionError('Repeated system launcher ANR')
        close=next(n for n in tree.iter('node') if n.get('text')=='Close app')
        x1,y1,x2,y2=map(int,re.findall(r'\d+',close.get('bounds')))
        adb('shell','input','tap',(x1+x2)//2,(y1+y2)//2)
        launcher_dialog_closed=True
        print('Dismissed the emulator launcher ANR; application ANRs are not dismissed.',flush=True)
        return '<hierarchy />'
    (OUT/'window.xml').write_text(xml)
    return xml

def wait(text,seconds=40):
    end=time.monotonic()+seconds
    while time.monotonic()<end:
        xml=screen()
        if text in xml:return xml
        if 'Не удалось загрузить вопросы' in xml or 'Обновите компонент Android' in xml:
            raise AssertionError('Application startup error: '+xml)
        time.sleep(.5)
    raise AssertionError('Missing Android text: '+text)

def tap(label, field=False):
    width,height=map(int,re.findall(r'\d+',adb('shell','wm','size'))[-2:])
    norm=lambda s:' '.join(s.split())
    for attempt in range(9):
        tree=ET.fromstring(screen())
        parents={child:parent for parent in tree.iter() for child in parent}
        for node in tree.iter('node'):
            if not any(norm(node.get(key,''))==norm(label) for key in ['text','content-desc']):continue
            if field:
                # Android's hierarchy omits the HTML name for empty EditText nodes.
                # The associated submit button identifies the enclosing step exactly.
                inputs=[n for n in parents[node].iter('node') if n.get('class')=='android.widget.EditText']
                if len(inputs)!=1:raise AssertionError('Ambiguous calculation field for '+label)
                node=inputs[0]
            bounds=list(map(int,re.findall(r'\d+',node.get('bounds',''))))
            if len(bounds)==4 and bounds[2]>bounds[0] and bounds[3]-bounds[1]>=35:
                adb('shell','input','tap',(bounds[0]+bounds[2])//2,(bounds[1]+bounds[3])//2)
                return
        adb('shell','input','swipe',width//2,int(height*.83),width//2,int(height*.38),'250')
        time.sleep(.25)
    raise AssertionError('Missing Android control: '+label)

def start():
    adb('shell','am','start','-W','-n',PACKAGE+'/.MainActivity')

def install(apk):
    adb('install','-r',apk)

def stop():
    adb('shell','am','force-stop',PACKAGE)

def reset(apk):
    adb('uninstall',PACKAGE,check=False)
    install(apk);start();wait('Учитесь небольшими шагами')

def first_answer(site):
    site=Path(site)
    plan=json.loads((site/'data/study_plan.json').read_text())
    paths=json.loads((site/'data/interview_paths.json').read_text())['paths']
    route=next(p for p in paths if p['id']==plan['recommended_path_order'][0])
    q=next(q for q in json.loads((site/'data/question_bank.json').read_text())['questions'] if q['id']==route['question_ids'][0])
    return next(o['text'] for o in q['options'] if o['id']==q['correct_option_id'])

def seed_quiz(site):
    tap('Начать с основ');wait('Слова, которые пригодятся');tap('Начать 5 вопросов')
    wait('Вопрос 1 из 5');tap(first_answer(site));wait('Правильный ответ')

def check_quiz_restored():
    start();wait('Продолжить:');tap('Продолжить');wait('Вопрос 1 из 5');wait('Правильный ответ')

def type_field(label,value):
    tap(label, field=True)
    adb('shell','input','keyevent','123',*['67']*20)
    adb('shell','input','text',value.replace(' ','%s'))
    time.sleep(.5)
    if re.search(r'(?:mInputShown|isInputViewShown)=true',adb('shell','dumpsys','input_method')):
        adb('shell','input','keyevent','4')

def open_circuit(title):
    tap('Открыть расчёты');wait('Расчёты по шагам');tap(title);wait('Ваше решение')

a=argparse.ArgumentParser()
for name in ['new-apk','legacy-apk','published-apk','previous-apk','legacy-site','previous-site','circuit-fixture']:
    a.add_argument('--'+name,required=True)
a=a.parse_args()
try:
    adb('shell','svc','wifi','disable');adb('shell','svc','data','disable')
    adb('shell','settings','put','secure','show_ime_with_hard_keyboard','1')
    # Actual old UI writes a correct answer. Both subsequent installations retain it.
    reset(a.legacy_apk);seed_quiz(a.legacy_site);stop()
    install(a.published_apk);install(a.new_apk)
    check_quiz_restored();stop();check_quiz_restored()
    print('PASS: update 1.0.0 -> published 1.1.0 -> 1.1.2 preserves the active ticket and its recorded answer.')
    # Also retain the old arithmetic draft and re-grade it with the corrected SI parser.
    reset(a.previous_apk);seed_quiz(a.previous_site)
    adb('shell','input','keyevent','4');wait('Учитесь небольшими шагами')
    fixture=json.loads(Path(a.circuit_fixture).read_text())
    step=next(s for s in fixture['steps'] if s['id']=='i')
    label=step['label']+', '+step['unit']
    button='Проверить шаг '+str(fixture['steps'].index(step)+1)
    open_circuit(fixture['title']);type_field(button,'30 MA');tap(button);wait('Верно: 0,03')
    stop();install(a.new_apk);start();wait('Учитесь небольшими шагами')
    open_circuit(fixture['title']);wait('30 MA');wait('Проверьте:')
    assert 'Верно: 0,03' not in screen(),'Mega-amperes still accepted as milli-amperes'
    type_field(button,'30 mA');tap(button);wait('Верно: 0,03')
    adb('shell','settings','put','system','accelerometer_rotation','0')
    adb('shell','settings','put','system','user_rotation','1');time.sleep(1)
    wait('30 mA');wait('Верно: 0,03')
    adb('shell','settings','put','system','user_rotation','0');time.sleep(1)
    wait('30 mA');wait('Верно: 0,03')
    adb('shell','input','keyevent','4');wait('Расчёты по шагам')
    adb('shell','input','keyevent','4');wait('Учитесь небольшими шагами')
    stop();check_quiz_restored()
    print('PASS: update 1.1.1 -> 1.1.2 preserves quiz answers and calculation drafts, corrects old MA grading, and survives rotation and Android Back offline.')
finally:
    (OUT/'logcat.txt').write_text(adb('logcat','-d'))
    with (OUT/'screen.png').open('wb') as f:subprocess.run(['adb','exec-out','screencap','-p'],stdout=f,check=False)
