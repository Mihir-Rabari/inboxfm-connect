import { StaticPropsValue } from '@inboxfm-connect/pieces-framework';
import { oracleDbAuth } from '../common/auth';

export type OracleDbAuth = StaticPropsValue<(typeof oracleDbAuth)['props']>;
