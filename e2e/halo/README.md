# Halo (donyx) e2e

Отдельный Playwright-прогон для стабильной ветки **Halo / donyx** (`main`).
Halo — Svelte-клиент, поэтому селекторы и сценарии отличаются от Aurora;
общие бизнес-сценарии продублированы в `e2e/10-halo-parity.spec.mjs` и
гоняются на Aurora Vue 2 / Vue 3.

## Сборка и запуск

```sh
cd /Users/artnavsegda/Documents/GitHub/donyx
npm run build

cd /Users/artnavsegda/Documents/GitHub/aurora-demo
HALO_DIST=/Users/artnavsegda/Documents/GitHub/donyx/dist \
  npm run test:e2e:halo
```

Можно положить сборку в `frontend/halo` (каталог в git не входит) и не
указывать `HALO_DIST`. Демо-бэкенд поднимается на `8104`, тот же набор схем и
фикстур, что у Aurora.

## Что уже работает

- вход и dashboard (сводка, Storage/RAM/CPU, modem);
- список схем, открытие строк и flat-схем;
- `@set` при изменении поля, `apply`;
- `delete` / `clean` на бэкенде;
- плоская схема `/system/management`: hostname + Apply;
- потоковый ping, вывод в Bypass;
- журнал: Halo шлёт тело без `Content-Type`, демо-бэкенд теперь разбирает
  такой JSON, как прод-wrapper;
- `09-input-sync`: поле обновляется из `data` после refetch (`$effect.pre`);
- валидация полей и действий из `src/lib/validation`: `pattern`, `minimum`,
  `required`, `$ref`, `modificator`, `@cue enum`;
- невалидное значение не уходит в `@set`, APPLY/OK блокируются, ADD с пустыми
  required не создаёт запись, ping без host не отправляется;
- Stop обрывает потоковый вывод: окно помечается `stream stopped`, кнопка
  блокируется, уже полученные строки остаются, `Close` закрывает окно;
- глобальный commit из шапки уходит с `path: "/system/config"` и обновляет данные;
- индикация несохранённых изменений: commit disabled до первого `@set`,
  активируется после `@set`/`add`/`delete`/`clean`, успешный commit сбрасывает
  состояние, ошибка commit сохраняет dirty и черновик;
- lifecycle действий: `reset`, `reload` (включая массив путей),
  `responseType: "blob"` и `checkConnection` с ожиданием возврата устройства;
- подтверждение вторичных действий (`confirm: true` и строка): Cancel не
  отправляет команду, OK продолжает действие;
- перестановка строк таблицы (reorder): drag строки отправляет `reorder` с
  `_section` и `position`, после успеха таблица показывает новый порядок.

## Тесты валидатора в Halo

В `donyx` (`main`):

- `src/lib/validation/validation.test.ts` — 23 unit-теста: значения полей,
  `$ref`, `modificator`, `@cue enum`, нормализация, `validateForm` и адаптер
  поля (`validateField`, `visibleIssues`, `sameValue`);
- `e2e/validation.spec.ts` — 4 Storybook-e2e: форма, APPLY с пустым required,
  строка таблицы, модалка действия. Прогон:
  `npx playwright test e2e/validation.spec.ts --project=chromium`.
  Для Firefox/WebKit нужны установленные браузеры Playwright.

## Тесты Stop в Halo

- `src/lib/pages/Dashboard/bypass.test.ts` — unit: отмена query сохраняет
  частичный вывод и не переводит запрос в `error`;
- `e2e/bypass-stop.spec.ts` — 3 Storybook-e2e: running, stopped, finished;
- `aurora-demo/e2e/halo/06-actions.spec.mjs` — реальный ping: Stop помечает
  поток, блокирует кнопку, вывод не растёт, `Close` закрывает окно.

## Тесты несохранённых изменений

- `donyx/e2e/header-commit.spec.ts` — 5 Storybook-e2e: disabled/active,
  irz/donyx-цвета, `commitPending`;
- `aurora-demo/e2e/halo/10-unsaved-changes.spec.mjs` — 4 интеграционных e2e:
  `@set` + Apply + успешный commit, ошибка commit, delete и clean.

## Тесты lifecycle действий

- `donyx/src/lib/actionLifecycle.test.ts` — порядок `reset → reload → checkConnection`;
- `donyx/src/lib/api.blob.test.ts` — blob-ответ и имя файла из `Content-Disposition`;
- `aurora-demo/e2e/halo/12-actions-lifecycle.spec.mjs` — 4 e2e: blob,
  reload массивом, reset и checkConnection + confirm/Cancel для reboot;
- `aurora-demo/e2e/halo/11-action-lifecycle.spec.mjs` — регрессия: первый опрос
  `/script/dashboard` идёт после `checkConnection.delay`, а не через 1 с.

## Тесты reorder

- `aurora-demo/e2e/halo/13-reorder.spec.mjs` — drag строки `/firewall/filter`:
  проверяет тело `reorder` и итоговый порядок строк в UI;
- `aurora-demo/src/legacy.mjs` — демо-бэкенд сортирует `status` по порядку
  `@get`, как реальное устройство после reorder (иначе колонки статуса
  читаются по позиции и показывают чужую строку).

## Статус паритета

Функциональный паритет Halo с Aurora по текущему scope закрыт. Остаётся только:

1. **Глобальный revert — на стопе**: в шапке его нет; возможно, действие
   будет удалено из бэкенда, поэтому реализацию в Halo пока не делаем.

Вне текущего scope (не влияет на паритет по рабочим сценариям):
dashboard-модули демо-стенда (404), upload и чистка `selectedKey`
с `console.log`.

Журнал **не является багом Halo**: прод-wrapper читает JSON из stdin без
проверки `Content-Type`, Halo это делает корректно. Ошибка была в демо-бэкенде,
он теперь принимает `text/plain` с JSON.

## Ожидаемые падения

`04-commit-revert` (revert) — проверка на стопе. `01-dashboard`,
`02-edit-apply`, `03-validation`, `04-commit-revert` (commit), `05-journal`,
`06-actions` (ping и Stop), `07-flat-schema`, `08-crud`, `09-input-sync`,
`10-unsaved-changes`, `11-action-lifecycle`, `12-actions-lifecycle`,
`13-reorder` проходят.

## Aurora parity

`e2e/10-halo-parity.spec.mjs` проверяет на Aurora Vue 2/Vue 3:

- commit и revert отправляют запросы;
- ADD с пустыми required не уходит;
- ping без host не уходит;
- Stop останавливает поток;
- flat-схема `/system/management` сохраняет hostname и Apply.

Все пять сценариев на Aurora проходят.
