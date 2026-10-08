import { afterEach, describe, expect, it } from 'vitest';

import { processEnvironment } from '@infra/config/process-environment';

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

describe('processEnvironment', () => {
  it('reads each variable the schema declares, by name', () => {
    process.env['OIDC_AUDIENCE'] = 'https://api.example';

    expect(processEnvironment().OIDC_AUDIENCE).toBe('https://api.example');
  });

  it('reports an unset variable as undefined rather than inventing a value', () => {
    delete process.env['OIDC_SCOPES'];

    expect(processEnvironment().OIDC_SCOPES).toBeUndefined();
  });

  it('covers exactly the variables the schema expects', () => {
    expect(Object.keys(processEnvironment()).sort()).toEqual([
      'DATABASE_URL',
      'LOG_LEVEL',
      'NODE_ENV',
      'OIDC_ADDITIONAL_ISSUERS',
      'OIDC_AUDIENCE',
      'OIDC_CLIENT_ID_MOBILE',
      'OIDC_CLIENT_ID_WEB',
      'OIDC_ISSUER',
      'OIDC_SCOPES',
      'RC_ATTACHMENT_MAX_BYTES',
      'RC_ATTACHMENT_MEMORY_BYTES',
      'RC_ATTACHMENT_TTL_SECONDS',
      'RC_AUDIT_PURGE_INTERVAL_MS',
      'RC_AUDIT_RETENTION_DAYS',
      'RC_BACKEND_PORT',
      'RC_CHECKPOINT_DIR',
      'RC_CHECKPOINT_MAX_FILE_BYTES',
      'RC_CHECKPOINT_MAX_STORE_BYTES',
      'RC_CONTEXT_DRAFT_WINDOW_TOKENS',
      'RC_CONTEXT_MAX_BYTES',
      'RC_CONTEXT_WARN_PERCENT',
      'RC_FILES_ARCHIVE_MAX_ENTRIES',
      'RC_FILES_COPY_MAX_BYTES',
      'RC_FILES_COPY_MAX_ENTRIES',
      'RC_FILES_DELETE_COUNT_CAP',
      'RC_FILES_DOWNLOAD_MAX_BYTES',
      'RC_FILES_HISTORY_DIR',
      'RC_FILES_HISTORY_MAX_BATCH_ENTRIES',
      'RC_FILES_HISTORY_MAX_FILE_BYTES',
      'RC_FILES_HISTORY_MAX_PER_FILE',
      'RC_FILES_HISTORY_MAX_STORE_BYTES',
      'RC_FILES_HISTORY_RETENTION_DAYS',
      'RC_FILES_LARGE_FILE_BYTES',
      'RC_FILES_MAX_EDIT_BYTES',
      'RC_FILES_TREE_MAX_ENTRIES',
      'RC_FILES_UPLOAD_MAX_BYTES',
      'RC_FILES_UPLOAD_MAX_ENTRIES',
      'RC_FILES_UPLOAD_MAX_TOTAL_BYTES',
      'RC_FILES_WATCH_MAX_BUFFERED_BYTES',
      'RC_FILES_WATCH_MAX_CHANGES',
      'RC_FILES_WATCH_MAX_PER_CONNECTION',
      'RC_FILES_WATCH_WINDOW_MS',
      'RC_PERMISSION_EXTENSION_MS',
      'RC_PERMISSION_MAX_EXTENSIONS',
      'RC_PERMISSION_RULE_DEFAULT_LIFETIME_MS',
      'RC_PERMISSION_RULE_LIFETIME_MS',
      'RC_PERMISSION_RULE_MAX_LIFETIME_MS',
      'RC_PERMISSION_TIMEOUT_MS',
      'RC_PID_FILE',
      'RC_PUSH_CREDENTIALS_FILE',
      'RC_PUSH_ENDPOINT',
      'RC_PUSH_SCOPE',
      'RC_QUESTION_TIMEOUT_MS',
      'RC_SESSION_DEFAULT_MODEL',
      'RC_SESSION_DEFAULT_PERMISSION_MODE',
      'RC_SESSION_IDLE_TTL_MS',
      'RC_SESSION_MAX_BUDGET_USD',
      'RC_SESSION_MAX_CONCURRENT',
      'RC_SESSION_MAX_TURNS',
      'RC_SESSION_MEMORY_FRACTION',
      'RC_SESSION_MEMORY_MB',
      'RC_SESSION_MIN_CONCURRENT',
      'RC_TRANSCRIPT_ACTIVE_WINDOW_SECONDS',
      'RC_TRANSCRIPT_FOLLOW_ACTIVE_MS',
      'RC_TRANSCRIPT_FOLLOW_IDLE_MS',
      'RC_TRANSCRIPT_FOLLOW_MAX',
      'RC_TRANSCRIPT_FOLLOW_MAX_PER_CONNECTION',
      'RC_TRANSCRIPT_IMAGE_MAX_BYTES',
      'RC_TRANSCRIPT_TOOL_RESULT_MAX_BYTES',
      'RC_WEB_PORT',
      'RC_WORKSPACE_ALLOWLIST_FILE',
      'RC_WS_MAX_ATTACHED_SESSIONS',
      'RC_WS_MAX_FRAMES_PER_SECOND',
      'RC_WS_MAX_FRAME_BYTES',
    ]);
  });
});
