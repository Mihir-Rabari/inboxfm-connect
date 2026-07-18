/**
 * Event Destinations Service
 *
 * This service serves as a backward compatibility layer for Event Destinations / Platform Webhooks.
 *
 * Core Design & Compatibility Details:
 * 1. PERSISTENCE SUPPORTED: Webhook configuration persistence remains fully active. Platform administrators
 *    can still create, read, update, and delete event destination webhooks through the REST API. Configurations
 *    are stored in the `event_destination` database table via `EventDestinationEntity`.
 * 2. DISPATCH IS INTENTIONALLY DISABLED: The active webhook dispatch logic has been disabled by stubbing out
 *    the `jobQueue` (see below). No webhook payloads are actually sent out to registered URLs.
 * 3. RETIRED BULLMQ INTEGRATION: Webhook dispatch previously relied on BullMQ background queues (adding
 *    `EVENT_DESTINATION` jobs to the queue to be executed asynchronously by workers).
 * 4. HEADLESS RUNTIME COMPATIBILITY: The modern headless runtime operates synchronously and does not emit
 *    any dispatchable execution events (such as `FLOW_RUN_STARTED` or `FLOW_RUN_FINISHED`).
 */

import { apId, Cursor, isNil, PlatformId, ProjectId, SeekPage } from '@inboxfm-connect/core-utils'
import { ApplicationEvent, ApplicationEventName, buildMockEvent, CreatePlatformEventDestinationRequestBody, EventDestination, EventDestinationScope, LATEST_JOB_DATA_SCHEMA_VERSION, UpdatePlatformEventDestinationRequestBody, WorkerJobType } from '@inboxfm-connect/shared'
import { FastifyBaseLogger } from 'fastify'
import { ArrayContains, FindOptionsWhere } from 'typeorm'
import { repoFactory } from '../core/db/repo-factory'
import { applicationEvents } from '../helper/application-events'
import { buildPaginator } from '../helper/pagination/build-paginator'
import { paginationHelper } from '../helper/pagination/pagination-utils'

// Webhook dispatch is intentionally disabled.
// Previously, jobs were pushed to a BullMQ queue to be delivered by the background worker.
// Since the background worker execution pathway is removed/commented out, this is stubbed to a no-op.
const jobQueue = (_log: unknown): { add: (_data: unknown) => Promise<void> } => ({ add: async (_data: unknown): Promise<void> => {} })
const JobType = { CHAT: 'CHAT', ONE_TIME: 'ONE_TIME', EVENT_DESTINATION: 'EVENT_DESTINATION' } as const
import {
    EventDestinationEntity,
    EventDestinationSchema,
} from './event-destinations.entity'

const eventDestinationRepo = repoFactory<EventDestinationSchema>(
    EventDestinationEntity,
)

export const eventDestinationService = (log: FastifyBaseLogger): {
    setup(): void
    create(request: CreatePlatformEventDestinationRequestBody, platformId: string): Promise<EventDestination>
    update(params: UpdateParams): Promise<EventDestination>
    delete(params: DeleteParams): Promise<void>
    list(params: ListParams): Promise<SeekPage<EventDestination>>
    trigger(params: TriggerParams): Promise<void>
    test(params: TestParams): Promise<void>
} => ({
    setup(): void {
        applicationEvents(log).registerListeners(log, {
            userEvent: (log: FastifyBaseLogger) => async (event: ApplicationEvent): Promise<void> => {
                await eventDestinationService(log).trigger({
                    projectId: event.projectId,
                    event,
                })
            },
            workerEvent: (log: FastifyBaseLogger) => async (projectId: string, event: ApplicationEvent): Promise<void> => {
                await eventDestinationService(log).trigger({
                    projectId,
                    event,
                })
            },
        })
    },
    create: async (
        request: CreatePlatformEventDestinationRequestBody,
        platformId: string,
    ): Promise<EventDestination> => {
        const entity: EventDestination = {
            id: apId(),
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            platformId,
            scope: EventDestinationScope.PLATFORM,
            events: request.events,
            url: request.url,
        }
        return eventDestinationRepo().save(entity)
    },
    update: async ({ id, platformId, request }: UpdateParams): Promise<EventDestination> => {
        await eventDestinationRepo().update({ id, platformId }, request)
        return eventDestinationRepo().findOneByOrFail({ id, platformId })
    },
    delete: async ({ id, platformId }: DeleteParams): Promise<void> => {
        await eventDestinationRepo().delete({
            id,
            platformId,
        })
    },
    list: async ({
        platformId,
        cursorRequest,
        limit,
    }: ListParams): Promise<SeekPage<EventDestination>> => {
        const decodedCursor = paginationHelper.decodeCursor(cursorRequest)
        const paginator = buildPaginator({
            entity: EventDestinationEntity,
            query: {
                limit,
                afterCursor: decodedCursor.nextCursor,
                beforeCursor: decodedCursor.previousCursor,
            },
        })

        const queryBuilder = eventDestinationRepo()
            .createQueryBuilder('event_destination')
            .where({
                platformId,
            })

        const { data, cursor } = await paginator.paginate(queryBuilder)

        return paginationHelper.createPage<EventDestination>(data, cursor)
    },
    trigger: async ({ event }: TriggerParams): Promise<void> => {
        const platformId = event.platformId
        const conditions: FindOptionsWhere<EventDestinationSchema>[] = [{
            platformId,
            events: ArrayContains([event.action]),
            scope: EventDestinationScope.PLATFORM,
        }]
        const destinations = await eventDestinationRepo().findBy(conditions)
        await Promise.all(destinations.map(destination =>
            jobQueue(log).add({
                type: JobType.ONE_TIME,
                id: apId(),
                data: {
                    schemaVersion: LATEST_JOB_DATA_SCHEMA_VERSION,
                    platformId,
                    webhookId: destination.id,
                    webhookUrl: destination.url,
                    payload: event,
                    jobType: WorkerJobType.EVENT_DESTINATION,
                },
            }),
        ))
    },
    test: async ({ platformId, projectId, url, event }: TestParams): Promise<void> => {
        const eventToTest = event ?? ApplicationEventName.CONNECTION_UPSERTED
        const mockEvent = buildMockEvent({ event: eventToTest, platformId, projectId })
        await jobQueue(log).add({
            type: JobType.ONE_TIME,
            id: apId(),
            data: {
                schemaVersion: LATEST_JOB_DATA_SCHEMA_VERSION,
                platformId,
                projectId,
                webhookId: apId(),
                webhookUrl: url,
                payload: mockEvent,
                jobType: WorkerJobType.EVENT_DESTINATION,
                },
        })
    },
})


type DeleteParams = {
    id: string
    platformId: string
}

type UpdateParams = {
    id: string
    platformId: string
    request: UpdatePlatformEventDestinationRequestBody
}

type ListParams = {
    platformId: PlatformId
    cursorRequest: Cursor
    limit?: number
}

type TriggerParams = {
    projectId?: ProjectId
    event: ApplicationEvent
}

type TestParams = {
    platformId: PlatformId
    projectId?: ProjectId
    url: string
    event?: ApplicationEventName
}

