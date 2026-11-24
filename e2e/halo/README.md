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
  required не создаёт запись, ping без host не отправляется.

## Тесты валидатора в Halo

В `donyx` (`main`):

- `src/lib/validation/validation.test.ts` — 23 unit-теста: значения полей,
  `$ref`, `modificator`, `@cue enum`, нормализация, `validateForm` и адаптер
  поля (`validateField`, `visibleIssues`, `sameValue`);
- `e2e/validation.spec.ts` — 4 Storybook-e2e: форма, APPLY с пустым required,
  строка таблицы, модалка действия. Прогон:
  `npx playwright test e2e/validation.spec.ts --project=chromium`.
  Для Firefox/WebKit нужны установленные браузеры Playwright.

## Известные недоработки Halo

Тесты с этими проверками помечены `test.fail`: они падают ожидаемо, а после
исправления Halo Playwright начнёт ругаться «expected to fail, but passed».

1. **Commit — заглушка**: кнопка Save в шапке только показывает overlay на
   5 секунд (`src/Dashboard.svelte`, `onCommit` с закомментированным
   `commitMutation.mutate()`), запрос `commit` не уходит.
2. **Нет глобального revert** в шапке; revert есть только как действие
   `/system/config`.
3. **Stop не останавливает поток**: `onStop={() => {}}` в
   `src/Dashboard.svelte`, вывод ping продолжает дописываться.
4. **Dashboard-модули hardware/mobile**: демо-бэкенд и сборка не отдают
   `/modules/dashboard/hardware/index.js` и `.../mobile/index.js` (404).
   Это ограничение демо-модулей, а не входа/схем.
5. **Качество кода**: в flat-схеме `Render.svelte` передаёт
   `selectedKey="wtf"`, в production остались `console.log`, а
   `commitMutation` объявлен, но не используется.

Журнал **не является багом Halo**: прод-wrapper читает JSON из stdin без
проверки `Content-Type`, Halo это делает корректно. Ошибка была в демо-бэкенде,
он теперь принимает `text/plain` с JSON.

## Ожидаемые падения

`04-commit-revert` (commit и revert) и `06-actions` (Stop) — проверки из
списка выше. `01-dashboard`, `02-edit-apply`, `03-validation`,
`05-journal`, `06-actions` (ping без host), `07-flat-schema`, `08-crud`,
`09-input-sync` проходят.

## Aurora parity

`e2e/10-halo-parity.spec.mjs` проверяет на Aurora Vue 2/Vue 3:

- commit и revert отправляют запросы;
- ADD с пустыми required не уходит;
- ping без host не уходит;
- Stop останавливает поток;
- flat-схема `/system/management` сохраняет hostname и Apply.

Все пять сценариев на Aurora проходят.
