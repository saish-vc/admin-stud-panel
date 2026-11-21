import type { PrincipalRole } from '../db/schema.js';

export interface Principal {
  id: string;
  role: PrincipalRole;
  name: string;
  email: string;
  mustChangePassword: boolean;
  sessionId: string;
  rollNumber?: string;
  programme?: string;
}

export interface SessionActor {
  id: string;
  role: PrincipalRole;
  name: string;
  email: string;
  mustChangePassword: boolean;
}

export interface LoginMeta {
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthUser extends SessionActor {
  rollNumber?: string;
  programme?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: AuthUser;
}
