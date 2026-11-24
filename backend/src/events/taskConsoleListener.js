const taskEventEmitter = require("./taskEventEmitter");
const logger = require("../utils/logger");

const eventTypes = [
  "taskCreated",
  "taskUpdated",
  "taskAssigned",
  "taskCompleted",
];

eventTypes.forEach((eventType) => {
  if (process.env.NODE_ENV !== "development") return;
  taskEventEmitter.on(eventType, (data) => {
    if (!data?.taskId || !data?.performedBy) return;
    logger.debug(`Task event: ${eventType}`);
  });
});
