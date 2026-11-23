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
Aurora (с `namesake`, `showParams`, `patternProperties`), данные — слепок R50.

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

Перед сборкой нужно положить собранный фронтенд в `frontend/aurora`
(в образе он лежит по `/app/frontend/aurora`):

```sh
make prepare FRONTEND=/Users/artnavsegda/Desktop/aurora/dist
docker compose up --build
```

Или одной командой:

```sh
make docker
```

`make prepare` можно не делать, тогда контейнер поднимется с заглушкой
`public/index.html`, а API будет работать — удобно для smoke-теста.

Контейнер: non-root, read-only rootfs, `cap_drop: ALL`, лимит памяти, healthcheck.
Docker daemon в моём окружении был выключен, поэтому `docker build` я не прогонял —
первую сборку нужно проверить на машине с Docker.

## Что реализовано

- вход любым username, token + Basic, TTL сессии (по умолчанию 3600 с);
- `@schemas` — список и hidden из слепка, `chpasswd_req: 0`;
- `@get` — данные пути из фикстуры или пустой объект;
- `@set` — изменение поля, `apply` — подтверждение (данные уже в сессии);
- `add` / `delete` / `clean` / `reorder` — реальные операции над состоянием сессии;
- `status` — статус таблицы и записи, с «живыми» счётчиками;
- `@cue` — подсказки `+value`, `$option`, `/schema[фильтр]`, `/defaults/...`;
- dashboard — плата, прошивка, uptime, RAM/CPU/Storage, модем;
- `journal` — поток журнала, сначала 50 строк, потом по строке в секунду;
- действия `ping`, `traceroute`, `sniffer`, `download` и прочие `wait`-команды —
  потоковый вывод;
- `export`, `report` и `download` с `responseType: blob` — скачивание файла;
- `/script/upload` — файл появляется в `/storage/file`;
- данные `/system/user` дополняются записью текущего пользователя.

## Данные

`fixtures/fixtures.json` собран скриптом:

```sh
python3 scripts/build-fixtures.py \
  /Users/artnavsegda/Documents/GitHub/irz-artifacts/snapshots/r50-irzos-0.1.283/horizont
```

Источник — слепок `@get` и `status` реального R50. Скрипт чистит серийники, IMEI,
Wi-Fi-ключи и MAC-адреса. Пустые на слепке разделы немного заполняются примерами
(ARP, DHCP-аренды, SMS, файлы, события, BGP, WireGuard).

Схемы (`schemas/`) сняты с `https://irzos.demo.radiofid.ru/schema/...` — это
прод-схемы Aurora. При обновлении прошивки их можно переснять:

```sh
scripts/fetch-schemas.py https://irzos.demo.radiofid.ru \
  /path/to/_schemas.json
```

Скрипт возьмёт список путей из слепка и обновит `schemas/`.

## Ограничения и что дальше

- Halo-модули (`firmware`, `software`, `clock`, `gps`, `load`) пока не эмулируются:
  основные разделы и сводка работают, CGI модулей нужно добавить отдельно.
- Часть разделов остаётся пустой — это нормально для демо; можно добавить фикстуры.
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
Подробности, список сценариев и известные баги Vue 2 (ожидаемые падения) —
в `e2e/README.md`; найденные ошибки самих схем — в `e2e/SCHEMA-ISSUES.md`.

## Что проверено

- Aurora (`Desktop/aurora/dist`): вход `demo`, меню, dashboard, `/ip/interface`
  (таблица, статус, поля), изменение поля → Apply → Commit, журнал (поток),
  ping (поток вывода в окне действия).
- Halo (`donyx/dist`): вход, меню, dashboard (device/hardware/mobile по данным
  `/script/dashboard`), `/ip/interface`.
- API: `@schemas`, `@get`, `@set`, `apply`, `add`, `delete`, `clean`, `status`,
  `@cue`, `commit`, `revert`, `journal`, `dashboard`, `upload`.
- Docker-образ не проверялся в этом окружении (Docker daemon был выключен).

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
