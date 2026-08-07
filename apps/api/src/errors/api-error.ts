export interface ApiErrorResponse {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  requestId: string;
  validation?: Array<{
    field: string;
    message: string;
  }>;
}

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly type: string;

  constructor(options: {
    statusCode: number;
    code: string;
    title: string;
    detail: string;
    type?: string;
  }) {
    super(options.detail);
    this.name = 'ApiError';
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.type =
      options.type ??
      `https://wits.world/problems/${options.code.toLowerCase()}`;
    this.title = options.title;
  }

  readonly title: string;
}
