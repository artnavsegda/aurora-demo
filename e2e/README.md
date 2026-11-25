# Композитные e2e-тесты Aurora

Одни и те же сценарии гоняются на двух сборках прод-Авроры через
`aurora-demo`:

- **vue2** — ветка `compressed` (Vue 2, текущая прод-сборка);
- **vue3** — ветка `vue3`.

Отдельных тестов под версию нет: сценарии общие. Различия, найденные в Vue 3,
исправляются в `Desktop/aurora`; баги Vue 2 фиксируются в Kaiten и после
исправления в `compressed` проверяются теми же сценариями.

## Сборки

По умолчанию Playwright берёт фронтенды из `frontend/vue2` и `frontend/vue3`
(эти каталоги в git не входят). Vue 2 собирается из `compressed`; актуальные
исправления уже в ветке, патчи не применяются. Можно указать готовые `dist` напрямую:

```sh
AURORA_VUE2_DIST=/path/to/vue2/dist \
AURORA_VUE3_DIST=/path/to/vue3/dist \
npx playwright test
```

Vue 2 (`compressed`):

```sh
git archive compressed | tar -x -C /tmp/aurora-vue2
cd /tmp/aurora-vue2
npm ci
NODE_OPTIONS=--openssl-legacy-provider npx vue-cli-service build
```

Vue 3 (`vue3`):

```sh
cd /Users/artnavsegda/Desktop/aurora
npm run build
```

Копирование в демо-репозиторий:

```sh
scripts/prepare-e2e-frontends.sh /path/to/vue2/dist /path/to/vue3/dist
```

## Запуск

```sh
npm install
npx playwright install chromium

npm run test:e2e          # оба проекта
npm run test:e2e:vue2     # только Vue 2
npm run test:e2e:vue3     # только Vue 3
npm run test:e2e:adversarial  # только испытательные схемы /test/*
```

Playwright сам поднимает два демо-бэкенда: `8102` (Vue 2) и `8103` (Vue 3)
на одном наборе схем и фикстур.

## Что покрыто

- `00-schema-sweep` — все схемы открываются без ошибок в консоли;
- `01-login-dashboard` — вход, сводка, прямой переход на `/ip/interface`;
- `02-text-input` — ввод с паузой не теряет пробел;
- `03-validation` — ошибка формы блокирует Apply, после исправления Apply работает;
- `04-modificator` — новая секция видит `modificator` (`type=static` → IP Address);
- `05-cue` — `@cue` заполняет список source;
- `06-journal` — поток журнала показывает строки и дописывает новые;
- `07-stream` — потоковый ping выводит результат в окно действия;
- `08-schema-business` — проход по всем схемам: видимые ошибки полей и ошибки
  консоли; три известных расхождения схема/данные перечислены явно;
- `11-session-commit` — @cue 403 выводит на login; неуспешный commit
  не теряет changes/commited;
- `09-adversarial-schemas` — испытательные схемы `/test/*`: битый regexp,
  массивы без `items`, битые `$ref`, пустой `enum`, `modificator` на
  несуществующем поле, `cue`, actions (форма, confirm, поток, blob, без схемы).
  Схемы и данные — в `test-schemas/` и `fixtures/test-schemas.json`; включаются
  через `DEMO_TEST_SCHEMAS=1` (Playwright выставляет флаг сам).

## Ранее известные баги Vue 2

Все закрыты в ветке `compressed`, `test.fail` снят:

- `#75554667` — пробел между словами при дебаунсе `TextElement` (`659ccc1`);
- `#75512469` — Apply не видел ошибок формы (`7150ee2`);
- `#75562223` — `BoolElement` писал в скалярные значения (`7145a01`) и
  `validator` падал на битом `pattern` (`538baac`).

Патчи в `patches/aurora-vue2-*.patch` оставлены только для старых сборок.

## Halo

Halo (`donyx/main`) — отдельный Svelte-клиент, поэтому у него свой конфиг и
селекторы: `playwright.halo.config.mjs`, `e2e/halo/`. Запуск:

```sh
HALO_DIST=/Users/artnavsegda/Documents/GitHub/donyx/dist \
  npm run test:e2e:halo
```

Общие бизнес-сценарии продублированы в `e2e/10-halo-parity.spec.mjs` для
Aurora Vue 2/Vue 3. Список известных недоработок Halo — в `e2e/halo/README.md`.

## Ошибки самих схем

Статический разбор: `node scripts/check-schemas.mjs --all` (или
`npm run check:schemas`). Юнит-тесты на реальных схемах лежат в
`aurora-vue2-tests/tests/schemas` и `aurora-vue3-tests/tests/schemas`:
валидаторы, `Sch`, рендер каждого поля, данные фикстур.

Найденные ошибки и предложения по исправлению: `e2e/SCHEMA-ISSUES.md`,
карточка Kaiten `#75557467`.

`08-schema-business` знает об одном подтверждённом расхождении:

- `/service/openvpn-server` — required на отсутствующих в данных полях.

Испытательная схема `bad-regexp`: `validator` больше не бросает `SyntaxError`
на невалидном `pattern` — исправлено и в Vue 2 (`compressed`), и в Vue 3.

## Правки демо-бэкенда

`journal` раньше закрывался сразу после чтения тела POST: `request.raw.on('close')`
в Node срабатывает по завершении запроса, а не при отключении клиента. Теперь
поток закрывается по `reply.raw.on('close')`, а регрессию ловит
`test/http.test.mjs`.
