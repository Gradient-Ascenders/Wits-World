import type { FastifyReply, FastifyRequest } from 'fastify';
import type { LocalPlayer } from '../players/types.js';

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
    player: LocalPlayer | null;
  }

  interface FastifyInstance {
    authenticate: AuthenticateRequest;
    requireActivePlayer: AuthenticateRequest;
    requireAuthor: AuthenticateRequest;
  }
}
