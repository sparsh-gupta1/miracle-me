const logService = require("../services/log.service");

// ========== ADMIN - SERVER LOGS ==========

/**
 * List available log files
 */
const listFiles = async (req, res, next) => {
    try {
        const files = await logService.listFiles();
        res.status(200).json({ success: true, data: files });
    } catch (error) {
        next(error);
    }
};

/**
 * Read entries from a log file, newest first, paging backwards with `cursor`
 */
const readEntries = async (req, res, next) => {
    try {
        const data = await logService.readEntries(req.params.file, req.validatedQuery);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

/**
 * Read entries written after byte offset `after` (live tail polling)
 */
const followEntries = async (req, res, next) => {
    try {
        const data = await logService.followEntries(req.params.file, req.validatedQuery);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

/**
 * Download a whole log file
 */
const downloadFile = async (req, res, next) => {
    try {
        const { file, stream } = await logService.createDownloadStream(req.params.file);
        res.attachment(file.name);
        res.type("text/plain");
        res.setHeader("Content-Length", file.size);
        stream.on("error", next);
        stream.pipe(res);
    } catch (error) {
        next(error);
    }
};

/**
 * Delete one (inactive) log file
 */
const deleteFile = async (req, res, next) => {
    try {
        const data = await logService.deleteFile(req.params.file, req.user.id);
        res.status(200).json({ success: true, message: "Log file deleted", data });
    } catch (error) {
        next(error);
    }
};

/**
 * Empty a log file (works on the active file too)
 */
const clearFile = async (req, res, next) => {
    try {
        const data = await logService.clearFile(req.params.file, req.user.id);
        res.status(200).json({ success: true, message: "Log file cleared", data });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete all inactive log files older than `olderThanDays`
 */
const deleteOlderThan = async (req, res, next) => {
    try {
        const { olderThanDays } = req.validatedQuery;
        const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
        const data = await logService.deleteOlderThan(cutoff, req.user.id);
        res.status(200).json({ success: true, message: `Deleted ${data.deleted.length} log files`, data });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    listFiles,
    readEntries,
    followEntries,
    downloadFile,
    deleteFile,
    clearFile,
    deleteOlderThan,
};
