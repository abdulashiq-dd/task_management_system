const assert = require("node:assert/strict");
const { getWebAuthnConfig } = require("../src/config/webauthn");

assert.deepEqual(getWebAuthnConfig({}), {
  rpId: "localhost",
  rpName: "TaskOrbit",
  origin: "http://localhost:4200"
});

assert.throws(
  () => getWebAuthnConfig({ NODE_ENV: "production" }),
  /WEBAUTHN_RP_ID and WEBAUTHN_ORIGIN are required/
);
assert.throws(
  () => getWebAuthnConfig({
    NODE_ENV: "production",
    WEBAUTHN_RP_ID: "example.com",
    WEBAUTHN_ORIGIN: "http://example.com"
  }),
  /must be HTTPS/
);
assert.throws(
  () => getWebAuthnConfig({
    NODE_ENV: "production",
    WEBAUTHN_RP_ID: "example.com",
    WEBAUTHN_ORIGIN: "https://other.example.net"
  }),
  /must be HTTPS and match/
);
assert.deepEqual(
  getWebAuthnConfig({
    NODE_ENV: "production",
    WEBAUTHN_RP_ID: "example.com",
    WEBAUTHN_ORIGIN: "https://app.example.com",
    WEBAUTHN_RP_NAME: "Example Tasks"
  }),
  {
    rpId: "example.com",
    rpName: "Example Tasks",
    origin: "https://app.example.com"
  }
);

console.log("Passkey configuration tests passed");
