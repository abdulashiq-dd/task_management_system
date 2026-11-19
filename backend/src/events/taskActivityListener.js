const taskEventEmitter = require("./taskEventEmitter");
const TaskActivity = require("../models/taskActivityModel");

const saveTaskActivity = async (eventType, data) => {
  try {
    const activity = await TaskActivity.create({
      task: data.taskId,
      eventType,
      performedBy: data.performedBy,
      details: data.details || {},
    });

    console.log(`Activity saved: ${eventType}`);
    return activity;
  } catch (error) {
    console.error(`Failed to save ${eventType} activity:`, error.message);
  }
};

const eventTypes = [
  "taskCreated",
  "taskUpdated",
  "taskAssigned",
  "taskCompleted",
];

eventTypes.forEach((eventType) => {
  taskEventEmitter.on(eventType, (data) => {
    void saveTaskActivity(eventType, data);
  });
});

module.exports = { saveTaskActivity };
