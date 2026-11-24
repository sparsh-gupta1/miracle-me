const { forEachLimit } = require("../../../src/utils/concurrency");

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe("forEachLimit", () => {
    it("processes every item and never runs more than the limit at once", async () => {
        let active = 0;
        let maxActive = 0;
        const seen = [];

        await forEachLimit([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
            active += 1;
            maxActive = Math.max(maxActive, active);
            await tick();
            seen.push(item);
            active -= 1;
        });

        expect(maxActive).toBe(3);
        expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it("resolves for an empty list without calling fn", async () => {
        const fn = jest.fn();
        await forEachLimit([], 5, fn);
        expect(fn).not.toHaveBeenCalled();
    });

    it("works when the limit is larger than the list", async () => {
        const fn = jest.fn().mockResolvedValue();
        await forEachLimit(["a", "b"], 10, fn);
        expect(fn).toHaveBeenCalledTimes(2);
    });
});
