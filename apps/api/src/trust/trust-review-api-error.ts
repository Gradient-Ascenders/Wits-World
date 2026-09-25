import { ApiError } from '../errors/api-error.js';
import {
  InvalidTrustReviewRequestError,
  SelfTrustReviewForbiddenError,
  StaleTrustCaseVersionError,
  TrustCaseNotFoundError,
  TrustCaseStateConflictError,
} from './trust-review-service.js';

export function throwTrustReviewApiError(error: unknown): void {
  if (error instanceof InvalidTrustReviewRequestError) {
    throw new ApiError({
      statusCode: 400,
      code: 'INVALID_TRUST_REVIEW_REQUEST',
      title: 'Invalid trust review request',
      detail: error.message,
    });
  }
  if (error instanceof SelfTrustReviewForbiddenError) {
    throw new ApiError({
      statusCode: 403,
      code: 'SELF_TRUST_REVIEW_FORBIDDEN',
      title: 'Self-review forbidden',
      detail: error.message,
    });
  }
  if (error instanceof TrustCaseNotFoundError) {
    throw new ApiError({
      statusCode: 404,
      code: 'TRUST_CASE_NOT_FOUND',
      title: 'Trust case not found',
      detail: error.message,
    });
  }
  if (error instanceof StaleTrustCaseVersionError) {
    throw new ApiError({
      statusCode: 409,
      code: 'STALE_TRUST_CASE_VERSION',
      title: 'Stale trust case version',
      detail: error.message,
    });
  }
  if (error instanceof TrustCaseStateConflictError) {
    throw new ApiError({
      statusCode: 409,
      code: 'TRUST_CASE_STATE_CONFLICT',
      title: 'Trust case state conflict',
      detail: error.message,
    });
  }
}
