import type {
  PluginManifestRead,
  PluginManifestReadError,
  PluginManifestReader,
} from '@application/engines/claude';
import { digestOfPluginManifest } from '@domain/engines/claude';
import type { PluginManifest } from '@domain/engines/claude';

/** A manifest reader whose answer for each path is set up by the test (plan 13, B-27). */
export class FakePluginManifestReader implements PluginManifestReader {
  private readonly byPath = new Map<string, PluginManifest | PluginManifestReadError>();

  set(path: string, manifest: PluginManifest | PluginManifestReadError): void {
    this.byPath.set(path, manifest);
  }

  read(absolutePath: string): Promise<PluginManifestRead | PluginManifestReadError> {
    const answer = this.byPath.get(absolutePath);
    if (answer === undefined) {
      return Promise.resolve('notFound');
    }
    if (typeof answer === 'string') {
      return Promise.resolve(answer);
    }
    return Promise.resolve({ manifest: answer, digest: digestOfPluginManifest(answer) });
  }
}
