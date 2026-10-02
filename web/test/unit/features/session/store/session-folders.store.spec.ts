import { afterEach, describe, expect, it } from 'vitest';

import {
  folderOfSession,
  forgetSessionFolders,
  noteSessionFolder,
} from '@/features/session/store/session-folders.store';

afterEach(() => {
  forgetSessionFolders();
});

describe('the folder of each attached session — plan 08, B-42', () => {
  it('names the folder last noted for a session, and none for one never noted', () => {
    noteSessionFolder('s1', '/a');
    noteSessionFolder('s1', '/b');

    expect(folderOfSession('s1')).toBe('/b');
    expect(folderOfSession('s2')).toBeNull();
    expect(folderOfSession(undefined)).toBeNull();
  });

  it('forgets every one', () => {
    noteSessionFolder('s1', '/a');
    forgetSessionFolders();

    expect(folderOfSession('s1')).toBeNull();
  });
});
