export const messages = {
    required: "value required",
    number: "must be a number",
    boolean: "must be: true or false (1 or 0)",
    array: "must be an array",
    invalidPattern: "invalid validation rule",
    enum: (value: unknown) => `'${String(value)}' - invalid value`,
    pattern: (value: unknown, description?: string) =>
        description || `'${String(value)}' - not allowed value`,
    minimum: (value: number) => `minimum is ${value}`,
    maximum: (value: number) => `maximum is ${value}`,
    minLength: (value: number) => `minimum length is ${value}`,
    maxLength: (value: number) => `maximum length is ${value}`,
    duplicate: (value: unknown) => `${String(value)} duplicated`,
}
