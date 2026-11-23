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
- `add` / `delete` / `clean` на бэкенде;
- плоская схема `/system/management`: hostname + Apply;
- потоковый ping, вывод в Bypass.

## Известные недоработки Halo

Тесты с этими проверками помечены `test.fail`: они падают ожидаемо, а после
исправления Halo Playwright начнёт ругаться «expected to fail, but passed».

1. **Нет валидации полей**: `String`/`Number`/`Modal` проверяют только
   `required` (и то не всегда), но не `pattern`, `minimum`, `maximum`,
   `minLength`/`maxLength`. Невалидный `gateway` уходит в `@set`.
   Файлы: `src/lib/pages/Dashboard/Render/Control/*.svelte`.
2. **ADD с пустыми required**: модалка Add всегда возвращает `newData`,
   OK не блокируется; создаётся запись `cfg07` без device/type.
3. **Commit — заглушка**: кнопка Save в шапке только показывает overlay на
   5 секунд (`src/Dashboard.svelte`, `onCommit` с закомментированным
   `commitMutation.mutate()`), запрос `commit` не уходит.
4. **Нет глобального revert** в шапке; revert есть только как действие
   `/system/config`.
5. **Журнал не работает**: запрос `POST /script/wrapper?journal=` идёт без
   `Content-Type: application/json`, бэкенд отвечает `400 Bad Request`,
   в UI видно `Bad Request`.
6. **Required не блокирует действия**: ping с пустым host уходит в
   `ping,/tools`; бэкенд подставляет `1.1.1.1`.
7. **Stop не останавливает поток**: `onStop={() => {}}` в
   `src/Dashboard.svelte`, вывод ping продолжает дописываться.
8. **Dashboard-модули hardware/mobile**: демо-бэкенд и сборка не отдают
   `/modules/dashboard/hardware/index.js` и `.../mobile/index.js` (404).
   Это ограничение демо-модулей, а не входа/схем.
9. **Качество кода**: в flat-схеме `Render.svelte` передаёт
   `selectedKey="wtf"`, в production остались `console.log`, а
   `commitMutation` объявлен, но не используется.

## Ожидаемые падения

`03-validation`, `04-commit-revert`, `05-journal`, `06-actions` — по одной-
две проверки из списка выше. `01-dashboard`, `02-edit-apply`,
`07-flat-schema` проходят.

## Aurora parity

`e2e/10-halo-parity.spec.mjs` проверяет на Aurora Vue 2/Vue 3:

- commit и revert отправляют запросы;
- ADD с пустыми required не уходит;
- ping без host не уходит;
- Stop останавливает поток;
- flat-схема `/system/management` сохраняет hostname и Apply.

Все пять сценариев на Aurora проходят.
