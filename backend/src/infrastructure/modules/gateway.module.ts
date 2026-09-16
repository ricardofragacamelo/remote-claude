import { Module } from '@nestjs/common';

import { WS_COMMAND_HANDLERS } from '@adapter/inbound/ws/ws-command';
import { SessionAttachHandler } from '@adapter/inbound/ws/session/session-attach.gateway-handler';
import { SessionPingHandler } from '@adapter/inbound/ws/session/session.gateway-handler';
import { AppGateway } from '../websocket/app.gateway';
import { AuthModule } from './auth.module';
import { SessionModule } from './session.module';
import { WebsocketModule } from './websocket.module';

/**
 * The gateway, and the table of commands it routes over.
 *
 * A command of the contract becomes a line in this list and a file in
 * `adapter/inbound/ws/<domain>/`. The gateway itself never grows a branch per command.
 */
@Module({
  imports: [AuthModule, SessionModule, WebsocketModule],
  providers: [
    {
      provide: WS_COMMAND_HANDLERS,
      inject: [SessionPingHandler, SessionAttachHandler],
      useFactory: (ping: SessionPingHandler, attach: SessionAttachHandler) => [ping, attach],
    },
    AppGateway,
  ],
})
export class GatewayModule {}
