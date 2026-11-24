const logger = require("../utils/logger");

const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

// ==========================================
// 1. STORAGE CONFIGURATION
// ==========================================

const EXPORT_ROOT = process.env.EXPORT_ROOT ? path.resolve(process.env.EXPORT_ROOT) : path.resolve(__dirname, "../../exports");

const FILE_TYPES = Object.freeze({
  JSON: "json",
  CSV: "csv",
  REPORT: "reports"
});

const STORAGE_DIRECTORIES = Object.freeze({
  [FILE_TYPES.JSON]: path.join(EXPORT_ROOT, "json"),

  [FILE_TYPES.CSV]: path.join(EXPORT_ROOT, "csv"),

  [FILE_TYPES.REPORT]: path.join(EXPORT_ROOT, "reports")
});

const FILE_EXTENSIONS = Object.freeze({
  [FILE_TYPES.JSON]: ".json",
  [FILE_TYPES.CSV]: ".csv",
  [FILE_TYPES.REPORT]: ".json"
});

// ==========================================
// 2. VALIDATE FILE TYPE
// ==========================================

function validateFileType(type) {

  if (!Object.hasOwn(STORAGE_DIRECTORIES, type)) {

    const error = new Error("Invalid export file type");

    error.statusCode = 400;

    throw error;

  }

}

// ==========================================
// 3. INITIALIZE STORAGE
// ==========================================

async function initializeFileStorage() {

  await Promise.all(

    Object.values(STORAGE_DIRECTORIES).map(directory =>

      fs.mkdir(directory, {
        recursive: true
      })

    )

  );

  logger.info("[File Storage] Directories initialized");

  return STORAGE_DIRECTORIES;

}

// ==========================================
// 4. GENERATE UNIQUE FILE NAME
// ==========================================

function generateFileName(type) {

  validateFileType(type);

  const prefix = type === FILE_TYPES.REPORT
    ? "task-report"
    : "tasks";

  const timestamp = Date.now();

  const uniqueId = randomUUID();

  const extension = FILE_EXTENSIONS[type];

  return `${prefix}-${timestamp}-${uniqueId}${extension}`;

}

// ==========================================
// 5. VALIDATE FILE NAME
// ==========================================

function validateFileName(fileName, type) {

  validateFileType(type);

  if (

    typeof fileName !== "string" ||

    fileName.length === 0 ||

    fileName.length > 200 ||

    !/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(fileName)

  ) {

    const error = new Error("Invalid file name");

    error.statusCode = 400;

    throw error;

  }

  if (

    path.extname(fileName) !== FILE_EXTENSIONS[type]

  ) {

    const error = new Error("Invalid file extension");

    error.statusCode = 400;

    throw error;

  }

}

// ==========================================
// 6. GENERATE SAFE FILE PATH
// ==========================================

function getFilePath(type, fileName) {

  validateFileType(type);

  validateFileName(fileName, type);

  const directory = STORAGE_DIRECTORIES[type];

  const filePath = path.resolve(directory, fileName);

  const relativePath = path.relative(
    directory,
    filePath
  );

  if (

    relativePath === ".." ||

    relativePath.startsWith(`..${path.sep}`) ||

    path.isAbsolute(relativePath)

  ) {

    const error = new Error("Unsafe file path");

    error.statusCode = 400;

    throw error;

  }

  return filePath;

}

// ==========================================
// 7. CREATE FILE LOCATION
// ==========================================

function createFileLocation(type) {

  const fileName = generateFileName(type);

  const filePath = getFilePath(type, fileName);

  return {
    type,
    fileName,
    filePath
  };

}

// ==========================================
// 8. CHECK FILE EXISTENCE
// ==========================================

async function fileExists(type, fileName) {

  const filePath = getFilePath(type, fileName);

  try {

    const stats = await fs.lstat(filePath);

    return stats.isFile();

  } catch (error) {

    if (error.code === "ENOENT") {
      return false;
    }

    throw error;

  }

}

// ==========================================
// 9. GET FILE METADATA
// ==========================================

async function getFileMetadata(type, fileName) {

  const filePath = getFilePath(type, fileName);

  const stats = await fs.lstat(filePath);

  if (!stats.isFile()) {

    const error = new Error("Invalid file");

    error.statusCode = 400;

    throw error;

  }

  return {
    fileName,
    type,
    size: stats.size,
    createdAt: stats.birthtime,
    modifiedAt: stats.mtime,
    extension: path.extname(fileName)
  };

}

// ==========================================
// 10. DELETE FILE
// ==========================================

async function deleteFile(type, fileName) {

  const filePath = getFilePath(type, fileName);

  try {

    await fs.unlink(filePath);

    return true;

  } catch (error) {

    if (error.code === "ENOENT") {
      return false;
    }

    throw error;

  }

}

// ==========================================
// 11. EXPORT FUNCTIONS
// ==========================================

module.exports = {
  EXPORT_ROOT,
  FILE_TYPES,
  STORAGE_DIRECTORIES,
  FILE_EXTENSIONS,
  initializeFileStorage,
  validateFileType,
  validateFileName,
  generateFileName,
  getFilePath,
  createFileLocation,
  fileExists,
  getFileMetadata,
  deleteFile
};
