# Android APK для RuStore

Сборщик упаковывает текущий сайт и все 472 вопроса (банк 1.3.0), 12 задач Кирхгофа и 20 задач инженерной практики в автономное Android-приложение.
Ранее собранный APK содержит свой банк и не обновляется вслед за GitHub Pages. Номер версии приложения задаётся отдельно в `version.json`; перед выпуском обновления его нужно повысить.
Минимальная версия — Android 8.0 (API 26), целевая — Android 16 (API 36).
Нужен системный WebView версии 80 или новее. Google Play Services не требуются.

Приложение использует локальный HTTPS-origin для HTML, ES-модулей, JSON и localStorage.
Ни одного разрешения Android, доступа к произвольным файлам или JavaScript/native bridge нет.
Ссылки на внешние источники открываются только в браузере после нажатия.
Системная кнопка «Назад» сохраняет текущий подход; системные панели и клавиатура учитываются.
При закрытии, повороте экрана и обновлении результаты остаются в локальном хранилище.
При удалении приложения или очистке данных прогресс удаляется.

## Сборка

Нужны JDK 17, Python 3, Android SDK Platform 36 и Build Tools 35.0.0.
Gradle, Node-зависимости, AndroidX и сервер для сборки APK не требуются.

    export JAVA_HOME=/absolute/path/to/jdk17
    export PATH="$JAVA_HOME/bin:$PATH"
    export ANDROID_SDK_ROOT=/absolute/path/to/android-sdk
    bash android/build.sh --unsigned

Проверка исходного тренажёра:

    npm test
    npm run check
    npm run build

## Подпись релиза

Перед первой публикацией создайте один постоянный приватный ключ.
Не публикуйте ключ или его пароль в git, публичных артефактах и логах.
Копия ключа первого подготовленного релиза передаётся владельцу отдельно.

    export ROBOTICS_KEYSTORE=/private/path/robotics-release.jks
    export ROBOTICS_PASSWORD_FILE=/private/path/signing-password.txt
    export ROBOTICS_KEY_ALIAS=robotics-release
    bash android/build.sh

Пароль считывается из файла, а не из текста командной строки.
Без ключа сборщик создаёт неподписанный APK и прекращает релизную сборку.
Он не подменяет отсутствующий релизный ключ тестовым.
Для обновлений сохраняйте applicationId и ключ, увеличивайте versionCode в android/version.json.
Не меняйте package в AndroidManifest.xml и package Java-класса при обычном обновлении.

## Файлы результата

android/build/outputs/robotics-tickets-1.0.0.apk — подписанный релиз.
android/build/outputs/robotics-tickets-1.0.0.apk.sha256 — контрольная сумма.
Файл с суффиксом -unsigned.apk нельзя устанавливать или загружать в RuStore без подписи.
По желанию задайте ROBOTICS_OUTPUT_DIR для сохранения результатов в другой папке.

Инструкция и текст карточки магазина находятся в store/rustore-listing.txt.
Политика данных — privacy.html. Её публичный адрес заработает после публикации этой ветки в Pages.

## GitHub Actions

Build Android APK проверяет тренажёр и собирает неподписанный APK для review.
Релиз подписывается только при ручном запуске workflow_dispatch с двумя repository secrets:
ROBOTICS_SIGNING_KEY_BASE64 — исходный постоянный JKS, кодированный в Base64;
ROBOTICS_SIGNING_PASSWORD — его пароль. В PR-сборках подпись не используется.
Секретные файлы не попадают в артефакты; после сборки временная копия удаляется.

