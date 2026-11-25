import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { PasswordEncryptionService } from './password-encryption.service';

describe('PasswordEncryptionService', () => {
  let service: PasswordEncryptionService;
  let httpTesting: HttpTestingController;
  let keyPair: CryptoKeyPair;
  let publicKeySpki: string;

  beforeEach(async () => {
    keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt'],
    );
    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', keyPair.publicKey));
    let binary = '';
    for (const byte of spki) {
      binary += String.fromCharCode(byte);
    }
    publicKeySpki = `-----BEGIN PUBLIC KEY-----\n${btoa(binary)}\n-----END PUBLIC KEY-----`;

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PasswordEncryptionService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('encrypts the password and binds the ciphertext to the issued context', async () => {
    const operation = service.encryptPassword('login', ' User@Example.com ', 'MyPassword123');
    const keyRequest = httpTesting.expectOne('/api/auth/password-encryption/public-key');
    const keyId = 'test-key-id';
    keyRequest.flush({ keyId, publicKeySpki });
    await Promise.resolve();

    const challengeRequest = httpTesting.expectOne('/api/auth/password-encryption/challenges');
    expect(challengeRequest.request.body).toEqual({
      operation: 'login',
      account: 'user@example.com',
      keyId,
    });
    const challenge = {
      challengeId: 'challenge-id',
      challenge: 'random-challenge',
      operation: 'login',
      account: 'user@example.com',
      keyId,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    challengeRequest.flush(challenge);

    const encrypted = await operation;
    expect(encrypted.challengeId).toBe(challenge.challengeId);
    expect(encrypted.keyId).toBe(keyId);
    expect(encrypted.encryptedPassword).not.toContain('MyPassword123');

    const ciphertext = Uint8Array.from(
      atob(encrypted.encryptedPassword.replace(/-/g, '+').replace(/_/g, '/')),
      (character) => character.charCodeAt(0),
    );
    const label = new TextEncoder().encode(
      JSON.stringify([
        'task-management-password-v1',
        'login',
        'user@example.com',
        challenge.challengeId,
        challenge.challenge,
        keyId,
      ]),
    );
    const plaintext = await crypto.subtle.decrypt(
      { name: 'RSA-OAEP', label },
      keyPair.privateKey,
      ciphertext,
    );
    expect(new TextDecoder().decode(plaintext)).toBe('MyPassword123');
  });
});
