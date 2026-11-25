
export type UserRole = 'user' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export type PasswordOperation = 'login' | 'register';

export interface PasswordEncryptionKey {
  keyId: string;
  publicKeySpki: string;
}

export interface PasswordEncryptionChallenge {
  challengeId: string;
  challenge: string;
  operation: PasswordOperation;
  account: string;
  keyId: string;
  expiresAt: string;
}

export interface EncryptedPassword {
  challengeId: string;
  keyId: string;
  encryptedPassword: string;
}

export interface LoginResponse {
  message: string;
  token: string;
  user: User;
}

export interface RegisterResponse {
  message: string;
  user: User;
}

export interface AuthSession {
  token: string;
  user: User;
}

export interface WorkspaceUser {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
}
