const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
if (!/\/task_hardening_test_[a-f0-9]{32}(?:\?|$)/.test(process.env.MONGO_URI || "")) {
  throw new Error("Run through npm test only");
}

const app = require("../src/app");
const User = require("../src/models/userModel");
const PasswordChallenge = require("../src/models/passwordChallengeModel");
const { encryptedPassword } = require("./helpers/encryptedPassword");

let server;
let base;

async function request(method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([User.createIndexes(), PasswordChallenge.createIndexes()]);

  await new Promise((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", resolve);
    server.once("error", reject);
  });
  base = `http://127.0.0.1:${server.address().port}`;

  const key = await request("GET", "/api/auth/password-encryption/public-key");
  assert.equal(key.status, 200);
  assert.deepEqual(Object.keys(key.body).sort(), ["keyId", "publicKeySpki"]);
  assert.match(key.body.publicKeySpki, /BEGIN PUBLIC KEY/);

  const plaintextLogin = await request("POST", "/api/auth/login", {
    email: process.env.TEST_USER_EMAIL,
    password: process.env.TEST_USER_PASSWORD
  });
  assert.equal(plaintextLogin.status, 400);

  const plaintextRegistration = await request("POST", "/api/auth/register", {
    name: "Plaintext should fail",
    email: "plaintext-rejected@example.invalid",
    password: "password123"
  });
  assert.equal(plaintextRegistration.status, 400);
  assert.equal(await User.exists({ email: "plaintext-rejected@example.invalid" }), null);

  const existingLogin = await encryptedPassword(
    base,
    "login",
    process.env.TEST_USER_EMAIL,
    process.env.TEST_USER_PASSWORD
  );
  const loginResult = await request("POST", "/api/auth/login", existingLogin);
  assert.equal(loginResult.status, 200);
  assert.ok(loginResult.body.token);
  assert.equal(loginResult.body.user.email, process.env.TEST_USER_EMAIL);

  const boundLogin = await encryptedPassword(
    base,
    "login",
    process.env.TEST_USER_EMAIL,
    process.env.TEST_USER_PASSWORD
  );
  assert.equal((await request("POST", "/api/auth/login", {
    ...boundLogin,
    email: "different@example.invalid"
  })).status, 400);
  assert.equal((await request("POST", "/api/auth/login", boundLogin)).status, 200);

  const firstChallenge = await encryptedPassword(
    base,
    "login",
    process.env.TEST_USER_EMAIL,
    process.env.TEST_USER_PASSWORD
  );
  const secondChallenge = await encryptedPassword(
    base,
    "login",
    process.env.TEST_USER_EMAIL,
    process.env.TEST_USER_PASSWORD
  );
  assert.equal((await request("POST", "/api/auth/login", {
    ...firstChallenge,
    challengeId: secondChallenge.challengeId
  })).status, 400);
  assert.equal((await request("POST", "/api/auth/login", firstChallenge)).status, 200);

  const registerEmail = `encrypted-${Date.now()}@example.invalid`;
  const registerRequest = await encryptedPassword(base, "register", registerEmail, "new-user-password");
  assert.equal((await request("POST", "/api/auth/login", registerRequest)).status, 400);
  const registered = await request("POST", "/api/auth/register", {
    ...registerRequest,
    name: "Encrypted Registration"
  });
  assert.equal(registered.status, 201);
  const createdUser = await User.findOne({ email: registerEmail }).select("+password");
  assert.ok(createdUser);
  assert.notEqual(createdUser.password, "new-user-password");
  assert.equal(await bcrypt.compare("new-user-password", createdUser.password), true);

  const replayable = await encryptedPassword(
    base,
    "login",
    process.env.TEST_USER_EMAIL,
    process.env.TEST_USER_PASSWORD
  );
  const replayResults = await Promise.all([
    request("POST", "/api/auth/login", replayable),
    request("POST", "/api/auth/login", replayable)
  ]);
  assert.deepEqual(replayResults.map(result => result.status).sort(), [200, 400]);

  const expired = await encryptedPassword(
    base,
    "login",
    process.env.TEST_USER_EMAIL,
    process.env.TEST_USER_PASSWORD
  );
  await PasswordChallenge.updateOne(
    { _id: expired.challengeId },
    { $set: { expiresAt: new Date(Date.now() - 1000) } }
  );
  assert.equal((await request("POST", "/api/auth/login", expired)).status, 400);

  console.log("Password encryption integration tests passed");
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
