// Structured logging to stdout/stderr. Do not serialize arbitrary error messages,
// requests, user data, credentials, or database values.
const levels = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };
function log(level, event, error) {
  const threshold = levels[process.env.LOG_LEVEL] ?? levels.info;
  if (levels[level] < threshold) return;
  const record = { time: new Date().toISOString(), level, event };
  if (error instanceof Error) {
    record.error = { name: error.name, code: typeof error.code === "number" ? error.code : undefined,
      stack: typeof error.stack === "string" ? error.stack.split("\n").slice(1).filter(line => /^\s*at /.test(line)).slice(0, 12) : undefined };
  }
  (level === "error" ? process.stderr : process.stdout).write(JSON.stringify(record) + "\n");
}
module.exports = { debug: (event, error) => log("debug", event, error), info: (event, error) => log("info", event, error), warn: (event, error) => log("warn", event, error), error: (event, error) => log("error", event, error) };
