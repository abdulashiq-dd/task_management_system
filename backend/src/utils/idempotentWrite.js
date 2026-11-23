
const {
  NonRetryableError,
} = require("./jobErrors");

// ==========================================
// IDEMPOTENT DATABASE WRITE
// ==========================================

async function createIdempotent(
  Model,
  backgroundJobId,
  data
) {
  if (
    typeof backgroundJobId !== "string" ||
    !backgroundJobId.trim()
  ) {
    throw new NonRetryableError(
      "Valid background job ID is required"
    );
  }

  // Check whether an earlier attempt
  // already created the record.

  const existingRecord = await Model.findOne({
    backgroundJobId,
  });

  if (existingRecord) {
    console.log(
      `[Idempotency] Existing record found: ${backgroundJobId}`
    );

    return existingRecord;
  }

  try {
    // Create the record using the same job ID.

    const record = await Model.create({
      ...data,
      backgroundJobId,
    });

    console.log(
      `[Idempotency] Record created: ${backgroundJobId}`
    );

    return record;

  } catch (error) {

    // Handle concurrent duplicate insert attempts.
    // MongoDB unique indexes enforce uniqueness.

    if (error?.code === 11000) {

      const existingRecord = await Model.findOne({
        backgroundJobId,
      });

      if (existingRecord) {
        console.log(
          `[Idempotency] Duplicate prevented: ${backgroundJobId}`
        );

        return existingRecord;
      }
    }

    // Propagate other failures to the worker.
    throw error;
  }
}

module.exports = {
  createIdempotent,
};
