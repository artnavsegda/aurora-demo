import { isEmpty, isPairSchema, normalizeValue } from "./normalize.ts"
import { resolveSchema } from "./resolve.ts"
import { messages } from "./messages.ts"
import type {
    FormValidationResult,
    ValidationContext,
    ValidationIssue,
    ValidationResult,
    ValidationSchema,
} from "./types.ts"

function joinPath(base: string, name: string | number): string {
    return base ? `${base}.${name}` : String(name)
}

function issue(
    path: string,
    code: ValidationIssue["code"],
    message: string,
    value?: unknown,
): ValidationIssue {
    return { path, code, message, value }
}

function requiredList(schema: ValidationSchema): string[] {
    return Array.isArray(schema.required) ? schema.required : []
}

function isRequired(schema: ValidationSchema, ctx: ValidationContext): boolean {
    return ctx.required === true ||
        schema.required === true
}

function checkEnum(
    schema: ValidationSchema,
    value: unknown,
    ctx: ValidationContext,
    path: string,
): ValidationIssue | undefined {
    const list = ctx.enumValues ?? schema.enum
    if (!Array.isArray(list))
        return undefined
    if (schema.strictEnum === false)
        return undefined

    const allowed = list.map((item) => String(item))
    if (schema.default !== undefined && !allowed.includes(String(schema.default)))
        allowed.push(String(schema.default))

    if (isPairSchema(schema)) {
        const text = String(value)
        if (allowed.some((item) => text.startsWith(item + "=")))
            return undefined
        return issue(path, "enum", messages.enum(value), value)
    }

    if (!allowed.includes(String(value)))
        return issue(path, "enum", messages.enum(value), value)
    return undefined
}

function checkPattern(
    schema: ValidationSchema,
    value: unknown,
    path: string,
): ValidationIssue | undefined {
    if (typeof schema.pattern !== "string")
        return undefined

    let regexp: RegExp
    try {
        regexp = new RegExp(schema.pattern)
    } catch (e) {
        return issue(path, "invalid-pattern", messages.invalidPattern, value)
    }

    let text = String(value)
    if (text.startsWith("!"))
        text = text.slice(1)

    if (!regexp.test(text)) {
        return issue(
            path,
            "pattern",
            messages.pattern(value, schema.patternDescription),
            value,
        )
    }
    return undefined
}

function validateArray(
    schema: ValidationSchema,
    value: unknown[],
    ctx: ValidationContext,
    path: string,
): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    if (schema.uniqueItems !== false) {
        const seen = new Set<string>()
        for (const item of value) {
            const key = String(item)
            if (seen.has(key)) {
                issues.push(issue(path, "duplicate", messages.duplicate(item), item))
                break
            }
            seen.add(key)
        }
    }

    if (schema.items) {
        for (const [index, item] of value.entries()) {
            const child = validateValue(schema.items, item, {
                ...ctx,
                required: false,
                path: joinPath(path, index),
            })
            issues.push(...child.issues)
        }
    }

    return issues
}

function validateObject(
    schema: ValidationSchema,
    value: Record<string, unknown>,
    ctx: ValidationContext,
    path: string,
): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    const required = requiredList(schema)

    for (const [name, childSchema] of Object.entries(schema.properties ?? {})) {
        const childPath = joinPath(path, name)
        const child = validateValue(childSchema, value[name], {
            ...ctx,
            required: required.includes(name),
            path: childPath,
        })
        issues.push(...child.issues)
    }

    return issues
}

/**
 * Проверяет одно значение. Схема должна быть уже эффективной:
 * $ref, modificator и enum из @cue должны быть подставлены вызывающим кодом.
 */
export function validateValue(
    schema: ValidationSchema,
    rawValue: unknown,
    ctx: ValidationContext = {},
): ValidationResult {
    const path = ctx.path ?? ""
    schema = resolveSchema(schema, ctx)

    if (ctx.skipHidden !== false && schema.hidden === true)
        return { valid: true, issues: [] }
    if (ctx.skipReadOnly !== false && schema.readOnly === true)
        return { valid: true, issues: [] }

    const value = normalizeValue(schema, rawValue)

    if (isEmpty(value)) {
        if (isRequired(schema, ctx))
            return { valid: false, issues: [issue(path, "required", messages.required)] }
        return { valid: true, issues: [] }
    }

    const issues: ValidationIssue[] = []
    const enumIssue = checkEnum(schema, value, ctx, path)
    if (enumIssue)
        issues.push(enumIssue)

    const type = schema.type

    if (type === "number" || type === "integer") {
        if (typeof value !== "number" || Number.isNaN(value)) {
            issues.push(issue(path, "type", messages.number, value))
        } else if (type === "integer" && !Number.isInteger(value)) {
            issues.push(issue(path, "type", messages.number, value))
        } else {
            if (schema.minimum !== undefined && value < schema.minimum)
                issues.push(issue(path, "minimum", messages.minimum(schema.minimum), value))
            if (schema.maximum !== undefined && value > schema.maximum)
                issues.push(issue(path, "maximum", messages.maximum(schema.maximum), value))
        }
    } else if (type === "boolean") {
        if (typeof value !== "boolean")
            issues.push(issue(path, "type", messages.boolean, value))
    } else if (type === "array") {
        if (!Array.isArray(value)) {
            issues.push(issue(path, "array", messages.array, value))
        } else {
            issues.push(...validateArray(schema, value, ctx, path))
        }
    } else if (schema.properties) {
        if (value && typeof value === "object" && !Array.isArray(value))
            issues.push(...validateObject(schema, value as Record<string, unknown>, ctx, path))
    } else {
        // string / password / text / pair и прикладные типы
        if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean")
            issues.push(issue(path, "type", messages.number, value))

        if (typeof value === "string") {
            const patternIssue = checkPattern(schema, value, path)
            if (patternIssue)
                issues.push(patternIssue)

            if (schema.minLength !== undefined && value.length < schema.minLength)
                issues.push(issue(path, "min-length", messages.minLength(schema.minLength), value))
            if (schema.maxLength !== undefined && value.length > schema.maxLength)
                issues.push(issue(path, "max-length", messages.maxLength(schema.maxLength), value))
        }
    }

    return { valid: issues.length === 0, issues }
}

/**
 * Проверяет форму/секцию по properties и required[].
 * Значения могут быть строками из DOM — нормализация внутри.
 */
export function validateForm(
    schema: ValidationSchema,
    values: Record<string, unknown>,
    ctx: ValidationContext = {},
): FormValidationResult {
    const root = ctx.root ?? schema
    const formSchema = resolveSchema(schema, { ...ctx, root, values })
    const issues = formSchema.properties
        ? validateObject(formSchema, values ?? {}, { ...ctx, root, values }, ctx.path ?? "")
        : validateValue(formSchema, values, { ...ctx, root }).issues

    const errors: Record<string, string> = {}
    for (const item of issues) {
        if (!errors[item.path])
            errors[item.path] = item.message
    }

    return { valid: issues.length === 0, issues, errors }
}

export { isEmpty, normalizeValue }
