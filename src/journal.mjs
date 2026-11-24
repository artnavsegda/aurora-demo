import { Readable } from 'node:stream'
import { HOSTNAME } from './fixtures.mjs'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function stamp(date = new Date()) {
    const d = date
    return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, ' ')} ` +
        `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:` +
        `${String(d.getSeconds()).padStart(2, '0')}`
}

const TEMPLATES = [
    (n) => `daemon.info dnsmasq[${1200 + (n % 30)}]: DHCPACK(bridge0) 192.168.3.${20 + (n % 80)} 02:00:00:00:aa:${(n % 255).toString(16).padStart(2, '0')} phone-${n % 7}`,
    () => `daemon.notice netifd: Interface 'wan' is now up`,
    () => `daemon.notice netifd: Interface 'wan' is now down`,
    (n) => `user.info horizon: /ip/interface: apply by demo (${n})`,
    (n) => `daemon.info modem1: signal quality ${18 + (n % 8)} dBm, LTE band b${[3, 7, 20][n % 3]}`,
    (n) => `kern.warn kernel: [${12000 + n}.${100 + (n % 800)}] nf_conntrack: table full, dropping packet`,
    (n) => `daemon.info hostapd: wifi1: STA 02:00:00:00:${(n % 255).toString(16).padStart(2, '0')}:11 IEEE 802.11: authenticated`,
    (n) => `daemon.info dnsmasq[${1200 + (n % 30)}]: reply 192.168.3.1 is 8.8.8.8`,
    () => `user.notice root: ntp: sync with 0.openwrt.pool.ntp.org`,
    (n) => `daemon.info firewall: rule 'allow-dhcp' matched udp 0.0.0.0:68 -> 255.255.255.255:67 (${n})`,
    (n) => `user.info horizon: dashboard: refresh (${n})`,
    (n) => `daemon.info wwan: modem1: PDP context activated, address 10.${n % 255}.${(n * 7) % 255}.${(n * 13) % 255}`,
]

let counter = 0

export function nextLine(date = new Date()) {
    const n = counter++
    const text = TEMPLATES[n % TEMPLATES.length](n)
    return `${stamp(date)} ${HOSTNAME} ${text}`
}

export function history(count) {
    const out = []
    const now = Date.now()
    for (let i = count - 1; i >= 0; i--)
        out.push(nextLine(new Date(now - i * 1000)))
    return out
}

export function journalStream(reply, last) {
    const stream = new Readable({
        read() {},
    })

    if (last > 0) {
        for (const line of history(Math.min(last, 200)))
            stream.push(line + '\n')
    }

    const timer = setInterval(() => {
        stream.push(nextLine() + '\n')
    }, 1000)
    timer.unref?.()

    const stop = () => {
        clearInterval(timer)
        stream.push(null)
    }
    // request.raw 'close' срабатывает сразу после чтения тела запроса,
    // а не при отключении клиента: журнал закрывался через 1 мс
    reply.raw.on('close', stop)
    stream.on('close', stop)
    stream.on('error', stop)

    // страховка: один стрим не живёт дольше 30 минут
    const limit = setTimeout(stop, 30 * 60 * 1000)
    limit.unref?.()
    stream.on('close', () => clearTimeout(limit))

    return stream
}
