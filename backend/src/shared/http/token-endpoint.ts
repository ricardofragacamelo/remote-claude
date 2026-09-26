import type { ZodType } from 'zod';

/**
 * Reading an OAuth2 token endpoint's answer, in the caller's own words.
 *
 * Two integrations of this backend exchange something for a bearer token — the identity provider
 * exchanges an authorization code, the push provider exchanges a signed assertion — and the three
 * steps are the same in both: refuse a status that is not a success, refuse a body that is not the
 * shape, and answer the parsed one. The two differ only in **which** error they raise, which is
 * why that is the parameter.
 *
 * Written once because the shape it enforces is the point: a token endpoint that answered `200`
 * with an unusable body would otherwise leave one of the two callers holding `undefined` and
 * calling it a credential.
 *
 * @param refuse builds the caller's own error from a phrase describing what went wrong
 * @throws whatever `refuse` returns
 */
export async function readTokenAnswer<T>(
  response: Response,
  schema: ZodType<T>,
  refuse: (why: string) => Error,
): Promise<T> {
  if (!response.ok) {
    throw refuse(`answered ${String(response.status)}`);
  }

  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw refuse('answered an unusable body');
  }

  return parsed.data;
}
