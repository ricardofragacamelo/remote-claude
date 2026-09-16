/** The transport layer: one HTTP client, one WebSocket client, one error shape. */
export { ApiClient, api, anonymous } from './api';
export type { Credentials, RequestOptions } from './api';
export { AppError, toAppError, toTransportError } from './errors';
export type { AppErrorDetail } from './errors';
export { WsClient } from './ws-client';
export type { ConnectionStatus, SessionSubscriber, SocketLike } from './ws-client';
