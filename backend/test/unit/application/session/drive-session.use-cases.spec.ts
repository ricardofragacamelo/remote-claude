import { beforeEach, describe, expect, it } from 'vitest';

import {
  CloseSessionUseCase,
  CommandCatalog,
  InterruptSessionUseCase,
  ListSessionCommandsUseCase,
  PromptSessionUseCase,
  SessionEnder,
  SessionRegistry,
  SetSessionModelUseCase,
  SetSessionPermissionModeUseCase,
} from '@application/session';
import { UserId } from '@domain/auth';
import {
  ClaudeUnavailableError,
  InvalidSessionIdError,
  SessionForbiddenError,
  SessionLockedError,
  SessionNotFoundError,
  UnknownCommandError,
} from '@domain/session';
import type { Session } from '@domain/session';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import {
  aClock,
  aCommand,
  aRegistry,
  aSession,
  RecordingHandle,
  SESSION_ID,
} from '../../../support/builders/session.builder';
import { RecordingBroadcaster } from '../../../support/fakes/recording-broadcaster';

const owner = UserId.create('auth|owner');
const stranger = UserId.create('auth|stranger');

describe('the commands that drive a running session', () => {
  let registry: SessionRegistry;
  let handle: RecordingHandle;
  let session: Session;
  let broadcaster: RecordingBroadcaster;
  let clock: FixedClock;

  beforeEach(() => {
    session = aSession();
    clock = aClock();
    const built = aRegistry([session], 10, clock);
    registry = built.registry;
    handle = built.handles.get(SESSION_ID) as RecordingHandle;
    broadcaster = new RecordingBroadcaster();
  });

  describe('prompt', () => {
    const prompter = (): PromptSessionUseCase =>
      new PromptSessionUseCase(registry, new CommandCatalog());

    /**
     * A prompt as the gateway handles it: checked, and handed to the CLI once acknowledged — here, as
     * soon as the check resolves, so the order of the sends is the order the checks resolved in.
     */
    const sent = (prompt: PromptSessionUseCase, text: string): Promise<void> =>
      prompt.execute(SESSION_ID, text, owner).then((send) => {
        send();
      });

    it('queues the turn', async () => {
      await sent(prompter(), 'hello');

      expect(handle.prompts).toEqual(['hello']);
    });

    describe('while an undo is putting files back — plan 05, B-27', () => {
      beforeEach(() => {
        session.moveTo('idle');
      });

      it('refuses the prompt as locked, and sends nothing — S-54', async () => {
        session.beginRewind();

        await expect(sent(prompter(), 'carry on')).rejects.toThrow(SessionLockedError);
        expect(handle.prompts).toEqual([]);
      });

      it('says the lock is the undo, not a turn — S-54', async () => {
        session.beginRewind();

        await expect(prompter().execute(SESSION_ID, 'carry on', owner)).rejects.toMatchObject({
          params: { reason: 'rewindRunning' },
        });
      });

      it('refuses a slash command whose menu was being read when the undo began — S-55', async () => {
        // The menu is read from the CLI, and the undo can take the lock in that gap. Checked only
        // before the read, the command would go through onto a disk halfway back.
        handle.commands = [aCommand('init')];
        let release = (): void => undefined;
        handle.commandsHeld = new Promise((resolve) => {
          release = resolve;
        });

        const prompt = prompter().execute(SESSION_ID, '/init', owner);
        while (handle.commandCalls === 0) {
          await Promise.resolve();
        }
        session.beginRewind();
        release();

        await expect(prompt).rejects.toThrow(SessionLockedError);
      });

      it('takes the prompt again once the undo is over — S-54', async () => {
        session.beginRewind();
        session.endRewind();

        await sent(prompter(), 'carry on');

        expect(handle.prompts).toEqual(['carry on']);
      });
    });

    it('queues a second prompt rather than refusing it — S-22', async () => {
      // The SDK does this natively, it was measured, and it is what the Claude Code UI does.
      // Rejecting a concurrent prompt with a conflict was our own policy and it was wrong.
      const prompt = prompter();

      await Promise.all([sent(prompt, 'first'), sent(prompt, 'second')]);

      expect(handle.prompts).toEqual(['first', 'second']);
    });

    it('preserves the order the prompts arrived in — S-23', async () => {
      const prompt = prompter();

      await Promise.all(['a', 'b', 'c'].map((text) => sent(prompt, text)));

      expect(handle.prompts).toEqual(['a', 'b', 'c']);
    });

    it('refuses a session that is not running', async () => {
      await expect(
        new PromptSessionUseCase(aRegistry([]).registry, new CommandCatalog()).execute(
          SESSION_ID,
          'x',
          owner,
        ),
      ).rejects.toThrow(SessionNotFoundError);
    });

    it("refuses somebody else's session as forbidden, not as absent", async () => {
      await expect(prompter().execute(SESSION_ID, 'x', stranger)).rejects.toThrow(
        SessionForbiddenError,
      );
    });

    it('refuses an id that is not a ULID', async () => {
      await expect(prompter().execute('nope', 'x', owner)).rejects.toThrow(InvalidSessionIdError);
    });

    describe('a slash command', () => {
      beforeEach(() => {
        handle.cliVersion = '2.1.277';
        handle.commands = [
          aCommand('init'),
          aCommand('usage', { aliases: ['cost'] }),
          aCommand('agents', { description: '(removed) Ask Claude to manage subagents' }),
        ];
      });

      it('sends a command the installation has — S-32', async () => {
        await sent(prompter(), '/init');

        expect(handle.prompts).toEqual(['/init']);
      });

      it('sends a command named by its alias', async () => {
        await sent(prompter(), '/cost');

        expect(handle.prompts).toEqual(['/cost']);
      });

      it('sends a command the menu hides: hiding is not refusing — D-05', async () => {
        await sent(prompter(), '/agents');

        expect(handle.prompts).toEqual(['/agents']);
      });

      it('hands nothing to the CLI until the caller runs the send — the ack goes first', async () => {
        const send = await prompter().execute(SESSION_ID, '/init', owner);

        expect(handle.prompts).toEqual([]);
        send();
        expect(handle.prompts).toEqual(['/init']);
      });

      it('refuses a command the installation does not have, and sends nothing — S-34', async () => {
        const refusal = prompter().execute(SESSION_ID, '/heapsnap now', owner);

        await expect(refusal).rejects.toThrow(UnknownCommandError);
        await expect(refusal).rejects.toMatchObject({
          code: 'INVALID_INPUT',
          messageKey: 'session.error.unknownCommand',
          params: { command: 'heapsnap' },
        });
        expect(handle.prompts).toEqual([]);
      });

      it('never asks the installation about a prompt that is not a command', async () => {
        await sent(prompter(), '/tmp/build is empty, why?');

        expect(handle.prompts).toEqual(['/tmp/build is empty, why?']);
        expect(handle.commandCalls).toBe(0);
      });

      it('refuses nothing when the list cannot be had — S-31', async () => {
        handle.commandsFailWith = new ClaudeUnavailableError(SESSION_ID);

        await sent(prompter(), '/whatever');

        expect(handle.prompts).toEqual(['/whatever']);
      });

      it('keeps the order when a command has to wait for the list', async () => {
        let release = (): void => undefined;
        handle.commandsHeld = new Promise<void>((resolve) => {
          release = resolve;
        });
        const prompt = prompter();

        const first = sent(prompt, '/init');
        const second = sent(prompt, 'and then this');
        release();
        await Promise.all([first, second]);

        expect(handle.prompts).toEqual(['/init', 'and then this']);
      });

      it('lets the prompt after a refused one through', async () => {
        const prompt = prompter();

        const refused = sent(prompt, '/nope');
        const next = sent(prompt, 'hello');

        await expect(refused).rejects.toThrow(UnknownCommandError);
        await next;
        expect(handle.prompts).toEqual(['hello']);
      });
    });
  });

  describe('list commands', () => {
    it('answers the menu with the version of the CLI — S-29, S-60', async () => {
      handle.cliVersion = '2.1.277';
      handle.commands = [
        aCommand('zeta'),
        aCommand('init'),
        aCommand('__remote-workflow'),
        aCommand('extra-usage', { description: 'Renamed to /usage-credits' }),
      ];

      const menu = await new ListSessionCommandsUseCase(registry, new CommandCatalog()).execute(
        SESSION_ID,
        owner,
      );

      expect(menu.cliVersion).toBe('2.1.277');
      expect(menu.commands.map((command) => [command.name, command.suggested])).toEqual([
        ['init', true],
        ['zeta', false],
      ]);
    });

    it("refuses somebody else's session", async () => {
      await expect(
        new ListSessionCommandsUseCase(registry, new CommandCatalog()).execute(
          SESSION_ID,
          stranger,
        ),
      ).rejects.toThrow(SessionForbiddenError);
    });

    it('lets the failure of the CLI through — S-31', async () => {
      handle.commandsFailWith = new ClaudeUnavailableError(SESSION_ID);

      await expect(
        new ListSessionCommandsUseCase(registry, new CommandCatalog()).execute(SESSION_ID, owner),
      ).rejects.toThrow(ClaudeUnavailableError);
    });
  });

  describe('interrupt', () => {
    it('forwards the control request', async () => {
      await new InterruptSessionUseCase(registry).execute(SESSION_ID, owner);

      expect(handle.interrupts).toBe(1);
    });

    it('refuses a session that is already over — S-29', () => {
      // Nothing persists a live session, so "closed" and "never existed" are the same answer.
      return expect(
        new InterruptSessionUseCase(aRegistry([]).registry).execute(SESSION_ID, owner),
      ).rejects.toThrow(SessionNotFoundError);
    });
  });

  describe('setModel', () => {
    it('changes it on the subprocess and on the session', async () => {
      await new SetSessionModelUseCase(registry).execute(SESSION_ID, 'claude-opus-5', owner);

      expect(handle.models).toEqual(['claude-opus-5']);
      expect(session.model).toBe('claude-opus-5');
    });

    it('leaves the session alone when the subprocess refused', async () => {
      // The entity records what the SDK actually accepted, never what we asked for: a session
      // reporting a model it is not running is worse than one that failed visibly.
      handle.failWith = new Error('no such model');

      await expect(
        new SetSessionModelUseCase(registry).execute(SESSION_ID, 'nope', owner),
      ).rejects.toThrow('no such model');
      expect(session.model).toBe('claude-sonnet-5');
    });
  });

  describe('setPermissionMode', () => {
    it('changes it on the subprocess and on the session', async () => {
      await new SetSessionPermissionModeUseCase(registry).execute(SESSION_ID, 'acceptEdits', owner);

      expect(handle.modes).toEqual(['acceptEdits']);
      expect(session.permissionMode).toBe('acceptEdits');
    });
  });

  describe('activity — plan 05, D-02', () => {
    it('counts any command of the owner as activity, resetting the idle clock — S-04', async () => {
      clock.advance(60_000);

      await new InterruptSessionUseCase(registry).execute(SESSION_ID, owner);

      expect(session.lastActivityAt).toEqual(clock.now());
    });

    it("does not count somebody else's refused command — S-04", async () => {
      const before = session.lastActivityAt;
      clock.advance(60_000);

      await expect(
        new InterruptSessionUseCase(registry).execute(SESSION_ID, stranger),
      ).rejects.toThrow(SessionForbiddenError);
      expect(session.lastActivityAt).toEqual(before);
    });
  });

  describe('close', () => {
    it('ends the session, forgets it and announces it', async () => {
      await new CloseSessionUseCase(registry, new SessionEnder(registry, broadcaster)).execute(
        SESSION_ID,
        owner,
      );

      expect(handle.closes).toBe(1);
      expect(session.closeReason).toBe('closedByUser');
      expect(registry.find(session.id)).toBeNull();
      expect(broadcaster.events.at(-1)?.event).toMatchObject({
        type: 'session.closed',
        payload: { reason: 'closedByUser' },
      });
    });

    it('forgets the session even when releasing the subprocess failed', async () => {
      // Whatever the subprocess does on the way out, the entry goes and everybody is told. A
      // registry holding a session whose close threw is a session nobody can act on and nobody
      // can see ending.
      handle.failWith = new Error('already gone');

      await expect(
        new CloseSessionUseCase(registry, new SessionEnder(registry, broadcaster)).execute(
          SESSION_ID,
          owner,
        ),
      ).rejects.toThrow('already gone');

      expect(registry.find(session.id)).toBeNull();
      expect(broadcaster.events.at(-1)?.event.type).toBe('session.closed');
    });

    it("refuses somebody else's session as forbidden, and closes nothing — S-38", async () => {
      // Only the owner may end a session. `403` is what that is: the credential is good, and the
      // caller still may not ([D-17](../../../../docs/plans/01-live-session/decisions.md)).
      await expect(
        new CloseSessionUseCase(registry, new SessionEnder(registry, broadcaster)).execute(
          SESSION_ID,
          stranger,
        ),
      ).rejects.toThrow(SessionForbiddenError);
      expect(handle.closes).toBe(0);
    });
  });
});
