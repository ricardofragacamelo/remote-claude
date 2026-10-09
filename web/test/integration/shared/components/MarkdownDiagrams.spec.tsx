import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { MarkdownPreview } from '@/features/editor/components/MarkdownPreview';
import { PlanApprovalCard } from '@/features/permission/components/PlanApprovalCard';
import type { PermissionRequest } from '@/features/permission/types/permission';
import ChatMarkdown from '@/features/session/components/conversation/ChatMarkdown';
import { Markdown } from '@/shared/components/markdown/Markdown';
import { setDiagramLoader } from '@/shared/components/markdown/mermaid-loader';
import { useTheme } from '@/shared/hooks/useTheme';
import { fakeDiagrams } from '../../../support/diagram-fake';
import { render, translator } from '../../../support/render';

const t = translator('en');

afterEach(() => {
  setDiagramLoader();
  vi.restoreAllMocks();
  act(() => {
    useTheme.getState().setTheme('light');
  });
});

/** A text with a diagram in it, closed. */
function withDiagram(source: string, before = 'Before.'): string {
  return `${before}\n\n\`\`\`mermaid\n${source}\n\`\`\`\n\nAfter.`;
}

function strict(source: string): ReturnType<typeof render> {
  return render(
    <StrictMode>
      <Markdown source={source} />
    </StrictMode>,
  );
}

describe('the tables of a text — plan 21, B-15', () => {
  it('keeps the alignment of each column, a header of its own, and a pipe escaped as text (S-52)', () => {
    strict(['| left | centre | right |', '|:---|:---:|---:|', '| a \\| b | c | d |'].join('\n'));

    const table = screen.getByRole('table');
    const [left, centre, right] = within(table).getAllByRole('columnheader');
    expect(left).toHaveStyle({ textAlign: 'left' });
    expect(centre).toHaveStyle({ textAlign: 'center' });
    expect(right).toHaveStyle({ textAlign: 'right' });
    expect(within(table).getByRole('cell', { name: 'a | b' })).toBeVisible();
    // The table is in a box of its own, which the keyboard reaches.
    expect(table.parentElement).toHaveAttribute('tabindex', '0');
    expect(table.parentElement?.className).toContain('overflow-x-auto');
  });
});

describe('the diagrams of a text — plan 21, B-17', () => {
  it('draws a closed mermaid block as inline SVG, named by its accTitle or "Diagram" (S-58)', async () => {
    fakeDiagrams();
    strict(
      [
        withDiagram('graph TD\n  A --> B', 'First.'),
        withDiagram('graph TD\n  accTitle: The flow\n  C --> D', 'Second.'),
      ].join('\n\n'),
    );

    const unnamed = await screen.findByRole('img', { name: t('markdown.diagram.label') });
    const named = await screen.findByRole('img', { name: 'The flow' });
    expect(unnamed.querySelector('svg')).not.toBeNull();
    expect(unnamed).toHaveTextContent('A --> B');
    expect(named).toHaveTextContent('C --> D');
  });

  it('says on which line a diagram is wrong, with its source in sight — and nothing escapes (S-59)', async () => {
    fakeDiagrams();
    strict(withDiagram('graph TD\n  invalid --> ?'));

    expect(await screen.findByText(t('markdown.diagram.invalidLine', { line: 2 }))).toBeVisible();
    expect(screen.getByLabelText(t('markdown.diagram.source'))).toHaveTextContent('invalid --> ?');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('switches between the diagram and its code, and copies the source (S-60)', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    fakeDiagrams();
    strict(withDiagram('graph TD\n  A --> B'));

    await screen.findByRole('img', { name: t('markdown.diagram.label') });
    await user.click(screen.getByRole('button', { name: t('markdown.diagram.showCode') }));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByLabelText(t('markdown.diagram.source'))).toHaveTextContent('A --> B');
    await user.click(screen.getByRole('button', { name: t('markdown.diagram.showDiagram') }));
    expect(screen.getByRole('img', { name: t('markdown.diagram.label') })).toBeVisible();

    await user.click(screen.getByRole('button', { name: t('markdown.diagram.copy') }));
    expect(writeText).toHaveBeenCalledWith('graph TD\n  A --> B');
    expect(await screen.findByText(t('markdown.diagram.copied'))).toBeInTheDocument();
  });

  it('draws two diagrams of the same source, each with ids and styles of its own (S-65)', async () => {
    const diagrams = fakeDiagrams();
    strict([withDiagram('graph TD\n  A --> B'), withDiagram('graph TD\n  A --> B')].join('\n\n'));

    await waitFor(() => {
      expect(screen.getAllByRole('img', { name: t('markdown.diagram.label') })).toHaveLength(2);
    });
    const ids = new Set(diagrams.drawn.map((drawing) => drawing.id));
    expect(ids.size).toBe(2);
    const svgIds = screen
      .getAllByRole('img', { name: t('markdown.diagram.label') })
      .map((image) => image.querySelector('svg')?.id);
    expect(new Set(svgIds).size).toBe(2);
    for (const id of svgIds) {
      expect(document.querySelectorAll(`#${String(id)}`)).toHaveLength(1);
    }
  });

  it('keeps an open fence as code while it streams, draws it once it closes, and not again (S-62, S-63)', async () => {
    const diagrams = fakeDiagrams();
    const renderCode = vi.fn((code: string) => <output>{code}</output>);
    const { rerender } = render(
      <Markdown source={'Answer:\n\n```mermaid\ngraph TD\n  A --> B'} renderCode={renderCode} />,
    );

    expect(screen.getByText(/A --> B/)).toBeVisible();
    expect(renderCode).toHaveBeenCalledWith('graph TD\n  A --> B', 'mermaid');
    expect(screen.queryByRole('img')).toBeNull();
    expect(diagrams.drawn).toHaveLength(0);

    const closed = 'Answer:\n\n```mermaid\ngraph TD\n  A --> B\n```';
    rerender(<Markdown source={closed} renderCode={renderCode} />);
    await screen.findByRole('img', { name: t('markdown.diagram.label') });

    for (const delta of ['\n\nMore', '\n\nMore text', '\n\nMore text, and more.']) {
      rerender(<Markdown source={closed + delta} renderCode={(code) => <output>{code}</output>} />);
    }
    expect(await screen.findByText('More text, and more.')).toBeVisible();
    expect(diagrams.drawn).toHaveLength(1);
  });

  it('draws again in the theme when it changes (S-64)', async () => {
    const diagrams = fakeDiagrams();
    strict(withDiagram('graph TD\n  A --> B'));

    const image = await screen.findByRole('img', { name: t('markdown.diagram.label') });
    expect(image.querySelector('svg')).toHaveAttribute('data-theme', 'light');
    act(() => {
      useTheme.getState().setTheme('dark');
    });

    await waitFor(() => {
      expect(
        screen.getByRole('img', { name: t('markdown.diagram.label') }).querySelector('svg'),
      ).toHaveAttribute('data-theme', 'dark');
    });
    expect(diagrams.drawn.map((drawing) => drawing.theme)).toEqual(['light', 'dark']);
  });

  it('says the renderer did not load, with "try again", and the source in sight (S-54)', async () => {
    const user = userEvent.setup();
    const engine = fakeDiagrams().engine;
    let loads = 0;
    setDiagramLoader(() => {
      loads += 1;
      return loads === 1 ? Promise.reject(new Error('chunk')) : Promise.resolve(engine);
    });
    strict(withDiagram('graph TD\n  A --> B'));

    expect(await screen.findByText(t('markdown.diagram.loadFailed'))).toBeVisible();
    expect(screen.getByLabelText(t('markdown.diagram.source'))).toHaveTextContent('A --> B');
    await user.click(screen.getByRole('button', { name: t('common.action.retry') }));
    expect(await screen.findByRole('img', { name: t('markdown.diagram.label') })).toBeVisible();
  });

  it('leaves a source too long as code, said so, and never loads the renderer (S-57)', () => {
    const diagrams = fakeDiagrams();
    const long = `graph TD\n${'  A --> B\n'.repeat(2_001)}`;
    strict(withDiagram(long.trimEnd()));

    expect(
      screen.getByText(
        t('markdown.diagram.tooLarge', { size: long.trimEnd().length, limit: 20_000 }),
      ),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: t('markdown.diagram.showCode') })).toBeNull();
    expect(diagrams.drawn).toHaveLength(0);
  });

  it('has no violation of axe with a table and a diagram (S-73, in jsdom)', async () => {
    fakeDiagrams();
    const { container } = strict(
      ['| a | b |', '|---|---|', '| 1 | 2 |', '', withDiagram('graph TD\n  A --> B')].join('\n'),
    );
    await screen.findByRole('img', { name: t('markdown.diagram.label') });

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('every Markdown of the product — plan 21, S-53, S-66', () => {
  const RICH = [
    '| a | b |',
    '|---|---|',
    '| 1 | 2 |',
    '',
    '```mermaid',
    'graph TD',
    '  A --> B',
    '```',
  ].join('\n');

  /** The table is in its box, and the diagram is drawn, inside `within`. */
  async function rich(within_: HTMLElement): Promise<void> {
    const table = await within(within_).findByRole('table');
    expect(table.parentElement).toHaveAttribute('tabindex', '0');
    expect(table.parentElement?.className).toContain('overflow-x-auto');
    expect(
      await within(within_).findByRole('img', { name: t('markdown.diagram.label') }),
    ).toBeVisible();
  }

  it('draws the table and the diagram in the preview of a file', async () => {
    fakeDiagrams();
    const { container } = render(<MarkdownPreview folder="/srv/app" path="notes.md" text={RICH} />);
    await rich(container);
  });

  it('draws them in an answer of Claude, whose code blocks are its own', async () => {
    fakeDiagrams();
    const { container } = render(<ChatMarkdown source={RICH} folder="" />);
    await rich(container);
  });

  it('draws them in a plan to approve', async () => {
    fakeDiagrams();
    const request = {
      requestId: 'plan-1',
      toolName: 'ExitPlanMode',
      input: { plan: RICH },
    } as unknown as PermissionRequest;
    render(
      <ul>
        <PlanApprovalCard request={request} remainingMs={60_000} onAnswer={vi.fn()} />
      </ul>,
    );
    await rich(screen.getByRole('listitem', { name: t('permission.plan.label') }));
  });
});
