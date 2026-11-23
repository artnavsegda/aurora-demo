import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { loadDocs, effectiveSchema } from "../scripts/check-schemas.mjs"
import { validateForm, validateValue } from "../shared/validation/index.ts"

const docs = loadDocs()
const ACTION_KEYS = ["actions", "add", "apply", "delete", "clean", "status", "reorder"]

function* walk(node, ctx = {}) {
    if (!node || typeof node !== "object" || Array.isArray(node))
        return
    yield { node, ...ctx }

    if (node.properties) {
        for (const [name, child] of Object.entries(node.properties))
            yield* walk(child, { ...ctx, location: `${ctx.location}/properties/${name}` })
    }
    if (node.definitions) {
        for (const [name, child] of Object.entries(node.definitions))
            yield* walk(child, { ...ctx, location: `${ctx.location}/definitions/${name}` })
    }
    if (node.patternProperties) {
        for (const [pattern, child] of Object.entries(node.patternProperties)) {
            if (pattern === "actions")
                continue
            yield* walk(child, { ...ctx, location: `${ctx.location}/patternProperties/${pattern}` })
        }
        for (const [name, action] of Object.entries(node.patternProperties.actions || {})) {
            if (action?.schema)
                yield* walk(action.schema, { ...ctx, location: `${ctx.location}/patternProperties/actions/${name}/schema` })
        }
    }
    if (node.items)
        yield* walk(node.items, { ...ctx, location: `${ctx.location}/items` })
    if (Array.isArray(node.modificator)) {
        for (const [idx, mod] of node.modificator.entries()) {
            if (mod?.then)
                yield* walk(mod.then, { ...ctx, location: `${ctx.location}/modificator/${idx}/then` })
        }
    }
    for (const key of ACTION_KEYS) {
        const action = node[key]
        if (!action)
            continue
        for (const [name, act] of key === "actions" ? Object.entries(action) : [[key, action]]) {
            if (act?.schema)
                yield* walk(act.schema, { ...ctx, location: `${ctx.location}/${key}/${name}/schema` })
        }
    }
}

function allNodes() {
    const out = []
    for (const [docPath, doc] of docs)
        out.push(...walk(doc, { docPath, location: "#" }))
    return out
}

describe("shared/validation", () => {
    test("required: пусто/0/false", () => {
        const schema = { type: "string" }
        assert.equal(validateValue(schema, undefined, { required: true }).valid, false)
        assert.equal(validateValue(schema, "", { required: true }).valid, false)
        assert.equal(validateValue(schema, "x", { required: true }).valid, true)
        assert.equal(validateValue({ type: "number" }, 0, { required: true }).valid, true)
        assert.equal(validateValue({ type: "boolean" }, false, { required: true }).valid, true)
    })

    test("number/integer и границы", () => {
        assert.deepEqual(validateValue({ type: "number", minimum: 10, maximum: 20 }, "5").issues.map((i) => i.code), ["minimum"])
        assert.equal(validateValue({ type: "number", minimum: 10, maximum: 20 }, "15").valid, true)
        assert.equal(validateValue({ type: "integer" }, "1.5").valid, false)
        assert.equal(validateValue({ type: "integer" }, "1.5").issues[0].message, "must be a number")
    })

    test("pattern, invert и битый regexp", () => {
        assert.equal(validateValue({ type: "string", pattern: "^[a-z]+$" }, "hello").valid, true)
        assert.equal(validateValue({ type: "string", pattern: "^[a-z]+$" }, "123").valid, false)
        assert.equal(validateValue({ type: "string", pattern: "^[a-z]+$" }, "!123").valid, false)
        assert.equal(validateValue({ type: "string", pattern: "^[a-z]+$" }, "!hello").valid, true)
        assert.equal(validateValue({ type: "string", pattern: "[" }, "x").issues[0].code, "invalid-pattern")
    })

    test("enum strict/loose/default", () => {
        assert.equal(validateValue({ type: "string", enum: ["a", "b"] }, "c").valid, false)
        assert.equal(validateValue({ type: "string", enum: ["a", "b"] }, "a").valid, true)
        assert.equal(validateValue({ type: "string", enum: ["a"], strictEnum: false }, "c").valid, true)
        assert.equal(validateValue({ type: "string", enum: ["a"], default: "d" }, "d").valid, true)
        assert.equal(validateValue({ type: "pair", enum: ["a"] }, "a=1").valid, true)
        assert.equal(validateValue({ type: "pair", enum: ["a"] }, "b=1").valid, false)
    })

    test("length", () => {
        assert.equal(validateValue({ type: "string", minLength: 3 }, "ab").valid, false)
        assert.equal(validateValue({ type: "string", maxLength: 3 }, "abcd").valid, false)
        assert.equal(validateValue({ type: "string", minLength: 3, maxLength: 3 }, "abc").valid, true)
    })

    test("boolean", () => {
        assert.equal(validateValue({ type: "boolean" }, "1").valid, true)
        assert.equal(validateValue({ type: "boolean" }, "false").valid, true)
        assert.equal(validateValue({ type: "boolean" }, "yes").valid, false)
    })

    test("array: items, unique и pair", () => {
        assert.equal(validateValue({ type: "array", items: { type: "string", pattern: "^[a-z]+$" } }, ["a", "b"]).valid, true)
        assert.equal(validateValue({ type: "array", items: { type: "string", pattern: "^[a-z]+$" } }, ["a", "1"]).valid, false)
        assert.equal(validateValue({ type: "array", items: { type: "string" } }, ["a", "a"]).valid, false)
        assert.equal(validateValue({
            type: "array",
            uniqueItems: false,
            items: { type: "string" },
        }, ["a", "a"]).valid, true)
        assert.equal(validateValue({
            type: "array",
            items: { type: "pair", enum: ["key"], pattern: "^key=.+$" },
        }, ["key=value"]).valid, true)
    })

    test("form: required[] и вложенные пути", () => {
        const schema = {
            type: "object",
            required: ["name", "port"],
            properties: {
                name: { type: "string" },
                port: { type: "number", minimum: 1 },
                extra: { type: "string" },
            },
        }
        const result = validateForm(schema, { port: "0" }, { path: "bridge0" })
        assert.equal(result.valid, false)
        assert.deepEqual(result.issues.map((i) => `${i.path}:${i.code}`).sort(), [
            "bridge0.name:required",
            "bridge0.port:minimum",
        ])
    })

    test("hidden/readOnly по умолчанию не валидируются", () => {
        assert.equal(validateValue({ type: "string", hidden: true }, "", { required: true }).valid, true)
        assert.equal(validateValue({ type: "string", readOnly: true }, "", { required: true }).valid, true)
        assert.equal(validateValue({ type: "string", readOnly: true }, "", {
            required: true,
            skipReadOnly: false,
        }).valid, false)
    })

    test("все реальные схемы: validator не бросает на произвольных значениях", () => {
        for (const { node, docPath, location } of allNodes()) {
            const schema = effectiveSchema(node, docPath, docs)
            const values = [
                undefined, null, "", 0, false, "x", "1", "1.5",
                ...(schema.patternExample || []),
                ...(schema.enum || []),
            ]
            for (const value of values) {
                assert.doesNotThrow(
                    () => validateValue(schema, value),
                    `${docPath}${location}: ${JSON.stringify(value)}`,
                )
            }
        }
        for (const [docPath, doc] of docs) {
            assert.doesNotThrow(() => validateForm(doc, {}), docPath)
        }
    })

    test("реальные схемы: валидатор не падает на примерах и enum", () => {
        const problems = []
        for (const { node, docPath, location } of allNodes()) {
            const schema = effectiveSchema(node, docPath, docs)
            for (const example of schema.patternExample || []) {
                const result = validateValue(schema, example)
                if (!result.valid)
                    problems.push(`${docPath}${location}: patternExample ${JSON.stringify(example)}`)
            }
        }
        // Это известные ошибки в самих схемах (см. e2e/SCHEMA-ISSUES.md).
        assert.deepEqual(problems.sort(), [
            "/ip/nhrp#/patternProperties/.*/properties/map/items: patternExample \"10.0.1.101@133.94.75.36.14\"",
            "/service/dhcp/server#/patternProperties/.*/properties/option/items: patternExample \"bootfile=image.bin\"",
            "/service/openvpn-server#/properties/push/items: patternExample \"route-gateway=192.168.1.1\"",
        ])
    })
})
