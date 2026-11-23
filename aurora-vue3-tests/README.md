# aurora-vue3-tests

Юнит-тесты для **Aurora Vue 3** (ветка `vue3`), вынесенные из корпоративного
репозитория. Тесты импортируют `src/` из соседнего репозитория, а не копируют код.

## Запуск

```sh
npm install
npm test
```

По умолчанию исходники берутся из `../../../../Desktop/aurora/src`.
Для другой машины/CI:

```sh
AURORA_SRC=/path/to/aurora/src npm test
```

Нужен установленный `node_modules` в прод-репозитории (там лежат `vuex`,
`vue-router`, `axios`, `json-pointer` и остальные рантайм-зависимости).

Стек: Vitest 3 + `@vue/test-utils` 2 + jsdom; Vue 3.5.45.

## Что покрыто

- `utils`: index, validator, session, схема `Sch`;
- store: state, mutations, getters, actions (включая ошибки, потоки, upload,
  commit/revert, dashboard);
- элементы форм: Text/Number/Bool/Select/MultipleText/MultipleSelect/
  MultiplePair/Status/description/errorDescription, включая DOM-ввод;
- Header, Menu, Changes, Informs, PopUpWindow, Schema, SectionOption, Syslog,
  Plate, графики, окна Action/Dialog/FileUpload;
- Login, Main, App, router, axios-интерцептор сессии.

`src/main.js` и `src/utils/icons.js` не тестируются: entrypoint и
сгенерированные иконки с побочными эффектами.
