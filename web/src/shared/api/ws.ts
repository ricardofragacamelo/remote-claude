import { config } from '@/shared/config/env';
import { createAttachments } from './attachments';
import { credentials, currentLocale } from './credentials';
import { createFolderWatches } from './folder-watches';
import { WsClient } from './ws-client';

/** The one WebSocket client. A second one in the project means something escaped the chain. */
export const wsClient = new WsClient({
  url: config.wsUrl,
  accessToken: () => credentials.accessToken(),
  locale: currentLocale,
  appVersion: config.appVersion,
});

/** The sessions of that client held attached by more than one owner — a tab, and its screen. */
export const sessionAttachments = createAttachments(wsClient);

/** The folders that client follows on disk — one subscription per folder, however many features follow it. */
export const folderWatches = createFolderWatches(wsClient);
