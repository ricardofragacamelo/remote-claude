/**
 * The fields the previous protocol named a tool call by, from the canonical ones — the window of
 * deprecation of plan 28 (D-08), for the socket and for the history over HTTP alike. Gone with the
 * window, in F7 (B-47).
 */

type Payload = Readonly<Record<string, unknown>>;

/** The engine's own name for the call, from its `origin` — `''` when the payload has none. */
function nativeOf(payload: Payload): string {
  const origin = payload['origin'] as { native?: unknown } | undefined;
  return typeof origin?.native === 'string' ? origin.native : '';
}

/**
 * `toolName` and `input`, as the previous protocol carried them on `tool.started` and
 * `permission.requested`: the engine's name and the raw input. Nothing for a payload of any other
 * kind.
 */
export function previousToolFields(payload: Payload): Payload {
  return payload['origin'] === undefined
    ? {}
    : { toolName: nativeOf(payload), input: payload['rawInput'] ?? {} };
}

/** The `title` of a `permission.requested` as the previous protocol keyed it: by the engine's name. */
export function previousPermissionTitle(payload: Payload): string {
  return `permission.tool.${nativeOf(payload)}`;
}
