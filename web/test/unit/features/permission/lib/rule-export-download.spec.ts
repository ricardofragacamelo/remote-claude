import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  downloadRuleExportFile,
  ruleExportFileName,
} from '@/features/permission/lib/rule-export-download';
import type { RuleExport } from '@/features/permission/types/rule';

const PAYLOAD: RuleExport = {
  format: 'remote-claude.permission-rules',
  version: 1,
  exportedAt: '2026-11-11T00:00:00.000Z',
  rules: [
    {
      pattern: 'shell(pnpm test:*)',
      decision: 'allow',
      scope: 'always',
      projectPath: null,
      expiresAt: '2027-01-01T00:00:00.000Z',
    },
  ],
};

describe('ruleExportFileName — today’s own date, in the installation’s own clock (plan 15, B-31)', () => {
  it('names the file after the given date, zero-padded', () => {
    expect(ruleExportFileName(new Date('2026-01-05T23:00:00.000Z'))).toBe(
      'remote-claude-rules-2026-01-05.json',
    );
  });

  it('names the file after a different date, same format', () => {
    expect(ruleExportFileName(new Date('2026-11-11T12:30:00.000Z'))).toBe(
      'remote-claude-rules-2026-11-11.json',
    );
  });
});

describe('downloadRuleExportFile — the one way the web ever writes to the visitor’s own disk (plan 15, B-31)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates an object URL from the payload, clicks a download link named by the date, and revokes it', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.fn();
    const anchor = { href: '', download: '', click } as unknown as HTMLAnchorElement;
    const createElement = vi.spyOn(document, 'createElement').mockReturnValue(anchor);

    downloadRuleExportFile(PAYLOAD, new Date('2026-11-11T00:00:00.000Z'));

    expect(createElement).toHaveBeenCalledWith('a');
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(anchor.href).toBe('blob:fake-url');
    expect(anchor.download).toBe('remote-claude-rules-2026-11-11.json');
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
  });

  it('revokes the object URL even when clicking the link throws', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.fn(() => {
      throw new Error('boom');
    });
    const anchor = { href: '', download: '', click } as unknown as HTMLAnchorElement;
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);

    expect(() => downloadRuleExportFile(PAYLOAD, new Date())).toThrow('boom');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
  });

  it('writes the payload itself into the blob, as JSON', async () => {
    let capturedBlob: Blob | null = null;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
      capturedBlob = blob as Blob;
      return 'blob:fake-url';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const anchor = { href: '', download: '', click: vi.fn() } as unknown as HTMLAnchorElement;
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);

    downloadRuleExportFile(PAYLOAD, new Date());

    expect(capturedBlob).not.toBeNull();
    const text = await (capturedBlob as unknown as Blob).text();
    expect(JSON.parse(text)).toEqual(PAYLOAD);
  });
});
