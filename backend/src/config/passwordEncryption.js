const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

let developmentPrivateKey;
let cachedKeyPath;
let cachedConfig;

function createConfig(privateKey) {
  const key = privateKey.type === "private" ? privateKey : crypto.createPrivateKey(privateKey);
  if (key.asymmetricKeyType !== "rsa" || key.asymmetricKeyDetails.modulusLength < 2048) {
    throw new Error("Password encryption key must be an RSA private key of at least 2048 bits");
  }

  const publicKey = crypto.createPublicKey(key);
  const publicKeyDer = publicKey.export({ format: "der", type: "spki" });
  return {
    privateKey: key,
    publicKeySpki: publicKey.export({ format: "pem", type: "spki" }).toString(),
    keyId: crypto.createHash("sha256").update(publicKeyDer).digest("base64url")
  };
}

function getPasswordEncryptionConfig(env = process.env) {
  const keyPath = env.PASSWORD_ENCRYPTION_PRIVATE_KEY_PATH?.trim();
  if (keyPath) {
    if (!path.isAbsolute(keyPath)) {
      throw new Error("PASSWORD_ENCRYPTION_PRIVATE_KEY_PATH must be an absolute path");
    }
    if (cachedConfig && cachedKeyPath === keyPath) return cachedConfig;

    try {
      const stats = fs.statSync(keyPath);
      if (env.NODE_ENV === "production" && process.platform !== "win32" && (stats.mode & 0o077) !== 0) {
        throw new Error("Password encryption private key file permissions must be restricted to its owner");
      }
      cachedConfig = createConfig(fs.readFileSync(keyPath, "utf8"));
      cachedKeyPath = keyPath;
      return cachedConfig;
    } catch (error) {
      if (error.message.includes("Password encryption")) throw error;
      throw new Error("Unable to load password encryption private key");
    }
  }

  if (env.NODE_ENV === "production") {
    throw new Error("PASSWORD_ENCRYPTION_PRIVATE_KEY_PATH is required in production");
  }

  if (!developmentPrivateKey) {
    developmentPrivateKey = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicExponent: 0x10001
    }).privateKey;
  }
  return createConfig(developmentPrivateKey);
}

module.exports = { getPasswordEncryptionConfig };
