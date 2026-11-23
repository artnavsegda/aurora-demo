import type { ValidationSchema } from "./types.ts"

export function isEmpty(value: unknown): boolean {
    if (value === undefined || value === null || value === "")
        return true
    if (Array.isArray(value) && value.length === 0)
        return true
    return false
}

export function isPairSchema(schema: ValidationSchema): boolean {
    return schema.type === "pair" || schema.items?.type === "pair"
}

export function normalizeValue(schema: ValidationSchema, value: unknown): unknown {
    if (value === undefined || value === null || value === "")
        return value

    switch (schema.type) {
    case "number":
    case "integer": {
        if (typeof value === "number")
            return value
        const raw = String(value).trim()
        if (raw === "")
            return value
        const number = Number(raw)
        return Number.isFinite(number) ? number : value
    }
    case "boolean": {
        if (value === true || value === false)
            return value
        if (value === 1 || value === "1" || value === "true")
            return true
        if (value === 0 || value === "0" || value === "false")
            return false
        return value
    }
    case "string":
    case "password":
    case "text":
        return typeof value === "string" ? value : String(value)
    default:
        return value
    }
}
