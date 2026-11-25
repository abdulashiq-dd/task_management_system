const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
if (!/\/task_hardening_test_[a-f0-9]{32}(?:\?|$)/.test(process.env.MONGO_URI || "")) {
  throw new Error("Run through npm test only");
}

const app = require("../src/app");
const User = require("../src/models/userModel");
const PasskeyChallenge = require("../src/models/passkeyChallengeModel");

let server;
let base;
let owner;

async function request(method, path, user, body) {
  const headers = user
    ? { Authorization: `Bearer ${jwt.sign({ sub: String(user._id) }, process.env.JWT_SECRET, { algorithm: "HS256", expiresIn: "1h" })}` }
    : {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([User.createIndexes(), PasskeyChallenge.createIndexes()]);
  owner = await User.findOne({ email: process.env.TEST_USER_EMAIL });
  assert.ok(owner);

  await new Promise((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", resolve);
    server.once("error", reject);
  });
  base = `http://127.0.0.1:${server.address().port}`;

  const unauthenticated = await request(
    "POST",
    "/api/auth/passkeys/registration/options",
    null,
    {}
  );
  assert.equal(unauthenticated.status, 401);

  const registration = await request(
    "POST",
    "/api/auth/passkeys/registration/options",
    owner,
    {}
  );
  assert.equal(registration.status, 200);
  assert.equal(registration.body.rp.id, "localhost");
  assert.equal(registration.body.authenticatorSelection.residentKey, "required");
  assert.ok(await PasskeyChallenge.findById(registration.body.challenge));

  const registrationResponse = {
    id: "invalid-credential",
    rawId: "invalid-credential",
    type: "public-key",
    response: {
      clientDataJSON: Buffer.from(JSON.stringify({
        type: "webauthn.create",
        challenge: registration.body.challenge,
        origin: "http://localhost:4200"
      })).toString("base64url"),
      attestationObject: Buffer.from("{}").toString("base64url")
    },
    clientExtensionResults: {}
  };
  const rejectedRegistration = await request(
    "POST",
    "/api/auth/passkeys/registration/verify",
    owner,
    registrationResponse
  );
  assert.equal(rejectedRegistration.status, 401);
  assert.equal(await PasskeyChallenge.findById(registration.body.challenge), null);
  assert.equal(
    (await request(
      "POST",
      "/api/auth/passkeys/registration/verify",
      owner,
      registrationResponse
    )).status,
    400
  );

  const authentication = await request(
    "POST",
    "/api/auth/passkeys/authentication/options",
    null,
    {}
  );
  assert.equal(authentication.status, 200);
  assert.equal(authentication.body.userVerification, "required");
  assert.equal(authentication.body.allowCredentials, undefined);
  assert.ok(await PasskeyChallenge.findById(authentication.body.challenge));

  const authenticationResponse = {
    id: "unknown-credential",
    rawId: "unknown-credential",
    type: "public-key",
    response: {
      clientDataJSON: Buffer.from(JSON.stringify({
        type: "webauthn.get",
        challenge: authentication.body.challenge,
        origin: "http://localhost:4200"
      })).toString("base64url"),
      authenticatorData: Buffer.alloc(37).toString("base64url"),
      signature: Buffer.from([1]).toString("base64url"),
      userHandle: null
    },
    clientExtensionResults: {}
  };
  assert.equal(
    (await request(
      "POST",
      "/api/auth/passkeys/authentication/verify",
      null,
      authenticationResponse
    )).status,
    401
  );
  assert.equal(await PasskeyChallenge.findById(authentication.body.challenge), null);

  console.log("Passkey integration tests passed");
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
  });
