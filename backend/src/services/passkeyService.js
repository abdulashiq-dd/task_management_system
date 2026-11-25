const {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} = require("@simplewebauthn/server");
const { createError } = require("../utils/httpError");
const { getWebAuthnConfig } = require("../config/webauthn");
const PasskeyChallenge = require("../models/passkeyChallengeModel");
const User = require("../models/userModel");
const { createSession } = require("./authService");

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function extractChallenge(response) {
  const encodedClientData = response?.response?.clientDataJSON;
  if (typeof encodedClientData !== "string" || !encodedClientData) {
    throw createError("Invalid passkey response", 400);
  }

  try {
    const clientData = JSON.parse(Buffer.from(encodedClientData, "base64url").toString("utf8"));
    if (typeof clientData.challenge !== "string" || clientData.challenge.length > 256) {
      throw new Error("Invalid challenge");
    }
    return clientData.challenge;
  } catch {
    throw createError("Invalid passkey response", 400);
  }
}

async function saveChallenge(challenge, purpose, userId = null) {
  await PasskeyChallenge.create({
    _id: challenge,
    purpose,
    userId,
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS)
  });
}

async function consumeChallenge(response, purpose, userId) {
  const challengeValue = extractChallenge(response);
  const query = {
    _id: challengeValue,
    purpose,
    expiresAt: { $gt: new Date() }
  };
  if (userId) query.userId = userId;
  else query.userId = null;

  const challenge = await PasskeyChallenge.findOneAndDelete(query);
  if (!challenge) throw createError("Passkey challenge is invalid or expired", 400);
  return challenge;
}

async function registrationOptions(userId) {
  const user = await User.findById(userId).select("+passkeys");
  if (!user) throw createError("User not found", 404);

  const { rpId, rpName } = getWebAuthnConfig();
  const options = await generateRegistrationOptions({
    rpName,
    rpID: rpId,
    userID: new Uint8Array(Buffer.from(user._id.toString())),
    userName: user.email,
    userDisplayName: user.name,
    attestationType: "none",
    excludeCredentials: user.passkeys.map(passkey => ({
      id: passkey.credentialId,
      transports: passkey.transports
    })),
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required"
    }
  });

  await saveChallenge(options.challenge, "registration", user._id);
  return options;
}

async function verifyRegistration(userId, response) {
  await consumeChallenge(response, "registration", userId);

  const { rpId, origin } = getWebAuthnConfig();
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: extractChallenge(response),
      expectedOrigin: origin,
      expectedRPID: rpId,
      requireUserVerification: true
    });
  } catch {
    throw createError("Passkey verification failed", 401);
  }

  if (!verification.verified || !verification.registrationInfo) {
    throw createError("Passkey verification failed", 401);
  }

  const credential = verification.registrationInfo.credential;
  try {
    const user = await User.findById(userId).select("+passkeys");
    if (!user) throw createError("User not found", 404);

    user.passkeys.push({
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports || [],
      deviceType: verification.registrationInfo.credentialDeviceType,
      backedUp: verification.registrationInfo.credentialBackedUp
    });
    await user.save();
  } catch (error) {
    if (error.code === 11000) throw createError("This passkey is already registered", 409);
    throw error;
  }
}

async function authenticationOptions() {
  const { rpId } = getWebAuthnConfig();
  const options = await generateAuthenticationOptions({
    rpID: rpId,
    userVerification: "required"
  });

  await saveChallenge(options.challenge, "authentication");
  return options;
}

async function verifyAuthentication(response) {
  await consumeChallenge(response, "authentication", null);

  const user = await User.findOne({ "passkeys.credentialId": response?.id }).select("+passkeys");
  const passkey = user?.passkeys.find(item => item.credentialId === response.id);
  if (!user || !passkey) throw createError("Invalid passkey response", 401);

  const { rpId, origin } = getWebAuthnConfig();
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: extractChallenge(response),
      expectedOrigin: origin,
      expectedRPID: rpId,
      credential: {
        id: passkey.credentialId,
        publicKey: passkey.publicKey,
        counter: passkey.counter,
        transports: passkey.transports
      },
      requireUserVerification: true
    });
  } catch {
    throw createError("Invalid passkey response", 401);
  }

  if (!verification.verified) throw createError("Invalid passkey response", 401);

  const { authenticationInfo } = verification;
  const update = await User.updateOne(
    {
      _id: user._id,
      passkeys: {
        $elemMatch: {
          credentialId: passkey.credentialId,
          counter: passkey.counter
        }
      }
    },
    {
      $set: {
        "passkeys.$.counter": authenticationInfo.newCounter,
        "passkeys.$.deviceType": authenticationInfo.credentialDeviceType,
        "passkeys.$.backedUp": authenticationInfo.credentialBackedUp
      }
    }
  );
  if (update.matchedCount !== 1) throw createError("Passkey could not be verified", 401);

  return createSession(user);
}

module.exports = {
  authenticationOptions,
  registrationOptions,
  verifyAuthentication,
  verifyRegistration
};
