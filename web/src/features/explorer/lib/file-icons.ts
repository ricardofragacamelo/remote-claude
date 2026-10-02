import {
  ExternalLink,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileCog,
  FileImage,
  FileJson,
  FileQuestion,
  FileTerminal,
  FileText,
  FileVideo,
  Folder,
  FolderOpen,
  FolderSymlink,
  Link,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { TreeEntry } from '../types/explorer';
import { isFolderLike } from './sort';

/** The icons the tree draws, by name — looked up, never made, while a row renders. */
export const ENTRY_ICONS = {
  file: File,
  code: FileCode,
  json: FileJson,
  text: FileText,
  config: FileCog,
  terminal: FileTerminal,
  image: FileImage,
  audio: FileAudio,
  video: FileVideo,
  archive: FileArchive,
  folder: Folder,
  folderOpen: FolderOpen,
  folderLink: FolderSymlink,
  link: Link,
  outside: ExternalLink,
  unreadable: FileQuestion,
} as const satisfies Readonly<Record<string, LucideIcon>>;

export type EntryIconName = keyof typeof ENTRY_ICONS;

/** The extensions of one kind of file, each to its icon. */
function kind(extensions: string, icon: EntryIconName): [string, EntryIconName][] {
  return extensions.split(' ').map((extension) => [extension, icon]);
}

/** The icon of a file by its extension. */
const BY_EXTENSION: Readonly<Record<string, EntryIconName>> = Object.fromEntries([
  ...kind(
    'ts tsx js jsx mjs cjs py go rs java kt dart rb php c h cpp cs css scss html vue svelte sql',
    'code',
  ),
  ...kind('json', 'json'),
  ...kind('md mdx txt rst log', 'text'),
  ...kind('yml yaml toml ini env xml lock', 'config'),
  ...kind('sh bash zsh ps1', 'terminal'),
  ...kind('png jpg jpeg gif svg webp ico', 'image'),
  ...kind('mp3 wav ogg', 'audio'),
  ...kind('mp4 webm mov', 'video'),
  ...kind('zip gz tgz tar 7z rar', 'archive'),
]);

/** Names that say what they are better than their extension does. */
const BY_NAME: Readonly<Record<string, EntryIconName>> = {
  dockerfile: 'config',
  makefile: 'terminal',
  '.gitignore': 'config',
  '.editorconfig': 'config',
  '.env': 'config',
};

function fileIcon(name: string): EntryIconName {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf('.');

  return BY_NAME[lower] ?? (dot > 0 ? BY_EXTENSION[lower.slice(dot + 1)] : undefined) ?? 'file';
}

/**
 * The icon of an entry of the tree: a folder (open or not), a link out of the folder — its own icon,
 * which the help explains —, a link inside, a name that is not text, or the file's type. Lucide only
 * (web/03); plan 06 had no map of its own, and this is the Explorer's.
 */
export function iconNameOf(entry: TreeEntry, expanded: boolean): EntryIconName {
  if (entry.unreadableName) {
    return 'unreadable';
  }

  if (entry.outside) {
    return 'outside';
  }

  if (isFolderLike(entry)) {
    if (entry.kind === 'symlink') {
      return 'folderLink';
    }

    return expanded ? 'folderOpen' : 'folder';
  }

  return entry.kind === 'symlink' ? 'link' : fileIcon(entry.name);
}
