const crypto = require("node:crypto");
const { buildOaepLabel } = require("../../src/services/passwordEncryptionService");

async function encryptedPassword(baseUrl, operation, account, password) {
  const normalizedAccount = account.trim().toLowerCase();
  const keyResponse = await fetch(`${baseUrl}/api/auth/password-encryption/public-key`);
  if (!keyResponse.ok) throw new Error("Unable to retrieve password encryption key");
  const key = await keyResponse.json();

  const challengeResponse = await fetch(`${baseUrl}/api/auth/password-encryption/challenges`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation, account: normalizedAccount, keyId: key.keyId })
  });
  if (!challengeResponse.ok) throw new Error("Unable to create password encryption challenge");
  const challenge = await challengeResponse.json();

  const ciphertext = crypto.publicEncrypt({
    key: key.publicKeySpki,
    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: "sha256",
    oaepLabel: buildOaepLabel({
      operation,
      account: normalizedAccount,
      challengeId: challenge.challengeId,
      challenge: challenge.challenge,
      keyId: key.keyId
    })
  }, Buffer.from(password, "utf8"));

  return {
    email: normalizedAccount,
    challengeId: challenge.challengeId,
    keyId: key.keyId,
    encryptedPassword: ciphertext.toString("base64url")
  };
}

module.exports = { encryptedPassword };
