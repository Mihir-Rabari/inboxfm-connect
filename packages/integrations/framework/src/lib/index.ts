export * from './action/action';
export * from './property';
export * from './trigger/trigger';
export * from './context';
export * from './piece';
export * from './piece-metadata';
export * from './output-schema';
export * from './i18n'
export * from './context/versioning'
export * from './test'

// Legacy backward-compatibility aliases
export { IntegrationAuthProperty as PieceAuthProperty } from './property/authentication';
export { createTool as createAction, Tool as Action } from './action/action';
export { ToolContext as ActionContext, ConnectionValueForAuthProperty as AppConnectionValueForAuthProperty } from './context';
export { ExtractIntegrationAuthPropertyTypeForMethods as ExtractPieceAuthPropertyTypeForMethods } from './property/authentication';
export { Integration as Piece, createIntegration as createPiece } from './piece';
export { IntegrationMetadata as PieceMetadata, IntegrationMetadataSummary as PieceMetadataSummary, IntegrationMetadataModel as PieceMetadataModel, IntegrationMetadataModelSummary as PieceMetadataModelSummary, IntegrationPackageInformation as PiecePackageInformation, ToolBase as ActionBase } from './piece-metadata';
export { IntegrationPropertyMap as PiecePropertyMap, IntegrationAuth as PieceAuth, IntegrationPropValueSchema as PiecePropValueSchema } from './property';
