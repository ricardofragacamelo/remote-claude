/** Where the centre lives in the query cache — one place, so invalidating it is not a guess. */
export const notificationKeys = {
  all: ['notifications'] as const,
  list: () => [...notificationKeys.all, 'list'] as const,
};
