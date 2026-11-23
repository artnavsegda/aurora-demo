// Чистая валидация схем Aurora/Halo. Без Svelte, DOM и Node-зависимостей:
// модуль можно использовать в браузере, Halo и демо-бэкенде.

export type ValidationCode =
    | "required"
    | "type"
    | "enum"
    | "pattern"
    | "invalid-pattern"
    | "minimum"
    | "maximum"
    | "min-length"
    | "max-length"
    | "duplicate"
    | "array"

export interface ValidationIssue {
    path: string
    code: ValidationCode
    message: string
    value?: unknown
}

export interface ValidationResult {
    valid: boolean
    issues: ValidationIssue[]
}

export interface FormValidationResult extends ValidationResult {
    errors: Record<string, string>
}

/**
 * Схема в том виде, в котором её отдаёт Aurora/Halo.
 * Валидатор не резолвит $ref и modificator — вызывающий код передаёт
 * уже эффективную схему (после refResolver/applyModificator/cue).
 */
export interface ValidationSchema {
    type?: string
    title?: string
    description?: string
    default?: unknown
    enum?: unknown[]
    strictEnum?: boolean
    pattern?: string
    patternDescription?: string
    patternExample?: unknown[]
    minLength?: number
    maxLength?: number
    minimum?: number
    maximum?: number
    required?: boolean | string[]
    items?: ValidationSchema
    properties?: Record<string, ValidationSchema>
    hidden?: boolean
    readOnly?: boolean
    uniqueItems?: boolean
    [key: string]: unknown
}

export interface ValidationContext {
    /** Обязательность поля из required[] секции/действия. */
    required?: boolean
    /** Значения соседних полей — для modificator и будущих зависимостей. */
    values?: Record<string, unknown>
    /** Корень документа для локальных $ref (#/definitions/...). */
    root?: ValidationSchema
    /** Реестр внешних схем: { "/defaults": schema, "/ip/interface": schema }. */
    registry?: Record<string, ValidationSchema>
    /** Значения внешних условий: { "/defaults/ipsec_installed": "true" }. */
    externalValues?: Record<string, unknown>
    /** Уже загруженный enum из @cue: { "interface": [...], "bridge0.interface": [...] }. */
    cueEnums?: Record<string, unknown[]>
    /** Подставленный enum из @cue для одного значения. */
    enumValues?: unknown[]
    /** Не проверять скрытые поля (по умолчанию true). */
    skipHidden?: boolean
    /** Не проверять readOnly-поля (по умолчанию true). */
    skipReadOnly?: boolean
    /** Путь для вложенных ошибок. */
    path?: string
}
