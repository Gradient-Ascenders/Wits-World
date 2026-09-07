import type { AuthorApiError } from '../../api/author';

export function authorErrorDetail(error: AuthorApiError): string {
  return error.failure === 'unavailable'
    ? 'The service could not complete this request. Check your connection and try again. No content change was confirmed.'
    : error.detail;
}
