import { describe, expect, it } from 'vitest';

import {
  AuthorContentNotReadyError,
  AuthorContentStateConflictError,
  SelfReviewForbiddenError,
  StaleAuthorContentVersionError,
} from '../src/authoring/content-workflow.js';
import { throwAuthorContentWorkflowError } from '../src/authoring/workflow-api-error.js';

describe('Author content stable API errors', () => {
  it.each([
    [new SelfReviewForbiddenError(), 403, 'SELF_REVIEW_FORBIDDEN'],
    [
      new AuthorContentStateConflictError('Invalid transition.'),
      409,
      'CONTENT_STATE_CONFLICT',
    ],
    [new StaleAuthorContentVersionError(), 409, 'STALE_CONTENT_VERSION'],
    [
      new AuthorContentNotReadyError('Incomplete dependency.'),
      422,
      'CONTENT_NOT_READY',
    ],
  ] as const)('maps %s to %i %s', (source, statusCode, code) => {
    expect(() => throwAuthorContentWorkflowError(source)).toThrow(
      expect.objectContaining({ code, statusCode }),
    );
  });
});
