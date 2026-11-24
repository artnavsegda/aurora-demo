import { HOSTNAME, MODEL, dashboardFixture, fixture } from './fixtures.mjs'

function pad(n) {
    return String(n).padStart(2, '0')
}

function formatUptime(sec) {
    const days = Math.floor(sec / 86400)
    const rest = sec % 86400
    const time = `${pad(Math.floor(rest / 3600))}:${pad(Math.floor((rest % 3600) / 60))}:${pad(rest % 60)}`
    return days > 0 ? `${days}d ${time}` : time
}

function deviceTime() {
    const d = new Date()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
        `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function section(sections, label) {
    return sections.find((s) => s && s.label === label)
}

function subsection(sections, label, name) {
    const root = section(sections, label)
    return root && Array.isArray(root.items)
        ? root.items.find((i) => i && (i.label === name || i.name === name))
        : undefined
}

function setValue(parent, label, value) {
    if (!parent || !Array.isArray(parent.items))
        return
    const item = parent.items.find((i) => i && i.label === label)
    if (item)
        item.value = value
}

// uptime берём из снятой сводки, чтобы после старта контейнера он продолжал идти
function capturedUptimeSeconds(sections) {
    const info = subsection(sections, 'device', 'info')
    const item = info && info.items.find((i) => i.label === 'uptime')
    const m = String(item && item.value || '').match(/^(?:(\d+)d\s+)?(\d+):(\d+):(\d+)$/)
    if (!m)
        return 0
    return Number(m[1] || 0) * 86400 + Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4])
}

const BOOT = Date.now() - capturedUptimeSeconds(dashboardFixture) * 1000

export function dashboard() {
    const sections = structuredClone(dashboardFixture)
    if (!Array.isArray(sections) || sections.length === 0)
        return []

    const info = subsection(sections, 'device', 'info')
    if (info) {
        setValue(info, 'hostname', HOSTNAME)
        setValue(info, 'device-time', deviceTime())
        setValue(info, 'uptime', formatUptime(Math.max(0, Math.floor((Date.now() - BOOT) / 1000))))
    }

    const board = subsection(sections, 'device', 'board')
    if (board) {
        setValue(board, 'model', MODEL)
        setValue(board, 'serial', fixture.serial || 'DONYX-DEMO-0001')
    }

    return sections
}

export function board() {
    return {
        model: MODEL,
        serial: fixture.serial || 'DONYX-DEMO-0001',
        hostname: HOSTNAME,
        firmware: '0.1.905-devel',
        uptime: formatUptime(Math.max(0, Math.floor((Date.now() - BOOT) / 1000))),
    }
}
