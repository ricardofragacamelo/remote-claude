import type { ZodType } from 'zod';

import { payloadOf } from './frame-payload';
import { accepted, causedBy } from './ws-command';
import type { WsCommandContext, WsCommandHandler, WsCommandOutcome } from './ws-command';

/** An event one command caused, on its way to everybody watching that session. */
export interface CausedEvent {
  readonly sessionId: string;
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/** What a command does once its frame has been validated. */
export type CommandAction<T> = (
  command: T,
  context: WsCommandContext,
) => Promise<CausedEvent | void> | CausedEvent | void;

/**
 * One command of the contract: validate the frame, do one thing, ack, and maybe publish.
 *
 * Every handler in this gateway was those four steps, and the only things that differed were the
 * schema and the middle one. Writing the other three once is what stops two of them from drifting
 * in the place nobody looks — the order, in particular: the ack goes out **before** anything the
 * command caused, so a client is never told a result before it is told the command was accepted.
 *
 * The ack means **accepted**, never finished. The outcome of the work arrives as an event on the
 * stream, and making a client wait for an ack to learn a result would put request/response back
 * where a stream was chosen.
 */
export class ContractCommandHandler<T> implements WsCommandHandler {
  constructor(
    readonly type: string,
    private readonly schema: ZodType<T>,
    private readonly run: CommandAction<T>,
  ) {}

  async handle(context: WsCommandContext): Promise<WsCommandOutcome> {
    const caused = (await this.run(payloadOf(context.frame, this.schema), context)) ?? null;

    return {
      ack: accepted(this.type),
      then: [],
      publish: () => {
        if (caused !== null) {
          context.publish(caused.sessionId, {
            type: caused.type,
            payload: caused.payload,
            ...causedBy(context),
          });
        }
      },
    };
  }
}
