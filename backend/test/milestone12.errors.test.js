const test = require("node:test");
const assert = require("node:assert/strict");
const { runClassDemo, TaskCounter, invoke } = require("../learning-examples/classServiceDesign");
const { createError, AppError, ValidationError, AuthenticationError, AuthorizationError, NotFoundError, ConflictError, RateLimitError, ServiceUnavailableError, DatabaseError } = require("../src/utils/httpError");
const { normalizeError } = require("../src/errors/normalizeError");
const errorHandler = require("../src/middleware/errorMiddleware");
const { QueueProcessingError, RetryableError, NonRetryableError, JobTimeoutError, isRetryableError } = require("../src/utils/jobErrors");
const { retry } = require("../src/utils/retry");
process.env.LOG_LEVEL = "silent";

function response() {
  return { locals: {}, statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
}
function render(error, envelope = false) {
  const res = response();
  res.locals.apiErrorEnvelope = envelope;
  errorHandler(error, {}, res, () => assert.fail("Unexpected next"));
  return res;
}

test("M11: direct reference loses this; bind, wrapper, call and apply restore it", () => {
  assert.deepEqual(runClassDemo(), { direct: "Tasks: 1", lostThis: "TypeError", bound: "Tasks: 3", wrapper: "Tasks: 6", call: "Other: 4", apply: "Other: 9", count: 6, otherCount: 9 });
  const instance = new TaskCounter("Private");
  assert.equal(instance.count, 0);
  assert.throws(() => invoke(instance.add), TypeError);
  assert.equal(Object.hasOwn(instance, "count"), false);
});

test("M12: error factory returns typed subclasses and keeps the public contract", () => {
  for (const [code, Type] of [[400, ValidationError], [401, AuthenticationError], [403, AuthorizationError], [404, NotFoundError], [409, ConflictError], [429, RateLimitError], [503, ServiceUnavailableError]]) {
    const error = createError("Public message", code);
    assert.ok(error instanceof Type);
    assert.ok(error instanceof AppError);
    assert.ok(error instanceof Error);
    assert.equal(error.statusCode, code);
    assert.equal(error.message, "Public message");
    assert.equal(normalizeError(error), error);
    assert.deepEqual(render(error, true).body, { success: false, message: "Public message" });
  }
});

test("M12: database validation, casting and duplicate keys are classified without raw input", () => {
  const validation = Object.assign(new Error("private input value"), { name: "ValidationError" });
  assert.ok(normalizeError(validation) instanceof ValidationError);
  assert.equal(normalizeError(validation).cause, validation);
  assert.deepEqual(render(validation).body, { message: "Validation failed" });
  const cast = Object.assign(new Error("private input value"), { name: "CastError" });
  assert.equal(render(cast).statusCode, 400);
  assert.equal(render(cast).body.message, "Invalid resource ID");
  const duplicate = Object.assign(new Error("secret email"), { code: 11000, keyPattern: { email: 1 }, keyValue: { email: "secret" } });
  assert.equal(render(duplicate).statusCode, 409);
  assert.deepEqual(render(duplicate).body, { message: "Email already registered" });
  assert.match(render({ code: 11000, keyPattern: { backgroundJobId: 1 } }).body.message, /backgroundJobId/);
});

test("M12: database outages and unexpected 500 errors hide internal details", () => {
  const original = Object.assign(new Error("mongodb://private:password@host"), { name: "MongoNetworkError" });
  const normalized = normalizeError(original);
  assert.ok(normalized instanceof DatabaseError);
  assert.equal(normalized.cause, original);
  assert.deepEqual(render(original, true).body, { success: false, message: "Internal server error" });
  assert.equal(render(original).statusCode, 500);
  assert.deepEqual(render(new Error("secret" )).body, { message: "Internal server error" });
  assert.equal(render(undefined).statusCode, 500);
});

test("M12: malformed JSON is handled and already-sent headers delegate to Express", () => {
  const malformed = Object.assign(new SyntaxError("private request"), { type: "entity.parse.failed", status: 400 });
  assert.equal(render(malformed).statusCode, 400);
  assert.equal(render(malformed).body.message, "Malformed JSON request");
  const res = response(); res.headersSent = true;
  let forwarded;
  errorHandler(malformed, {}, res, error => { forwarded = error; });
  assert.equal(forwarded, malformed);
  assert.equal(res.body, undefined);
});

test("M12: route forwarding preserves existing success:false error envelope", () => {
  const err = new NotFoundError("Export not found");
  const res = response();
  errorHandler.forwardApiError(err, res, error => errorHandler(error, {}, res, () => assert.fail()));
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { success: false, message: "Export not found" });
});

test("M12: custom queue errors preserve retry classification and do not leak to HTTP", () => {
  const retryable = new RetryableError("temporary", "TEST");
  const fatal = new NonRetryableError("private payload");
  assert.ok(retryable instanceof QueueProcessingError);
  assert.ok(fatal instanceof QueueProcessingError);
  assert.equal(isRetryableError(retryable), true);
  assert.equal(isRetryableError(fatal), false);
  assert.equal(isRetryableError(new JobTimeoutError()), false);
  assert.deepEqual(render(fatal).body, { message: "Internal server error" });
});

test("M12: resolved and rejected promises are asserted with mocked operations", async t => {
  const success = t.mock.fn(async () => "done");
  assert.equal(await retry(success, 0, 0), "done");
  assert.equal(success.mock.callCount(), 1);
  const original = new Error("operation failed");
  const failure = t.mock.fn(async () => { throw original; });
  await assert.rejects(retry(failure, 1, 0), error => error === original);
  assert.equal(failure.mock.callCount(), 2);
});
