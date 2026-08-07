import type { FastifyReply, FastifyRequest } from 'fastify';

export interface AuthenticatedIdentity {
  issuer: string;
  subject: string;
}

export type AuthenticateRequest = (
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<void>;

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthenticatedIdentity | null;
  }

  interface FastifyInstance {
    authenticate: AuthenticateRequest;
  }
}
