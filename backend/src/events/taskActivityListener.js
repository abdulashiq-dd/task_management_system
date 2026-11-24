// Pure event-to-job mapping; durable delivery is handled by taskOutbox.
function activityJob(event) {
  const { taskId, performedBy, details } = event.data;
  return { id: `activity:${event.id}`, type: "activityLog", userId: performedBy, payload: { task: taskId, eventType: event.eventType, performedBy, details } };
}
module.exports = { activityJob };
