const Task = require("../models/taskModel");
const User = require("../models/userModel");
const mongoose = require("mongoose");
const { makeEvent, flushBestEffort, flushTaskEvents } = require("../events/taskOutbox");
const { createError } = require("../utils/httpError");
const { validateUser, taskVisibility } = require("../utils/taskAccess");
const { taskFields } = require("../utils/taskFields");

class TaskService {
  #Task;
  #User;
  #outbox;

  constructor({ taskModel = Task, userModel = User, outbox = { makeEvent, flushBestEffort, flushTaskEvents } } = {}) {
    this.#Task = taskModel;
    this.#User = userModel;
    this.#outbox = outbox;
    // Preserve the old module's detached-function API for callbacks and imports.
    this.createTask = this.createTask.bind(this);
    this.getAllTasks = this.getAllTasks.bind(this);
    this.getTaskById = this.getTaskById.bind(this);
    this.updateTask = this.updateTask.bind(this);
    this.deleteTask = this.deleteTask.bind(this);
    this.assignTask = this.assignTask.bind(this);
  }

  // ==========================================
  // HELPER — TASK PERMISSIONS
  // ==========================================

  #isTaskCreator(task, currentUser) {
    return task.createdBy?.toString() === currentUser.id;
  }

  #canViewTask(task, currentUser) {
    return (
      currentUser.role === "admin" ||
      this.#isTaskCreator(task, currentUser) ||
      task.assignedTo?.toString() === currentUser.id
    );
  }

  // ==========================================
  // HELPER — EMIT TASK EVENT
  // ==========================================

  // Match the version read before building the event snapshot. Bound outbox growth.
  #mutationFilter(permission, task) {
    return { ...permission, __v: task.__v, $expr: { $lt: [{ $size: { $ifNull: ["$pendingEvents", []] } }, 99] } };
  }
  async #mutationConflict(id) {
    if (!(await this.#Task.exists({ _id: id }))) throw createError("Task not found", 404);
    throw createError("Task changed or its event backlog is full; retry", 409);
  }

  // ==========================================
  // 1. CREATE TASK
  // ==========================================

  async createTask(taskData, currentUser, assignedTo = null) {
    validateUser(currentUser);
    const taskFieldsValue = taskFields(taskData);

    let assignee = null;
    if (assignedTo !== null && assignedTo !== undefined && assignedTo !== "") {
      if (currentUser.role !== "admin") {
        throw createError("Only administrators can assign tasks", 403);
      }
      if (!mongoose.isValidObjectId(assignedTo)) {
        throw createError("Invalid assignee ID", 400);
      }
      const user = await this.#User.findById(assignedTo);
      if (!user) {
        throw createError("User not found", 404);
      }
      assignee = user._id;
    }

    const newTask = new this.#Task({
      ...taskFieldsValue,
      createdBy: currentUser.id,
      assignedTo: assignee,
    });
    await newTask.validate();
    newTask.pendingEvents = [this.#outbox.makeEvent("taskCreated", newTask, currentUser.id, { title: newTask.title, status: newTask.status, priority: newTask.priority })];
    await newTask.save();
    await this.#outbox.flushBestEffort(newTask._id);
    return newTask;
  }

  // ==========================================
  // 2. GET ALL TASKS
  // Filtering, Searching, Sorting, Pagination
  // + User-Based Visibility
  // ==========================================

  async getAllTasks(
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
  ) {
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

    const totalTasks = await this.#Task.countDocuments(filter);

    let tasks;

    // Custom priority sorting
    if (sortBy === "priority") {
      const priorityOrder = ["low", "medium", "high"];

      tasks = await this.#Task.find(filter);

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

      tasks = await this.#Task.find(filter)
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
  }

  // ==========================================
  // 3. GET TASK BY ID
  // Authorization included
  // ==========================================

  async getTaskById(id, currentUser) {
    if (!mongoose.isValidObjectId(id)) {
      throw createError("Invalid task ID", 400);
    }

    validateUser(currentUser);

    const task = await this.#Task.findById(id);

    if (!task) {
      return null;
    }

    if (!this.#canViewTask(task, currentUser)) {
      throw createError("Not authorized to view this task", 403);
    }

    return task;
  }

  // ==========================================
  // 4. UPDATE TASK
  // Creator or admin only
  // ==========================================

  async updateTask(id, updateData, currentUser) {
    updateData = taskFields(updateData);
    if (!mongoose.isValidObjectId(id)) {
      throw createError("Invalid task ID", 400);
    }

    validateUser(currentUser);

    const task = await this.#Task.findById(id);

    if (!task) {
      return null;
    }

    if (!this.#isTaskCreator(task, currentUser) && currentUser.role !== "admin") {
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
    const events = [this.#outbox.makeEvent("taskUpdated", task, currentUser.id, { previousStatus, newStatus: task.status, previousPriority, newPriority: task.priority, updatedFields: Object.keys(updateData) })];
    if (previousStatus !== "completed" && task.status === "completed") events.push(this.#outbox.makeEvent("taskCompleted", task, currentUser.id, { previousStatus, newStatus: "completed" }));
    const updatedTask = await this.#Task.findOneAndUpdate(this.#mutationFilter(permissionFilter, task), { $set: fields, $inc: { __v: 1 }, $push: { pendingEvents: { $each: events } } }, { returnDocument: "after", runValidators: true });
    if (!updatedTask) await this.#mutationConflict(id);
    await this.#outbox.flushBestEffort(updatedTask._id);

    return updatedTask;
  }

  // ==========================================
  // 5. DELETE TASK
  // Creator or admin only
  // ==========================================

  async deleteTask(id, currentUser) {
    if (!mongoose.isValidObjectId(id)) {
      throw createError("Invalid task ID", 400);
    }

    validateUser(currentUser);

    const task = await this.#Task.findById(id);

    if (!task) {
      return null;
    }

    if (!this.#isTaskCreator(task, currentUser) && currentUser.role !== "admin") {
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
    await this.#outbox.flushTaskEvents(id);
    const deleted = await this.#Task.findOneAndDelete({ ...permissionFilter, "pendingEvents.0": { $exists: false } });
    if (!deleted && await this.#Task.exists({ _id: id })) throw createError("Task events are awaiting delivery; retry deletion", 409);
    return deleted;
  }

  // ==========================================
  // 6. ASSIGN TASK
  // Creator or admin only
  // ==========================================

  async assignTask(taskId, assignedTo, currentUser) {
    if (
      !mongoose.isValidObjectId(taskId) ||
      !mongoose.isValidObjectId(assignedTo)
    ) {
      throw createError("Invalid task or user ID", 400);
    }

    validateUser(currentUser);

    const task = await this.#Task.findById(taskId);

    if (!task) {
      throw createError("Task not found", 404);
    }

    if (!this.#isTaskCreator(task, currentUser) && currentUser.role !== "admin") {
      throw createError("Not authorized to assign this task", 403);
    }

    const user = await this.#User.findById(assignedTo);

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
    const event = this.#outbox.makeEvent("taskAssigned", task, currentUser.id, { previousAssignee, assignedTo: user._id });
    const updatedTask = await this.#Task.findOneAndUpdate(this.#mutationFilter(permissionFilter, task), { $set: { assignedTo: user._id, isOverdue: false, overdueAt: null }, $inc: { __v: 1 }, $push: { pendingEvents: event } }, { returnDocument: "after", runValidators: true });
    if (!updatedTask) await this.#mutationConflict(taskId);
    await this.#outbox.flushBestEffort(updatedTask._id);

    return updatedTask;
  }
}

// Existing consumers use the shared instance; tests can construct isolated instances.
module.exports = new TaskService();
module.exports.TaskService = TaskService;
