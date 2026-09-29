import { describe, expect, it } from 'vitest'
import { cronParser } from '../src/cron-parser'

describe('Cron Parser & Validator', () => {
    it('accepts zero-padded fields and ranges', () => {
        expect(cronParser.validateCronExpression('00 09 * * *')).toBe(true)
        expect(cronParser.validateCronExpression('00 08-09 * * *')).toBe(true)
        expect(cronParser.validateCronExpression('00 9x * * *')).toBe(false)
    })

    it('retains local midnight after spring-forward when advancing unmatched days', () => {
        expect(cronParser.computeNextTick({
            cronExpression: '0 0 9 3 *',
            fromDate: new Date('2026-03-07T20:01:00.000Z'),
            timezone: 'America/New_York',
        }).toISOString()).toBe('2026-03-09T04:00:00.000Z')
    })

    it('retains second precision at midnight after a local day boundary', () => {
        expect(cronParser.computeNextTick({
            cronExpression: '0 0 0 9 3 *',
            fromDate: new Date('2026-03-07T20:01:04.000Z'),
            timezone: 'America/New_York',
        }).toISOString()).toBe('2026-03-09T04:00:00.000Z')
    })
    describe('validateCronExpression', () => {
        it('accepts standard 5-field cron expressions', () => {
            expect(cronParser.validateCronExpression('* * * * *')).toBe(true)
            expect(cronParser.validateCronExpression('0 8 * * *')).toBe(true)
            expect(cronParser.validateCronExpression('*/15 * * * *')).toBe(true)
            expect(cronParser.validateCronExpression('0 9-17 * * 1-5')).toBe(true)
            expect(cronParser.validateCronExpression('0 0 1,15 * *')).toBe(true)
            expect(cronParser.validateCronExpression('0 0 1 JAN *')).toBe(true)
            expect(cronParser.validateCronExpression('0 0 * * SUN')).toBe(true)
        })

        it('accepts 6-field cron expressions with seconds', () => {
            expect(cronParser.validateCronExpression('*/30 * * * * *')).toBe(true)
            expect(cronParser.validateCronExpression('0 0 12 * * *')).toBe(true)
            expect(cronParser.validateCronExpression('15 0 9-17 * * 1-5')).toBe(true)
        })

        it('rejects expressions with incorrect field counts', () => {
            expect(cronParser.validateCronExpression('')).toBe(false)
            expect(cronParser.validateCronExpression('* * * *')).toBe(false) // 4 fields
            expect(cronParser.validateCronExpression('* * * * * * *')).toBe(false) // 7 fields
        })

        it('rejects out-of-bounds field values', () => {
            expect(cronParser.validateCronExpression('60 * * * *')).toBe(false) // min > 59
            expect(cronParser.validateCronExpression('* 24 * * *')).toBe(false) // hour > 23
            expect(cronParser.validateCronExpression('* * 32 * *')).toBe(false) // dom > 31
            expect(cronParser.validateCronExpression('* * 0 * *')).toBe(false) // dom < 1
            expect(cronParser.validateCronExpression('* * * 13 *')).toBe(false) // month > 12
            expect(cronParser.validateCronExpression('* * * 0 *')).toBe(false) // month < 1
            expect(cronParser.validateCronExpression('* * * * 8')).toBe(false) // dow > 7
        })

        it('rejects inverted ranges or invalid step values', () => {
            expect(cronParser.validateCronExpression('10-5 * * * *')).toBe(false)
            expect(cronParser.validateCronExpression('*/0 * * * *')).toBe(false)
            expect(cronParser.validateCronExpression('*/-1 * * * *')).toBe(false)
            expect(cronParser.validateCronExpression('*/abc * * * *')).toBe(false)
        })
    })

    describe('validateCronExpression fireability probe (issue #389)', () => {
        it('rejects a dom/month combo that can never denote a real date', () => {
            // 31 Feb and 30 Feb never produce a tick within the 1-year search
            // window (no month has a 31st or 30th in a single non-leap
            // February); 31 Apr / 30 Jun are likewise unreachable in their
            // single short months.
            expect(cronParser.validateCronExpression('0 0 31 2 *')).toBe(false)
            expect(cronParser.validateCronExpression('0 0 30 2 *')).toBe(false)
            expect(cronParser.validateCronExpression('0 0 31 4 *')).toBe(false)
            expect(cronParser.validateCronExpression('0 0 31 6 *')).toBe(false)
        })

        it('keeps a single short month\'s last day (30 Apr) and leap-year February 29', () => {
            // April has 30 days (so 30 Apr is a real recurring date) and 29 Feb
            // still fires in the next leap year (2028), so both schedules must
            // survive the probe.
            expect(cronParser.validateCronExpression('0 0 30 4 *')).toBe(true)
            expect(cronParser.validateCronExpression('0 0 29 2 *', )).toBe(true)
        })

        it('keeps wildcard-dom schedules that roll to a shorter month\'s 31st', () => {
            // dom is not pinned to a single short month: April 1 2026 -> May 31
            // (April has 30 days), so the validator keeps the schedule.
            expect(cronParser.validateCronExpression('0 0 31 * *')).toBe(true)
            expect(cronParser.validateCronExpression('0 0 30 * *')).toBe(true)
        })

        it('rejects when only an unreachable dom is requested in a single month', () => {
            // Only the 31st is requested and the only month is one that never
            // has a 31st (e.g. a single non-leap February), so no tick exists.
            expect(cronParser.validateCronExpression('0 0 31 FEB *')).toBe(false)
        })
    })

    describe('parseCronExpression', () => {
        it('correctly maps month and day names', () => {
            const parsed = cronParser.parseCronExpression('0 0 1 JAN MON')
            expect(parsed.months.values.has(1)).toBe(true)
            expect(parsed.daysOfWeek.values.has(1)).toBe(true)
        })

        it('maps day 7 and 0 both to Sunday', () => {
            const parsed7 = cronParser.parseCronExpression('0 0 * * 7')
            expect(parsed7.daysOfWeek.values.has(0)).toBe(true)
            expect(parsed7.daysOfWeek.values.has(7)).toBe(true)

            const parsed0 = cronParser.parseCronExpression('0 0 * * 0')
            expect(parsed0.daysOfWeek.values.has(0)).toBe(true)
            expect(parsed0.daysOfWeek.values.has(7)).toBe(true)
        })

        it('parses step intervals and lists accurately', () => {
            const parsed = cronParser.parseCronExpression('*/20 1,5,10 * * *')
            expect(Array.from(parsed.minutes.values).sort((a, b) => a - b)).toEqual([0, 20, 40])
            expect(Array.from(parsed.hours.values).sort((a, b) => a - b)).toEqual([1, 5, 10])
        })
    })

    describe('computeNextTick', () => {
        it('computes next minute tick strictly after fromDate', () => {
            const from = new Date('2026-06-01T12:00:30.000Z')
            const next = cronParser.computeNextTick({ cronExpression: '* * * * *',  fromDate: from, timezone: 'UTC' })
            expect(next.toISOString()).toBe('2026-06-01T12:01:00.000Z')
        })

        it('computes step interval ticks accurately', () => {
            const from = new Date('2026-06-01T12:04:30.000Z')
            const next = cronParser.computeNextTick({ cronExpression: '*/15 * * * *',  fromDate: from, timezone: 'UTC' })
            expect(next.toISOString()).toBe('2026-06-01T12:15:00.000Z')
        })

        it('computes daily midnight ticks across UTC days', () => {
            const from = new Date('2026-06-01T12:00:00.000Z')
            const next = cronParser.computeNextTick({ cronExpression: '0 0 * * *',  fromDate: from, timezone: 'UTC' })
            expect(next.toISOString()).toBe('2026-06-02T00:00:00.000Z')
        })

        it('computes next tick in specific timezone (Asia/Tokyo)', () => {
            // 9:00 AM JST is 00:00:00 UTC
            const from = new Date('2026-06-01T00:30:00.000Z')
            const next = cronParser.computeNextTick({ cronExpression: '0 9 * * *',  fromDate: from, timezone: 'Asia/Tokyo' })
            expect(next.toISOString()).toBe('2026-06-02T00:00:00.000Z')
        })

        describe('Daylight Saving Time (DST) edge cases', () => {
            it('DST Spring Forward: safely advances past the skipped gap hour', () => {
                // In America/New_York, on March 8, 2026, clocks spring forward from 01:59:59 to 03:00:00.
                // 02:30:00 local clock does NOT exist on March 8.
                // The next tick must advance to March 9, 2026 at 02:30:00 EDT (06:30:00 UTC).
                const from = new Date('2026-03-08T00:00:00.000Z')
                const next = cronParser.computeNextTick({ cronExpression: '30 2 * * *',
                    fromDate: from,
                    timezone: 'America/New_York',
                })
                expect(next.toISOString()).toBe('2026-03-09T06:30:00.000Z')
            })

            it('DST Fall Back: resolves duplicate hour in strict chronological order', () => {
                // In America/New_York, on November 1, 2026, clocks fall back from 02:00:00 EDT to 01:00:00 EST.
                // 01:30:00 occurs twice:
                // 1st: 05:30:00 UTC (EDT, UTC-4)
                // 2nd: 06:30:00 UTC (EST, UTC-5)
                const fromBeforeFirst = new Date('2026-11-01T04:00:00.000Z')
                const firstTick = cronParser.computeNextTick({ cronExpression: '30 1 * * *',
                    fromDate: fromBeforeFirst,
                    timezone: 'America/New_York',
                })
                expect(firstTick.toISOString()).toBe('2026-11-01T05:30:00.000Z')

                // Next tick after first occurrence matches the second occurrence
                const secondTick = cronParser.computeNextTick({ cronExpression: '30 1 * * *',
                    fromDate: firstTick,
                    timezone: 'America/New_York',
                })
                expect(secondTick.toISOString()).toBe('2026-11-01T06:30:00.000Z')

                // Next tick after second occurrence advances to Nov 2
                const thirdTick = cronParser.computeNextTick({ cronExpression: '30 1 * * *',
                    fromDate: secondTick,
                    timezone: 'America/New_York',
                })
                expect(thirdTick.toISOString()).toBe('2026-11-02T06:30:00.000Z')
            })
        })

        describe('Calendar edge cases (month-end, leap years)', () => {
            it('advances past shorter months to 31st of matching month', () => {
                // Starting on April 1, 2026: April has 30 days, so 31st occurs on May 31.
                const from = new Date('2026-04-01T00:00:00.000Z')
                const next = cronParser.computeNextTick({ cronExpression: '0 0 31 * *',  fromDate: from, timezone: 'UTC' })
                expect(next.toISOString()).toBe('2026-05-31T00:00:00.000Z')
            })

            it('advances to next leap year for February 29 schedule', () => {
                // 2026 is not a leap year. Next leap year is 2028.
                const from = new Date('2026-01-01T00:00:00.000Z')
                const next = cronParser.computeNextTick({ cronExpression: '0 0 29 2 *',  fromDate: from, timezone: 'UTC' })
                expect(next.toISOString()).toBe('2028-02-29T00:00:00.000Z')
            })
        })
    })
})
