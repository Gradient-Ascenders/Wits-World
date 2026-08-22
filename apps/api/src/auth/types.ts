import type { FastifyReply, FastifyRequest } from 'fastify';
import type { LocalPlayer } from '../players/types.js';

export interface AuthenticatedIdentity {
  issuer: string;
  subject: string;
}

export type SupportedConnectionStrategy = 'auth0' | 'google-oauth2';

export interface MachinePrincipal extends AuthenticatedIdentity {
  connectionStrategy: null;
  playerName: null;
}

export interface DatabasePlayerPrincipal extends AuthenticatedIdentity {
  connectionStrategy: 'auth0';
  playerName: string;
}

export interface GooglePlayerPrincipal extends AuthenticatedIdentity {
  connectionStrategy: 'google-oauth2';
  playerName: null;
}

export type InteractivePlayerPrincipal =
  DatabasePlayerPrincipal | GooglePlayerPrincipal;

export type AuthenticatedPrincipal =
  InteractivePlayerPrincipal | MachinePrincipal;

export type AuthenticateRequest = (
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<void>;

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthenticatedPrincipal | null;
    player: LocalPlayer | null;
  }

  interface FastifyInstance {
    authenticate: AuthenticateRequest;
    loadActivePlayer: AuthenticateRequest;
    requireActivePlayer: AuthenticateRequest;
    requireAuthor: AuthenticateRequest;
  }
}
