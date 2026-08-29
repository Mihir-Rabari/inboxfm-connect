import { Controller, useForm } from 'react-hook-form'
import { ConnectionFormShell } from '@/components/connections/connection-form-shell'
import { TextField } from '@/components/connections/form-field'
import { AppConnection, PieceMetadata } from '@/lib/api/types'
import { useConnectionCreated } from '@/lib/hooks/use-connection-created'
import { useCreateConnection } from '@/lib/query/hooks'
import { connectionErrors } from '@/lib/utils/connection-errors'
import { connectionIds } from '@/lib/utils/connection-ids'

interface SecretTextValues {
  displayName: string
  secretText: string
}

interface SecretTextConnectProps {
  piece: PieceMetadata
  externalId?: string
  defaultDisplayName?: string
  isReconnect?: boolean
}

export function SecretTextConnect({
  piece,
  externalId,
  defaultDisplayName,
  isReconnect = false,
}: SecretTextConnectProps) {
  const createConnection = useCreateConnection()
  const { handleConnectionCreated } = useConnectionCreated(piece.name)

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SecretTextValues>({
    defaultValues: {
      displayName: defaultDisplayName ?? `${piece.displayName} connection`,
      secretText: '',
    },
  })

  const handleCreate = handleSubmit(async (values) => {
    try {
      const connection: AppConnection = await createConnection.mutateAsync({
        displayName: values.displayName.trim(),
        pieceName: piece.name,
        pieceVersion: piece.version,
        type: 'SECRET_TEXT',
        externalId: externalId ?? connectionIds.newExternalId(),
        value: {
          type: 'SECRET_TEXT',
          secret_text: values.secretText,
        },
      })
      reset({ displayName: values.displayName, secretText: '' })
      handleConnectionCreated(connection.displayName)
    } catch (error) {
      // Error is surfaced through the mutation's error state below.
      void error
    }
  })

  return (
    <ConnectionFormShell
      pieceDisplayName={piece.displayName}
      pieceLogoUrl={piece.logoUrl}
      title={`Connect ${piece.displayName}`}
      description={
        authDescription(piece.auth?.description) ??
        `Provide the API key or token ${piece.displayName} issued for your account. It is stored encrypted and never displayed again.`
      }
      submitLabel={isReconnect ? 'Reconnect' : 'Create connection'}
      pending={createConnection.isPending}
      errorMessage={createConnection.error ? describeError(createConnection.error) : undefined}
      onSubmit={(event) => void handleCreate(event)}
    >
      {isReconnect && (
        <p className="rounded-md border border-dashed border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
          Reconnecting replaces the stored credential in place — tools keep using the same connection.
        </p>
      )}
      <Controller
        name="displayName"
        control={control}
        rules={{ required: 'Connection name is required' }}
        render={({ field }) => (
          <TextField
            id="secret-display-name"
            label="Connection name"
            required
            value={field.value}
            onChange={field.onChange}
            disabled={createConnection.isPending}
            error={errors.displayName?.message}
            autoComplete="off"
          />
        )}
      />
      <Controller
        name="secretText"
        control={control}
        rules={{ required: 'Secret is required' }}
        render={({ field }) => (
          <TextField
            id="secret-text-value"
            label="Secret"
            description={`${piece.displayName} API key or token.`}
            required
            type="password"
            value={field.value}
            onChange={field.onChange}
            disabled={createConnection.isPending}
            error={errors.secretText?.message}
            autoComplete="new-password"
          />
        )}
      />
    </ConnectionFormShell>
  )
}

function authDescription(description?: string): string | undefined {
  return description && description.trim().length > 0 ? description : undefined
}

function describeError(error: unknown): string {
  return connectionErrors.describe(error, 'The connection could not be created. Try again.')
}
