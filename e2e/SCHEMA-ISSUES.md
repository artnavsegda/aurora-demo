# Ошибки в схемах Aurora

Карточка Kaiten: `#75557467`.

Повторная проверка — 2026-11-27, после замены демо-фикстур на слепок боевого
роутера Donyx iRM (`fixtures/fixtures.json`, `source: donyx-irm snapshot
2026-11-24`). Дополнительно схемы и данные сверены с прод-R2
(`https://192.168.1.1`, только чтение: `@schemas`, `@get`, `status`,
`/schema/*.json`).

## Итог повторной проверки

Первичный разбор (`5 ошибок, 50 предупреждений`) частично опирался на
неправильные демо-фикстуры. На актуальном слепке:

- снято как артефакт фикстур — `/network/device`,
  `/tunnel/wireguard/interface`;
- уже исправлено в схемах — `$ref` в `/tunnel/ipsec/profile` и
  `/tunnel/ipsec/proposal`;
- остаётся реальным — `/service/openvpn-server`, `/network/fdb`,
  `/tunnel/ipsec/connection`, `/mobile/sms`, `/network/bridge-vlan`,
  `/firewall/mangle`, примеры/ограничения и `@cue`;
- на прод-R2 дополнительно воспроизводятся `/network/qos/queue` и
  `/peripheral/serial-port` (в слепке Donyx iRM этих схем нет).

Текущий статический разбор:

```text
Схем: 74; ошибок: 3, предупреждений: 45, заметок: 29
```

## Снято: артефакты старых фикстур

### `/network/device`

Старая фикстура отдавала `bridge0` (`type: br`), `eth0` и `wlan0`, из-за чего
форма показывала `invalid value` и `value required`. Сейчас `@get` пустой и в
демо, и на прод-R2:

```json
{ "get": {} }
```

Строк нет — ошибок на странице нет. Схема при этом остаётся VLAN-ориентированной
(`definitions.type.enum: ["vlan"]`, `required: ["name", "device", "vid"]`), а
остальные L2-устройства живут в `/network/ethernet`, `/network/bridge` и
`/wireless/*`. Дизайн-замечание к заголовку секции остаётся теоретическим:
подтверждать его нужно на данных, где `/network/device` реально отдаёт
не-VLAN строки.

### `/tunnel/wireguard/interface`

Старая фикстура отдавала плоский объект (`proto`, `disabled`, `tunnel-ip`, ...)
при схеме с `patternProperties[".*"]`; из-за этого Vue 2 падал в
`BoolElement.beforeMount`. Сейчас `@get` пустой и в демо, и на прод-R2:

```json
{ "get": {} }
```

Строк нет — падения нет. Само расхождение «плоский объект против
`patternProperties`» остаётся латентным: его можно подтвердить только на
роутере с настроенным WireGuard-интерфейсом. Vue 2 дополнительно защищён в
`compressed` (`7145a01`): `BoolElement` больше не пишет в скалярные значения.

## Уже исправлено в схемах

### `/tunnel/ipsec/profile`, `/tunnel/ipsec/proposal`

В `add.schema.properties.name` теперь `/defaults#/definitions/name` и в демо,
и на прод-R2. Локальной ссылки `#/definitions/name` больше нет.

## Остаётся реальным

### `/service/openvpn-server`

`required: ["tunnel-ip", "pool", "ca", "cert"]`, но этих полей нет в данных, а
сервер выключен (`disabled: "1"`). На странице сразу видны четыре
`value required`; это единственное известное расхождение в
`e2e/08-schema-business.spec.mjs`.

Воспроизводится и в демо, и на прод-R2 — данные и `required` совпадают.

**Предложение:** убрать эти поля из `required` (оставить `name`), а
обязательность проверять в `apply`/`add` по `disabled` и `tls-mode`; либо
добавить значения в фикстуру, если демо должно показывать заполненный сервер.

Отдельно: в слепке Donyx iRM в `push.items.enum` нет `route-gateway`, а на
прод-R2 он уже добавлен (и pattern допускает `+`). Это отставание слепка, а не
ошибка клиента.

### `/network/fdb`

```diff
- "$ref": "/defaults#/definitions/mac"
+ "$ref": "/defaults#/definitions/macaddr"
```

`/defaults` определяет только `macaddr`; ссылка `mac` не разрешается. Одинаково
в демо и на прод-R2, ловится `check-schemas` как ERROR. После замены поле MAC
получит pattern и пример.

### `/tunnel/ipsec/connection`

`required: ["psk", "cert"]`, хотя `psk` и `cert` взаимоисключающие по `auth`
(`psk` / `pubkey`). Одинаково в демо и на прод-R2.

**Предложение:** убрать `psk/cert` из `required` и проверять выбранный `auth` в
обработчике.

### `/mobile/sms`, action `send-sms`

```diff
- "message": { "type": "text" }
+ "message": { "type": "string" }
```

`text` не тип JSON Schema. Клиент валидирует его как строку, но схема
становится невалидной для внешних генераторов. Одинаково в демо и на прод-R2,
ловится `check-schemas` как ERROR.

### `/network/bridge-vlan`

`required: ["name"]`, но свойства `name` в `properties` нет (есть `bridge`,
`vid`, `disabled`, `untagged`, `port`). Одинаково в демо и на прод-R2, ловится
`check-schemas` как ERROR.

**Предложение:** убрать `name` из `required` или добавить свойство.

### `/firewall/mangle`

У `set-mark`, `set-dscp`, `set-mss`, `set-ttl` стоит `"required": true`
(булево), а клиент ожидает массив имён полей. Одинаково в демо и на прод-R2.

**Предложение:** убрать `required` или реализовать условную обязательность по
`action`.

### Примеры и ограничения

| Схема | Проблема | Предложение |
| --- | --- | --- |
| `/ip/nhrp`, `map.items` | второй `patternExample` — 5 октетов: `10.0.1.101@133.94.75.36.14` | `10.0.1.101@133.94.75.36` |
| `/service/dhcp/server`, `option.items` | пример `bootfile=image.bin` не проходит pattern | `bootfile-name=image.bin` |
| `/tunnel/l2tp-v3`, `udp-dport/sport` | `minimum: 1024` на строковом порту | убрать `minimum` или сменить тип |
| `/network/bridge`, `/tunnel/eoip`, `/tunnel/l2tp-v3`, `/wireless/network` | `default: "auto"` не подходит под MAC-pattern | разрешить `auto` в pattern или убрать default |
| `/storage/certificate`, `issuer/subject/alt-name` | `enum: []` у items | пометить `readOnly/noExport` либо заполнить |
| `/system/package`, `depends.items` | `enum: []` | то же |
| `/routing/status`, `attributes`; `/tunnel/ipsec/status`, `local-ts/remote-ts` | массив без `items` | добавить `items` или `readOnly` |

Пункты таблицы проверены на прод-R2 там, где схема есть; на R2 отсутствует
только `/wireless/network`. Остальные схемы совпадают с демо.

### `@cue`

Источники `/tunnel` и `/tunnel/atunnel` встречаются в `defaults.json` и
firewall-схемах, но такого пути нет ни в `@schemas` демо, ни в `@schemas`
прод-R2. Демо-бэкенд возвращает пустой список.

**Предложение:** заменить на конкретные `/tunnel/eoip`, `/tunnel/gre`,
`/tunnel/l2tp`, ...; если агрегат есть в прошивке — добавить схему и путь.

## Дополнительно на прод-R2

Эти схемы есть на R2, но отсутствуют в слепке Donyx iRM, поэтому в демо они не
воспроизводятся.

### `/network/qos/queue`

`red-bandwidth`: `minimum: 1` при строковом типе (ссылка на
`#/definitions/bandwidth`). Убрать `minimum` или сделать поле числом.

### `/peripheral/serial-port`

`mode` уже использует `/defaults/ntripclient_installed` — и это работает:
`/defaults` в данных отдаёт `ntripclient_installed`. Но `ntrip-mode` и
остальные NTRIP-поля по-прежнему ссылаются на локальный
`ntripclient_installed`, которого в секции нет: данные содержат
`ntripclient-installed` (через дефис), а свойств с таким именем в схеме тоже
нет.

**Предложение:** заменить локальный ключ на `/defaults/ntripclient_installed`
во всех NTRIP-условиях. Добавлять флаг в `/defaults` не нужно — он там уже есть.

## Слепок Donyx iRM и прод-R2

Схемы расходятся в 14 общих путях. Для этой карточки важны:

| Путь | Donyx iRM (демо) | Прод-R2 |
| --- | --- | --- |
| `/service/openvpn-server` | в `push` нет `route-gateway` | добавлен `route-gateway`, pattern с `+` |
| `/mobile/sms` | у read-only `text` есть `multiline` | `multiline` нет |
| `/network/bridge`, `/network/bridge-vlan` | порты через `$ref` на `l2-device` | cue-список `_available-ports` |
| `/tunnel/ipsec/connection` | без `dynamic/interface/service` | добавлены read-only `dynamic/interface/service` |

R2 также отдаёт 79 путей против 74 в слепке: добавлены `/network/qos/*`,
`/peripheral/*`, `/service/link-client`, `/service/torrent`,
`/system/dashboard-load`, `/system/firmware`, `/system/software`; в слепке
остались `/service/drm-client` и `/wireless/*`, которых нет в списке R2.

## Что осталось за пределами карточки

- `showParams` может содержать статусные колонки (`module`, `model`, `host`,
  `pub-key`) — это нормально.
- `required` на скрытых полях клиент игнорирует (`isRequired=false` при
  `hidden:true`); это не ошибка, но лучше не смешивать.
- Vue 3 уже исправлен для массива без `items`: `SectionOption.type` больше не
  падает (`Desktop/aurora` `b286106`), а `BoolElement` не пишет в строку
  (`d4030fe`). Vue 2 исправлен в `compressed` (`7145a01`); патч
  `patches/aurora-vue2-bool-scalar-values.patch` оставлен для старых сборок.

## Испытательные схемы

В `test-schemas/` добавлены намеренно неудобные схемы `/test/validation`,
`/test/sections`, `/test/actions`, `/test/edge`. Они включаются только при
`DEMO_TEST_SCHEMAS=1` и не входят в обычный список демо.

Первый прогон (`e2e/09-adversarial-schemas.spec.mjs`) нашёл падение
`validator.checkPattern` на невалидном `pattern` из схемы: `new RegExp('[')`
бросал `SyntaxError` прямо из `check_valid`. Vue 3 исправлен (`5981744`), Vue 2 — в `compressed`
(`538baac`); патч оставлен для старых сборок.
Остальные неудобные конструкции (пустой enum, битые `$ref`, массивы без
items, отсутствующие условия modificator, cue-источники) обрабатываются без
падений на обеих версиях.

## Проверка

```sh
cd /Users/artnavsegda/Documents/GitHub/aurora-demo
node scripts/check-schemas.mjs --all
npm test
npm run test:aurora3
AURORA_SRC=/path/to/vue2/src npm run test:aurora
npm run test:e2e
```
