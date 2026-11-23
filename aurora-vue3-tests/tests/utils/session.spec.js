import {
    DEFAULT_SESSION_TIMEOUT, idleBusy, idleWatchStart, idleWatchStop, isSessionError,
} from '@/utils/session'

import { vi } from 'vitest'

describe('utils/session', () => {
    afterEach(() => {
        idleWatchStop()
        vi.useRealTimers()
    })

    test('isSessionError: только 401/403 от /script/*, кроме auth/logout', () => {
        const err = (status, url) => ({ response: { status }, config: { url } })

        expect(DEFAULT_SESSION_TIMEOUT).toBe(360)
        expect(isSessionError(err(401, '/script/wrapper?@get'))).toBe(true)
        expect(isSessionError(err(403, '/script/dashboard'))).toBe(true)

        expect(isSessionError(err(404, '/script/wrapper'))).toBe(false)
        expect(isSessionError(err(401, '/script/auth'))).toBe(false)
        expect(isSessionError(err(401, '/script/logout'))).toBe(false)
        expect(isSessionError(err(401, '/other'))).toBe(false)
        expect(isSessionError(undefined)).toBe(false)
    })

    test('истечение по бездействию', () => {
        vi.useFakeTimers()
        vi.setSystemTime(0)
        const expired = vi.fn()

        idleWatchStart(1, expired)
        // Vue3: период проверки — четверть таймаута (250 мс для 1 с)
        vi.advanceTimersByTime(249)
        expect(expired).not.toHaveBeenCalled()

        vi.advanceTimersByTime(751)
        expect(expired).toHaveBeenCalledTimes(1)
    })

    test('активность пользователя продлевает сессию', () => {
        vi.useFakeTimers()
        vi.setSystemTime(0)
        const expired = vi.fn()

        idleWatchStart(1, expired)
        vi.advanceTimersByTime(200)
        document.dispatchEvent(new Event('keydown'))

        // проверки каждые 250 мс: на 1000 мс бездействие ещё 800 мс
        vi.advanceTimersByTime(800)
        expect(expired).not.toHaveBeenCalled()

        vi.advanceTimersByTime(250)
        expect(expired).toHaveBeenCalledTimes(1)
    })

    test('idleBusy не даёт истечь во время стрима', () => {
        vi.useFakeTimers()
        vi.setSystemTime(0)
        const expired = vi.fn()

        idleWatchStart(1, expired)
        idleBusy(1)
        vi.advanceTimersByTime(30000)
        expect(expired).not.toHaveBeenCalled()

        idleBusy(-1)
        vi.advanceTimersByTime(1250)
        expect(expired).toHaveBeenCalledTimes(1)
    })

    test('повторный старт сбрасывает предыдущий таймер', () => {
        vi.useFakeTimers()
        vi.setSystemTime(0)
        const first = vi.fn()
        const second = vi.fn()

        idleWatchStart(1, first)
        vi.advanceTimersByTime(200)
        idleWatchStart(1, second)

        vi.advanceTimersByTime(1050)
        expect(first).not.toHaveBeenCalled()
        expect(second).toHaveBeenCalledTimes(1)
    })

    test('idleWatchStop снимает таймер и слушателей', () => {
        vi.useFakeTimers()
        vi.setSystemTime(0)
        const expired = vi.fn()

        idleWatchStart(1, expired)
        idleWatchStop()
        vi.advanceTimersByTime(60000)
        expect(expired).not.toHaveBeenCalled()

        // событие после stop не должно падать
        document.dispatchEvent(new Event('mousedown'))
    })
})
