const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const logger = require("../utils/logger");

// Same directory the winston file transports in utils/logger.js write to.
const LOG_DIRECTORY = path.join(__dirname, "..", "..", "logs");
const LOG_FILE_PATTERN = /^[\w.-]+\.log$/;

// Every entry written by utils/logger.js starts with "YYYY-MM-DD HH:mm:ss [LEVEL]: ".
// Lines that don't match (multi-line messages, dumped objects) belong to the previous entry.
const ENTRY_HEADER = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \[([A-Z]+)\]: ?/;

const CHUNK_SIZE = 64 * 1024;
// Upper bound on bytes scanned per request, so a rare filter on a huge file can't stall the server.
const MAX_SCAN_BYTES = 8 * 1024 * 1024;
const MAX_FOLLOW_BYTES = 1024 * 1024;
const MAX_ENTRY_LENGTH = 20000;

const JWT_PATTERN = /eyJ[\w-]+\.[\w-]+\.[\w-]+/g;

const notFound = (message) => {
    const err = new Error(message);
    err.name = "NotFoundError";
    return err;
};

const redact = (text) => text.replace(JWT_PATTERN, "[REDACTED_JWT]");

const conflict = (message) => {
    const err = new Error(message);
    err.name = "ConflictError";
    return err;
};

// Daily files written by utils/logger.js are "<type>-YYYY-MM-DD.log". Older undated
// files (combined.log, error.log) are reported with date: null.
const DATED_FILE = /^(.+)-(\d{4}-\d{2}-\d{2})\.log$/;

const parseName = (name) => {
    const match = DATED_FILE.exec(name);
    return match
        ? { type: match[1], date: match[2] }
        : { type: name.replace(/\.log$/, ""), date: null };
};

/**
 * List the .log files in the log directory. `active` marks the newest dated file
 * of each type, which is the one the logger is currently writing to.
 */
const listFiles = async () => {
    let names;
    try {
        names = await fsp.readdir(LOG_DIRECTORY);
    } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
    }

    const files = (await Promise.all(
        names
            .filter((name) => LOG_FILE_PATTERN.test(name))
            .map(async (name) => {
                const stat = await fsp.stat(path.join(LOG_DIRECTORY, name));
                return stat.isFile() ? { name, ...parseName(name), size: stat.size, modifiedAt: stat.mtime } : null;
            })
    )).filter(Boolean);

    const newestDateByType = {};
    files.forEach((f) => {
        if (f.date && (!newestDateByType[f.type] || f.date > newestDateByType[f.type])) {
            newestDateByType[f.type] = f.date;
        }
    });
    files.forEach((f) => {
        f.active = f.date !== null && f.date === newestDateByType[f.type];
    });

    return files.sort((a, b) =>
        a.type.localeCompare(b.type) ||
        (b.date || "").localeCompare(a.date || "") ||
        a.name.localeCompare(b.name)
    );
};

/**
 * Resolve a requested file name to a path, only allowing files that actually
 * exist in the log directory (blocks path traversal like "../.env").
 */
const resolveFile = async (name) => {
    const files = await listFiles();
    const file = files.find((f) => f.name === name);
    if (!file) throw notFound(`Log file "${name}" not found`);
    return { ...file, filePath: path.join(LOG_DIRECTORY, file.name) };
};

const toEntry = (header, continuation, offset) => {
    const match = ENTRY_HEADER.exec(header);
    const first = match ? header.slice(match[0].length) : header;
    let message = (first ? [first, ...continuation] : continuation).join("\n");
    const truncated = message.length > MAX_ENTRY_LENGTH;
    if (truncated) message = `${message.slice(0, MAX_ENTRY_LENGTH)}…`;
    return {
        offset,
        timestamp: match ? match[1] : null,
        level: match ? match[2].toLowerCase() : null,
        message: redact(message),
        truncated,
    };
};

const buildMatcher = ({ level, search }) => {
    const needle = search ? search.toLowerCase() : null;
    return (entry) =>
        (!level || entry.level === level) &&
        (!needle || entry.message.toLowerCase().includes(needle));
};

/**
 * Read entries backwards from `cursor` (a byte offset, default end of file).
 * Returns newest-first entries and the cursor to pass for the next (older) page.
 */
const readEntries = async (name, { limit = 200, cursor, level, search } = {}) => {
    const file = await resolveFile(name);
    const matches = buildMatcher({ level, search });
    const end = cursor === undefined ? file.size : Math.min(cursor, file.size);

    const entries = [];
    const handle = await fsp.open(file.filePath, "r");
    let position = end;
    // Bytes read but not yet split into complete lines (always starts at `position`).
    let leftover = Buffer.alloc(0);
    // Continuation lines seen (newest first) whose header line is further back in the file.
    let pendingLines = [];
    // Offset of the oldest fully processed entry: where the next page should resume.
    let nextCursor = end;
    let scanned = 0;

    try {
        while (entries.length < limit && scanned < MAX_SCAN_BYTES) {
            if (position === 0 && leftover.length === 0) break;

            if (position > 0) {
                const size = Math.min(CHUNK_SIZE, position);
                const chunk = Buffer.alloc(size);
                await handle.read(chunk, 0, size, position - size);
                position -= size;
                scanned += size;
                leftover = Buffer.concat([chunk, leftover]);
            }

            // Split complete lines off the end of the buffer. The first line is only
            // complete once we've reached the start of the file.
            let lineEnd = leftover.length;
            for (let i = leftover.length - 1; i >= -1; i--) {
                const atStart = i === -1;
                if (!atStart && leftover[i] !== 0x0a) continue;
                if (atStart && position > 0) break;

                const lineStart = i + 1;
                const line = leftover.toString("utf8", lineStart, lineEnd).replace(/\r$/, "");
                const offset = position + lineStart;
                lineEnd = i;

                if (ENTRY_HEADER.test(line)) {
                    const entry = toEntry(line, pendingLines.reverse(), offset);
                    pendingLines = [];
                    nextCursor = offset;
                    if (matches(entry)) entries.push(entry);
                    if (entries.length >= limit) break;
                } else if (line !== "" || pendingLines.length) {
                    pendingLines.push(line);
                }
            }
            leftover = leftover.subarray(0, Math.max(lineEnd, 0));
            if (entries.length >= limit) break;
            if (position === 0) {
                // Lines before the first header in the file have no entry of their own.
                if (pendingLines.length) {
                    const entry = toEntry("", pendingLines.reverse(), 0);
                    if (matches(entry)) entries.push(entry);
                }
                nextCursor = 0;
                break;
            }
        }
    } finally {
        await handle.close();
    }

    // A single entry larger than the scan budget: skip past it rather than returning the same cursor forever.
    if (nextCursor === end && position > 0) nextCursor = position;

    return {
        file: { name: file.name, size: file.size, modifiedAt: file.modifiedAt },
        entries,
        // null once the start of the file has been reached.
        nextCursor: nextCursor > 0 ? nextCursor : null,
        // Pass as `after` to /follow to receive entries written after this response.
        endCursor: file.size,
        scanLimitReached: scanned >= MAX_SCAN_BYTES && nextCursor > 0,
    };
};

/**
 * Read entries written after byte offset `after` (oldest first), for live tailing.
 */
const followEntries = async (name, { after, level, search } = {}) => {
    const file = await resolveFile(name);
    const matches = buildMatcher({ level, search });

    // The file was truncated or replaced since the client's last poll.
    const reset = after > file.size;
    const start = reset ? 0 : after;
    const length = Math.min(file.size - start, MAX_FOLLOW_BYTES);

    const entries = [];
    let endCursor = start;

    if (length > 0) {
        const buffer = Buffer.alloc(length);
        const handle = await fsp.open(file.filePath, "r");
        try {
            await handle.read(buffer, 0, length, start);
        } finally {
            await handle.close();
        }

        // Only consume complete lines; a partly written last line is picked up next poll.
        const lastNewline = buffer.lastIndexOf(0x0a);
        if (lastNewline !== -1) {
            let current = null;
            let lineStart = 0;
            const flush = () => {
                if (!current) return;
                const entry = toEntry(current.header, current.lines, current.offset);
                if (matches(entry)) entries.push(entry);
            };

            while (lineStart <= lastNewline) {
                const newline = buffer.indexOf(0x0a, lineStart);
                const line = buffer.toString("utf8", lineStart, newline).replace(/\r$/, "");
                if (ENTRY_HEADER.test(line)) {
                    flush();
                    current = { header: line, lines: [], offset: start + lineStart };
                } else if (current) {
                    current.lines.push(line);
                } else if (line !== "") {
                    current = { header: "", lines: [line], offset: start + lineStart };
                }
                lineStart = newline + 1;
            }
            flush();
            endCursor = start + lastNewline + 1;
        }
    }

    return {
        file: { name: file.name, size: file.size, modifiedAt: file.modifiedAt },
        entries,
        endCursor,
        reset,
        hasMore: endCursor < file.size && length === MAX_FOLLOW_BYTES,
    };
};

/**
 * Stream a whole log file (for download).
 */
const createDownloadStream = async (name) => {
    const file = await resolveFile(name);
    return { file, stream: fs.createReadStream(file.filePath) };
};

/**
 * Delete one log file. The file currently being written to can only be cleared,
 * since the logger keeps it open.
 */
const deleteFile = async (name, adminId) => {
    const file = await resolveFile(name);
    if (file.active) {
        throw conflict(`"${file.name}" is the log file currently being written. Clear it instead of deleting it.`);
    }
    await fsp.unlink(file.filePath);
    logger.warn(`Admin ${adminId} deleted log file ${file.name} (${file.size} bytes)`);
    return { name: file.name, size: file.size };
};

/**
 * Empty a log file. Safe on the active file because the logger appends.
 */
const clearFile = async (name, adminId) => {
    const file = await resolveFile(name);
    await fsp.truncate(file.filePath, 0);
    logger.warn(`Admin ${adminId} cleared log file ${file.name} (${file.size} bytes)`);
    return { name: file.name, freedBytes: file.size };
};

/**
 * Delete every inactive log file older than `cutoff`. Dated files use the date in
 * their name; undated files use their last-modified time.
 */
const deleteOlderThan = async (cutoff, adminId) => {
    const cutoffDate = cutoff.toISOString().slice(0, 10);
    const files = await listFiles();
    const deleted = [];
    let freedBytes = 0;

    for (const file of files) {
        if (file.active) continue;
        const isOld = file.date ? file.date < cutoffDate : file.modifiedAt < cutoff;
        if (!isOld) continue;
        try {
            await fsp.unlink(path.join(LOG_DIRECTORY, file.name));
        } catch (error) {
            if (error.code === "ENOENT") continue;
            throw error;
        }
        deleted.push(file.name);
        freedBytes += file.size;
    }

    if (deleted.length) {
        logger.warn(`Admin ${adminId} deleted ${deleted.length} log files older than ${cutoffDate} (${freedBytes} bytes): ${deleted.join(", ")}`);
    }
    return { cutoff: cutoffDate, deleted, freedBytes };
};

module.exports = {
    LOG_DIRECTORY,
    listFiles,
    readEntries,
    followEntries,
    createDownloadStream,
    deleteFile,
    clearFile,
    deleteOlderThan,
};
