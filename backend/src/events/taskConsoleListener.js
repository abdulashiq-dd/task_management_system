const taskEventEmitter = require("./taskEventEmitter");

const eventTypes = [
  "taskCreated",
  "taskUpdated",
  "taskAssigned",
  "taskCompleted",
];

eventTypes.forEach((eventType) => {
  taskEventEmitter.on(eventType, (data) => {
    console.log(`[Task Event] ${eventType}`, {
      taskId: data.taskId,
      performedBy: data.performedBy,
    });
  });
});
