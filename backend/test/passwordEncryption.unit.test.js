const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { getPasswordEncryptionConfig } = require("../src/config/passwordEncryption");
const { buildOaepLabel, getPublicKey } = require("../src/services/passwordEncryptionService");

assert.throws(
  () => getPasswordEncryptionConfig({ NODE_ENV: "production" }),
  /PASSWORD_ENCRYPTION_PRIVATE_KEY_PATH is required/
);

const config = getPasswordEncryptionConfig({ NODE_ENV: "development" });
assert.equal(config.privateKey.asymmetricKeyType, "rsa");
assert.ok(config.privateKey.asymmetricKeyDetails.modulusLength >= 2048);
assert.equal(getPublicKey().keyId, config.keyId);
assert.match(getPublicKey().publicKeySpki, /BEGIN PUBLIC KEY/);
assert.doesNotMatch(JSON.stringify(getPublicKey()), /PRIVATE KEY/);

const context = {
  operation: "login",
  account: "user@example.com",
  challengeId: crypto.randomBytes(32).toString("base64url"),
  challenge: crypto.randomBytes(32).toString("base64url"),
  keyId: config.keyId
};
const password = Buffer.from("correct horse battery staple", "utf8");
const ciphertext = crypto.publicEncrypt({
  key: config.publicKeySpki,
  padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
  oaepHash: "sha256",
  oaepLabel: buildOaepLabel(context)
}, password);

assert.deepEqual(
  crypto.privateDecrypt({
    key: config.privateKey,
    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: "sha256",
    oaepLabel: buildOaepLabel(context)
  }, ciphertext),
  password
);
assert.throws(() => crypto.privateDecrypt({
  key: config.privateKey,
  padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
  oaepHash: "sha256",
  oaepLabel: buildOaepLabel({ ...context, operation: "register" })
}, ciphertext));

console.log("Password encryption unit tests passed");
