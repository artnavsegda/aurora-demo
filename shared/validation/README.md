# Pure validation

Чистый TypeScript-валидатор схем Aurora/Halo. Без Svelte, DOM, axios и
Node-зависимостей — подходит и для браузера, и для демо-бэкенда.

## API

```ts
import { validateValue, validateForm } from "../shared/validation/index.ts"

const result = validateValue(schema, value, {
    required: true,
    enumValues: ["a", "b"], // например, enum из @cue
})

const form = validateForm(sectionSchema, values, {
    path: "bridge0",
})
form.valid        // boolean
form.errors       // { field: "value required" }
form.issues       // [{ path, code, message, value }]
```

Схема должна быть уже **эффективной**: `$ref`, `modificator` и `cue enum`
подставляет вызывающий код. Валидатор не знает про `refResolver`, `Sch` и
QueryBuilder — поэтому его можно использовать в Halo, в демо-бэкенде и в
юнит-тестах без браузера.

## Что проверяется

- `required` из `required[]` и legacy `required: true`;
- `number`/`integer`, `minimum`/`maximum`;
- `string`/`password`/`text`, `pattern`, `minLength`/`maxLength`;
- `enum` и `strictEnum`, включая `default`;
- `boolean`;
- `array`: `items`, `uniqueItems`, pair;
- вложенные `properties`.

`hidden` и `readOnly` по умолчанию пропускаются (`skipHidden`,
`skipReadOnly` можно отключить).

Битый `pattern` не бросает исключение: возвращается issue
`invalid-pattern`. Сообщения совпадают с поведением Авроры
(`value required`, `minimum is 10`, `'x' - invalid value`, ...).

## Проверка

```sh
npm test
npx tsc -p tsconfig.validation.json
```

`test/validation.test.mjs` проверяет правила на синтетических примерах и
прогоняет валидатор по всем реальным схемам, включая примеры `patternExample`
и enum.
