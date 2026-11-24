
const mongoose = require("mongoose");

const {
  FILE_TYPES,
  validateFileName
} = require("../config/fileStorage");

// ==========================================
// 1. EXPORT STATUS
// ==========================================

const EXPORT_STATUS = Object.freeze({
  PENDING: "pending",
  PROCESSING: "processing",
  RETRYING: "retrying",
  COMPLETED: "completed",
  FAILED: "failed"
});

const MIME_TYPES = Object.freeze({
  [FILE_TYPES.JSON]: "application/json",
  [FILE_TYPES.CSV]: "text/csv",
  [FILE_TYPES.REPORT]: "application/json"
});

// ==========================================
// 2. EXPORT FILTER SCHEMA
// ==========================================

const exportFilterSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["pending", "in_progress", "completed"]
    },

    priority: {
      type: String,
      enum: ["low", "medium", "high"]
    },

    search: {
      type: String,
      trim: true,
      maxlength: 200
    },

    tag: {
      type: String,
      trim: true,
      maxlength: 100
    },

    fromDate: {
      type: Date
    },

    toDate: {
      type: Date
    }
  },
  {
    _id: false,
    strict: "throw"
  }
);

// ==========================================
// 3. EXPORT SCHEMA
// ==========================================

const exportSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true
    },

    backgroundJobId: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
      maxlength: 100
    },

    type: {
      type: String,
      enum: Object.values(FILE_TYPES),
      required: true,
      immutable: true
    },

    fileName: {
      type: String,
      required: true,
      immutable: true,
      maxlength: 200,

      validate: {
        validator: function (value) {
          try {
            validateFileName(value, this.type);
            return true;
          } catch {
            return false;
          }
        },

        message: "Invalid export file name"
      }
    },

    mimeType: {
      type: String,
      required: true,
      immutable: true,
      enum: Object.values(MIME_TYPES),

      validate: {
        validator: function (value) {
          return value === MIME_TYPES[this.type];
        },

        message: "Invalid MIME type for export format"
      }
    },

    generatedRole: { type: String, enum: ["user", "admin"], default: null },

    size: {
      type: Number,
      default: 0,
      min: 0,

      validate: {
        validator: Number.isSafeInteger,
        message: "File size must be a valid integer"
      }
    },

    totalRecords: {
      type: Number,
      default: 0,
      min: 0,

      validate: {
        validator: Number.isSafeInteger,
        message: "Record count must be a valid integer"
      }
    },

    status: {
      type: String,
      enum: Object.values(EXPORT_STATUS),
      default: EXPORT_STATUS.PENDING
    },

    filters: {
      type: exportFilterSchema,
      default: () => ({})
    },

    error: {
      type: String,
      default: null,
      maxlength: 500
    },

    completedAt: {
      type: Date,
      default: null
    },

    failedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    strict: "throw",

    toJSON: {
      transform: function (doc, ret) {
        delete ret.__v;
        return ret;
      }
    }
  }
);

// ==========================================
// 4. DATABASE INDEXES
// ==========================================

// Prevent duplicate export records for the same job.
exportSchema.index(
  {
    backgroundJobId: 1
  },
  {
    unique: true
  }
);

// Prevent duplicate filenames within the same type.
exportSchema.index(
  {
    type: 1,
    fileName: 1
  },
  {
    unique: true
  }
);

// Efficient user-level export listing.
exportSchema.index({
  userId: 1,
  createdAt: -1
});

// Efficient export status filtering.
exportSchema.index({
  userId: 1,
  status: 1,
  createdAt: -1
});

// ==========================================
// 5. DOWNLOAD AVAILABILITY
// ==========================================

exportSchema.virtual("isDownloadable").get(function () {
  return this.status === EXPORT_STATUS.COMPLETED;
});

// ==========================================
// 6. CREATE MODEL
// ==========================================

const Export = mongoose.model(
  "Export",
  exportSchema
);

module.exports = {
  Export,
  EXPORT_STATUS,
  MIME_TYPES
};
