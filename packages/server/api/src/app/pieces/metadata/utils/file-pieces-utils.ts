import { readdir, readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { cwd } from 'node:process'
import { sep } from 'path'
import { Piece, PieceMetadata, pieceTranslation } from '@inboxfm-connect/pieces-framework'
import { extractPieceFromModule } from '@inboxfm-connect/shared'
import clearModule from 'clear-module'
import { FastifyBaseLogger } from 'fastify'
import { AppSystemProp, environmentVariables } from '../../../helper/system/system-props'

const SOURCE_PIECES_PATH = resolve(cwd(), 'packages', 'integrations')
export const filePiecesUtils = (log: FastifyBaseLogger): FilePiecesUtils => ({

    getPackageNameFromFolderPath: async (folderPath: string): Promise<string> => {
        const packageJson = await readFile(join(folderPath, 'package.json'), 'utf-8').then(JSON.parse)
        return packageJson.name
    },

    getPieceDependencies: async (folderPath: string): Promise<Record<string, string> | null> => {
        try {
            const packageJson =  await readFile(join(folderPath, 'package.json'), 'utf-8').then(JSON.parse)
            if (!packageJson.dependencies) {
                return null
            }
            return packageJson.dependencies
        }
        catch (e) {
            return null
        }
    },

    findDistPiecePathByPackageName: async (packageName: string): Promise<string | null> => {
        const paths = await findAllDistPiecesFolders(SOURCE_PIECES_PATH)
        for (const path of paths) {
            try {
                const packageJsonName = await filePiecesUtils(log).getPackageNameFromFolderPath(path)
                if (packageJsonName === packageName) {
                    return path
                }
            }
            catch (e) {
                log.error({
                    name: 'findDistPiecePathByPackageName',
                    message: JSON.stringify(e),
                }, 'Error finding dist piece path by package name')
            }
        }
        return null
    },

    findSourcePiecePathByPieceName: async (pieceName: string): Promise<string | null> => {
        const piecesPath = await findAllPiecesFolder(SOURCE_PIECES_PATH)
        const piecePath = piecesPath.find((p) => p.endsWith(sep + pieceName))
        return piecePath ?? null
    },

    loadDistPiecesMetadata: async (piecesNames: string[]): Promise<PieceMetadata[]> => {
        try {
            const devPieces = await findAllDistPiecesFolders(SOURCE_PIECES_PATH)
            const paths = devPieces.filter(path => piecesNames.some(name => path.endsWith(sep + name + sep + 'dist')))
            const pieces = await Promise.all(paths.map((p) => loadPieceFromFolder(p)))
            return pieces.filter((p): p is PieceMetadata => p !== null)
        }
        catch (e) {
            const err = e as Error
            log.warn({ error: err }, '[filePieceMetadataService#loadDistPiecesMetadata] Failed to load pieces from folder')
            return []
        }
    },


    clearPieceModuleCache: (distFolderPath: string): void => {
        const indexPath = join(distFolderPath, 'src', 'index')
        const packageJsonPath = join(distFolderPath, 'package.json')
        clearModule(indexPath)
        clearModule(packageJsonPath)
    },
})

const findAllPiecesFolder = async (folderPath: string): Promise<string[]> => {
    const files = await readdir(folderPath)
    if (files.includes('package.json')) {
        return [folderPath]
    }

    const paths: string[] = []
    const ignoredFiles = ['node_modules', 'dist', 'framework', 'common']
    for (const file of files) {
        if (ignoredFiles.includes(file)) {
            continue
        }
        const filePath = join(folderPath, file)
        const fileStats = await stat(filePath)
        if (fileStats.isDirectory()) {
            paths.push(...(await findAllPiecesFolder(filePath)))
        }
    }
    return paths
}


const findAllDistPiecesFolders = async (sourcePiecesPath: string): Promise<string[]> => {
    const sourceFolders = await findAllPiecesFolder(sourcePiecesPath)
    const distChecks = await Promise.all(sourceFolders.map(async (folder) => {
        const distPath = join(folder, 'dist')
        try {
            const distStats = await stat(distPath)
            return distStats.isDirectory() ? distPath : null
        }
        catch {
            return null
        }
    }))
    return distChecks.filter((p): p is string => p !== null)
}

const loadPieceFromFolder = async (
    folderPath: string,
): Promise<PieceMetadata | null> => {
    const indexPath = join(folderPath, 'src', 'index')
    const packageJsonPath = join(folderPath, 'package.json')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const packageJson = require(packageJsonPath)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const module = require(indexPath)
    const { name: pieceName, version: pieceVersion } = packageJson
    const piece = extractPieceFromModule<Piece>({
        module,
        pieceName,
        pieceVersion,
    })
    const originalMetadata = piece.metadata()
    const loadTranslations = environmentVariables.getBooleanEnvironment(AppSystemProp.LOAD_TRANSLATIONS_FOR_DEV_PIECES)
    const i18n = loadTranslations ? await pieceTranslation.initializeI18n(folderPath) : undefined
    const metadata: PieceMetadata = {
        ...originalMetadata,
        name: pieceName,
        version: pieceVersion,
        authors: piece.authors,
        directoryPath: folderPath,
        i18n,
    }

    return metadata
}

export type FilePiecesUtils = {
    getPackageNameFromFolderPath: (folderPath: string) => Promise<string>
    getPieceDependencies: (folderPath: string) => Promise<Record<string, string> | null>
    findDistPiecePathByPackageName: (packageName: string) => Promise<string | null>
    findSourcePiecePathByPieceName: (pieceName: string) => Promise<string | null>
    loadDistPiecesMetadata: (piecesNames: string[]) => Promise<PieceMetadata[]>
    clearPieceModuleCache: (distFolderPath: string) => void
}