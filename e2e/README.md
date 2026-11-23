# Композитные e2e-тесты Aurora

Одни и те же сценарии гоняются на двух сборках прод-Авроры через
`aurora-demo`:

- **vue2** — ветка `compressed` (Vue 2, текущая прод-сборка);
- **vue3** — ветка `vue3`.

Отдельных тестов под версию нет: сценарии общие. Различия, найденные в Vue 3,
исправляются в `Desktop/aurora`; различия Vue 2 собираются как баги для Kaiten.

## Сборки

По умолчанию Playwright берёт фронтенды из `frontend/vue2` и `frontend/vue3`
(эти каталоги в git не входят). Vue 2 собирается из `compressed` **без патчей**:
так тесты и показывают известные баги. Можно указать готовые `dist` напрямую:

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
- `09-adversarial-schemas` — испытательные схемы `/test/*`: битый regexp,
  массивы без `items`, битые `$ref`, пустой `enum`, `modificator` на
  несуществующем поле, `cue`, actions (форма, confirm, поток, blob, без схемы).
  Схемы и данные — в `test-schemas/` и `fixtures/test-schemas.json`; включаются
  через `DEMO_TEST_SCHEMAS=1` (Playwright выставляет флаг сам).

## Известные баги Vue 2

Эти тесты помечены `test.fail` для проекта `vue2`: они падают ожидаемо, а при
исправлении Vue 2 Playwright начнёт ругаться «expected to fail, but passed» —
тогда `test.fail` надо убрать.

### 1. Пробел между словами теряется при дебаунсе

`e2e/02-text-input.spec.mjs`

Vue 2 `TextElement.update()` по таймеру вызывает `setValue()`, а тот делает
`trim()`. Если после `hello ` сделать паузу и набрать `world`, в поле и в API
попадает `helloworld`. Vue 3 обрезает значение только по blur/Enter, во время
дебаунса отдаёт как есть.

Патч: `patches/aurora-vue2-text-debounce.patch`.

### 2. Apply не видит ошибок формы

`e2e/03-validation.spec.mjs`

Vue 2 `Schema.errorUpdate()` пишет новый ключ в `this.errors` напрямую
(`this.errors[o.name] = o.err`). В Vue 2 это не реактивно: `hasErrors` остаётся
прежним, кнопка Apply не блокируется и отправляет `apply` с невалидными
данными. В Vue 3 такой проблемы нет.

Карточка: Kaiten `#75512469`. Патч:
`patches/aurora-vue2-schema-haserrors.patch`.

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

`08-schema-business` знает о трёх подтверждённых расхождениях:

- `/network/device` — VLAN-схема на всех L2-устройствах;
- `/service/openvpn-server` — required на отсутствующих в данных полях;
- `/tunnel/wireguard/interface` — схема-список на плоских данных.

Для Vue 2 в последнем случае дополнительно воспроизводится
`BoolElement.beforeMount` на строке; Vue 3 уже защищён.

Испытательная схема `bad-regexp` нашла ещё одну проблему: `validator` бросал
`SyntaxError` на невалидном `pattern` из схемы. Vue 3 исправлен (`5981744`),
для Vue 2 — `patches/aurora-vue2-validator-bad-regexp.patch`.

## Правки демо-бэкенда

`journal` раньше закрывался сразу после чтения тела POST: `request.raw.on('close')`
в Node срабатывает по завершении запроса, а не при отключении клиента. Теперь
поток закрывается по `reply.raw.on('close')`, а регрессию ловит
`test/http.test.mjs`.
