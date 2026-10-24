import { afterEach, describe, expect, it, vi } from 'vitest';

import * as editorFeature from '@/features/editor';
import { writeAndOpen } from '@/engines/claude/settings/lib/write-and-open';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('writeAndOpen — plan 13, D-18', () => {
  it('writes the file, calls onCreated, then navigates to it in the editor', async () => {
    const createFile = vi
      .spyOn(editorFeature, 'createFile')
      .mockResolvedValue({ path: '.claude/commands/review.md', etag: 'a' });
    const onCreated = vi.fn();
    const navigate = vi.fn();

    await writeAndOpen(
      { folder: '/srv/app', path: '.claude/commands/review.md', content: 'body' },
      navigate,
      onCreated,
    );

    expect(createFile).toHaveBeenCalledWith({
      folder: '/srv/app',
      path: '.claude/commands/review.md',
      content: 'body',
      encoding: 'utf8',
      bom: false,
      confirmSensitive: false,
    });
    expect(onCreated).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith({
      href: expect.stringContaining(encodeURIComponent('.claude/commands/review.md')),
    });
  });

  it('never calls onCreated or navigates when the write itself fails', async () => {
    vi.spyOn(editorFeature, 'createFile').mockRejectedValue(new Error('FILE_EXISTS'));
    const onCreated = vi.fn();
    const navigate = vi.fn();

    await expect(
      writeAndOpen({ folder: '/srv/app', path: 'a.md', content: '' }, navigate, onCreated),
    ).rejects.toThrow();

    expect(onCreated).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
