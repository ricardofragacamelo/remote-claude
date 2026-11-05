import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';

import {
  Attachment,
  AttachmentsView,
  LinkAttachment,
  UnknownAttachment,
} from '@/features/session/components/conversation/ToolRow';
import type { ToolAttachment } from '@/features/session/types/live-session';
import { render, translator } from '../../../../../support/render';

const t = translator('en');

/** The media and the links a tool's result carried besides its text — plan 27, F6 · B-22. */
describe('tool attachments — plan 27, F6 · B-22', () => {
  it('draws an image attachment through the ImageMarker', () => {
    render(
      <Attachment
        attachment={{ kind: 'image', blockId: 'm1:0:0', mediaType: 'image/png', size: 12 }}
        conversation={null}
      />,
    );

    expect(screen.getByText(/Attached image/)).toBeInTheDocument();
  });

  it('a link with a title names it; the title is text, not yet a link', () => {
    render(
      <LinkAttachment
        attachment={{ kind: 'link', uri: 'https://example.com', title: 'Example' }}
      />,
    );

    expect(screen.getByText('Example')).toBeInTheDocument();
  });

  it('a safe scheme is clickable, and asks for confirmation before it opens', () => {
    render(
      <LinkAttachment
        attachment={{ kind: 'link', uri: 'https://example.com', title: 'Example' }}
      />,
    );

    fireEvent.click(screen.getByText('Example'));

    expect(screen.getByText(t('sessions.toolRow.linkConfirmTitle'))).toBeInTheDocument();
    expect(screen.getAllByText('https://example.com').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText(t('sessions.toolRow.linkConfirmCancel')));
    expect(screen.queryByText(t('sessions.toolRow.linkConfirmTitle'))).not.toBeInTheDocument();
  });

  it('an unsafe scheme (javascript:) is text only, never clickable', () => {
    render(
      <LinkAttachment
        attachment={{ kind: 'link', uri: 'javascript:alert(1)', title: 'Click me' }}
      />,
    );

    expect(screen.getByText('Click me')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('a link with no uri at all is just its title, as text', () => {
    render(<LinkAttachment attachment={{ kind: 'link', title: 'Just a name' }} />);

    expect(screen.getByText('Just a name')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('a link with neither uri nor title falls back to the generic label', () => {
    render(<LinkAttachment attachment={{ kind: 'link' }} />);

    expect(screen.getByText(t('sessions.toolRow.attachmentLink'))).toBeInTheDocument();
  });

  it('an unknown attachment reads generically, with its own type', () => {
    render(<UnknownAttachment attachment={{ kind: 'unknown', type: 'resource' }} />);

    expect(
      screen.getByText(t('sessions.message.unknownBlock', { blockType: 'resource' })),
    ).toBeInTheDocument();
  });

  it('draws every attachment of a list, each by its own kind', () => {
    const attachments: readonly ToolAttachment[] = [
      { kind: 'link', uri: 'https://example.com', title: 'Example' },
      { kind: 'unknown', type: 'resource' },
    ];

    render(<AttachmentsView attachments={attachments} conversation={null} />);

    expect(screen.getByText('Example')).toBeInTheDocument();
    expect(
      screen.getByText(t('sessions.message.unknownBlock', { blockType: 'resource' })),
    ).toBeInTheDocument();
  });
});
