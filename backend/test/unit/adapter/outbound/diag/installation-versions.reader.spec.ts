import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  InstallationVersionReader,
  ownPackageVersion,
} from '@adapter/outbound/diag/installation-versions.reader';
import type { VersionReaders } from '@adapter/outbound/diag/installation-versions.reader';
import { EngineRegistry } from '@application/session';
import type { EngineSelfDescription } from '@application/session';
import { StubEngine } from '../../../../support/fakes/stub-engine';

/** An engine that names the parts of its installation as the test says. */
class PartsEngine extends StubEngine {
  constructor(
    engine: string,
    private readonly components: EngineSelfDescription['components'],
  ) {
    super(engine);
  }

  override async describe(): Promise<EngineSelfDescription> {
    return { ...(await super.describe()), components: this.components };
  }
}

const readers: VersionReaders = {
  backend: () => ({ version: '1.2.3', reason: null }),
  node: () => '24.0.0',
};

describe('InstallationVersionReader', () => {
  it('reads the versions of this very installation by default — plan 06, S-65', async () => {
    const versions = (
      await InstallationVersionReader.of(new EngineRegistry([new StubEngine()], 'claude'))
    ).read();

    expect(versions.backend).toEqual({ version: '0.0.0', reason: null });
    expect(versions.node).toEqual({ version: process.versions.node, reason: null });
  });

  it('answers the engine’s parts as the default engine describes them — plan 28, S-100', async () => {
    const engine = new PartsEngine('test-engine', {
      binary: { version: '2.1.277', reason: null },
      library: { version: '0.3.277', reason: null },
    });
    const other = new PartsEngine('claude', {
      binary: { version: '9.9.9', reason: null },
      library: null,
    });
    const registry = new EngineRegistry([other, engine], 'test-engine');

    expect((await InstallationVersionReader.of(registry, readers)).read()).toEqual({
      backend: { version: '1.2.3', reason: null },
      agentSdk: { version: '0.3.277', reason: null },
      claudeCli: { version: '2.1.277', reason: null },
      node: { version: '24.0.0', reason: null },
    });
  });

  it('answers null and the reason for what it cannot read — S-66', async () => {
    const engine = new PartsEngine('claude', {
      binary: { version: null, reason: 'notInstalled' },
      library: { version: null, reason: 'unreadable' },
    });
    const broken: VersionReaders = {
      backend: () => ({ version: null, reason: 'unreadable' }),
      node: () => '24.0.0',
    };

    expect(
      (await InstallationVersionReader.of(new EngineRegistry([engine], 'claude'), broken)).read(),
    ).toEqual({
      backend: { version: null, reason: 'unreadable' },
      agentSdk: { version: null, reason: 'unreadable' },
      claudeCli: { version: null, reason: 'notInstalled' },
      node: { version: '24.0.0', reason: null },
    });
  });

  it('says the library is not installed for an engine driven with none', async () => {
    const engine = new PartsEngine('claude', {
      binary: { version: '1.0.0', reason: null },
      library: null,
    });

    const versions = (
      await InstallationVersionReader.of(new EngineRegistry([engine], 'claude'), readers)
    ).read();

    expect(versions.agentSdk).toEqual({ version: null, reason: 'notInstalled' });
  });

  it('asks the engine once, however often it is asked — S-68', async () => {
    const engine = new StubEngine();
    let backendReads = 0;
    const reader = await InstallationVersionReader.of(new EngineRegistry([engine], 'claude'), {
      backend: () => {
        backendReads += 1;
        return { version: '1', reason: null };
      },
      node: () => '4',
    });

    expect(reader.read()).toBe(reader.read());
    expect(engine.describedTimes).toBe(1);
    expect(backendReads).toBe(1);
  });
});

describe('ownPackageVersion', () => {
  const tree = (manifest: string | null): string => {
    const root = mkdtempSync(path.join(tmpdir(), 'rc-own-version-'));
    const nested = path.join(root, 'src', 'deep');
    mkdirSync(nested, { recursive: true });
    if (manifest !== null) {
      writeFileSync(path.join(root, 'package.json'), manifest, 'utf8');
    }
    return path.join(nested, 'file.ts');
  };

  it('reads the version of the first package up from the file', () => {
    expect(ownPackageVersion(tree('{"version":"4.5.6"}'))).toEqual({
      version: '4.5.6',
      reason: null,
    });
  });

  it('says unreadable for a manifest with no version, or one that is not JSON', () => {
    expect(ownPackageVersion(tree('{"name":"x"}'))).toEqual({
      version: null,
      reason: 'unreadable',
    });
    expect(ownPackageVersion(tree('not json'))).toEqual({ version: null, reason: 'unreadable' });
  });

  it('says not installed when no directory up to the root is a package', () => {
    expect(ownPackageVersion('/file.ts')).toEqual({ version: null, reason: 'notInstalled' });
  });
});
