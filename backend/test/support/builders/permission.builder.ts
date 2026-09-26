import { RecordAuditEventUseCase } from '@application/audit';
import {
  DescribePermissionUseCase,
  EndSessionPermissionsUseCase,
  ExtendPermissionUseCase,
  GrantPermissionRuleUseCase,
  DescribePermissionRuleUseCase,
  ListPermissionRulesUseCase,
  PermissionDeadlines,
  PermissionRegistry,
  PermissionRuleBook,
  PermissionSettlement,
  RequestPermissionUseCase,
  ResolvePermissionUseCase,
  RevokePermissionRuleUseCase,
} from '@application/permission';
import type { PermissionSettings } from '@application/permission';
import { UserId } from '@domain/auth';
import type { PermissionMode } from '@domain/session';
import { SessionId } from '@domain/session';
import { FixedClock } from '../fakes/fixed-clock';
import { InMemoryPermissionRequestRepository } from '../fakes/in-memory-permission-request.repository';
import { InMemoryPermissionRuleRepository } from '../fakes/in-memory-permission-rule.repository';
import { RecordingAuditEvents } from '../fakes/recording-audit-events';
import { ManualScheduler } from '../fakes/manual-scheduler';
import { RecordingPermissionBroadcaster } from '../fakes/recording-permission-broadcaster';
import { RecordingPermissionEvents } from '../fakes/recording-permission-events';
import { SequentialIds } from '../fakes/sequential-ids';
import { SESSION_ID } from './session.builder';

/**
 * The numbers a test runs with.
 *
 * Every scenario fixes the values it uses, or it stops being deterministic — the plan says so
 * explicitly ([D-09](../../../../docs/plans/01-live-session/decisions.md)). These are small enough
 * to reason about in a single expression: a deadline of one second and an extension of two, so an
 * extension always moves a fresh deadline and the difference is visible in an assertion.
 */
export const TEST_PERMISSION_SETTINGS: PermissionSettings = {
  timeoutMs: 1_000,
  extensionMs: 2_000,
  maxExtensions: 2,
  ruleLifetimeMs: 60_000,
  ruleDefaultLifetimeMs: 3_600_000,
  ruleMaxLifetimeMs: 86_400_000,
};

/** The whole permission stack, with every edge replaced by something a test can read. */
export interface PermissionHarness {
  readonly registry: PermissionRegistry;
  readonly requests: InMemoryPermissionRequestRepository;
  readonly rules: InMemoryPermissionRuleRepository;
  readonly trail: RecordingAuditEvents;
  readonly ruleBook: PermissionRuleBook;

  /** Failures the rule book reported instead of letting them decide anything. */
  readonly lookupFailures: readonly unknown[];
  readonly broadcaster: RecordingPermissionBroadcaster;
  readonly events: RecordingPermissionEvents;
  readonly scheduler: ManualScheduler;
  readonly clock: FixedClock;
  readonly ids: SequentialIds;
  readonly settlement: PermissionSettlement;
  readonly deadlines: PermissionDeadlines;

  /** Failures a deadline reported instead of letting escape as an unhandled rejection. */
  readonly deadlineFailures: readonly unknown[];
  readonly request: RequestPermissionUseCase;
  readonly resolve: ResolvePermissionUseCase;
  readonly extend: ExtendPermissionUseCase;
  readonly endSession: EndSessionPermissionsUseCase;
  readonly describe: DescribePermissionUseCase;
  readonly grant: GrantPermissionRuleUseCase;
  readonly revoke: RevokePermissionRuleUseCase;
  readonly list: ListPermissionRulesUseCase;
  readonly describeRule: DescribePermissionRuleUseCase;
}

/** The session most permission tests ask about. */
export const PERMISSION_SESSION = SessionId.create(SESSION_ID);

/** The person most permission tests are. */
export const PERMISSION_OWNER = UserId.create('auth|owner');

/** The workspace root most permission tests run in. */
export const PERMISSION_PROJECT = '/srv/projects/app';

/** The instant the harness starts at. */
export const PERMISSION_NOW = new Date('2026-09-19T12:00:00.000Z');

/**
 * The permission module, wired by hand.
 *
 * One builder rather than eleven `new` calls per spec: the wiring is the same every time, and a
 * spec that assembled its own would be a spec that quietly diverges from the container the
 * product actually runs.
 */
export function aPermissionModule(
  settings: PermissionSettings = TEST_PERMISSION_SETTINGS,
): PermissionHarness {
  const registry = new PermissionRegistry();
  const requests = new InMemoryPermissionRequestRepository();
  const broadcaster = new RecordingPermissionBroadcaster();
  const events = new RecordingPermissionEvents();
  const scheduler = new ManualScheduler();
  const clock = new FixedClock(PERMISSION_NOW);
  const ids = new SequentialIds();
  const rules = new InMemoryPermissionRuleRepository();
  const trail = new RecordingAuditEvents();
  const lookupFailures: unknown[] = [];
  const ruleBook = new PermissionRuleBook(registry, rules, (error) => {
    lookupFailures.push(error);
  });
  const recordEvent = new RecordAuditEventUseCase(trail, ids);
  const grant = new GrantPermissionRuleUseCase(rules, recordEvent, ids, clock, settings);

  const settlement = new PermissionSettlement(
    registry,
    requests,
    broadcaster,
    events,
    ids,
    settings,
  );
  const deadlineFailures: unknown[] = [];
  const deadlines = new PermissionDeadlines(registry, settlement, scheduler, clock, (error) => {
    deadlineFailures.push(error);
  });

  return {
    registry,
    requests,
    rules,
    trail,
    ruleBook,
    lookupFailures,
    broadcaster,
    events,
    scheduler,
    clock,
    ids,
    settlement,
    deadlines,
    deadlineFailures,
    request: new RequestPermissionUseCase(
      registry,
      requests,
      ruleBook,
      settlement,
      deadlines,
      broadcaster,
      events,
      clock,
      settings,
    ),
    resolve: new ResolvePermissionUseCase(registry, settlement, grant, clock),
    extend: new ExtendPermissionUseCase(
      registry,
      requests,
      deadlines,
      broadcaster,
      clock,
      settings,
    ),
    endSession: new EndSessionPermissionsUseCase(registry, settlement, clock),
    describe: new DescribePermissionUseCase(registry, settings),
    grant,
    revoke: new RevokePermissionRuleUseCase(rules, recordEvent, clock),
    list: new ListPermissionRulesUseCase(rules, clock),
    describeRule: new DescribePermissionRuleUseCase(rules, clock),
  };
}

/** One question, with everything a test does not care about defaulted. */
export function aPermissionQuestion(
  overrides: {
    requestId?: string;
    toolName?: string;
    input?: Record<string, unknown>;
    toolUseId?: string | null;
    userId?: UserId;
    sessionId?: SessionId;
    projectPath?: string | null;
    permissionMode?: PermissionMode;
  } = {},
) {
  return {
    requestId: overrides.requestId ?? 'request-1',
    sessionId: overrides.sessionId ?? PERMISSION_SESSION,
    userId: overrides.userId ?? PERMISSION_OWNER,
    projectPath: overrides.projectPath === undefined ? PERMISSION_PROJECT : overrides.projectPath,
    permissionMode: overrides.permissionMode ?? 'default',
    toolUseId: overrides.toolUseId === undefined ? 'toolu-1' : overrides.toolUseId,
    toolName: overrides.toolName ?? 'Bash',
    input: overrides.input ?? { command: 'rm -rf build/' },
  };
}
