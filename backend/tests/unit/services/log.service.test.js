const fs = require("fs");
const path = require("path");
const logService = require("../../../src/services/log.service");

const FILE_NAME = `zz-log-service-test-${process.pid}.log`;
const FILE_PATH = path.join(logService.LOG_DIRECTORY, FILE_NAME);

const LEVELS = ["INFO", "ERROR", "WARN"];

// 3000 entries (~200KB, several read chunks); every 7th has a multi-line message.
const buildEntries = () =>
    Array.from({ length: 3000 }, (_, i) => {
        const level = LEVELS[i % LEVELS.length];
        const extra = i % 7 === 0 ? `\n  detail line A ${i}\n  detail line B ${i}` : "";
        return { level: level.toLowerCase(), text: `2026-10-09 10:00:00 [${level}]: message ${i} ✓${extra}` };
    });

describe("log.service", () => {
    let entries;

    beforeAll(() => {
        fs.mkdirSync(logService.LOG_DIRECTORY, { recursive: true });
        entries = buildEntries();
        fs.writeFileSync(FILE_PATH, `orphan line before first header\n${entries.map((e) => e.text).join("\n")}\n`);
    });

    afterAll(() => {
        fs.rmSync(FILE_PATH, { force: true });
    });

    it("lists the file", async () => {
        const files = await logService.listFiles();
        expect(files).toEqual(expect.arrayContaining([expect.objectContaining({ name: FILE_NAME })]));
    });

    it("rejects files outside the log directory", async () => {
        await expect(logService.readEntries("../.env")).rejects.toMatchObject({ name: "NotFoundError" });
        await expect(logService.readEntries("..\package.json")).rejects.toMatchObject({ name: "NotFoundError" });
    });

    it("returns the newest entries first", async () => {
        const { entries: page, nextCursor } = await logService.readEntries(FILE_NAME, { limit: 3 });
        expect(page.map((e) => e.message)).toEqual(["message 2999 ✓", "message 2998 ✓", "message 2997 ✓"]);
        expect(page[0]).toMatchObject({ timestamp: "2026-10-09 10:00:00", level: "warn" });
        expect(nextCursor).toBeGreaterThan(0);
    });

    it("pages through the whole file without losing or splitting entries", async () => {
        const seen = [];
        let cursor;
        do {
            const result = await logService.readEntries(FILE_NAME, { limit: 250, cursor });
            seen.push(...result.entries);
            cursor = result.nextCursor === null ? undefined : result.nextCursor;
            if (result.nextCursor === null) break;
        } while (true);

        expect(seen).toHaveLength(entries.length + 1);
        expect(seen[seen.length - 1]).toMatchObject({ level: null, message: "orphan line before first header" });
        seen.slice(0, -1).reverse().forEach((entry, i) => {
            const extra = i % 7 === 0 ? `\n  detail line A ${i}\n  detail line B ${i}` : "";
            expect(entry.message).toBe(`message ${i} ✓${extra}`);
        });
    });

    it("filters by level and search", async () => {
        const { entries: errors } = await logService.readEntries(FILE_NAME, { limit: 5, level: "error" });
        expect(errors.every((e) => e.level === "error")).toBe(true);
        expect(errors).toHaveLength(5);

        // Search is case-insensitive and also matches continuation lines.
        const { entries: found } = await logService.readEntries(FILE_NAME, { search: "DETAIL LINE B 2996" });
        expect(found.map((e) => e.message)).toEqual(["message 2996 ✓\n  detail line A 2996\n  detail line B 2996"]);
    });

    it("follows entries appended after a cursor", async () => {
        const { endCursor } = await logService.readEntries(FILE_NAME, { limit: 1 });
        fs.appendFileSync(FILE_PATH, "2026-10-09 11:00:00 [ERROR]: new eyJhbGciOi.eyJzdWIi.c2lnbmF0dXJl\n  stack\n2026-10-09 11:00:01 [INFO]: partial");

        const result = await logService.followEntries(FILE_NAME, { after: endCursor });
        // The second entry has no trailing newline yet, so the whole line isn't confirmed complete.
        expect(result.entries).toEqual([
            expect.objectContaining({ level: "error", message: "new [REDACTED_JWT]\n  stack" }),
        ]);

        fs.appendFileSync(FILE_PATH, "\n");
        const next = await logService.followEntries(FILE_NAME, { after: result.endCursor });
        expect(next.entries.map((e) => e.message)).toEqual(["partial"]);
    });

    it("resets when the file shrank", async () => {
        const result = await logService.followEntries(FILE_NAME, { after: 10 ** 9 });
        expect(result.reset).toBe(true);
    });

    describe("cleanup", () => {
        const TYPE = `zztest${process.pid}`;
        const OTHER = `zzother${process.pid}`;
        const names = [`${TYPE}-2020-01-01.log`, `${TYPE}-2020-01-02.log`, `${TYPE}-2020-01-03.log`, `${OTHER}-2020-01-01.log`];
        const filePath = (name) => path.join(logService.LOG_DIRECTORY, name);
        const exists = (name) => fs.existsSync(filePath(name));

        beforeEach(() => {
            names.forEach((name) => fs.writeFileSync(filePath(name), "2020-01-01 00:00:00 [INFO]: hello\n"));
        });

        afterAll(() => {
            names.forEach((name) => fs.rmSync(filePath(name), { force: true }));
        });

        it("marks the newest dated file of each type as active", async () => {
            const files = (await logService.listFiles()).filter((f) => names.includes(f.name));
            const byName = Object.fromEntries(files.map((f) => [f.name, f]));
            expect(byName[names[2]]).toMatchObject({ type: TYPE, date: "2020-01-03", active: true });
            expect(byName[names[0]]).toMatchObject({ type: TYPE, date: "2020-01-01", active: false });
            expect(byName[names[3]]).toMatchObject({ type: OTHER, active: true });
            // Within a type, newest first.
            expect(files.filter((f) => f.type === TYPE).map((f) => f.date)).toEqual(["2020-01-03", "2020-01-02", "2020-01-01"]);

            const legacy = (await logService.listFiles()).find((f) => f.name === FILE_NAME);
            expect(legacy).toMatchObject({ date: null, active: false });
        });

        it("refuses to delete the active file", async () => {
            await expect(logService.deleteFile(names[2], "admin")).rejects.toMatchObject({ name: "ConflictError" });
            expect(exists(names[2])).toBe(true);
        });

        it("deletes an inactive file", async () => {
            const result = await logService.deleteFile(names[0], "admin");
            expect(result.name).toBe(names[0]);
            expect(exists(names[0])).toBe(false);
        });

        it("clears a file, including the active one", async () => {
            const result = await logService.clearFile(names[2], "admin");
            expect(result.freedBytes).toBeGreaterThan(0);
            expect(fs.statSync(filePath(names[2])).size).toBe(0);
        });

        it("bulk deletes only inactive files older than the cutoff", async () => {
            const result = await logService.deleteOlderThan(new Date("2020-01-03T00:00:00Z"), "admin");
            expect(result.deleted.sort()).toEqual([names[0], names[1]].sort());
            expect(exists(names[2])).toBe(true); // active
            expect(exists(names[3])).toBe(true); // active for its own type
            expect(exists(FILE_NAME)).toBe(true); // legacy file modified today
        });
    });
});
