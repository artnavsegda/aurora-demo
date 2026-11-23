import { HOSTNAME, MODEL, fixture } from './fixtures.mjs'

const BOOT = Date.now() - (3 * 86400 + 4 * 3600 + 12 * 60) * 1000

function pad(n) {
    return String(n).padStart(2, '0')
}

function uptime() {
    const sec = Math.max(0, Math.floor((Date.now() - BOOT) / 1000))
    const days = Math.floor(sec / 86400)
    const rest = sec % 86400
    return `${days}d ${pad(Math.floor(rest / 3600))}:${pad(Math.floor((rest % 3600) / 60))}:${pad(rest % 60)}`
}

function deviceTime() {
    const d = new Date()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
        `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function wave(period, min, max, phase = 0) {
    const t = Date.now() / 1000
    const k = (Math.sin((t / period) * Math.PI * 2 + phase) + 1) / 2
    return Math.round(min + k * (max - min))
}

export function dashboard() {
    const ramTotal = 512
    const ramUsed = wave(90, 180, 260, 1.3)
    const cpuLoad = wave(37, 3, 28, 0.4)
    const storageUsed = 42.1

    return [
        {
            label: 'device',
            items: [
                {
                    label: 'board',
                    items: [
                        { label: 'serial', value: fixture.serial || 'RAD-DEMO-0001' },
                        { label: 'model', value: MODEL },
                        { label: 'cpu', value: 'IPQ4019' },
                        { label: 'linux', value: '6.6.93' },
                    ],
                },
                {
                    label: 'info',
                    items: [
                        { label: 'firmware', value: '1.2.0-demo' },
                        { label: 'hostname', value: HOSTNAME },
                        { label: 'device-time', value: deviceTime() },
                        { label: 'timezone', value: '+0300' },
                        { label: 'uptime', value: uptime() },
                    ],
                },
            ],
        },
        {
            label: 'hardware',
            items: [
                {
                    label: 'Storage',
                    type: 'h-bar',
                    total: '128.00',
                    unit: 'MB',
                    items: [
                        { label: 'used', value: storageUsed.toFixed(2) },
                        { label: 'free', value: (128 - storageUsed).toFixed(2) },
                    ],
                },
                {
                    label: 'RAM',
                    type: 'h-bar',
                    total: ramTotal,
                    unit: 'MB',
                    items: [
                        { label: 'used', value: ramUsed },
                        { label: 'free', value: ramTotal - ramUsed },
                    ],
                },
                {
                    label: 'CPU',
                    type: 'h-bar',
                    total: 100,
                    unit: '%',
                    items: [
                        { label: 'load', value: cpuLoad },
                        { label: 'idle', value: 100 - cpuLoad },
                    ],
                },
            ],
        },
        {
            label: 'mobile',
            items: [
                {
                    label: 'modem1',
                    items: [
                        { label: 'operator', value: 'Demo Mobile' },
                        { label: 'state', value: 'connected' },
                        { label: 'signal', value: `${wave(53, 18, 24)} dBm` },
                        { label: 'network', value: 'LTE' },
                    ],
                },
            ],
        },
    ]
}

export function board() {
    return {
        model: MODEL,
        serial: fixture.serial || 'RAD-DEMO-0001',
        hostname: HOSTNAME,
        firmware: '1.2.0-demo',
        uptime: uptime(),
    }
}
