# Публикация демо на GitHub Pages

Репозиторий: [WakeUpMurad/into-nowhere](https://github.com/WakeUpMurad/into-nowhere).

Ожидаемый адрес после успешного размещения: [wakeupmurad.github.io/into-nowhere/](https://wakeupmurad.github.io/into-nowhere/). Наличие этой инструкции и workflow само по себе не подтверждает, что сайт уже опубликован.

## Что размещается

GitHub Pages публикует статические HTML, CSS и JavaScript. Здесь размещается веб-демонстрация с языками, музыкой и геометрией. **Платежи выключены, деньги не списываются.** Go API и база данных на Pages не запускаются. Сборка для Pages использует встроенную демонстрационную конфигурацию и не обращается к отсутствующему `/api`.

Pages подходит для показа текущего проекта. Для запуска платного сервиса потребуется отдельный хостинг: [ограничения GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) исключают использование Pages как бесплатного хостинга основного коммерческого сервиса и транзакций.

## Включение в репозитории

1. Открыть [Settings → Pages](https://github.com/WakeUpMurad/into-nowhere/settings/pages).
2. В разделе **Build and deployment → Source** выбрать **GitHub Actions**. Для изменения этой настройки нужны соответствующие права на репозиторий.
3. Отправить изменения в `main` либо открыть [Actions](https://github.com/WakeUpMurad/into-nowhere/actions), выбрать **Deploy demo to GitHub Pages**, нажать **Run workflow** и выбрать ветку `main`.
4. Дождаться успешного выполнения двух задач: `build` и `deploy`. Адрес сайта появится в результате задачи публикации и в разделе Pages.

У сайта на домене `github.io` HTTPS включается автоматически. Секретный токен вручную добавлять не нужно: workflow использует предоставленный GitHub `GITHUB_TOKEN` и разрешения `contents: read`, `pages: write`, `id-token: write`.

Публикация запускается после каждого push в `main`. Одновременные запуски объединены в группу `github-pages`; уже выполняющаяся публикация не отменяется. При ручном запуске из другой ветки задача `deploy` пропускается.

## Сборка и проверка

Workflow `.github/workflows/pages.yml` устанавливает Node.js 22 и зависимости из `package-lock.json`, запускает проверки денежных сумм, собирает React и загружает только `apps/web/dist` как артефакт Pages. Платёжных ключей в этой сборке нет.

Для такой же сборки локально:

```sh
npm ci
npm test
VITE_DEPLOY_TARGET=github-pages VITE_BASE_PATH=/into-nowhere/ npm run build
VITE_BASE_PATH=/into-nowhere/ npm run preview --workspace @into-nowhere/web
```

Предпросмотр открывается по адресу `http://127.0.0.1:4173/into-nowhere/`. Для него также нужен `VITE_BASE_PATH`, чтобы путь к файлам совпал со сборкой.

`VITE_BASE_PATH` соответствует пути проекта в адресе сайта. При переименовании репозитория или переходе на собственный домен нужно обновить путь и пересобрать приложение. `VITE_DEPLOY_TARGET=github-pages` включает статическое демо; обычный локальный запуск сохраняет обращение к Go API.

После публикации проверить открытие страницы на телефоне, загрузку фигуры и шрифтов, переключение языков и тем, старт музыки после касания и демонстрационный жест. Надпись о пробном режиме должна оставаться видимой. Если публикация не удалась, открыть упавшую задачу в Actions: типичные причины — не выбран источник GitHub Actions, отключены Actions, недостаточно прав или ошибка сборки.

## Официальная документация

- [Настройка источника публикации](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
- [Собственные workflows для Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
- [Статический хостинг GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).
- [HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https).
