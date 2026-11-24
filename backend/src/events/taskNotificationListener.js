// Use the event-time task snapshot; no additional task read or deletion race.
function notificationJob(event) {
  const { taskId, title, recipient, details = {} } = event.data;
  let user = recipient, type, message;
  if (event.eventType === "taskAssigned") {
    if (!details.assignedTo || String(details.previousAssignee || "") === String(details.assignedTo)) return null;
    user = String(details.assignedTo); type = "taskAssigned"; message = "You have been assigned a task.";
  } else if (event.eventType === "taskCompleted") {
    type = "taskCompleted"; message = `Task "${title}" has been completed.`;
  } else if (event.eventType === "taskUpdated" && details.previousPriority !== undefined && details.newPriority !== undefined && details.previousPriority !== details.newPriority) {
    type = "priorityChanged"; message = `Task "${title}" priority changed from ${details.previousPriority} to ${details.newPriority}.`;
  } else return null;
  if (!user) return null;
  return { id: `notification:${event.id}`, type: "notification", userId: user, payload: { user, task: taskId, type, message: message.slice(0, 4096) } };
}
module.exports = { notificationJob };
