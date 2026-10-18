#!/usr/bin/env python3
"""Launch the packaged APK offline through the real Android WebView."""
from pathlib import Path
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

PACKAGE = 'ru.moongametechnology.robotics.tickets'
OUTPUT = Path('test-results/android')
OUTPUT.mkdir(parents=True, exist_ok=True)

def adb(*args, check=True):
    return subprocess.run(['adb', *args], check=check, capture_output=True, text=True).stdout

def hierarchy():
    adb('shell', 'uiautomator', 'dump', '/sdcard/robotics-window.xml')
    text = adb('shell', 'cat', '/sdcard/robotics-window.xml')
    (OUTPUT / 'window.xml').write_text(text)
    return text

def wait_for(text, timeout=40):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        xml = hierarchy()
        if text in xml:
            return ET.fromstring(xml)
        if 'Не удалось загрузить вопросы' in xml or 'Обновите компонент Android' in xml:
            raise AssertionError('Startup failed: ' + xml)
        time.sleep(1)
    raise AssertionError('Expected Android screen: ' + text)

def tap(label):
    size = list(map(int, re.findall(r'\d+', adb('shell', 'wm', 'size'))))[-2:]
    width, height = size
    for attempt in range(5):
        root = ET.fromstring(hierarchy())
        for node in root.iter('node'):
            if label in (node.get('text', '') + node.get('content-desc', '')):
                numbers = list(map(int, re.findall(r'\d+', node.get('bounds', ''))))
                if len(numbers) == 4 and numbers[2] > numbers[0] and numbers[3] > numbers[1]:
                    adb('shell', 'input', 'tap', str((numbers[0] + numbers[2]) // 2), str((numbers[1] + numbers[3]) // 2))
                    return
        adb('shell', 'input', 'swipe', str(width // 2), str(int(height * .82)),
            str(width // 2), str(int(height * .4)), '300')
        time.sleep(.3)
    raise AssertionError('Button not visible: ' + label)

try:
    adb('install', '-r', sys.argv[1])
    adb('shell', 'svc', 'wifi', 'disable')
    adb('shell', 'svc', 'data', 'disable')
    adb('logcat', '-c')
    adb('shell', 'am', 'start', '-W', '-n', PACKAGE + '/.MainActivity')
    wait_for('Учитесь небольшими шагами')
    tap('Начать с основ')
    wait_for('Слова, которые пригодятся')
    tap('Начать 5 вопросов')
    wait_for('Вопрос 1 из 5')
    adb('shell', 'am', 'force-stop', PACKAGE)
    adb('shell', 'am', 'start', '-W', '-n', PACKAGE + '/.MainActivity')
    wait_for('Продолжить:')
    print('PASS: APK starts offline, opens a question, and restores the active approach after restart.')
finally:
    (OUTPUT / 'logcat.txt').write_text(adb('logcat', '-d'))
    with (OUTPUT / 'screen.png').open('wb') as out:
        subprocess.run(['adb', 'exec-out', 'screencap', '-p'], stdout=out, check=False)
