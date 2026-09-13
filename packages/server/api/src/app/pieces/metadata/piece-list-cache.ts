import { apDayjsDuration } from '@inboxfm-connect/server-utils'
import { distributedStore } from '../../database/redis-connections'
import { PieceMetadataSchema } from './piece-metadata-entity'

const KEY_PREFIX = 'piece-list'
const TEN_MINUTES_SECONDS = apDayjsDuration(10, 'minute').asSeconds()

const buildKey = (currentRelease: string) => `${KEY_PREFIX}:${currentRelease}`

export const pieceListCache = {
    async get(currentRelease: string): Promise<PieceMetadataSchema[] | null> {
        return distributedStore.get<PieceMetadataSchema[]>(buildKey(currentRelease))
    },
    async put(currentRelease: string, pieces: PieceMetadataSchema[]): Promise<void> {
        await distributedStore.put(buildKey(currentRelease), pieces, TEN_MINUTES_SECONDS)
    },
    async invalidate(currentRelease: string): Promise<void> {
        await distributedStore.delete(buildKey(currentRelease))
    },
}
