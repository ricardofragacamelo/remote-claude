/**
 * Full-page navigation, in one place.
 *
 * The OIDC flow is the only thing in this application that leaves the page: it hands the browser
 * to the provider and gets it back on the callback. Routing between screens is the router's job,
 * not this one's.
 *
 * It exists as an object rather than as bare calls so the sign-in can be exercised without a real
 * browser navigation — `globalThis.location` cannot be replaced, and a test that cannot observe the
 * redirect cannot prove the login starts.
 */
export const navigation = {
  /** Leaves for `url`, keeping this page in the history. */
  assign(url: string): void {
    globalThis.location.assign(url);
  },

  /** Leaves for `url`, replacing this page in the history. */
  replace(url: string): void {
    globalThis.location.replace(url);
  },

  /** The query string of the current page. */
  search(): string {
    return globalThis.location.search;
  },

  /** The origin this application is served from. */
  origin(): string {
    return globalThis.location.origin;
  },
};
