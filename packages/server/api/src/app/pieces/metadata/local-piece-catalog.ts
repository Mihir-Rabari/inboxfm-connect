import fs from 'fs'
import path from 'path'
import { apId, tryCatchSync } from '@inboxfm-connect/core-utils'
import { PackageType, PieceType } from '@inboxfm-connect/shared'
import { PieceRegistryEntry } from './piece-cache'
import { PieceMetadataSchema } from './piece-metadata-entity'

let cachedCatalog: PieceMetadataSchema[] | null = null
let cachedRegistry: PieceRegistryEntry[] | null = null

function loadCatalogFromDisk(): PieceMetadataSchema[] {
    if (cachedCatalog !== null) {
        return cachedCatalog
    }

    const catalogPath = path.resolve(__dirname, '../../../assets/local-integrations-catalog.json')
    const { data: rawContent, error: readError } = tryCatchSync(() => fs.readFileSync(catalogPath, 'utf-8'))
    if (readError || !rawContent) {
        return []
    }

    const { data: parsed, error: parseError } = tryCatchSync(() => JSON.parse(rawContent))
    if (parseError || !Array.isArray(parsed)) {
        return []
    }

    const catalog: PieceMetadataSchema[] = parsed.map((item: RawCatalogItem): PieceMetadataSchema => {
        const id = item.id || `piece_${apId()}`
        const now = new Date().toISOString()
        return {
            id,
            name: item.name,
            displayName: item.displayName,
            logoUrl: item.logoUrl,
            description: item.description ?? null,
            version: item.version,
            minimumSupportedRelease: item.minimumSupportedRelease ?? '0.0.0',
            maximumSupportedRelease: item.maximumSupportedRelease ?? '999.999.999',
            categories: item.categories ?? null,
            authors: item.authors ?? [],
            auth: item.auth ?? null,
            actions: item.actions ?? {},
            triggers: item.triggers ?? {},
            pieceType: PieceType.OFFICIAL,
            packageType: PackageType.REGISTRY,
            projectUsage: 0,
            platformId: null,
            archiveId: null,
            i18n: null,
            created: item.created ?? now,
            updated: item.updated ?? now,
        }
    })

    cachedCatalog = catalog
    return cachedCatalog
}

function normalizePieceName(name: string): string {
    return name
        .replace(/^@inboxfm-connect\/piece-/, '')
        .replace(/^@activepieces\/piece-/, '')
        .replace(/^piece-/, '')
}

function getLocalCatalog(): PieceMetadataSchema[] {
    return loadCatalogFromDisk()
}

function getLocalRegistry(): PieceRegistryEntry[] {
    if (cachedRegistry !== null) {
        return cachedRegistry
    }
    const catalog = getLocalCatalog()
    cachedRegistry = catalog.map((p) => ({
        name: p.name,
        version: p.version,
        minimumSupportedRelease: p.minimumSupportedRelease,
        maximumSupportedRelease: p.maximumSupportedRelease,
        pieceType: p.pieceType,
        platformId: undefined,
    }))
    return cachedRegistry
}

function findLocalPiece({ name, version }: FindLocalPieceParams): PieceMetadataSchema | undefined {
    const catalog = getLocalCatalog()
    const cleanTarget = normalizePieceName(name)

    return catalog.find((p) => {
        const cleanName = normalizePieceName(p.name)
        const nameMatches = p.name === name || cleanName === cleanTarget
        if (!nameMatches) {
            return false
        }
        if (version !== undefined && version !== '') {
            return p.version === version
        }
        return true
    })
}

function isLocalPiece(name: string): boolean {
    return findLocalPiece({ name }) !== undefined
}

type FindLocalPieceParams = {
    name: string
    version?: string
}

type RawCatalogItem = {
    id?: string
    name: string
    displayName: string
    logoUrl: string
    description?: string | null
    version: string
    minimumSupportedRelease?: string
    maximumSupportedRelease?: string
    categories?: string[] | null
    authors?: string[]
    auth?: unknown
    actions?: Record<string, unknown>
    triggers?: Record<string, unknown>
    created?: string
    updated?: string
}

export const localPieceCatalog = {
    getLocalCatalog,
    getLocalRegistry,
    findLocalPiece,
    isLocalPiece,
    normalizePieceName,
}

export type { FindLocalPieceParams }

