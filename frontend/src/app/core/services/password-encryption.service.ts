import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_ENDPOINTS } from '../constants/api.constants';
import {
  EncryptedPassword,
  PasswordEncryptionChallenge,
  PasswordEncryptionKey,
  PasswordOperation,
} from '../models/auth.model';

@Injectable({
  providedIn: 'root',
})
export class PasswordEncryptionService {
  private readonly http = inject(HttpClient);
  private readonly encoder = new TextEncoder();

  async encryptPassword(
    operation: PasswordOperation,
    account: string,
    password: string,
  ): Promise<EncryptedPassword> {
    if (!globalThis.crypto?.subtle) {
      throw new Error('Secure password encryption requires HTTPS or localhost.');
    }

    const normalizedAccount = account.trim().toLowerCase();
    const passwordBytes = this.encoder.encode(password);
    if (!normalizedAccount || !passwordBytes.length || passwordBytes.length > 72) {
      throw new Error('The password or account is invalid.');
    }

    try {
      const keyInfo = await firstValueFrom(
        this.http.get<PasswordEncryptionKey>(API_ENDPOINTS.AUTH.PASSWORD_ENCRYPTION_KEY),
      );
      const challenge = await firstValueFrom(
        this.http.post<PasswordEncryptionChallenge>(
          API_ENDPOINTS.AUTH.PASSWORD_ENCRYPTION_CHALLENGES,
          { operation, account: normalizedAccount, keyId: keyInfo.keyId },
        ),
      );

      if (
        challenge.operation !== operation ||
        challenge.account !== normalizedAccount ||
        challenge.keyId !== keyInfo.keyId ||
        Date.parse(challenge.expiresAt) <= Date.now()
      ) {
        throw new Error('The password encryption challenge is invalid or expired.');
      }

      const publicKey = await globalThis.crypto.subtle.importKey(
        'spki',
        this.decodePublicKey(keyInfo.publicKeySpki),
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['encrypt'],
      );
      const label = this.encoder.encode(
        JSON.stringify([
          'task-management-password-v1',
          operation,
          normalizedAccount,
          challenge.challengeId,
          challenge.challenge,
          keyInfo.keyId,
        ]),
      );
      const ciphertext = await globalThis.crypto.subtle.encrypt(
        { name: 'RSA-OAEP', label },
        publicKey,
        passwordBytes,
      );

      return {
        challengeId: challenge.challengeId,
        keyId: keyInfo.keyId,
        encryptedPassword: this.encodeBase64Url(new Uint8Array(ciphertext)),
      };
    } finally {
      passwordBytes.fill(0);
    }
  }

  private decodePublicKey(publicKeySpki: string): ArrayBuffer {
    const encoded = publicKeySpki
      .replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, '');
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return bytes.buffer;
  }

  private encodeBase64Url(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }
}
