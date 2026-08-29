import { Controller, useForm } from 'react-hook-form'
import { ConnectionFormShell } from '@/components/connections/connection-form-shell'
import { TextField } from '@/components/connections/form-field'
import { AppConnection, PieceMetadata } from '@/lib/api/types'
import { useConnectionCreated } from '@/lib/hooks/use-connection-created'
import { useCreateConnection } from '@/lib/query/hooks'
import { connectionErrors } from '@/lib/utils/connection-errors'
import { connectionIds } from '@/lib/utils/connection-ids'

interface BasicAuthValues {
  displayName: string
  username: string
  password: string
}

interface BasicAuthConnectProps {
  piece: PieceMetadata
  externalId?: string
  defaultDisplayName?: string
  isReconnect?: boolean
}

export function BasicAuthConnect({
  piece,
  externalId,
  defaultDisplayName,
  isReconnect = false,
}: BasicAuthConnectProps) {
  const createConnection = useCreateConnection()
  const { handleConnectionCreated } = useConnectionCreated(piece.name)

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BasicAuthValues>({
    defaultValues: {
      displayName: defaultDisplayName ?? `${piece.displayName} connection`,
      username: '',
      password: '',
    },
  })

  const handleCreate = handleSubmit(async (values) => {
    try {
      const connection: AppConnection = await createConnection.mutateAsync({
        displayName: values.displayName.trim(),
        pieceName: piece.name,
        pieceVersion: piece.version,
        type: 'BASIC_AUTH',
        externalId: externalId ?? connectionIds.newExternalId(),
        value: {
          type: 'BASIC_AUTH',
          username: values.username.trim(),
          password: values.password,
        },
      })
      reset({ displayName: values.displayName, username: values.username, password: '' })
      handleConnectionCreated(connection.displayName)
    } catch {
      // Surfaced through the mutation's error state below.
    }
  })

  return (
    <ConnectionFormShell
      pieceDisplayName={piece.displayName}
      pieceLogoUrl={piece.logoUrl}
      title={`Connect ${piece.displayName}`}
      description={
        piece.auth?.description?.trim() ||
        `Sign in with your ${piece.displayName} username and password. Credentials are stored encrypted and never displayed again.`
      }
      submitLabel={isReconnect ? 'Reconnect' : 'Create connection'}
      pending={createConnection.isPending}
      errorMessage={
        createConnection.error
          ? connectionErrors.describe(
              createConnection.error,
              'The connection could not be created. Try again.'
            )
          : undefined
      }
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
            id="basic-display-name"
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
        name="username"
        control={control}
        rules={{ required: 'Username is required' }}
        render={({ field }) => (
          <TextField
            id="basic-username"
            label="Username"
            required
            value={field.value}
            onChange={field.onChange}
            disabled={createConnection.isPending}
            error={errors.username?.message}
            autoComplete="off"
          />
        )}
      />
      <Controller
        name="password"
        control={control}
        rules={{ required: 'Password is required' }}
        render={({ field }) => (
          <TextField
            id="basic-password"
            label="Password"
            required
            type="password"
            value={field.value}
            onChange={field.onChange}
            disabled={createConnection.isPending}
            error={errors.password?.message}
            autoComplete="new-password"
          />
        )}
      />
    </ConnectionFormShell>
  )
}
