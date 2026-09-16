import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { AppError } from '@/shared/api/errors';
import { EmptyState } from '@/shared/components/EmptyState';
import { ErrorState } from '@/shared/components/ErrorState';
import { render, translator } from '../../../support/render';

const t = translator('en');

const error = new AppError('SESSION_NOT_FOUND', 'session.error.notFound', 'trace-42', {
  sessionId: '01J0',
});

describe('ErrorState', () => {
  it('shows the translated message, not the code', () => {
    render(<ErrorState error={error} />);

    expect(screen.getByText(t('session.error.notFound'))).toBeInTheDocument();
  });

  it('shows the trace, which is what turns "it broke" into a report somebody can find', () => {
    render(<ErrorState error={error} />);

    expect(
      screen.getByText(t('common.error.traceLabel', { traceId: 'trace-42' })),
    ).toBeInTheDocument();
  });

  it('interpolates the parameters the backend sent', () => {
    const invalid = new AppError('INVALID_INPUT', 'session.error.invalidSessionId', 't', {
      sessionId: 'nope',
    });

    render(<ErrorState error={invalid} />);

    expect(screen.getByText(/nope/)).toBeInTheDocument();
  });

  it('announces itself, so a screen reader does not miss it', () => {
    render(<ErrorState error={error} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('offers a way out when there is one', async () => {
    const retry = vi.fn();
    render(<ErrorState error={error} onRetry={retry} />);

    await userEvent.click(screen.getByRole('button', { name: t('common.action.retry') }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('offers none when there is nothing to retry', () => {
    render(<ErrorState error={error} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('translates into the visitor’s language', () => {
    render(<ErrorState error={error} />, 'pt-BR');

    expect(screen.getByText(translator('pt-BR')('session.error.notFound'))).toBeInTheDocument();
  });

  it('has no accessibility violation', async () => {
    const { container } = render(<ErrorState error={error} onRetry={() => undefined} />);

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('EmptyState', () => {
  it('says what to do next, not just that there is nothing', () => {
    render(<EmptyState title={t('session.ping.title')} description={t('session.ping.empty')} />);

    expect(screen.getByText(t('session.ping.empty'))).toBeInTheDocument();
  });

  it('has no accessibility violation', async () => {
    const { container } = render(<EmptyState title="A" description="B" />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
