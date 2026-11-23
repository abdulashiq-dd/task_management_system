
const taskEventEmitter = require("./taskEventEmitter");

const {
  jobQueue,
  JOB_TYPES,
} = require("../queues/jobQueue");

// ==========================================
// QUEUE TASK ACTIVITY
// ==========================================

const saveTaskActivity = async (
  eventType,
  data
) => {
  try {
    if (!data?.taskId || !data?.performedBy) {
      throw new Error(
        "Task ID and performedBy are required"
      );
    }

    const job = jobQueue.enqueue(
      JOB_TYPES.ACTIVITY_LOG,
      {
        task: String(data.taskId),
        eventType,
        performedBy: String(data.performedBy),
        details: data.details || {},
      },
      String(data.performedBy)
    );

    console.log(
      `[Activity Listener] ${eventType} queued: ${job.id}`
    );

    return job;

  } catch (error) {
    console.error(
      `Failed to queue ${eventType} activity:`,
      error.message
    );
  }
};

// ==========================================
// SUPPORTED TASK EVENTS
// ==========================================

const eventTypes = [
  "taskCreated",
  "taskUpdated",
  "taskAssigned",
  "taskCompleted",
];

// ==========================================
// REGISTER EVENT LISTENERS
// ==========================================

eventTypes.forEach((eventType) => {
  taskEventEmitter.on(eventType, (data) => {
    void saveTaskActivity(eventType, data);
  });
});

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  saveTaskActivity,
};
