import { Controller, HttpCode, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

import { UploadAttachmentUseCase } from '@application/session';
import type { AttachmentLimits, AttachmentView } from '@application/session';
import type { UploadPart } from '@application/files';
import type { UserId } from '@domain/auth';
import { InputValidationError } from '@shared/errors/input-validation.error';
import { LOGGER } from '@shared/logging/logger';
import type { Logger } from '@shared/logging/logger';
import { BearerAuthGuard, CurrentUser } from '../auth/bearer.guard';
import { MultipartUpload } from '../files/multipart-upload.reader';

/** DI token of the ceilings of the attachments, from the configuration. */
export const ATTACHMENT_LIMITS = Symbol('AttachmentLimits');

/**
 * An attachment of the prompts, uploaded — plan 08, B-45, D-02.
 *
 * `multipart/form-data` with one `file` part, and a `name` field before it — the name of the file
 * on the person's machine, which is what a text is introduced to Claude by. Read as a stream, and
 * cut one byte past the ceiling: the backend never holds more than that of a body it will refuse.
 * The bytes stay in memory, for the session; the log carries the type, the size and the hash, and
 * never what the file says (S-211).
 *
 * | Status | When |
 * |---|---|
 * | `201` | held — or the same bytes were already, and it is the same id (S-213) |
 * | `400` | not a form, or no `file` part; an id that is not a session's |
 * | `403` / `404` | a live session of somebody else / no live session with that id |
 * | `413` | past the ceiling (S-208) |
 * | `415` | not one of the four images, nor UTF-8 text (S-209) |
 */
@Controller('sessions/:sessionId/attachments')
@UseGuards(BearerAuthGuard)
export class SessionAttachmentsController {
  constructor(
    @Inject(UploadAttachmentUseCase) private readonly uploader: UploadAttachmentUseCase,
    @Inject(ATTACHMENT_LIMITS) private readonly limits: Pick<AttachmentLimits, 'maxBytes'>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  @Post()
  @HttpCode(201)
  async upload(
    @Param('sessionId') sessionId: string,
    @Req() request: Request,
    @CurrentUser() userId: UserId,
  ): Promise<AttachmentView> {
    const form = await MultipartUpload.open(request, { fileBytes: this.limits.maxBytes, files: 1 });

    try {
      const part = await form.next();

      if (part === null) {
        throw new InputValidationError([{ field: 'file', rule: 'required' }]);
      }

      const bytes = await bytesOf(part);
      const { attachment, sha256 } = this.uploader.execute(
        {
          sessionId,
          name: form.fields['name'] ?? '',
          bytes,
          truncated: bytes.length > this.limits.maxBytes,
        },
        userId,
      );

      this.logger.debug(
        {
          op: 'session.attachment',
          layer: 'adapter',
          sessionId,
          kind: attachment.kind,
          mediaType: attachment.mediaType,
          bytes: attachment.size,
          sha256,
        },
        'attachment held',
      );

      return attachment;
    } finally {
      form.release();
    }
  }
}

/** Every byte of a part, which the parser already cut one byte past the ceiling. */
async function bytesOf(part: UploadPart): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];

  for (let chunk = await part.next(); chunk !== null; chunk = await part.next()) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}
