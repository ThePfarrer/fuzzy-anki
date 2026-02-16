/**
 * Error handling and file validation for the Fuzzy-Anki application
 */

/**
 * Error display system - displays inline error notifications
 * @param {string} message - Error message to display
 */
export function showError(message) {
  let errorContainer = document.getElementById("error-container");
  if (!errorContainer) {
    errorContainer = document.createElement("div");
    errorContainer.id = "error-container";
    errorContainer.style.cssText =
      "position: fixed; top: 20px; right: 20px; max-width: 400px; z-index: 10000; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; padding: 12px; color: #721c24; font-family: sans-serif; box-shadow: 0 2px 8px rgba(0,0,0,0.15);";
    document.body.insertBefore(errorContainer, document.body.firstChild);
  }

  const errorMsg = document.createElement("div");
  errorMsg.style.cssText = "margin-bottom: 8px; font-size: 14px;";
  errorMsg.textContent = message;

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "×";
  closeBtn.style.cssText =
    "float: right; background: none; border: none; color: #721c24; font-size: 20px; cursor: pointer; padding: 0; margin: -8px 0 0 0;";
  closeBtn.onclick = function () {
    errorMsg.remove();
  };

  errorMsg.appendChild(closeBtn);
  errorContainer.appendChild(errorMsg);

  // Auto-remove after 8 seconds
  setTimeout(function () {
    errorMsg.remove();
  }, 8000);

  console.error(message);
}

/**
 * Validates ZIP file header magic number
 * ZIP files start with magic number 0x04034b50 (little-endian: 50 4b 03 04)
 * @param {ArrayBuffer} arrayBuffer - File binary data
 * @returns {boolean} True if valid ZIP header found
 */
export function validateZipHeader(arrayBuffer) {
  if (arrayBuffer.byteLength < 4) return false;
  const view = new Uint8Array(arrayBuffer);
  return (
    view[0] === 0x50 && view[1] === 0x4b && view[2] === 0x03 && view[3] === 0x04
  );
}

/**
 * Validates SQLite file header
 * SQLite files start with "SQLite format 3"
 * @param {ArrayBuffer} arrayBuffer - File binary data
 * @returns {boolean} True if valid SQLite header found
 */
export function validateSqliteHeader(arrayBuffer) {
  if (arrayBuffer.byteLength < 16) return false;
  const view = new Uint8Array(arrayBuffer);
  const header = String.fromCharCode.apply(null, view.slice(0, 13));
  return header === "SQLite format";
}

/**
 * Validates a URL using the browser URL parser
 * @param {string} url - URL to validate
 * @returns {boolean} True if URL is valid http/https
 */
export function validateURL(url) {
  try {
    const urlObj = new URL(url);
    // Only allow http and https protocols
    if (urlObj.protocol !== "http:" && urlObj.protocol !== "https:") {
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Validates file extension and prompts user if incorrect
 * @param {File} file - File object to validate
 * @param {Array<string>} expectedExtensions - Array of valid extensions (e.g., ['.apkg'])
 * @param {string} fileType - Human-readable file type description
 * @returns {boolean} True if validation passes or user confirms
 */
export function validateFileExtension(file, expectedExtensions, fileType) {
  const fileName = file.name.toLowerCase();
  const hasValidExtension = expectedExtensions.some((ext) =>
    fileName.endsWith(ext),
  );

  if (!hasValidExtension) {
    const extensionList = expectedExtensions.join(" or ");
    return confirm(
      `File does not have ${extensionList} extension. Continue anyway?`,
    );
  }

  return true;
}

/**
 * Validates file size
 * @param {File} file - File object to validate
 * @param {number} maxSizeMB - Maximum file size in megabytes
 * @returns {boolean} True if file size is acceptable
 */
export function validateFileSize(file, maxSizeMB = 100) {
  const maxSize = maxSizeMB * 1024 * 1024;
  if (file.size > maxSize) {
    showError(`File is too large. Maximum size is ${maxSizeMB}MB.`);
    return false;
  }
  return true;
}
