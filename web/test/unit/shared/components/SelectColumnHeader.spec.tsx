import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SelectColumnHeader } from '@/shared/components/SelectColumnHeader';
import { render } from '../../../support/render';

describe('the leading checkbox column of a dense table', () => {
  it('is a plain, non-interactive label without an `onSelectAll`', () => {
    render(<SelectColumnHeader label="Select" />);

    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByText('Select')).toBeInTheDocument();
  });

  it('selects all from its own checkbox, given one', async () => {
    const onSelectAll = vi.fn();
    render(<SelectColumnHeader label="Select" allSelected={false} onSelectAll={onSelectAll} />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select' }));

    expect(onSelectAll).toHaveBeenCalled();
  });

  it('shows indeterminate for some, but not all, selected', () => {
    render(
      <SelectColumnHeader label="Select" allSelected={false} someSelected onSelectAll={() => {}} />,
    );

    expect(screen.getByRole('checkbox')).toHaveProperty('indeterminate', true);
  });

  it('defaults to unchecked when `allSelected` is left out', () => {
    render(<SelectColumnHeader label="Select" onSelectAll={() => {}} />);

    expect(screen.getByRole('checkbox')).toHaveProperty('checked', false);
  });

  it('is checked, not indeterminate, once every row is selected', () => {
    render(<SelectColumnHeader label="Select" allSelected someSelected onSelectAll={() => {}} />);

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveProperty('checked', true);
    expect(checkbox).toHaveProperty('indeterminate', false);
  });
});
