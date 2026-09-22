import type { CreateConnectSessionRequestContract, CreateConnectSessionResponseContract } from './generated/connect-session'
import type { ConnectionContract, ConnectionsPageContract, ListConnectionsQueryContract } from './generated/connections'
import type { ServerErrorCodeContract } from './generated/error-code'
import type { ExecuteRequestContract } from './generated/execute'

export type { CreateConnectSessionRequestContract, CreateConnectSessionResponseContract, ConnectionsPageContract, ExecuteRequestContract, ListConnectionsQueryContract, ServerErrorCodeContract }

export type Connection = Omit<ConnectionContract, 'platformId' | 'ownerId' | 'owner'>

export type ConnectionsPage = Omit<ConnectionsPageContract, 'data'> & {
    data: Connection[]
}
