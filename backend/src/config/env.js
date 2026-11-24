function validateEnvironment(env = process.env) {
  const missing = ["MONGO_URI", "JWT_SECRET"].filter(key => !env[key]?.trim());
  if (missing.length) throw new Error(`Missing configuration: ${missing.join(", ")}`);
  if (env.PORT !== undefined && (!/^\d+$/.test(env.PORT) || Number(env.PORT) < 1 || Number(env.PORT) > 65535)) throw new Error("Invalid PORT");
  if (env.NOTIFICATION_RETENTION_DAYS !== undefined && (!/^\d+$/.test(env.NOTIFICATION_RETENTION_DAYS) || Number(env.NOTIFICATION_RETENTION_DAYS) > 36500)) throw new Error("Invalid NOTIFICATION_RETENTION_DAYS");
}
module.exports = { validateEnvironment };
