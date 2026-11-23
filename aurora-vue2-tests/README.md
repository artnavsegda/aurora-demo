# aurora-vue2-tests

Юнит-тесты для **прод-Авроры Vue 2** (ветка `compressed`), вынесенные из её
репозитория по корпоративной политике.

Тесты не копируют прод-код: они импортируют его из соседнего репозитория через
алиас `@/`, поэтому проверяется именно текущий `src/`.

## Запуск

```sh
npm install
npm test
```

По умолчанию исходники берутся из
`../../../../Desktop/aurora/src` (путь относительно этого каталога).
Для другой машины/CI:

```sh
AURORA_SRC=/path/to/aurora/src npm test
```

В прод-репозитории должен быть установлен `node_modules` (там лежат `vuex`,
`vue-router`, `axios`, `vue-json-pointer` и остальные рантайм-зависимости).
Для тестов используется Vue `2.7.16` (как в текущем `node_modules` прод-Авроры).

## Coverage

```sh
npm run coverage
```

Отчёт: `coverage/lcov-report/index.html`. Для coverage-конфига корень Jest —
прод-репозиторий, поэтому в отчёт попадает `src/`; тесты указаны через `roots`.

Текущий результат: **184 теста, 16 наборов, все проходят**;
покрытие — около **64.6% statements / 66.7% lines**. Непокрытое — в основном
шаблонные ветки и редкие методы больших компонентов (`Schema`, `Syslog`,
`ActionWindow`, `Login`), которые в юнит-тестах проверяются через
`shallowMount`/вызовы методов.

## Что покрыто

- `utils`: `index` (typify/json_clean/deepMerge/state2str/sortAlphaNum/objSort),
  `validator`, `session`, `schema` (класс `Sch`);
- `store`: state, mutations, getters, actions (включая ошибки, потоки, upload,
  commit/revert, dashboard);
- элементы форм: Text/Number/Bool/Select/MultipleText/MultipleSelect/
  MultiplePair/Status/description/errorDescription;
- компоненты: Header, Menu, Changes, Informs, PopUpWindow, Schema, SectionOption,
  Syslog, Plate, графики, окна Action/Dialog/FileUpload;
- views: Login, Main;
- App, router, axios-интерцептор сессии.

`src/main.js` и `src/utils/icons.js` не тестируются: это entrypoint и
сгенерированный набор иконок с побочными эффектами.
