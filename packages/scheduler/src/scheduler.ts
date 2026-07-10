import { LocalScheduler } from './local-scheduler'
import { Scheduler } from './types'

const activeScheduler: Scheduler = LocalScheduler

export const scheduler = activeScheduler
