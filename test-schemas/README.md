# Испытательные схемы

Набор заведомо неудобных схем для проверки клиента и демо-бэкенда. В обычном
демо они не появляются: бэкенд подключает их только при
`DEMO_TEST_SCHEMAS=1`.

## Схемы

- `/test/validation` — типы (`password`, `text`, без типа), `pattern`,
  `enableInvert`, границы, `enum` (включая пустой), массивы без `items`,
  pair/select/text-массивы, `modificator` с несуществующим полем, `cue`
  (литералы, `$поле`, `/defaults`, отсутствующий источник), битые `$ref`,
  `readOnly`, несовпадающий default, `minimum > maximum`, битый regexp.
- `/test/sections` — `required` на отсутствующем и скрытом поле, boolean
  control + зависимое поле, массив без items, битый ref, section action,
  add/delete/status.
- `/test/actions` — action с формой и валидацией, confirm, потоковый вывод,
  blob и действие без схемы.
- `/test/edge` — странные имена полей, `default`/`hidden`, условие через
  `/defaults`, pair-массив.

Данные лежат в `fixtures/test-schemas.json`; файлы схем — в `test-schemas/`.

## Запуск

```sh
# backend
npm test                 # файл test/adversarial-schemas.test.mjs включает флаг сам

# e2e (Playwright сам выставляет DEMO_TEST_SCHEMAS=1)
npm run test:e2e
npm run test:e2e:adversarial
```

Юнит-тесты на реальных схемах находятся отдельно, в
`aurora-vue2-tests/tests/schemas` и `aurora-vue3-tests/tests/schemas`; эти
испытательные схемы в них не входят.
