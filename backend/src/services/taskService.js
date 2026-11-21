const Task = require("../models/taskModel");
const User = require("../models/userModel");
const mongoose = require("mongoose");
const taskEventEmitter = require("../events/taskEventEmitter");

// ==========================================
// HELPER — ERROR HANDLING
// ==========================================

const createError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

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

const emitTaskEvent = (eventType, task, userId, details = {}) => {
  taskEventEmitter.emit(eventType, {
    taskId: task._id,
    performedBy: userId,
    details,
  });
};

// ==========================================
// 1. CREATE TASK
// ==========================================

const createTask = async (taskData) => {
  const newTask = await Task.create(taskData);

  // Emit event only after successful creation.
  emitTaskEvent("taskCreated", newTask, newTask.createdBy, {
    title: newTask.title,
    status: newTask.status,
    priority: newTask.priority,
  });

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
  if (!currentUser?.id) {
    throw createError("Authentication required", 401);
  }

  const filter = {};

  // Users see their owned or assigned tasks.
  // Admins can see all tasks.
  if (currentUser.role !== "admin") {
    filter.$and = [
      {
        $or: [{ createdBy: currentUser.id }, { assignedTo: currentUser.id }],
      },
    ];
  }

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

  if (!currentUser?.id) {
    throw createError("Authentication required", 401);
  }

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
  if (!mongoose.isValidObjectId(id)) {
    throw createError("Invalid task ID", 400);
  }

  if (!currentUser?.id) {
    throw createError("Authentication required", 401);
  }

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

  // Capture previous status before updating.
  const previousStatus = task.status;
  const previousPriority = task.priority;
  const updatedTask = await Task.findOneAndUpdate(
    permissionFilter,
    updateData,
    {
      returnDocument: "after",
      runValidators: true,
    },
  );

  if (!updatedTask) {
    return null;
  }

  // Emit taskUpdated event.
  emitTaskEvent("taskUpdated", updatedTask, currentUser.id, {
    previousStatus,
    newStatus: updatedTask.status,
    previousPriority,
    newPriority: updatedTask.priority,
    updatedFields: Object.keys(updateData),
  });

  // Emit taskCompleted only when transitioning
  // from another status to completed.
  if (previousStatus !== "completed" && updatedTask.status === "completed") {
    emitTaskEvent("taskCompleted", updatedTask, currentUser.id, {
      previousStatus,
      newStatus: "completed",
    });
  }

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

  if (!currentUser?.id) {
    throw createError("Authentication required", 401);
  }

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

  return Task.findOneAndDelete(permissionFilter);
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

  if (!currentUser?.id) {
    throw createError("Authentication required", 401);
  }

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

  const updatedTask = await Task.findOneAndUpdate(
    permissionFilter,
    {
      assignedTo: user._id,
    },
    {
      returnDocument: "after",
      runValidators: true,
    },
  );

  if (!updatedTask) {
    return null;
  }

  // Emit assignment event.
  emitTaskEvent("taskAssigned", updatedTask, currentUser.id, {
    previousAssignee,
    assignedTo: user._id,
  });

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
