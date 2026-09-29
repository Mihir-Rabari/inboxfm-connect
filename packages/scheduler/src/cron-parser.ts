import { NextTickOptions, ParsedCronField, ParsedCronSchedule } from './types'

const MONTH_NAMES: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
}

const DAY_NAMES: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
}

function parseSingleValue({ valStr, min, max, names }: ParseValueParams): number {
    const lower = valStr.toLowerCase()
    if (names && names[lower] !== undefined) {
        return names[lower]
    }
    const num = parseInt(valStr, 10)
    if (!/^\d+$/.test(valStr) || !Number.isFinite(num)) {
        throw new Error(`Invalid value "${valStr}", expected number between ${min} and ${max}`)
    }
    if (num < min || num > max) {
        throw new Error(`Value ${num} out of bounds (${min}-${max})`)
    }
    return num
}

function parseField({ rawField, min, max, names, isDayOfWeek = false }: ParseFieldParams): ParsedCronField {
    const field = rawField.trim()
    if (field === '') {
        throw new Error('Empty cron field')
    }

    if (field === '*') {
        const values = new Set<number>()
        for (let i = min; i <= max; i++) {
            values.add(i)
        }
        if (isDayOfWeek && values.has(7)) {
            values.add(0)
        }
        return { values, wildcard: true }
    }

    const values = new Set<number>()
    const parts = field.split(',')

    for (const part of parts) {
        if (part === '') {
            throw new Error(`Invalid empty element in cron field: "${field}"`)
        }

        // Check for step: e.g. */5 or 1-10/2 or 0/15
        const stepMatch = part.match(/^([^-/]+)(?:-([^-/]+))?\/(\d+)$/)
        if (stepMatch) {
            const rangeStartRaw = stepMatch[1]
            const rangeEndRaw = stepMatch[2]
            const step = parseInt(stepMatch[3], 10)
            if (isNaN(step) || step <= 0) {
                throw new Error(`Invalid step "${stepMatch[3]}" in cron field: "${field}"`)
            }

            let start: number
            let end: number

            if (rangeStartRaw === '*') {
                start = min
                end = max
            }
            else {
                start = parseSingleValue({ valStr: rangeStartRaw, min, max, names })
                end = rangeEndRaw !== undefined ? parseSingleValue({ valStr: rangeEndRaw, min, max, names }) : max
            }

            if (start > end) {
                throw new Error(`Invalid range "${rangeStartRaw}-${rangeEndRaw}" in cron field: "${field}"`)
            }

            for (let i = start; i <= end; i += step) {
                const val = isDayOfWeek && i === 7 ? 0 : i
                values.add(val)
            }
            continue
        }

        // Check for range: e.g. 1-5 or MON-FRI
        const rangeMatch = part.match(/^([^-]+)-([^-]+)$/)
        if (rangeMatch) {
            const start = parseSingleValue({ valStr: rangeMatch[1], min, max, names })
            const end = parseSingleValue({ valStr: rangeMatch[2], min, max, names })
            if (start > end) {
                throw new Error(`Invalid range "${rangeMatch[1]}-${rangeMatch[2]}" in cron field: "${field}"`)
            }
            for (let i = start; i <= end; i++) {
                const val = isDayOfWeek && i === 7 ? 0 : i
                values.add(val)
            }
            continue
        }

        // Single value or wildcard
        if (part === '*') {
            for (let i = min; i <= max; i++) {
                values.add(i)
            }
            if (isDayOfWeek && values.has(7)) {
                values.add(0)
            }
            continue
        }

        const val = parseSingleValue({ valStr: part, min, max, names })
        values.add(isDayOfWeek && val === 7 ? 0 : val)
    }

    if (isDayOfWeek) {
        if (values.has(7)) {
            values.add(0)
        }
        if (values.has(0)) {
            values.add(7)
        }
    }

    return { values, wildcard: false }
}

function parseCronExpression(expression: string): ParsedCronSchedule {
    if (typeof expression !== 'string') {
        throw new TypeError('Cron expression must be a string')
    }

    const trimmed = expression.trim()
    const fields = trimmed.split(/\s+/)

    if (fields.length !== 5 && fields.length !== 6) {
        throw new Error(`Invalid cron expression "${expression}": expected 5 or 6 fields, got ${fields.length}`)
    }

    const hasSeconds = fields.length === 6
    const secStr = hasSeconds ? fields[0] : '0'
    const minStr = hasSeconds ? fields[1] : fields[0]
    const hourStr = hasSeconds ? fields[2] : fields[1]
    const domStr = hasSeconds ? fields[3] : fields[2]
    const monStr = hasSeconds ? fields[4] : fields[3]
    const dowStr = hasSeconds ? fields[5] : fields[4]

    return {
        seconds: parseField({ rawField: secStr, min: 0, max: 59 }),
        minutes: parseField({ rawField: minStr, min: 0, max: 59 }),
        hours: parseField({ rawField: hourStr, min: 0, max: 23 }),
        daysOfMonth: parseField({ rawField: domStr, min: 1, max: 31 }),
        months: parseField({ rawField: monStr, min: 1, max: 12, names: MONTH_NAMES }),
        daysOfWeek: parseField({ rawField: dowStr, min: 0, max: 7, names: DAY_NAMES, isDayOfWeek: true }),
        originalExpression: expression,
        hasSeconds,
    }
}

// Issue #389: per-field bounds are not enough to prove a schedule can ever
// fire — a dom/month combo that never denotes a real date (e.g. `0 0 31 2 *`)
// parses in-bounds but produces no tick. The tick search that proves it is
// expensive (it scans the whole window and throws only after MAX_ITERATIONS),
// so prove fireability directly from the parsed fields instead of running it.
// The day-match rule is the exact OR/dom-only/dow-only branching `computeNextTick`
// uses (line 264-276): a restricted dom AND dow pair is OR'd, so `0 0 31 2 MON`
// fires on February Mondays (review #391).
function dayMatches({ dom, dow, day, weekday }: DayMatchParams): boolean {
    if (dom.wildcard && dow.wildcard) return true
    if (!dom.wildcard && !dow.wildcard) {
        return dom.values.has(day) || dow.values.has(weekday)
    }
    if (!dom.wildcard) return dom.values.has(day)
    return dow.values.has(weekday)
}

// Reference year for weekday lookup — any fixed year is a valid fireability
// probe: if dom/dow matches some day in that year's month, `computeNextTick`
// finds a tick within the window; using one year avoids per-call Intl costs.
const REFERENCE_YEAR = 2000

function scheduleIsFireable(parsed: ParsedCronSchedule): boolean {
    const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    for (const month of parsed.months.values) {
        const maxDay = DAYS_IN_MONTH[month - 1]
        for (let day = 1; day <= maxDay; day++) {
            const weekday = new Date(Date.UTC(REFERENCE_YEAR, month - 1, day)).getUTCDay()
            if (dayMatches({ dom: parsed.daysOfMonth, dow: parsed.daysOfWeek, day, weekday })) {
                return true
            }
        }
    }
    return false
}

function validateCronExpression(expression: string): boolean {
    try {
        const parsed = parseCronExpression(expression)
        return scheduleIsFireable(parsed)
    }
    catch {
        return false
    }
}

function computeNextTick({ cronExpression, timezone = 'UTC', fromDate = new Date() }: NextTickOptions & { cronExpression: string }): Date {
    const parsed = parseCronExpression(cronExpression)

    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        weekday: 'short',
        hourCycle: 'h23',
    })

    function getParts(d: Date) {
        const parts = dtf.formatToParts(d)
        let year = 0
        let month = 0
        let day = 0
        let hour = 0
        let minute = 0
        let second = 0
        let weekday = 0
        for (const p of parts) {
            switch (p.type) {
                case 'year':
                    year = parseInt(p.value, 10)
                    break
                case 'month':
                    month = parseInt(p.value, 10)
                    break
                case 'day':
                    day = parseInt(p.value, 10)
                    break
                case 'hour':
                    hour = parseInt(p.value, 10) % 24
                    break
                case 'minute':
                    minute = parseInt(p.value, 10)
                    break
                case 'second':
                    second = parseInt(p.value, 10)
                    break
                case 'weekday': {
                    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
                    weekday = days.indexOf(p.value)
                    if (weekday === -1) {
                        weekday = 0
                    }
                    break
                }
            }
        }
        return { year, month, day, hour, minute, second, weekday }
    }

    let t = fromDate.getTime()
    if (parsed.hasSeconds) {
        t = Math.floor(t / 1000) * 1000 + 1000
    }
    else {
        t = (Math.floor(t / 60000) + 1) * 60000
    }

    let current = new Date(t)
    const MAX_ITERATIONS = 50000
    let iterations = 0

    while (iterations++ < MAX_ITERATIONS) {
        const p = getParts(current)

        // 1. Month check
        if (!parsed.months.values.has(p.month)) {
            current = advanceToNextLocalDay({ current, getParts })
            continue
        }

        // 2. Day of Month & Day of Week check
        let dayMatches: boolean
        if (parsed.daysOfMonth.wildcard && parsed.daysOfWeek.wildcard) {
            dayMatches = true
        }
        else if (!parsed.daysOfMonth.wildcard && !parsed.daysOfWeek.wildcard) {
            dayMatches = parsed.daysOfMonth.values.has(p.day) || parsed.daysOfWeek.values.has(p.weekday)
        }
        else if (!parsed.daysOfMonth.wildcard) {
            dayMatches = parsed.daysOfMonth.values.has(p.day)
        }
        else {
            dayMatches = parsed.daysOfWeek.values.has(p.weekday)
        }

        if (!dayMatches) {
            current = advanceToNextLocalDay({ current, getParts })
            continue
        }

        // 3. Hour check
        if (!parsed.hours.values.has(p.hour)) {
            const msToNextHour = Math.max(60000, ((60 - p.minute) * 60 - p.second) * 1000)
            current = new Date(current.getTime() + msToNextHour)
            continue
        }

        // 4. Minute check
        if (!parsed.minutes.values.has(p.minute)) {
            const msToNextMinute = Math.max(1000, (60 - p.second) * 1000)
            current = new Date(current.getTime() + msToNextMinute)
            continue
        }

        // 5. Second check (if 6 fields)
        if (parsed.hasSeconds && !parsed.seconds.values.has(p.second)) {
            current = new Date(current.getTime() + 1000)
            continue
        }

        return current
    }

    throw new Error(`Unable to compute next tick for cron expression "${cronExpression}" within search window`)
}

function advanceToNextLocalDay({ current, getParts }: { current: Date, getParts: (date: Date) => CalendarDay }): Date {
    const origin = getParts(current)
    const sameDay = (date: Date): boolean => {
        const parts = getParts(date)
        return parts.year === origin.year && parts.month === origin.month && parts.day === origin.day
    }
    let boundary = new Date(current.getTime() + 3_600_000)
    while (sameDay(boundary)) boundary = new Date(boundary.getTime() + 3_600_000)
    let candidate = new Date(Math.floor((boundary.getTime() - 3_600_000) / 60_000) * 60_000)
    while (sameDay(candidate)) candidate = new Date(candidate.getTime() + 60_000)
    return candidate
}

export const cronParser = { parseCronExpression, validateCronExpression, computeNextTick }

type ParseValueParams = { valStr: string, min: number, max: number, names?: Record<string, number> }
type ParseFieldParams = Omit<ParseValueParams, 'valStr'> & { rawField: string, isDayOfWeek?: boolean }
type CalendarDay = { year: number, month: number, day: number }
type DayMatchParams = { dom: ParsedCronField, dow: ParsedCronField, day: number, weekday: number }
