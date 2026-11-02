/*
 * Lumiform shortcut command queue (host-side, no UXP dependency).
 *
 * The queue serializes Photoshop actions so a burst of shortcut keys becomes
 * one modal batch instead of one modal scope per key. Additive commands (brush
 * size) merge into a single delta; discrete commands keep FIFO order.
 *
 * It is loaded as a classic script by plugin/index.html and also by the Node
 * test harness, hence the globalThis attachment.
 */
(function (global) {
  "use strict";

  /**
   * @param {object} options
   * @param {(batch: object[]) => Promise<void>} options.execute Runs one batch.
   * @param {number} [options.coalesceMs] Quiet window for additive commands.
   * @param {(error: unknown, batch: object[]) => void} [options.onError]
   */
  function createCommandQueue(options) {
    const execute = options.execute;
    const coalesceMs = typeof options.coalesceMs === "number" ? options.coalesceMs : 50;
    const onError = options.onError;

    let pending = [];
    let timer = null;
    let timerDelay = null;
    let running = false;

    function schedule(delay) {
      if (timer !== null) {
        if (delay >= timerDelay) return;
        global.clearTimeout(timer);
        timer = null;
      }
      timerDelay = delay;
      timer = global.setTimeout(() => {
        timer = null;
        timerDelay = null;
        void flush();
      }, delay);
    }

    function enqueue(task) {
      if (task.mergeKey) {
        const existing = pending.find((candidate) => candidate.mergeKey === task.mergeKey);
        if (existing) {
          existing.delta += task.delta;
          schedule(coalesceMs);
          return;
        }
      }

      pending.push(task);
      // Discrete actions should not wait behind the additive window.
      schedule(task.mergeKey ? coalesceMs : 0);
    }

    async function flush() {
      if (running || pending.length === 0) return;

      running = true;
      const batch = pending;
      pending = [];

      try {
        await execute(batch);
      } catch (error) {
        if (onError) onError(error, batch);
      } finally {
        running = false;
        if (pending.length > 0) schedule(0);
      }
    }

    function size() {
      return pending.length;
    }

    function isRunning() {
      return running;
    }

    return { enqueue, flush, size, isRunning };
  }

  global.LumiformCommandQueue = { createCommandQueue };
})(typeof globalThis !== "undefined" ? globalThis : this);
