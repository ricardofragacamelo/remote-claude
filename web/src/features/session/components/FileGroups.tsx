import { useTranslation } from 'react-i18next';

import type { PreservedFile } from '../types/checkpoint';
import { TitledList } from './TitledList';

/** One file an undo reaches: a path, or a path that stays and the reason it does. */
type ReachedFile = string | PreservedFile;

export interface FileGroupsProps<K extends string> {
  /**
   * The key of each group's title, in the order the groups are shown. Named as literals by the
   * caller, so the orphan check can see the catalogue entries are in use.
   */
  readonly titles: Readonly<Record<K, string>>;

  readonly files: Readonly<Record<NoInfer<K>, readonly ReachedFile[]>>;
}

/**
 * The groups of files an undo reaches — what would go back, or what went back.
 *
 * Every path is shown **whole**, monospaced and never truncated: which file changes is the one
 * thing these lists exist to say. A file that stays carries why, and the why is said beside it. An
 * empty group renders nothing.
 */
export function FileGroups<K extends string>({
  titles,
  files,
}: FileGroupsProps<K>): React.JSX.Element {
  const { t } = useTranslation();
  const groups = Object.keys(titles) as K[];

  return (
    <>
      {groups.map((group) => (
        <TitledList key={group} title={t(titles[group])} items={files[group]} keyOf={pathOf}>
          {(file) => (
            <>
              <span className="font-mono break-all">{pathOf(file)}</span>
              {typeof file !== 'string' && (
                <span className="opacity-70">{t(`undo.reason.${file.reason}`)}</span>
              )}
            </>
          )}
        </TitledList>
      ))}
    </>
  );
}

function pathOf(file: ReachedFile): string {
  return typeof file === 'string' ? file : file.path;
}
