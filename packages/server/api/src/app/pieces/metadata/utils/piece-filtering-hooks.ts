import { hooksFactory } from '../../../helper/hooks-factory'
import { PieceMetadataSchema } from '../piece-metadata-entity'

export const pieceFilteringHooks = hooksFactory.create<PieceFilteringHooks>(_log => ({
    async filter({ pieces }: PieceFilteringFilterParams): Promise<PieceMetadataSchema[]> {
        return pieces
    },
    async isFiltered(): Promise<boolean> {
        return false
    },
}))

export type PieceFilteringFilterParams = {
    platformId?: string
    includeHidden?: boolean
    pieces: PieceMetadataSchema[]
    projectId?: string
}

export type PieceFilteringIsFilteredParams = {
    piece: PieceMetadataSchema
    projectId: string | undefined
    platformId: string | undefined
}

export type PieceFilteringHooks = {
    filter(params: PieceFilteringFilterParams): Promise<PieceMetadataSchema[]>
    isFiltered(params: PieceFilteringIsFilteredParams): Promise<boolean>
}
