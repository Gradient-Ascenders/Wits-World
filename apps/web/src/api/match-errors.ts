export type MatchApiFailure =
  | 'already-active'
  | 'authorization'
  | 'completed'
  | 'deck-invalid'
  | 'illegal-action'
  | 'not-found'
  | 'stale-action'
  | 'unavailable'
  | 'validation';

export class MatchApiError extends Error {
  public constructor(
    public readonly failure: MatchApiFailure,
    public readonly options: {
      ambiguous?: boolean;
      code?: string;
      detail?: string;
      requestId?: string;
    } = {},
  ) {
    super(options.detail ?? 'The CPU match request could not be completed.');
    this.name = 'MatchApiError';
  }
}

export class MatchModuleLoadError extends MatchApiError {
  public constructor() {
    super('unavailable');
    this.name = 'MatchModuleLoadError';
  }
}
