import { config } from '@/shared/config/env';
import { credentials, currentLocale } from './credentials';
import { WsClient } from './ws-client';

/** The one WebSocket client. A second one in the project means something escaped the chain. */
export const wsClient = new WsClient({
  url: config.wsUrl,
  accessToken: () => credentials.accessToken(),
  locale: currentLocale,
  appVersion: config.appVersion,
});
