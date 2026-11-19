const EventEmitter = require("events");

class TaskEventEmitter extends EventEmitter {
  constructor() {
    super();
  }
}

const taskEventEmitter = new TaskEventEmitter();

module.exports = taskEventEmitter;
