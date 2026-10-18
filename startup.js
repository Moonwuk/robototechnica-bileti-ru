// A classic script remains executable even if a module is missing or cannot parse.
(function () {
  'use strict';
  var settled = false;
  var timer;
  function ready() {
    settled = true;
    clearTimeout(timer);
  }
  function fail() {
    if (settled) return;
    var main = document.getElementById('main');
    if (!main) return;
    ready();
    var title = document.createElement('h1');
    title.textContent = 'Не удалось загрузить вопросы';
    var text = document.createElement('p');
    text.textContent = window.ROBOTICS_ANDROID === true
      ? 'Вопросы встроены в приложение. Повторите запуск. Если ошибка повторяется, обновите приложение и Android System WebView. Сохранённый прогресс останется на устройстве.'
      : 'Обновите страницу и проверьте соединение. Сохранённый прогресс останется в браузере.';
    var retry = document.createElement('button');
    retry.className = 'button primary';
    retry.id = 'reload';
    retry.textContent = 'Попробовать ещё раз';
    retry.addEventListener('click', function () { window.location.reload(); });
    main.textContent = '';
    main.appendChild(title);
    main.appendChild(text);
    main.appendChild(retry);
  }
  window.roboticsStartup = { ready: ready, fail: fail };
  window.addEventListener('error', function (event) {
    var target = event.target;
    if (event.error || (target && target.tagName === 'SCRIPT')) fail();
  }, true);
  window.addEventListener('unhandledrejection', fail);
  timer = setTimeout(fail, 20000);
}());
