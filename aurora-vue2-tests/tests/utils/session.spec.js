import {
    DEFAULT_SESSION_TIMEOUT, idleBusy, idleWatchStart, idleWatchStop, isSessionError,
} from '@/utils/session'

describe('utils/session', () => {
    afterEach(() => {
        idleWatchStop()
        jest.useRealTimers()
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
        jest.useFakeTimers()
        jest.setSystemTime(0)
        const expired = jest.fn()

        idleWatchStart(1, expired)
        jest.advanceTimersByTime(9999)
        expect(expired).not.toHaveBeenCalled()

        jest.advanceTimersByTime(1)
        expect(expired).toHaveBeenCalledTimes(1)
    })

    test('активность пользователя продлевает сессию', () => {
        jest.useFakeTimers()
        jest.setSystemTime(0)
        const expired = jest.fn()

        idleWatchStart(1, expired)
        jest.advanceTimersByTime(9500)
        document.dispatchEvent(new Event('keydown'))

        // проверка на 10-й секунде: после keydown прошло 500 мс — ещё живы
        jest.advanceTimersByTime(500)
        expect(expired).not.toHaveBeenCalled()

        // следующая проверка через 10 с: бездействие уже больше секунды
        jest.advanceTimersByTime(10000)
        expect(expired).toHaveBeenCalledTimes(1)
    })

    test('idleBusy не даёт истечь во время стрима', () => {
        jest.useFakeTimers()
        jest.setSystemTime(0)
        const expired = jest.fn()

        idleWatchStart(1, expired)
        idleBusy(1)
        jest.advanceTimersByTime(30000)
        expect(expired).not.toHaveBeenCalled()

        idleBusy(-1)
        jest.advanceTimersByTime(10000)
        expect(expired).toHaveBeenCalledTimes(1)
    })

    test('повторный старт сбрасывает предыдущий таймер', () => {
        jest.useFakeTimers()
        jest.setSystemTime(0)
        const first = jest.fn()
        const second = jest.fn()

        idleWatchStart(1, first)
        jest.advanceTimersByTime(5000)
        idleWatchStart(1, second)

        jest.advanceTimersByTime(10000)
        expect(first).not.toHaveBeenCalled()
        expect(second).toHaveBeenCalledTimes(1)
    })

    test('idleWatchStop снимает таймер и слушателей', () => {
        jest.useFakeTimers()
        jest.setSystemTime(0)
        const expired = jest.fn()

        idleWatchStart(1, expired)
        idleWatchStop()
        jest.advanceTimersByTime(60000)
        expect(expired).not.toHaveBeenCalled()

        // событие после stop не должно падать
        document.dispatchEvent(new Event('mousedown'))
    })
})
