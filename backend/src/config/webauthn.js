function getWebAuthnConfig(env = process.env) {
  const production = env.NODE_ENV === "production";
  const rpId = env.WEBAUTHN_RP_ID?.trim() || (production ? "" : "localhost");
  const configuredOrigin = env.WEBAUTHN_ORIGIN?.trim() || (production ? "" : "http://localhost:4200");

  if (!rpId || !configuredOrigin) {
    throw new Error("WEBAUTHN_RP_ID and WEBAUTHN_ORIGIN are required in production");
  }

  const origin = configuredOrigin.endsWith("/")
    ? configuredOrigin.slice(0, -1)
    : configuredOrigin;
  let parsedOrigin;

  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new Error("WEBAUTHN_ORIGIN must be a valid origin");
  }

  const isLocalhost = parsedOrigin.hostname === "localhost" && parsedOrigin.protocol === "http:";
  if (
    parsedOrigin.origin !== origin ||
    (parsedOrigin.protocol !== "https:" && !isLocalhost) ||
    (parsedOrigin.hostname !== rpId && !parsedOrigin.hostname.endsWith(`.${rpId}`))
  ) {
    throw new Error("WEBAUTHN_ORIGIN must be HTTPS and match WEBAUTHN_RP_ID");
  }

  return {
    rpId,
    rpName: env.WEBAUTHN_RP_NAME?.trim() || "TaskOrbit",
    origin
  };
}

module.exports = { getWebAuthnConfig };
