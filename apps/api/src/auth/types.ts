import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthenticatedDeveloperApiKey } from '../developer/developer-api-key-service.js';
import type { LocalPlayer } from '../players/types.js';

export interface AuthenticatedIdentity {
  issuer: string;
  subject: string;
}

interface AccessTokenMetadata {
  tokenIssuedAt: Date;
}

export type SupportedConnectionStrategy = 'auth0' | 'google-oauth2';

export interface MachinePrincipal
  extends AuthenticatedIdentity, AccessTokenMetadata {
  connectionStrategy: null;
  playerName: null;
}

export interface DatabasePlayerPrincipal
  extends AuthenticatedIdentity, AccessTokenMetadata {
  connectionStrategy: 'auth0';
  playerName: string;
}

export interface GooglePlayerPrincipal
  extends AuthenticatedIdentity, AccessTokenMetadata {
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
  interface FastifyContextConfig {
    rateLimitPolicy?: import('../security/rate-protection.js').RateLimitPolicy;
  }
  interface FastifyRequest {
    auth: AuthenticatedPrincipal | null;
    player: LocalPlayer | null;
    developerApiKey: AuthenticatedDeveloperApiKey | null;
  }

  interface FastifyInstance {
    authenticate: AuthenticateRequest;
    loadActivePlayer: AuthenticateRequest;
    requireActivePlayer: AuthenticateRequest;
    requireAuthor: AuthenticateRequest;
    authenticateDeveloperApiKey: AuthenticateRequest;
  }
}
