import type { ValidationContext, ValidationSchema } from "./types.ts"

function decodePointerPart(part: string): string {
    return decodeURIComponent(part.replace(/~1/g, "/").replace(/~0/g, "~"))
}

export function getByPointer(doc: unknown, pointer: string): unknown {
    if (!pointer)
        return doc
    return pointer
        .replace(/^\//, "")
        .split("/")
        .reduce<unknown>((node, raw) => {
            if (node === null || typeof node !== "object")
                return undefined
            return (node as Record<string, unknown>)[decodePointerPart(raw)]
        }, doc)
}

function omitRef(schema: ValidationSchema): ValidationSchema {
    const { $ref: _, ...rest } = schema as ValidationSchema & { $ref?: string }
    return rest
}

/**
 * Раскрывает $ref. Локальные ссылки (#/...) ищутся в root, внешние
 * (/defaults#/definitions/...) — в registry.
 */
export function resolveRef(
    schema: ValidationSchema,
    root: ValidationSchema,
    registry: Record<string, ValidationSchema> = {},
    seen = new Set<string>(),
): ValidationSchema {
    if (!schema || typeof schema !== "object" || typeof schema.$ref !== "string")
        return schema

    const ref = schema.$ref
    const key = ref
    if (seen.has(key))
        return schema

    const [filePart, pointerPart = ""] = ref.split("#")
    const targetRoot = filePart ? registry[filePart] : root
    if (!targetRoot)
        return schema

    const target = getByPointer(targetRoot, pointerPart)
    if (!target || typeof target !== "object" || Array.isArray(target))
        return schema

    const nextSeen = new Set(seen).add(key)
    const resolvedTarget = resolveRef(
        target as ValidationSchema,
        targetRoot,
        registry,
        nextSeen,
    )

    // Соседние с $ref ключи важнее цели (draft 2019-09+).
    return { ...resolvedTarget, ...omitRef(schema) }
}

function conditionValue(
    key: string,
    values: Record<string, unknown>,
    externalValues: Record<string, unknown> | undefined,
): string {
    let value: unknown

    if (key.startsWith("/")) {
        if (externalValues && Object.prototype.hasOwnProperty.call(externalValues, key)) {
            value = externalValues[key]
        } else if (externalValues) {
            value = getByPointer(externalValues, key)
        }
    } else {
        value = values[key]
    }

    return value === null || value === undefined ? "" : String(value)
}

function conditionMatches(
    key: string,
    expected: unknown,
    values: Record<string, unknown>,
    externalValues?: Record<string, unknown>,
): boolean {
    let pattern = String(expected)
    const negate = pattern.startsWith("!")
    if (negate)
        pattern = pattern.slice(1)

    const actual = conditionValue(key, values, externalValues)
    let match: boolean
    if (pattern === "true")
        match = actual === "1" || actual === "true"
    else if (pattern === "false")
        match = actual === "0" || actual === "false"
    else
        match = actual === pattern

    return negate ? !match : match
}

export function condProcess(
    modificator: unknown,
    values: Record<string, unknown>,
    externalValues?: Record<string, unknown>,
): number {
    if (!Array.isArray(modificator))
        return -1

    return modificator.findIndex((mod) => {
        if (!mod || !Array.isArray(mod.if) || !mod.if.length)
            return false
        return mod.if.every((clause: unknown) => {
            if (!clause || typeof clause !== "object")
                return false
            return Object.entries(clause as Record<string, unknown>).every(([key, expected]) =>
                conditionMatches(key, expected, values, externalValues),
            )
        })
    })
}

export function applyCueEnum(
    schema: ValidationSchema,
    enumValues: unknown[] | undefined,
): ValidationSchema {
    if (!enumValues)
        return schema
    if (schema.cue)
        return { ...schema, enum: enumValues }
    if (schema.items?.cue)
        return { ...schema, items: { ...schema.items, enum: enumValues } }
    return schema
}

function cueEnumFor(schema: ValidationSchema, ctx: ValidationContext): unknown[] | undefined {
    if (ctx.enumValues)
        return ctx.enumValues

    const cues = ctx.cueEnums
    if (!cues)
        return undefined

    const path = ctx.path ?? ""
    if (path && cues[path])
        return cues[path]

    const parts = path.split(".").filter(Boolean)
    // Для items путь выглядит как "field.0": имя поля — первый сегмент,
    // для секции — последний/предпоследний; проверяем все сегменты.
    for (const part of parts) {
        if (cues[part])
            return cues[part]
    }

    return undefined
}

/**
 * Полная подготовка поля к валидации:
 * 1. $ref (root/registry);
 * 2. modificator с учётом соседних values и externalValues;
 * 3. enum из @cue (если уже загружен).
 *
 * Исходная схема не мутируется.
 */
export function resolveSchema(
    schema: ValidationSchema,
    ctx: ValidationContext = {},
): ValidationSchema {
    const root = ctx.root ?? schema
    const values = ctx.values ?? {}
    let resolved: ValidationSchema

    const modificator = schema.modificator
    if (Array.isArray(modificator)) {
        const index = condProcess(modificator, values, ctx.externalValues)
        if (index >= 0 && modificator[index]?.then) {
            const then = modificator[index].then as ValidationSchema
            // $ref из then заменяет собственный $ref поля.
            const base = then.$ref ? omitRef(schema) : schema
            resolved = {
                ...resolveRef(base, root, ctx.registry),
                ...resolveRef(then, root, ctx.registry),
            }
        } else {
            resolved = resolveRef(schema, root, ctx.registry)
        }
    } else {
        resolved = resolveRef(schema, root, ctx.registry)
    }

    return applyCueEnum(resolved, cueEnumFor(resolved, ctx))
}
