const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const outputPath = process.argv[2];
if (!outputPath || !path.isAbsolute(outputPath)) {
  console.error("Usage: node scripts/generate-password-encryption-key.js <absolute-private-key-path>");
  process.exit(1);
}
const resolvedPath = path.resolve(outputPath);
const repositoryRoot = path.resolve(__dirname, "..", "..");
const relativePath = path.relative(repositoryRoot, resolvedPath);
if (
  relativePath === "" ||
  (!relativePath.startsWith(`..${path.sep}`) && relativePath !== ".." && !path.isAbsolute(relativePath))
) {
  console.error("Store the private key outside the repository.");
  process.exit(1);
}

const { privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 3072,
  publicExponent: 0x10001,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" }
});

try {
  fs.writeFileSync(resolvedPath, privateKey, { flag: "wx", mode: 0o600 });
  console.log("Generated password encryption private key. Store it outside the repository and restrict access.");
} catch {
  console.error("Could not create the private key file; ensure the path is new and its directory is secure.");
  process.exit(1);
}
