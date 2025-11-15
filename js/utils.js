/**
 * PROTOGAMES UTILITIES
 * --------------------------------------------------------------
 * Small helper functions shared across modules. Keeping them here
 * prevents duplication and keeps other files focused on their core
 * responsibilities.
 */
const Utils = (() => {
    /**
     * Removes characters that are invalid in file names.
     *
     * @param {string} [name=Config.DEFAULT_PROJECT_NAME] - Raw user input.
     * @returns {string} Sanitized string safe for use as a file name.
     */
    function sanitizeFileName(name = Config.DEFAULT_PROJECT_NAME) {
        return name.replace(/[<>:"/\\|?*]+/g, '').trim() || Config.DEFAULT_PROJECT_NAME;
    }

    /**
     * Clones a polygon array so mutations will not affect the original.
     *
     * @param {Array<Object>} polygons - Source polygon list.
     * @returns {Array<Object>} Deep copy of the polygons.
     */
    function clonePolygons(polygons = []) {
        return polygons.map((polygon) => JSON.parse(JSON.stringify(polygon)));
    }

    /**
     * Downloads a Blob by simulating an anchor click.
     *
     * @param {Blob} blob - Blob containing file data.
     * @param {string} filename - File name used during download.
     */
    function triggerBlobDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
    }

    /**
     * Downloads a data URL by creating a temporary anchor.
     *
     * @param {string} dataUrl - Encoded string representing file data.
     * @param {string} filename - Download file name.
     */
    function triggerDataUrlDownload(dataUrl, filename) {
        const anchor = document.createElement('a');
        anchor.href = dataUrl;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
    }

    /**
     * Converts a timestamp into a localized human-readable string.
     *
     * @param {number} timestamp - Milliseconds since epoch.
     * @returns {string} Localized date/time or empty string.
     */
    function formatTimestamp(timestamp) {
        if (!timestamp) return '';
        return new Date(timestamp).toLocaleString();
    }

    return {
        sanitizeFileName,
        clonePolygons,
        triggerBlobDownload,
        triggerDataUrlDownload,
        formatTimestamp
    };
})();
