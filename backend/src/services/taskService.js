const Task = require("../models/taskModel");
const User = require("../models/userModel");
const mongoose = require("mongoose");
const { makeEvent, flushBestEffort, flushTaskEvents } = require("../events/taskOutbox");
const { createError } = require("../utils/httpError");
const { validateUser, taskVisibility } = require("../utils/taskAccess");
const { taskFields } = require("../utils/taskFields");

// ==========================================
// HELPER — ERROR HANDLING
// ==========================================



// ==========================================
// HELPER — TASK PERMISSIONS
// ==========================================

const isTaskCreator = (task, currentUser) => {
  return task.createdBy?.toString() === currentUser.id;
};

const canViewTask = (task, currentUser) => {
  return (
    currentUser.role === "admin" ||
    isTaskCreator(task, currentUser) ||
    task.assignedTo?.toString() === currentUser.id
  );
};

// ==========================================
// HELPER — EMIT TASK EVENT
// ==========================================

// Match the version read before building the event snapshot. Bound outbox growth.
function mutationFilter(permission, task) {
  return { ...permission, __v: task.__v, $expr: { $lt: [{ $size: { $ifNull: ["$pendingEvents", []] } }, 99] } };
}
async function mutationConflict(id) {
  if (!(await Task.exists({ _id: id }))) throw createError("Task not found", 404);
  throw createError("Task changed or its event backlog is full; retry", 409);
}

// ==========================================
// 1. CREATE TASK
// ==========================================

const createTask = async (taskData, currentUser) => {
  validateUser(currentUser);
  const newTask = new Task({ ...taskFields(taskData), createdBy: currentUser.id });
  await newTask.validate();
  newTask.pendingEvents = [makeEvent("taskCreated", newTask, currentUser.id, { title: newTask.title, status: newTask.status, priority: newTask.priority })];
  await newTask.save();
  await flushBestEffort(newTask._id);
  return newTask;
};

// ==========================================
// 2. GET ALL TASKS
// Filtering, Searching, Sorting, Pagination
// + User-Based Visibility
// ==========================================

const getAllTasks = async (
  status,
  priority,
  search,
  tag,
  fromDate,
  toDate,
  sortBy = "createdAt",
  order = "desc",
  page = 1,
  limit = 10,
  currentUser,
) => {
  validateUser(currentUser);

  const filter = { $and: [taskVisibility(currentUser)] };

  // Status filtering
  if (status) {
    filter.status = status;
  }

  // Priority filtering
  if (priority) {
    filter.priority = priority;
  }

  // Search by title or description
  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    filter.$or = [
      {
        title: {
          $regex: escapedSearch,
          $options: "i",
        },
      },
      {
        description: {
          $regex: escapedSearch,
          $options: "i",
        },
      },
    ];
  }

  // Tag filtering
  if (tag) {
    filter.tags = tag;
  }

  // Date filtering
  if (fromDate || toDate) {
    filter.dueDate = {};

    if (fromDate) {
      filter.dueDate.$gte = new Date(fromDate);
    }

    if (toDate) {
      const endDate = new Date(toDate);
      endDate.setUTCDate(endDate.getUTCDate() + 1);
      filter.dueDate.$lt = endDate;
    }
  }

  // Pagination
  const skip = (page - 1) * limit;

  const totalTasks = await Task.countDocuments(filter);

  let tasks;

  // Custom priority sorting
  if (sortBy === "priority") {
    const priorityOrder = ["low", "medium", "high"];

    tasks = await Task.find(filter);

    tasks.sort((a, b) => {
      const difference =
        priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority);

      if (difference !== 0) {
        return order === "asc" ? difference : -difference;
      }

      return String(a._id).localeCompare(String(b._id));
    });

    tasks = tasks.slice(skip, skip + limit);
  } else {
    const direction = order === "asc" ? 1 : -1;

    tasks = await Task.find(filter)
      .sort({
        [sortBy]: direction,
        _id: 1,
      })
      .skip(skip)
      .limit(limit);
  }

  return {
    tasks,
    totalTasks,
    totalPages: Math.ceil(totalTasks / limit),
    currentPage: page,
  };
};

// ==========================================
// 3. GET TASK BY ID
// Authorization included
// ==========================================

const getTaskById = async (id, currentUser) => {
  if (!mongoose.isValidObjectId(id)) {
    throw createError("Invalid task ID", 400);
  }

  validateUser(currentUser);

  const task = await Task.findById(id);

  if (!task) {
    return null;
  }

  if (!canViewTask(task, currentUser)) {
    throw createError("Not authorized to view this task", 403);
  }

  return task;
};

// ==========================================
// 4. UPDATE TASK
// Creator or admin only
// ==========================================

const updateTask = async (id, updateData, currentUser) => {
  updateData = taskFields(updateData);
  if (!mongoose.isValidObjectId(id)) {
    throw createError("Invalid task ID", 400);
  }

  validateUser(currentUser);

  const task = await Task.findById(id);

  if (!task) {
    return null;
  }

  if (!isTaskCreator(task, currentUser) && currentUser.role !== "admin") {
    throw createError("Not authorized to update this task", 403);
  }

  const permissionFilter =
    currentUser.role === "admin"
      ? { _id: id }
      : {
          _id: id,
          createdBy: currentUser.id,
        };

  // Validate casting/defaults before creating an event snapshot.
  const previousStatus = task.status;
  const previousPriority = task.priority;
  task.set(updateData);
  await task.validate();
  const fields = Object.fromEntries(Object.keys(updateData).map(key => [key, task.get(key)]));
  if (Object.hasOwn(updateData, "dueDate") || Object.hasOwn(updateData, "status")) Object.assign(fields, { isOverdue: false, overdueAt: null });
  const events = [makeEvent("taskUpdated", task, currentUser.id, { previousStatus, newStatus: task.status, previousPriority, newPriority: task.priority, updatedFields: Object.keys(updateData) })];
  if (previousStatus !== "completed" && task.status === "completed") events.push(makeEvent("taskCompleted", task, currentUser.id, { previousStatus, newStatus: "completed" }));
  const updatedTask = await Task.findOneAndUpdate(mutationFilter(permissionFilter, task), { $set: fields, $inc: { __v: 1 }, $push: { pendingEvents: { $each: events } } }, { returnDocument: "after", runValidators: true });
  if (!updatedTask) await mutationConflict(id);
  await flushBestEffort(updatedTask._id);

  return updatedTask;
};

// ==========================================
// 5. DELETE TASK
// Creator or admin only
// ==========================================

const deleteTask = async (id, currentUser) => {
  if (!mongoose.isValidObjectId(id)) {
    throw createError("Invalid task ID", 400);
  }

  validateUser(currentUser);

  const task = await Task.findById(id);

  if (!task) {
    return null;
  }

  if (!isTaskCreator(task, currentUser) && currentUser.role !== "admin") {
    throw createError("Not authorized to delete this task", 403);
  }

  const permissionFilter =
    currentUser.role === "admin"
      ? { _id: id }
      : {
          _id: id,
          createdBy: currentUser.id,
        };

  // Do not delete a task while its durable events are still awaiting delivery.
  await flushTaskEvents(id);
  const deleted = await Task.findOneAndDelete({ ...permissionFilter, "pendingEvents.0": { $exists: false } });
  if (!deleted && await Task.exists({ _id: id })) throw createError("Task events are awaiting delivery; retry deletion", 409);
  return deleted;
};

// ==========================================
// 6. ASSIGN TASK
// Creator or admin only
// ==========================================

const assignTask = async (taskId, assignedTo, currentUser) => {
  if (
    !mongoose.isValidObjectId(taskId) ||
    !mongoose.isValidObjectId(assignedTo)
  ) {
    throw createError("Invalid task or user ID", 400);
  }

  validateUser(currentUser);

  const task = await Task.findById(taskId);

  if (!task) {
    throw createError("Task not found", 404);
  }

  if (!isTaskCreator(task, currentUser) && currentUser.role !== "admin") {
    throw createError("Not authorized to assign this task", 403);
  }

  const user = await User.findById(assignedTo);

  if (!user) {
    throw createError("User not found", 404);
  }

  const permissionFilter =
    currentUser.role === "admin"
      ? { _id: taskId }
      : {
          _id: taskId,
          createdBy: currentUser.id,
        };

  const previousAssignee = task.assignedTo;
  task.assignedTo = user._id;
  const event = makeEvent("taskAssigned", task, currentUser.id, { previousAssignee, assignedTo: user._id });
  const updatedTask = await Task.findOneAndUpdate(mutationFilter(permissionFilter, task), { $set: { assignedTo: user._id, isOverdue: false, overdueAt: null }, $inc: { __v: 1 }, $push: { pendingEvents: event } }, { returnDocument: "after", runValidators: true });
  if (!updatedTask) await mutationConflict(taskId);
  await flushBestEffort(updatedTask._id);

  return updatedTask;
};

// ==========================================
// EXPORT SERVICES
// ==========================================

module.exports = {
  createTask,
  getAllTasks,
  getTaskById,
  updateTask,
  deleteTask,
  assignTask,
};
