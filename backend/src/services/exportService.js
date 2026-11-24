
const fs = require("node:fs");
const fsPromises = require("node:fs/promises");

const { randomUUID } = require("node:crypto");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");

const Task = require("../models/taskModel");

const {
  FILE_TYPES,
  initializeFileStorage,
  generateFileName,
  getFilePath,
  getFileMetadata
} = require("../config/fileStorage");
const {
  generateCSVHeader,
  generateCSVRow
} = require("../utils/csvUtils");
const {
  buildExportFilter
} = require("../utils/exportFilters");

// ==========================================
// 1. FORMAT TASK
// ==========================================

function formatTask(task) {

  return {
    id: String(task._id),

    title: task.title,

    description: task.description || "",

    status: task.status,

    priority: task.priority,

    dueDate: task.dueDate || null,

    tags: task.tags || [],

    isOverdue: task.isOverdue || false,

    overdueAt: task.overdueAt || null,

    createdBy: String(task.createdBy),

    assignedTo: task.assignedTo
      ? String(task.assignedTo)
      : null,

    createdAt: task.createdAt,

    updatedAt: task.updatedAt
  };

}

// ==========================================
// 2. JSON EXPORT
// ==========================================

async function exportTasksAsJSON(
  currentUser,
  filters = {},
  requestedFileName
) {

  const filter = buildExportFilter(
    currentUser,
    filters
  );

  await initializeFileStorage();

  const fileName =
    requestedFileName ||
    generateFileName(FILE_TYPES.JSON);

  const filePath = getFilePath(
    FILE_TYPES.JSON,
    fileName
  );

  // Write to a temporary file first.

  const temporaryPath =
    `${filePath}.${randomUUID()}.tmp`;

  let cursor;
  let totalRecords = 0;

  try {

    // Retrieve tasks incrementally.

    cursor = Task.find(filter)

      .select(
        "_id title description status priority " +
        "dueDate tags isOverdue overdueAt " +
        "createdBy assignedTo createdAt updatedAt"
      )

      .sort({
        createdAt: -1,
        _id: 1
      })

      .lean()

      .cursor({
        batchSize: 500
      });


    // Generate valid JSON incrementally.

    async function* generateJSON() {

      yield "[\n";

      let firstRecord = true;

      for await (const task of cursor) {

        if (!firstRecord) {
          yield ",\n";
        }

        const formattedTask = formatTask(task);

        yield JSON.stringify(formattedTask);

        firstRecord = false;

        totalRecords++;

      }

      yield "\n]\n";

    }


    // Stream data into the temporary file.

    await pipeline(

      Readable.from(generateJSON()),

      fs.createWriteStream(
        temporaryPath,
        {
          encoding: "utf8",
          flags: "wx"
        }
      )

    );


    // Publish only the completed file.

    await fsPromises.rename(
      temporaryPath,
      filePath
    );

    const metadata = await getFileMetadata(
      FILE_TYPES.JSON,
      fileName
    );

    console.log(
      "[Export Service] JSON export completed"
    );

    console.log(
      "[Export Service] Records:",
      totalRecords
    );

    return {
      type: FILE_TYPES.JSON,
      fileName,
      mimeType: "application/json",
      size: metadata.size,
      totalRecords
    };

  } finally {

    // Close the database cursor.

    try {

      if (cursor) {
        await cursor.close();
      }

    } finally {

      // Remove temporary output on failure.

      await fsPromises.rm(
        temporaryPath,
        {
          force: true
        }
      );

    }

  }

}


// ==========================================
// CSV EXPORT
// ==========================================

async function exportTasksAsCSV(
  currentUser,
  filters = {},
  requestedFileName
) {

  const filter = buildExportFilter(
    currentUser,
    filters
  );

  await initializeFileStorage();

  const fileName =
    requestedFileName ||
    generateFileName(FILE_TYPES.CSV);

  const filePath = getFilePath(
    FILE_TYPES.CSV,
    fileName
  );

  const temporaryPath =
    `${filePath}.${randomUUID()}.tmp`;

  let cursor;
  let totalRecords = 0;

  try {

    // Retrieve authorized tasks incrementally.

    cursor = Task.find(filter)

      .select(
        "_id title description status priority " +
        "dueDate tags isOverdue overdueAt " +
        "createdBy assignedTo createdAt updatedAt"
      )

      .sort({
        createdAt: -1,
        _id: 1
      })

      .lean()

      .cursor({
        batchSize: 500
      });


    // Generate CSV content incrementally.

    async function* generateCSV() {

      // UTF-8 BOM for better Excel compatibility.
      yield "\uFEFF";

      // Write column names.
      yield generateCSVHeader();

      // Write individual task rows.
      for await (const task of cursor) {

        const formattedTask = formatTask(task);

        yield generateCSVRow(formattedTask);

        totalRecords++;

      }

    }


    // Stream CSV content to temporary file.

    await pipeline(

      Readable.from(generateCSV()),

      fs.createWriteStream(
        temporaryPath,
        {
          encoding: "utf8",
          flags: "wx"
        }
      )

    );


    // Publish completed file.

    await fsPromises.rename(
      temporaryPath,
      filePath
    );

    const metadata = await getFileMetadata(
      FILE_TYPES.CSV,
      fileName
    );

    console.log(
      "[Export Service] CSV export completed"
    );

    console.log(
      "[Export Service] Records:",
      totalRecords
    );

    return {
      type: FILE_TYPES.CSV,
      fileName,
      mimeType: "text/csv",
      size: metadata.size,
      totalRecords
    };

  } finally {

    try {

      if (cursor) {
        await cursor.close();
      }

    } finally {

      await fsPromises.rm(
        temporaryPath,
        {
          force: true
        }
      );

    }

  }

}


// ==========================================
// 3. EXPORT FUNCTIONS
// ==========================================
module.exports = {
  formatTask,
  exportTasksAsJSON,
  exportTasksAsCSV
};