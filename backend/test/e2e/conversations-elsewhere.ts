import { json, Router } from 'express';
import type { Request, Response } from 'express';

import {
  capturedTranscript,
  compactedChain,
  recordedHistory,
} from '../fakes/agent-sdk/scripted-transcripts';
import type { ScriptedTranscripts } from '../fakes/agent-sdk/scripted-transcripts';

/** Where the suite plants a conversation begun elsewhere — on the scripted entry point only. */
export const ELSEWHERE_PATH = '/e2e/conversations-elsewhere';

/** What the suite plants: the conversation's id, the folder it runs in, and what it said. */
interface PlantedConversation {
  readonly conversationId: string;
  readonly cwd: string;
  readonly fixture: string;
  readonly title: string;
  /**
   * `true` plants what the SDK **read back** of the recording — its `history`, with the prompts and
   * the instants of every entry (plan 22, B-34); otherwise, the messages of its stream.
   */
  readonly history?: boolean;
}

/** Entries of a recording's `history`, from `from` up to (not including) `to` — all of it by default. */
interface RecordedEntries {
  readonly fixture: string;
  readonly from?: number;
  readonly to?: number;
}

/** The recording whose compaction the chain becomes. */
interface RewrittenChain {
  readonly fixture: string;
}

/** What the door keeps of each conversation it planted. */
interface Planted {
  /** The copy number its uuids carry, so no two planted conversations share a message id. */
  readonly copy: number;
  /** The last `lastModified` it wrote: every write moves it on, strictly. */
  lastModified: number;
}

/** A recording is named like its file, and nothing else: no path reaches outside the fixtures. */
const RECORDING_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The one door of the suite into the store of conversations: a conversation **begun elsewhere** —
 * the editor of the person, writing it at this moment — which no session of this backend opened
 * (plan 08, F6) — and, since plan 22 (B-34, D-17), that conversation **growing** while it is read.
 *
 * Everything else the suite reads back the product wrote during the run; this one cannot be, since
 * what makes it external is that the product never opened it. So it is written with the store's own
 * functions — `add`, `append`, `rewrite` — out of the messages of a captured run, never a transcript
 * somebody typed, and written now, which is what "active elsewhere" means and what the follower of
 * the backend looks at (`lastModified`).
 *
 * - `POST /` plants it — `201`.
 * - `POST /:conversationId/entries` writes the next entries of a recording's history at its end —
 *   `204`.
 * - `PUT /:conversationId/chain` rewrites it as a compaction does: the chain becomes what the
 *   recording said after its `compact_boundary` — `204`.
 *
 * A conversation the door did not plant is `404`; a recording that is not there, or has not what is
 * asked of it, is `400`. It is mounted beside the providers it replaces (`scripted-main.ts`), and the
 * product's entry point has no such route.
 */
export function conversationsElsewhere(transcripts: ScriptedTranscripts): Router {
  const router = Router();
  const planted = new Map<string, Planted>();
  let copies = 0;

  /** The instant of a write: now, and never the instant of the write before. */
  const written = (conversation: Planted): number => {
    conversation.lastModified = Math.max(Date.now(), conversation.lastModified + 1);
    return conversation.lastModified;
  };

  router.use(json());

  router.post('/', (request: Request, response: Response) => {
    const seed = request.body as PlantedConversation;

    recorded(response, seed.fixture, () => {
      const conversation: Planted = { copy: copies + 1, lastModified: 0 };
      const messages =
        seed.history === true
          ? recordedHistory(seed.fixture, conversation.copy)
          : capturedTranscript(seed.fixture, conversation.copy);

      transcripts.add({
        sessionId: seed.conversationId,
        directory: seed.cwd,
        cwd: seed.cwd,
        summary: seed.title,
        lastModified: written(conversation),
        messages,
      });
      copies = conversation.copy;
      planted.set(seed.conversationId, conversation);
      response.status(201).end();
    });
  });

  router.post('/:conversationId/entries', (request: Request, response: Response) => {
    const conversation = planted.get(String(request.params['conversationId']));
    const entries = request.body as RecordedEntries;

    if (conversation === undefined) {
      response.status(404).end();
      return;
    }

    recorded(response, entries.fixture, () => {
      const messages = recordedHistory(entries.fixture, conversation.copy).slice(
        entries.from ?? 0,
        entries.to,
      );

      transcripts.append(String(request.params['conversationId']), messages, written(conversation));
      response.status(204).end();
    });
  });

  router.put('/:conversationId/chain', (request: Request, response: Response) => {
    const conversation = planted.get(String(request.params['conversationId']));
    const chain = request.body as RewrittenChain;

    if (conversation === undefined) {
      response.status(404).end();
      return;
    }

    recorded(response, chain.fixture, () => {
      transcripts.rewrite(
        String(request.params['conversationId']),
        compactedChain(chain.fixture, conversation.copy),
        written(conversation),
      );
      response.status(204).end();
    });
  });

  return router;
}

/**
 * Runs what reads a recording, and answers `400` — with why — when the name is not one, or the
 * recording has not what was asked of it: a mistake of the spec, said to the spec.
 */
function recorded(response: Response, fixture: unknown, write: () => void): void {
  if (typeof fixture !== 'string' || !RECORDING_NAME.test(fixture)) {
    response.status(400).json({ error: `not the name of a recording: ${String(fixture)}` });
    return;
  }

  try {
    write();
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
