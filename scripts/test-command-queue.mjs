import test from "node:test";
import assert from "node:assert/strict";
import "../plugin/command-queue.js";

const { createCommandQueue } = globalThis.LumiformCommandQueue;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("merges additive deltas into one command", async () => {
  const batches = [];
  const queue = createCommandQueue({
    execute: async (batch) => {
      batches.push(batch);
    },
    coalesceMs: 10,
  });

  queue.enqueue({ mergeKey: "brush-size", delta: -1 });
  queue.enqueue({ mergeKey: "brush-size", delta: -1 });
  queue.enqueue({ mergeKey: "brush-size", delta: 1 });

  await wait(40);

  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 1);
  assert.equal(batches[0][0].delta, -1);
});

test("keeps discrete commands in FIFO order", async () => {
  const order = [];
  const queue = createCommandQueue({
    execute: async (batch) => {
      for (const task of batch) order.push(task.name);
    },
  });

  queue.enqueue({ name: "tool-z" });
  queue.enqueue({ name: "tool-v" });
  queue.enqueue({ name: "undo" });

  await wait(20);

  assert.deepEqual(order, ["tool-z", "tool-v", "undo"]);
});

test("runs additive and discrete commands in enqueue order", async () => {
  const order = [];
  const queue = createCommandQueue({
    execute: async (batch) => {
      for (const task of batch) order.push(task.name);
    },
    coalesceMs: 30,
  });

  queue.enqueue({ name: "brush", mergeKey: "brush-size", delta: 1 });
  queue.enqueue({ name: "tool-z" });

  await wait(50);

  assert.deepEqual(order, ["brush", "tool-z"]);
});

test("queues new commands while a batch is running", async () => {
  const batches = [];
  let release;
  const firstRun = new Promise((resolve) => {
    release = resolve;
  });

  const queue = createCommandQueue({
    execute: async (batch) => {
      batches.push(batch.map((task) => task.name));
      if (batches.length === 1) await firstRun;
    },
  });

  queue.enqueue({ name: "first" });
  await wait(10);
  queue.enqueue({ name: "second" });

  release();
  await wait(20);

  assert.deepEqual(batches, [["first"], ["second"]]);
});

test("drops a rejected batch and continues with later work", async () => {
  const batches = [];
  const errors = [];
  let failNext = true;

  const queue = createCommandQueue({
    execute: async (batch) => {
      batches.push(batch.map((task) => task.name));
      if (failNext) {
        failNext = false;
        throw new Error("Photoshop is modal");
      }
    },
    onError: (error, batch) => errors.push({ error, batch }),
  });

  queue.enqueue({ name: "first" });
  await wait(10);
  queue.enqueue({ name: "second" });
  await wait(10);

  assert.deepEqual(batches, [["first"], ["second"]]);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].batch[0].name, "first");
});
