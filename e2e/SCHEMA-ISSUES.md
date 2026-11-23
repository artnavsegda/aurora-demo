# Ошибки в схемах Aurora

Карточка Kaiten: `#75557467`.

Найдено статическим разбором `scripts/check-schemas.mjs`, юнит-тестами на
реальных схемах (`aurora-vue2-tests/tests/schemas`, `aurora-vue3-tests/tests/schemas`)
и бизнес-проходом Playwright `e2e/08-schema-business.spec.mjs`.

## Критичные: схема не соответствует данным

### `/network/device`

Схема описывает только VLAN-устройства, но в таблице и фикстуре лежат
`bridge0` (`type: br`), `eth0` (`ethernet`), `wlan0` (`wireless`).
У секции `required: ["name", "device", "vid"]`, а `type` имеет `enum: ["vlan"]`.

На каждой строке форма показывает:

- `type`: `'br'/'ethernet'/'wireless' - invalid value`;
- `device`: `value required`;
- `vid`: `value required`.

**Предложение:** разделить схему на «все L2-устройства» (типы
`br/ethernet/wireless`, required только `name`) и отдельную форму создания VLAN
(required `name/device/vid`), либо сделать `device`/`vid` условно обязательными
для `type=vlan`. В текущем формате `required` — плоский список, условного
required нет; можно вынести проверку в обработчик `add/set`.

### `/service/openvpn-server`

`required: ["tunnel-ip", "pool", "ca", "cert"]`, но в фикстуре этих полей нет,
а сервер выключен (`disabled: 1`). На странице сразу видны четыре
`value required`.

**Предложение:** убрать эти поля из `required` (оставить `name`), а обязательность
проверять в `apply`/`add` по `disabled` и `tls-mode`; либо добавить значения в
фикстуру, если демо должно показывать заполненный сервер.

### `/tunnel/wireguard/interface`

Схема объявляет `patternProperties[".*"]` (список интерфейсов), а `@get` и
фикстура отдают плоский объект:

```json
{ "proto": "wireguard", "disabled": "1", "tunnel-ip": ["10.99.0.1/24"], ... }
```

В результате таблица показывает строки `proto/disabled/...`, клик по строке
передаёт в `SectionOption` строку, а не объект; Vue 2 роняет
`BoolElement.beforeMount` на `this.values[disabled] = ...`.
В Vue 3 это уже защищено, но схема/данные всё равно не совпадают.

**Предложение:** привести схему к плоскому объекту (`properties` вместо
`patternProperties`) — это один интерфейс, как в `/tunnel/openvpn`; либо
изменить `@get/@set` и фикстуру на `{ "wg0": { ... } }`. Согласовать с прошивкой.

## Критичные: битые `$ref`

### `/network/fdb`

```diff
- "$ref": "/defaults#/definitions/mac"
+ "$ref": "/defaults#/definitions/macaddr"
```

В `/defaults` нет `definitions.mac`; после замены поле MAC получит pattern и
пример.

### `/tunnel/ipsec/profile`, `/tunnel/ipsec/proposal`

В `add.schema.properties.name` стоит локальная ссылка, а локального
`definitions.name` нет:

```diff
- "$ref": "#/definitions/name"
+ "$ref": "/defaults#/definitions/name"
```

Иначе форма добавления профиля/предложения остаётся без pattern и описания.

## Критичные: неверные `required`/типы

### `/tunnel/ipsec/connection`

`required: ["psk", "ca", "cert"]`, но:

- свойства `ca` нет (есть `psk`, `cert`);
- `psk` и `cert` взаимоисключающие по `auth` (`psk` / `pubkey`).

**Предложение:** убрать `psk/ca/cert` из `required`; проверять по `auth` в
обработчике или добавить в формат условный `required`. Если `ca` нужен — добавить
свойство с `cue: ["/storage/certificate"]`.

### `/mobile/sms`, action `send-sms`

```diff
- "message": { "type": "text" }
+ "message": { "type": "string" }
```

`text` не тип JSON Schema и не прикладной тип клиента (клиент валидирует его как
строку, но схема становится невалидной для внешних генераторов).

### `/peripheral/serial-port`

Во всех NTRIP-полях условие ссылается на несуществующее поле секции:

```diff
- { "if": [{ "mode": "ntripclient" }, { "ntripclient_installed": true }], ... }
+ { "if": [{ "mode": "ntripclient" }, { "/defaults/ntripclient_installed": true }], ... }
```

В `/defaults` есть `ntripclient_installed`. Сейчас NTRIP-поля никогда не
показываются: `condProcess` читает `values.ntripclient_installed`, которого нет.

## Ошибки в примерах/ограничениях

| Схема | Проблема | Предложение |
| --- | --- | --- |
| `/ip/nhrp`, `map.items` | второй `patternExample` — 5 октетов: `10.0.1.101@133.94.75.36.14` | `10.0.1.101@133.94.75.36` |
| `/service/dhcp/server`, `option.items` | пример `bootfile=image.bin` не проходит pattern/enum | `bootfile-name=image.bin` |
| `/service/openvpn-server`, `push.items` | `route-gateway=192.168.1.1` — ключа нет в `enum` | добавить `route-gateway` в enum или заменить пример на `route-metric=10` |
| `/network/qos/queue`, `red-bandwidth` | `minimum: 1` на строковом bandwidth | убрать `minimum` или сделать поле числом |
| `/tunnel/l2tp-v3`, `udp-dport/sport` | `minimum: 1024` на строковом порту | убрать `minimum` или сменить тип |
| `/firewall/mangle`, `set-mark/set-dscp/set-mss/set-ttl` | `"required": true` на поле; клиент такое не читает | убрать или реализовать условный required |
| `/network/bridge`, `/tunnel/eoip`, `/tunnel/l2tp-v3`, `/wireless/network` | `default: "auto"` не подходит под MAC-pattern | разрешить `auto` в pattern или убрать default |
| `/storage/certificate`, `issuer/subject/alt-name` | `enum: []` у items | пометить `readOnly/noExport` либо заполнить |
| `/system/package`, `depends.items` | `enum: []` | то же |
| `/routing/status`, `attributes`; `/tunnel/ipsec/status`, `local-ts/remote-ts` | массив без `items` | добавить `items` или `readOnly` |

## @cue

Много источников `/tunnel` и `/tunnel/atunnel` в `defaults.json` и firewall-схемах.
В списке схем такого пути нет; демо-бэкенд возвращает пустой список. Если на
прошивке такого агрегата тоже нет — заменить на конкретные
`/tunnel/eoip`, `/tunnel/gre`, ...; если есть — добавить схему/путь в fixtures.

## Что осталось за пределами карточки

- `showParams` может содержать статусные колонки (`module`, `model`, `host`,
  `pub-key`) — это нормально.
- `required` на скрытых полях клиент игнорирует (`isRequired=false` при
  `hidden:true`); это не ошибка, но лучше не смешивать.
- Vue 3 уже исправлен для массива без `items`: `SectionOption.type` больше не
  падает (`Desktop/aurora` `b286106`), а `BoolElement` не пишет в строку
  (`d4030fe`). Для Vue 2 патч к `BoolElement`:
  `patches/aurora-vue2-bool-scalar-values.patch`.

## Проверка

```sh
cd /Users/artnavsegda/Documents/GitHub/aurora-demo
node scripts/check-schemas.mjs --all
npm test
npm run test:aurora3
AURORA_SRC=/path/to/vue2/src npm run test:aurora
npm run test:e2e
```
