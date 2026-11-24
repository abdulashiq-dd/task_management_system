// Bounded, per-IP fixed-window limiter. Express trust proxy is disabled by default.
// Single process only. Deploy an external/shared limiter for multiple instances.
function authRateLimit({ limit, windowMs = 15 * 60 * 1000, maxKeys = 10000 }) {
  const entries = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || "unknown";
    let entry = entries.get(key);
    if (!entry || entry.until <= now) {
      if (entries.size >= maxKeys) {
        for (const [id, item] of entries) if (item.until <= now) entries.delete(id);
      }
      if (!entries.has(key) && entries.size >= maxKeys) {
        res.set("Retry-After", String(Math.ceil(windowMs / 1000)));
        return res.status(429).json({ message: "Too many requests; try again later" });
      }
      entry = { count: 0, until: now + windowMs };
      entries.set(key, entry);
    }
    entry.count++;
    res.set("RateLimit-Limit", String(limit));
    res.set("RateLimit-Remaining", String(Math.max(0, limit - entry.count)));
    if (entry.count > limit) {
      res.set("Retry-After", String(Math.ceil((entry.until - now) / 1000)));
      return res.status(429).json({ message: "Too many requests; try again later" });
    }
    next();
  };
}
module.exports = { authRateLimit };
