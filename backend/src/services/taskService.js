
const Task = require("../models/taskModel");


//create task
const createTask = async (taskData) => {
  const newTask = await Task.create(taskData);
  return newTask;
};


//getAllTasks



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
  limit = 10
) => {
  const filter = {};

  // Filter by status
  if (status) {
    filter.status = status;
  }

  // Filter by priority
  if (priority) {
    filter.priority = priority;
  }

  // Search by title or description
  if (search) {
    const escapedSearch = search.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

    filter.$or = [
      { title: { $regex: escapedSearch, $options: "i" } },
      { description: { $regex: escapedSearch, $options: "i" } }
    ];
  }

  // Filter by tag
  if (tag) {
    filter.tags = tag;
  }

  // Filter by due date range
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

  // Pagination calculation
  const skip = (page - 1) * limit;

  // Count all matching tasks before pagination
  const totalTasks = await Task.countDocuments(filter);

  let tasks;

  // Custom priority sorting
  if (sortBy === "priority") {
    const priorityOrder = ["low", "medium", "high"];

    tasks = await Task.find(filter);

    tasks.sort((a, b) => {
      const difference =
        priorityOrder.indexOf(a.priority) -
        priorityOrder.indexOf(b.priority);

      if (difference !== 0) {
        return order === "asc" ? difference : -difference;
      }

      return String(a._id).localeCompare(String(b._id));
    });

    // Pagination using JavaScript slice()
    tasks = tasks.slice(skip, skip + limit);

  } else {
    // Sorting and pagination using MongoDB
    const direction = order === "asc" ? 1 : -1;

    tasks = await Task.find(filter)
      .sort({
        [sortBy]: direction,
        _id: 1
      })
      .skip(skip)
      .limit(limit);
  }

  return {
    tasks,
    totalTasks,
    totalPages: Math.ceil(totalTasks / limit),
    currentPage: page
  };
};


// Get one task by ID
const getTaskById = async (id) => {
  const task = await Task.findById(id);
  return task;
};

// update  by id
const updateTask = async (id, updateData) => {
  const updatedTask = await Task.findByIdAndUpdate(
    id,
    updateData,
    {
      new: true,
      runValidators: true
    }
  );

  return updatedTask;
};
// delete by id 
const deleteTask = async (id) => {
  const deletedTask = await Task.findByIdAndDelete(id);

  return deletedTask;
};

module.exports = { 
    createTask ,
    getAllTasks,
    getTaskById,
    updateTask,
    deleteTask

};
