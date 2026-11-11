import { RuleWizardOption } from './RuleWizardOption';

export interface RadioOptionGroupProps<T extends string | number> {
  readonly label: string;
  readonly options: readonly T[];
  readonly value: T | null;
  onPick(option: T): void;
  labelOf(option: T): string;
  readonly outerClassName: string;
  readonly optionClassName: string;
}

/**
 * One choice of a single-select group, picked from a short list of options named by `labelOf` —
 * the shape the kind step (wizard and command tester alike), the command tester's own mode picker,
 * and the simulation panel's own limit picker (a number, not a string) all share, down to the
 * token (plan 15, B-27, B-28, B-29): a `radiogroup` of `RuleWizardOption`s, the outer layout and
 * each option's own class left to the caller.
 */
export function RadioOptionGroup<T extends string | number>({
  label,
  options,
  value,
  onPick,
  labelOf,
  outerClassName,
  optionClassName,
}: RadioOptionGroupProps<T>): React.JSX.Element {
  return (
    <div className={outerClassName} role="radiogroup" aria-label={label}>
      {options.map((candidate) => (
        <RuleWizardOption
          key={candidate}
          pressed={value === candidate}
          className={optionClassName}
          onClick={() => {
            onPick(candidate);
          }}
        >
          {labelOf(candidate)}
        </RuleWizardOption>
      ))}
    </div>
  );
}
