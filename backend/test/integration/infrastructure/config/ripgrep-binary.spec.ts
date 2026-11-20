import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { ConfigurationError } from '@remote-claude/config';
import { resolveRipgrepBinary } from '@infra/config/ripgrep-binary';
import { RecordingLogger } from '../../../support/fakes/recording-logger';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '../../../fixtures/process');

let scratch: string | null = null;

afterEach(async () => {
  if (scratch !== null) {
    await rm(scratch, { recursive: true, force: true });
    scratch = null;
  }
});

describe('resolveRipgrepBinary against real binaries — ADR-016, plan 11 B-07', () => {
  it('resolves the pinned @vscode/ripgrep binary when no override is given — S-18', async () => {
    const logger = new RecordingLogger();

    const binary = await resolveRipgrepBinary(null, logger.logger);

    expect(binary.path).toMatch(/rg$/);
    expect(binary.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(logger.withOp('search.ripgrep.resolved')).toHaveLength(1);
  });

  it('resolves and proves an override that is a real, modern-enough binary — S-18', async () => {
    const path = join(FIXTURES, 'fake-rg-ok.mjs');

    const binary = await resolveRipgrepBinary(path, new RecordingLogger().logger);

    expect(binary).toEqual({ path, version: '15.0.0' });
  });

  it('never lets RIPGREP_CONFIG_PATH of this process reach the version check — S-22', async () => {
    const path = join(FIXTURES, 'fake-rg-ok.mjs');
    const original = process.env['RIPGREP_CONFIG_PATH'];
    process.env['RIPGREP_CONFIG_PATH'] = '/etc/ripgreprc';

    try {
      const binary = await resolveRipgrepBinary(path, new RecordingLogger().logger);
      expect(binary.version).toBe('15.0.0');
    } finally {
      if (original === undefined) delete process.env['RIPGREP_CONFIG_PATH'];
      else process.env['RIPGREP_CONFIG_PATH'] = original;
    }
  });

  it('stops the boot when the configured path does not exist — S-19', async () => {
    const failure = resolveRipgrepBinary('/does/not/exist/rg', new RecordingLogger().logger);

    await expect(failure).rejects.toBeInstanceOf(ConfigurationError);
    await expect(failure).rejects.toMatchObject({
      problems: [expect.stringContaining('RC_RIPGREP_PATH')],
    });
  });

  it('stops the boot when the configured path is not executable — S-19', async () => {
    scratch = await mkdtemp(join(tmpdir(), 'rc-rg-'));
    const path = join(scratch, 'rg');
    await writeFile(path, '#!/bin/sh\necho hi\n');
    await chmod(path, 0o644);

    await expect(resolveRipgrepBinary(path, new RecordingLogger().logger)).rejects.toThrow(
      ConfigurationError,
    );
  });

  it('stops the boot when the binary reports below the minimum version — S-20', async () => {
    await expect(
      resolveRipgrepBinary(join(FIXTURES, 'fake-rg-old.mjs'), new RecordingLogger().logger),
    ).rejects.toMatchObject({
      problems: [expect.stringContaining('below the minimum')],
    });
  });

  it('stops the boot when the binary at the path is not ripgrep at all', async () => {
    await expect(
      resolveRipgrepBinary(join(FIXTURES, 'fake-rg-garbage.mjs'), new RecordingLogger().logger),
    ).rejects.toMatchObject({
      problems: [expect.stringContaining('did not report a ripgrep version')],
    });
  });
});
