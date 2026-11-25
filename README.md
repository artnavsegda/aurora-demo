# aurora-demo-backend

Демонстрационный бэкенд для **прод-Aurora и Halo** (irzOS 1.2, легаси-протокол
`horizont`). Поднимается на фикстурах, не требует реального роутера и не выполняет
команды на хосте.

## Что это

Прод-клиенты Aurora и Halo ходят в:

- `/script/auth`, `/script/logout`;
- `/script/wrapper` с типами `@schemas`, `@get`, `@set`, `apply`, `add`,
  `delete`, `clean`, `status`, `@cue`, `commit`, `revert`, `journal`;
- `/script/dashboard`, `/script/upload`;
- `/schema/*.json`.

Этот сервис реализует тот же протокол поверх in-memory состояния. Схемы — прод-формат
Aurora (с `namesake`, `showParams`, `patternProperties`), данные — слепок Donyx iRM.

Один backend обслуживает и Aurora, и Halo: у них общий протокол и общий набор схем.
horizon-uc (`~config`, `~get`, `@apply`) — это другое поколение, сюда не входит.

## Быстрый старт

```sh
npm install

# Aurora
FRONTEND_DIST=/Users/artnavsegda/Desktop/aurora/dist \
PORT=8099 npm start

# Halo — отдельным инстансом (у его dist корень /), например на 8098
FRONTEND_DIST=/Users/artnavsegda/Documents/GitHub/donyx/dist \
PORT=8098 npm start
```

Открыть Aurora — `http://127.0.0.1:8099/`, Halo — `http://127.0.0.1:8098/`.
Логин — **любое непустое имя**, пароль любой. Каждый посетитель получает свою
копию состояния: изменения одного не видны другому.

Без `FRONTEND_DIST` отдаётся заглушка `public/index.html`; API при этом работает.
`AURORA_DIST` — старый alias для того же. `HALO_DIST` — если Halo собран с
`--base /halo/` и должен жить на том же origin по `/halo/`.

### Docker

Образ демо-бэкенда содержит **только Aurora Vue 2** (`frontend/aurora`)
в брендинге Donyx: тёмная тема, логотип и `Donyx - Control Panel` (сборка
`DONYX=1`). Halo/donyx в образ не входит — это внутренняя разработка.

Сборка:

```sh
# frontend/aurora уже содержит Vue 2 dist в брендинге Donyx; при обновлении:
# scripts/prepare-frontend.sh /path/to/aurora-vue2-donyx/dist
docker build --platform linux/amd64 -t aurora-demo-backend:2026-11-24-donyx-amd64 .
docker compose -f docker-compose.deploy.yml up -d
```

Запуск одного контейнера без compose:

```sh
docker run -d --name aurora-demo \
  -p 8080:8080 \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,nodev \
  --cap-drop ALL --security-opt no-new-privileges:true \
  aurora-demo-backend:2026-11-24-donyx-amd64
```

Образ: non-root, read-only rootfs, `cap_drop: ALL`, лимит памяти,
healthcheck. Проверено: `docker build --platform linux/amd64`, `/healthz`,
отдача Vue 2, `/script/auth`, `docker load` из сохранённого tar.
Пошаговая инструкция для площадки — `DEPLOY-DOCKER.md`.

## Что реализовано

- вход любым username, token + Basic, TTL сессии (по умолчанию 3600 с);
- `@schemas` — список и hidden из слепка, `chpasswd_req: 0`;
- `@get` — данные пути из фикстуры или пустой объект;
- `@set` — изменение поля, `apply` — подтверждение (данные уже в сессии);
- `add` / `delete` / `clean` / `reorder` — реальные операции над состоянием сессии;
- `status` — статус таблицы и записи, с «живыми» счётчиками;
- `@cue` — подсказки `+value`, `$option`, `/schema[фильтр]`, `/defaults/...`;
- dashboard — снятая с Donyx сводка: плата, hardware, temperature, mobile, интерфейсы и ipsec;
- `journal` — поток журнала, сначала 50 строк, потом по строке в секунду;
- действия `ping`, `traceroute`, `sniffer`, `download` и прочие `wait`-команды —
  потоковый вывод;
- `export`, `report` и `download` с `responseType: blob` — скачивание файла;
- `/script/upload` — файл появляется в `/storage/file`;
- данные `/system/user` дополняются записью текущего пользователя.

## Данные

`fixtures/fixtures.json` и `fixtures/dashboard.json` собраны из слепка Donyx iRM:

```sh
# 1. снять @schemas, @get, status, records и dashboard с роутера
ROUTER_PASSWORD=... scripts/capture-router.py https://192.168.3.1 admin \
  --out /Users/artnavsegda/Documents/irz/donyx-snapshot-2026-11-24

# 2. почистить идентификаторы и разложить по schemas/ и fixtures/
scripts/import-donyx-snapshot.py \
  /Users/artnavsegda/Documents/irz/donyx-snapshot-2026-11-24
```

Слепок включает все пути из `@schemas` (list + hidden), данные `@get`, статусы
таблиц и записей, а также сводку `/script/dashboard`. Импорт заменяет
`schemas/` целиком, поэтому старые пути не остаются. Скрипт чистит серийник,
IMEI/IMSI/ICCID, Wi-Fi-ключи, SSID и MAC-адреса; пароль администратора в
фикстуры не попадает.

Схемы (`schemas/`) — это `/schema/<path>.json` с того же Donyx. При обновлении
прошивки слепок и импорт повторяют тем же порядком.

## Ограничения и что дальше

- Halo-модули (`firmware`, `software`, `clock`, `gps`, `load`, а также
  dashboard-секции) пока не эмулируются: основные разделы и сводка работают,
  CGI модулей нужно добавить отдельно.
- Часть разделов на этом устройстве пустая — так и должно быть: фикстуры больше
  не досыпаются примерами.
- Нет rate limit и TLS: перед публичным запуском поставить nginx/Caddy, ограничить
  логин и wrapper, включить `X-Robots-Tag: noindex`.
- Состояние хранится в памяти и теряется при рестарте; для нескольких реплик нужны
  sticky sessions или общий store.
- `journal` не ограничен по объёму на клиенте; при долгом открытом окне вкладка
  будет расти, как и на реальном устройстве.

## Тесты

```sh
npm test
```

Node-тесты без дополнительных зависимостей (`node:test` + `node:assert/strict`).
Покрыто:

- auth: любой username, пустой username, logout, невалидный токен;
- `@schemas`, `@get` (включая 404), `@set`, `apply`, `add`, `delete`, `clean`,
  `reorder`, `status`, `@cue`;
- изоляция сессий, TTL, `cleanup`, `seedUser`;
- фикстуры: клонирование, статус, очистка секретов;
- dashboard/board;
- HTTP-слой: `healthz`, статика схем (в том числе `/schema//...`), ping-поток,
  journal-поток (не закрывается сразу и дописывает строки), upload.

`npm run test:watch` — то же в watch-режиме.

Статическая проверка схем и отчёт по ошибкам:

```sh
npm run check:schemas          # ошибки, предупреждения и заметки
npm run check:schemas:errors   # только ошибки, код возврата 1 при находках
```

Подробнее — в `e2e/SCHEMA-ISSUES.md` и карточке Kaiten `#75557467`.

## Тесты Aurora Vue 3

Отдельный пакет `aurora-vue3-tests/` — юнит-тесты для ветки `vue3`
(Vitest + `@vue/test-utils` + jsdom). Тесты так же импортируют `src/` из
соседнего репозитория и не попадают в корпоративный git.

```sh
cd aurora-vue3-tests
npm install
AURORA_SRC=/Users/artnavsegda/Desktop/aurora/src npm test
```

Из корня демо-репозитория:

```sh
npm run test:aurora3
```

Подробности — в `aurora-vue3-tests/README.md`.

## Тесты прод-Авроры Vue 2

Отдельный пакет `aurora-vue2-tests/` — юнит-тесты для прод-Авроры (ветка
`compressed`), которые по корпоративной политике нельзя положить в её
репозиторий. Тесты импортируют `src/` из соседнего репозитория, а не копируют код.

```sh
cd aurora-vue2-tests
npm install
AURORA_SRC=/Users/artnavsegda/Desktop/aurora/src npm test
npm run coverage
```

Из корня демо-репозитория:

```sh
npm run test:aurora
npm run coverage:aurora
```

Подробности — в `aurora-vue2-tests/README.md`.

## Валидатор схем

`shared/validation/` — чистый TypeScript-валидатор без Svelte/DOM/Node-
зависимостей. Подходит для Halo, Aurora и демо-бэкенда. Раскрывает `$ref`,
применяет `modificator` и подставляет `enum` из `@cue` по переданному
контексту; сеть и кэш остаются на стороне вызывающего кода.

```ts
import { validateValue, validateForm } from "./shared/validation/index.ts"

const check = validateValue(schema, value, { required: true })
const form = validateForm(sectionSchema, values, { path: "bridge0" })
form.valid
form.errors
form.issues
```

Проверяет `required`, pattern, enum/strictEnum, границы, длины, boolean,
массивы/pair, `hidden`/`readOnly`. Битый pattern возвращает issue
`invalid-pattern`, а не бросает исключение.

```sh
npm run test:validation
npm run typecheck:validation
```

Тест прогоняет синтетические правила и все реальные схемы (включая
`patternExample`); найденные ошибки самих схем перечислены в
`e2e/SCHEMA-ISSUES.md`.

## Композитные e2e (Vue 2 + Vue 3)

`e2e/` — Playwright-тесты, которые гоняют один сценарий на двух сборках
прод-Авроры: Vue 2 (`compressed`) и Vue 3 (`vue3`). Обе обслуживает этот же
демо-бэкенд.

```sh
npm install
npx playwright install chromium
scripts/prepare-e2e-frontends.sh /path/to/vue2/dist /path/to/vue3/dist
npm run test:e2e
```

Можно без копирования:

```sh
AURORA_VUE2_DIST=/path/to/vue2/dist \
AURORA_VUE3_DIST=/path/to/vue3/dist \
npm run test:e2e
```

Отдельно: `npm run test:e2e:vue2`, `npm run test:e2e:vue3`,
`npm run test:e2e:adversarial`.
Подробности и список сценариев — в `e2e/README.md`; ранее известные баги Vue 2
закрыты в `compressed`, найденные ошибки самих схем — в `e2e/SCHEMA-ISSUES.md`.

### Halo (donyx)

Стабильная Halo (`donyx/main`) проверяется отдельным конфигом; её тесты лежат
в `e2e/halo/`:

```sh
cd /Users/artnavsegda/Documents/GitHub/donyx
npm run build

cd /Users/artnavsegda/Documents/GitHub/aurora-demo
HALO_DIST=/Users/artnavsegda/Documents/GitHub/donyx/dist \
  npm run test:e2e:halo
```

Ограничения и известные недоработки Halo — в `e2e/halo/README.md`.
Сценарии parity (commit/revert, ADD, ping required, Stop, flat-схема) лежат в
`e2e/10-halo-parity.spec.mjs` и проходят на Aurora Vue 2/Vue 3.

## Что проверено

- Aurora (`Desktop/aurora/dist`): вход `demo`, меню, dashboard, `/ip/interface`
  (таблица, статус, поля), изменение поля → Apply → Commit, журнал (поток),
  ping (поток вывода в окне действия).
- Halo (`donyx/dist`): вход, меню, dashboard (device/hardware/mobile по данным
  `/script/dashboard`), `/ip/interface`.
- API: `@schemas`, `@get`, `@set`, `apply`, `add`, `delete`, `clean`, `status`,
  `@cue`, `commit`, `revert`, `journal`, `dashboard`, `upload`.
- Docker-образ собран для Aurora Vue 2, проверены healthcheck, отдача
  `frontend/aurora`, `/script/auth` и `docker load`.

## Проверка API

```sh
TOKEN=$(curl -s -X POST localhost:8099/script/auth \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":""}' | jq -r .token)

curl -s -X POST 'localhost:8099/script/wrapper?schemas' \
  -H 'Content-Type: application/json' \
  -d "{\"type\":\"@schemas\",\"path\":\"/\",\"token\":\"$TOKEN\"}"

curl -s -X POST 'localhost:8099/script/wrapper?@get,/ip/interface' \
  -H 'Content-Type: application/json' \
  -d "{\"type\":\"@get\",\"path\":\"/ip/interface\",\"token\":\"$TOKEN\"}"

curl -s -N -X POST 'localhost:8099/script/wrapper?journal' \
  -H 'Content-Type: application/json' \
  -d "{\"type\":\"journal\",\"path\":\"/tools\",\"token\":\"$TOKEN\",\"data\":{\"last\":10}}"
```
