import fs from 'fs'
import path from 'path'
import { apId, tryCatchSync } from '@inboxfm-connect/core-utils'
import { IntegrationAuthProperty, ToolBase, TriggerBase } from '@inboxfm-connect/pieces-framework'
import { PackageType, PieceCategory, PieceType } from '@inboxfm-connect/shared'
import { z } from 'zod'
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
            description: item.description ?? '',
            version: item.version,
            minimumSupportedRelease: item.minimumSupportedRelease ?? '0.0.0',
            maximumSupportedRelease: item.maximumSupportedRelease ?? '999.999.999',
            categories: validatedOrUndefined({ schema: CategoriesSchema, value: item.categories }),
            authors: item.authors ?? [],
            auth: item.auth,
            actions: validatedOrUndefined({ schema: ActionsSchema, value: item.actions }) ?? {},
            triggers: validatedOrUndefined({ schema: TriggersSchema, value: item.triggers }) ?? {},
            pieceType: PieceType.OFFICIAL,
            packageType: PackageType.REGISTRY,
            projectUsage: 0,
            // Only the engine knows a piece's context version, and it resolves it from the
            // installed package at execution time — the catalog snapshot never carries one.
            contextInfo: undefined,
            platformId: undefined,
            archiveId: undefined,
            i18n: undefined,
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

// JSON.parse yields no type information, so the catalog's structural fields are gated
// on the framework's own schema at load time. A malformed entry degrades to "absent"
// rather than poisoning the process-lifetime cache with a half-valid piece.
//
// `auth` is deliberately NOT gated: the catalog stores a type-only marker
// (`{ "type": "CUSTOM_AUTH" }`) rather than a full IntegrationAuthProperty, so checking
// it against that schema would reject and drop the marker on all 703 pieces that carry
// one, which is how the UI knows a piece needs a connection at all.
function validatedOrUndefined<T>({ schema, value }: ValidatedOrUndefinedParams<T>): T | undefined {
    if (value === undefined) {
        return undefined
    }
    return schema.safeParse(value).success ? value : undefined
}

const CategoriesSchema = z.array(z.enum(PieceCategory))
const ActionsSchema = z.record(z.string(), ToolBase)
const TriggersSchema = z.record(z.string(), TriggerBase)

type ValidatedOrUndefinedParams<T> = {
    schema: z.ZodType
    value: T | undefined
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
    description?: string
    version: string
    minimumSupportedRelease?: string
    maximumSupportedRelease?: string
    categories?: PieceCategory[]
    authors?: string[]
    auth?: IntegrationAuthProperty | IntegrationAuthProperty[]
    actions?: Record<string, ToolBase>
    triggers?: Record<string, TriggerBase>
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

