function newExternalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `conn_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

export const connectionIds = {
  /** The backend requires an externalId on every upsert; new connections mint one client-side. Reconnects reuse the existing value instead. */
  newExternalId,
}
