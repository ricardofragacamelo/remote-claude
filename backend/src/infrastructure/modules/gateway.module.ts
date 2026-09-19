import { Module } from '@nestjs/common';

import { WS_COMMAND_HANDLERS } from '@adapter/inbound/ws/ws-command';
import type { WsCommandHandler } from '@adapter/inbound/ws/ws-command';
import { AttachSessionUseCase } from '@application/session';
import { DIAG_HANDLERS } from '@adapter/inbound/ws/diag/diag-commands';
import { PERMISSION_HANDLERS } from '@adapter/inbound/ws/permission/permission-commands';
import { DiagSessionOwnership } from '@adapter/outbound/diag/diag-session.ownership';
import { RegistrySessionOwnership } from '@adapter/outbound/session/registry-session.ownership';
import { SessionAttachHandler } from '@adapter/inbound/ws/session/session-attach.gateway-handler';
import { SESSION_HANDLERS } from '@adapter/inbound/ws/session/session-commands';
import { AppGateway } from '../websocket/app.gateway';
import { AuthModule } from './auth.module';
import { DiagModule } from './diag.module';
import { PermissionModule } from './permission.module';
import { SessionModule } from './session.module';
import { WebsocketModule } from './websocket.module';

/**
 * The gateway, and the table of commands it routes over.
 *
 * A command of the contract becomes a line in this list and a file in
 * `adapter/inbound/ws/<domain>/`. The gateway itself never grows a branch per command.
 */
const HANDLERS = [
  ...Object.values(DIAG_HANDLERS),
  SessionAttachHandler,
  ...Object.values(SESSION_HANDLERS),
  ...Object.values(PERMISSION_HANDLERS),
];

@Module({
  imports: [AuthModule, DiagModule, PermissionModule, SessionModule, WebsocketModule],
  providers: [
    {
      // Composed here, where both kinds of session are already in scope: `session.attach` asks
      // whether this user owns this stream, and a live session and the diagnostic round trip are
      // two different things that can both answer yes.
      provide: AttachSessionUseCase,
      inject: [RegistrySessionOwnership, DiagSessionOwnership],
      useFactory: (live: RegistrySessionOwnership, diag: DiagSessionOwnership) =>
        new AttachSessionUseCase([live, diag]),
    },
    SessionAttachHandler,
    {
      provide: WS_COMMAND_HANDLERS,
      inject: [...HANDLERS],
      useFactory: (...handlers: WsCommandHandler[]) => handlers,
    },
    AppGateway,
  ],
})
export class GatewayModule {}
