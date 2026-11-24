/**
 * Run fn over items with at most `limit` calls in flight. fn's errors are the caller's to
 * handle: a rejection stops that worker and rejects the whole call.
 * @param {Array} items
 * @param {number} limit
 * @param {(item: any) => Promise<void>} fn
 */
async function forEachLimit(items, limit, fn) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      await fn(items[next++]);
    }
  };
  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workers }, worker));
}

module.exports = { forEachLimit };
