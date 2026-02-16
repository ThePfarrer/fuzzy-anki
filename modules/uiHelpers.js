/**
 * UI helper functions for D3.js DOM manipulation
 */

/**
 * Creates a button element in a D3 selection
 * @param {Object} d3Selection - D3 selection to append button to
 * @param {string} id - ID attribute for the list item
 * @param {string} text - Button text
 * @param {Function} onClick - Click handler
 * @returns {Object} D3 selection of the created list item
 */
export function createButton(d3Selection, id, text, onClick) {
  return d3Selection
    .append("li")
    .attr("id", id)
    .append("button")
    .text(text)
    .on("click", onClick);
}

/**
 * Creates a checkbox with label in a D3 selection
 * @param {Object} d3Selection - D3 selection to append to
 * @param {string} checkboxId - ID for the checkbox input
 * @param {string} labelText - Text for the label
 * @param {boolean} checked - Initial checked state
 * @returns {Object} D3 selection of the created label
 */
export function createCheckbox(
  d3Selection,
  checkboxId,
  labelText,
  checked = false,
) {
  const label = d3Selection.append("label").attr("for", checkboxId);

  label
    .append("input")
    .attr("type", "checkbox")
    .attr("checked", checked ? true : null)
    .attr("id", checkboxId);

  label.append("text").text(" " + labelText);

  return label;
}

/**
 * Creates a chart container div with heading and description
 * @param {Object} d3Selection - D3 selection to append to
 * @param {string} heading - Heading text
 * @param {string} description - Description text
 * @param {string} chartId - ID for the chart container div
 * @returns {Object} D3 selection of the chart div
 */
export function createChartContainer(
  d3Selection,
  heading,
  description,
  chartId,
) {
  const container = d3Selection.append("div");
  container.append("h4").text(heading);
  container.append("p").text(description);
  return container.append("div").attr("id", chartId);
}

/**
 * Safe file processing wrapper with error handling
 * @param {Function} processFunction - Function to process the file data
 * @param {ArrayBuffer} data - File data to process
 * @param {string} errorContext - Context description for error messages
 * @param {Function} errorHandler - Optional custom error handler (defaults to showError)
 */
export function safeFileProcess(
  processFunction,
  data,
  errorContext = "processing file",
  errorHandler = null,
) {
  try {
    processFunction(data);
  } catch (err) {
    const errorMsg = `Error ${errorContext}: ${err.message}`;
    if (errorHandler) {
      errorHandler(errorMsg, err);
    } else if (typeof showError === "function") {
      showError(errorMsg);
      console.error(err);
    } else {
      console.error(errorMsg, err);
      alert(errorMsg);
    }
  }
}

/**
 * Creates a safe FileReader onload handler with error handling
 * @param {Function} processFunction - Function to process the file data
 * @param {Function} showError - Error display function
 * @returns {Function} FileReader onload handler
 */
export function createSafeFileReaderHandler(processFunction, showError) {
  return function (e) {
    try {
      processFunction(e.target.result);
    } catch (err) {
      showError("Error processing file: " + err.message);
      console.error(err);
    }
  };
}
