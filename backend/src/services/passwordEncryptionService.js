const crypto = require("node:crypto");

const PasswordChallenge = require("../models/passwordChallengeModel");
const { getPasswordEncryptionConfig } = require("../config/passwordEncryption");
const { createError } = require("../utils/httpError");

const CHALLENGE_TTL_MS = 2 * 60 * 1000;
const OPERATIONS = new Set(["login", "register"]);
const CHALLENGE_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CIPHERTEXT_PATTERN = /^[A-Za-z0-9_-]+$/;
const LABEL_PREFIX = "task-management-password-v1";

function normalizeAccount(account) {
  return typeof account === "string" ? account.trim().toLowerCase() : "";
}

function buildOaepLabel({ operation, account, challengeId, challenge, keyId }) {
  return Buffer.from(JSON.stringify([
    LABEL_PREFIX,
    operation,
    normalizeAccount(account),
    challengeId,
    challenge,
    keyId
  ]), "utf8");
}

function getPublicKey() {
  const { keyId, publicKeySpki } = getPasswordEncryptionConfig();
  return { keyId, publicKeySpki };
}

async function createChallenge({ operation, account, keyId }) {
  const normalizedAccount = normalizeAccount(account);
  if (
    !OPERATIONS.has(operation) ||
    normalizedAccount.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedAccount)
  ) {
    throw createError("Invalid encrypted credential challenge request", 400);
  }

  const config = getPasswordEncryptionConfig();
  if (keyId !== config.keyId) {
    throw createError("Password encryption key changed; retry the request", 409);
  }

  const challengeId = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  await PasswordChallenge.create({
    _id: challengeId,
    operation,
    account: normalizedAccount,
    keyId: config.keyId,
    challenge,
    expiresAt
  });

  return { challengeId, challenge, operation, account: normalizedAccount, keyId: config.keyId, expiresAt };
}

async function decryptPassword({ operation, account, challengeId, keyId, encryptedPassword }) {
  const normalizedAccount = normalizeAccount(account);
  if (
    !OPERATIONS.has(operation) ||
    !CHALLENGE_ID_PATTERN.test(challengeId || "") ||
    typeof keyId !== "string" ||
    typeof encryptedPassword !== "string" ||
    encryptedPassword.length > 2048 ||
    !CIPHERTEXT_PATTERN.test(encryptedPassword)
  ) {
    throw createError("Encrypted password and challenge are required", 400);
  }

  const config = getPasswordEncryptionConfig();
  const ciphertext = Buffer.from(encryptedPassword, "base64url");
  const ciphertextLength = Math.ceil(config.privateKey.asymmetricKeyDetails.modulusLength / 8);
  if (
    ciphertext.toString("base64url") !== encryptedPassword ||
    ciphertext.length !== ciphertextLength
  ) {
    throw createError("Invalid encrypted password", 400);
  }

  const challenge = await PasswordChallenge.findOneAndDelete({
    _id: challengeId,
    operation,
    account: normalizedAccount,
    keyId,
    expiresAt: { $gt: new Date() }
  });
  if (!challenge || keyId !== config.keyId) {
    throw createError("Encrypted password challenge is invalid or expired", 400);
  }

  let plaintext;
  try {
    plaintext = crypto.privateDecrypt({
      key: config.privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
      oaepLabel: buildOaepLabel({
        operation,
        account: normalizedAccount,
        challengeId,
        challenge: challenge.challenge,
        keyId
      })
    }, ciphertext);

    if (plaintext.length > 72) throw new Error("Invalid password length");
    return new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
  } catch {
    throw createError("Invalid encrypted password or challenge", 400);
  } finally {
    plaintext?.fill(0);
  }
}

module.exports = {
  buildOaepLabel,
  createChallenge,
  decryptPassword,
  getPublicKey,
  normalizeAccount
};
