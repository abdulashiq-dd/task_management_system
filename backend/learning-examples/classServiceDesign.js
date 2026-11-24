"use strict";

// A controlled example: this is deliberately NOT pre-bound, unlike the production services.
class TaskCounter {
  #count = 0;

  constructor(label) {
    this.label = label;
  }

  add(amount = 1) {
    this.#count += amount;
    return `${this.label}: ${this.#count}`;
  }

  get count() {
    return this.#count;
  }
}

function invoke(callback, ...args) {
  return callback(...args);
}

function runClassDemo() {
  const counter = new TaskCounter("Tasks");
  const other = new TaskCounter("Other");
  const results = { direct: counter.add(1) };
  try {
    // Extracting a method does not preserve the object that owns it.
    invoke(counter.add, 1);
  } catch (error) {
    results.lostThis = error.name;
  }
  results.bound = invoke(counter.add.bind(counter), 2);
  results.wrapper = invoke(() => counter.add(3));
  results.call = counter.add.call(other, 4);
  results.apply = counter.add.apply(other, [5]);
  results.count = counter.count;
  results.otherCount = other.count;
  return results;
}

if (require.main === module) {
  const results = runClassDemo();
  for (const [key, value] of Object.entries(results)) console.log(`${key}: ${value}`);
}
module.exports = { TaskCounter, invoke, runClassDemo };
