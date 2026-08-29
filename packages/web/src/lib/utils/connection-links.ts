interface NewConnectionHrefParams {
  pieceName: string
}

interface ReconnectHrefParams {
  pieceName: string
  externalId?: string
  displayName?: string
}

function newConnectionHref({ pieceName }: NewConnectionHrefParams): string {
  return `/connections/new?pieceName=${encodeURIComponent(pieceName)}`
}

function reconnectHref({ pieceName, externalId, displayName }: ReconnectHrefParams): string {
  const params = new URLSearchParams({ pieceName })
  if (externalId) {
    params.set('externalId', externalId)
  }
  if (displayName) {
    params.set('displayName', displayName)
  }
  return `/connections/new?${params.toString()}`
}

function integrationDetailTabHref(pieceName: string): string {
  return `/integrations/${encodeURIComponent(pieceName)}?tab=connections`
}

export const connectionLinks = {
  newConnection: newConnectionHref,
  reconnect: reconnectHref,
  integrationConnections: integrationDetailTabHref,
}
