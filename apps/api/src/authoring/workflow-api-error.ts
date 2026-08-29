import { ApiError } from '../errors/api-error.js';
import {
  AuthorContentNotReadyError,
  AuthorContentStateConflictError,
  AuthorContentWorkflowNotFoundError,
  InvalidAuthorContentNoteError,
  SelfReviewForbiddenError,
  StaleAuthorContentVersionError,
} from './content-workflow.js';

export function throwAuthorContentWorkflowError(error: unknown): void {
  if (error instanceof InvalidAuthorContentNoteError) {
    throw new ApiError({
      statusCode: 400,
      code: 'INVALID_AUTHOR_CONTENT_REQUEST',
      title: 'Invalid Author content request',
      detail: error.message,
    });
  }
  if (error instanceof SelfReviewForbiddenError) {
    throw new ApiError({
      statusCode: 403,
      code: 'SELF_REVIEW_FORBIDDEN',
      title: 'Self-review forbidden',
      detail: error.message,
    });
  }
  if (error instanceof AuthorContentWorkflowNotFoundError) {
    throw new ApiError({
      statusCode: 404,
      code: `${error.entityType.toUpperCase()}_NOT_FOUND`,
      title: `${titleCase(error.entityType)} not found`,
      detail: error.message,
    });
  }
  if (error instanceof StaleAuthorContentVersionError) {
    throw new ApiError({
      statusCode: 409,
      code: 'STALE_CONTENT_VERSION',
      title: 'Stale content version',
      detail: error.message,
    });
  }
  if (error instanceof AuthorContentStateConflictError) {
    throw new ApiError({
      statusCode: 409,
      code: 'CONTENT_STATE_CONFLICT',
      title: 'Content state conflict',
      detail: error.message,
    });
  }
  if (error instanceof AuthorContentNotReadyError) {
    throw new ApiError({
      statusCode: 422,
      code: 'CONTENT_NOT_READY',
      title: 'Content not ready',
      detail: error.message,
    });
  }
}

function titleCase(value: string) {
  return value[0]!.toUpperCase() + value.slice(1);
}
