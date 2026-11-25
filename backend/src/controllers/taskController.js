const { createError } = require("../utils/httpError");
const taskService = require("../services/taskService");
const { taskFields } = require("../utils/taskFields");

// ==========================================
// 1. CREATE TASK
// ==========================================

const createTask = async (req, res, next) => {
  try {
    // Include the authenticated user as the creator
    const taskBody = req.body || {};
    if (req.user.role !== "admin" && Object.hasOwn(taskBody, "assignedTo")) {
      throw createError("Unsupported task field: assignedTo", 400);
    }

    const { assignedTo, ...taskFieldsBody } = taskBody;
    const taskData = taskFields(taskFieldsBody);

    const newTask = await taskService.createTask(taskData, req.user, assignedTo);

    return res.status(201).json({
      message: "Task created successfully",
      task: newTask,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 2. GET ALL TASKS
// Filtering, Searching, Sorting, Pagination
// ==========================================

const getAllTasks = async (req, res, next) => {
  try {
    // Filtering parameters
    const status = req.query.status;
    const priority = req.query.priority;
    const search = req.query.search;
    const tag = req.query.tag;
    const fromDate = req.query.fromDate;
    const toDate = req.query.toDate;

    // Sorting parameters
    const sortBy = req.query.sortBy ?? "createdAt";
    const order = req.query.order ?? "desc";

    // Pagination parameters
    const pageInput = req.query.page ?? "1";
    const limitInput = req.query.limit ?? "10";

    // Validate status
    const allowedStatuses = ["pending", "in_progress", "completed"];

    if (
      status !== undefined &&
      (typeof status !== "string" || !allowedStatuses.includes(status))
    ) {
      throw createError("Invalid status filter", 400);
    }

    // Validate priority
    const allowedPriorities = ["low", "medium", "high"];

    if (
      priority !== undefined &&
      (typeof priority !== "string" || !allowedPriorities.includes(priority))
    ) {
      throw createError("Invalid priority filter", 400);
    }

    // Validate search
    if (
      search !== undefined &&
      (typeof search !== "string" || search.trim().length === 0)
    ) {
      throw createError("Invalid search parameter", 400);
    }

    // Validate tag
    if (
      tag !== undefined &&
      (typeof tag !== "string" || tag.trim().length === 0)
    ) {
      throw createError("Invalid tag filter", 400);
    }

    // Validate date format
    const isValidDate = (value) => {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
      }

      const date = new Date(value);

      return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
      );
    };

    if (
      (fromDate !== undefined && !isValidDate(fromDate)) ||
      (toDate !== undefined && !isValidDate(toDate))
    ) {
      throw createError("Invalid date format. Use YYYY-MM-DD", 400);
    }

    if (fromDate && toDate && fromDate > toDate) {
      throw createError("fromDate cannot be after toDate", 400);
    }

    // Validate sorting field
    const allowedSortFields = ["dueDate", "priority", "createdAt"];

    if (typeof sortBy !== "string" || !allowedSortFields.includes(sortBy)) {
      throw createError("Invalid sortBy parameter", 400);
    }

    // Validate sorting order
    const allowedOrders = ["asc", "desc"];

    if (typeof order !== "string" || !allowedOrders.includes(order)) {
      throw createError("Invalid order parameter", 400);
    }

    // Validate pagination
    const isPositiveInteger = (value) =>
      typeof value === "string" &&
      /^[1-9]\d*$/.test(value) &&
      Number.isSafeInteger(Number(value));

    if (
      !isPositiveInteger(pageInput) ||
      !isPositiveInteger(limitInput) ||
      Number(limitInput) > 100
    ) {
      throw createError("Invalid pagination parameters", 400);
    }

    const page = Number(pageInput);
    const limit = Number(limitInput);

    // Fetch filtered, sorted and paginated tasks

    const result = await taskService.getAllTasks(
      status,
      priority,
      search,
      tag,
      fromDate,
      toDate,
      sortBy,
      order,
      page,
      limit,
      req.user,
    );

    return res.status(200).json({
      message: "Tasks fetched successfully",
      count: result.tasks.length,
      totalTasks: result.totalTasks,
      totalPages: result.totalPages,
      currentPage: result.currentPage,
      tasks: result.tasks,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 3. GET TASK BY ID
// ==========================================

const getTaskById = async (req, res, next) => {
  try {
    const id = req.params.id;

    const task = await taskService.getTaskById(id, req.user);

    if (!task) {
      throw createError("Task not found", 404);
    }

    return res.status(200).json({
      message: "Task fetched successfully",
      task: task,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 4. UPDATE TASK BY ID
// ==========================================

const updateTask = async (req, res, next) => {
  try {
    const id = req.params.id;

    const updateData = taskFields(req.body);

    const updatedTask = await taskService.updateTask(id, updateData, req.user);

    if (!updatedTask) {
      throw createError("Task not found", 404);
    }

    return res.status(200).json({
      message: "Task updated successfully",
      task: updatedTask,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 5. DELETE TASK BY ID
// ==========================================

const deleteTask = async (req, res, next) => {
  try {
    const id = req.params.id;

    const deletedTask = await taskService.deleteTask(id, req.user);

    if (!deletedTask) {
      throw createError("Task not found", 404);
    }

    return res.status(200).json({
      message: "Task deleted successfully",
      task: deletedTask,
    });
  } catch (error) {
    next(error);
  }
};

const assignTask = async (req, res, next) => {
  try {
    const taskId = req.params.id;
    const { assignedTo } = req.body || {};

    if (typeof assignedTo !== "string" || !assignedTo.trim()) {
      throw createError("assignedTo is required", 400);
    }

    const updatedTask = await taskService.assignTask(
      taskId,
      assignedTo,
      req.user,
    );

    if (!updatedTask) throw createError("Task not found", 404);
    return res.status(200).json({
      message: "Task assigned successfully",
      task: updatedTask,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// EXPORT CONTROLLERS
// ==========================================

module.exports = {
  createTask,
  getAllTasks,
  getTaskById,
  updateTask,
  deleteTask,
  assignTask,
};
