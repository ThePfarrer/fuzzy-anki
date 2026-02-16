/**
 * CSV export functions for the Fuzzy-Anki application
 * Depends on: utils
 */

/**
 * Normalizes CSV input to an array
 * @param {Object|Array} parameter - Data to normalize
 * @returns {Array} Normalized array
 */
export function fixInput(parameter) {
  if (
    parameter &&
    parameter.length == undefined &&
    Object.keys(parameter).length > 0
  )
    parameter = [parameter]; // data is a json object instead of an array
  // of json objects

  return parameter;
}

/**
 * Extracts unique column names from data rows
 * @param {Array<Object>} data - Data rows
 * @returns {Array<string>} Column names
 */
export function getColumns(data) {
  const columns = [];

  for (let i = 0; i < data.length; i++) {
    Object.keys(data[i]).forEach(function (key) {
      if (columns.indexOf(key) === -1) {
        columns.push(key);
      }
    });
  }

  return columns;
}

/**
 * Converts a 2D array into CSV text
 * @param {Array<Array>} data - Rows of data
 * @returns {string} CSV string
 */
export function convertToCsv(data) {
  return JSON.stringify(data)
    .replace(/],\[/g, "\n")
    .replace(/]]/g, "")
    .replace(/\[\[/g, "")
    .replace(/\\"/g, '""');
}

/**
 * Converts objects to CSV text
 * @param {Array<Object>} data - Data rows
 * @param {Array<string>|string} headers - Headers list or comma string
 * @param {boolean} suppressHeader - Whether to omit header row
 * @returns {string} CSV string
 */
export function convert(data, headers, suppressHeader) {
  if (typeof suppressHeader !== "boolean") suppressHeader = false;

  data = fixInput(data);

  if (data == null || data.length == 0) {
    return "";
  }

  const columns = headers
    ? typeof headers == "string"
      ? [headers]
      : headers
    : getColumns(data);

  const rows = [];

  if (!suppressHeader) {
    rows.push(columns);
  }

  for (let i = 0; i < data.length; i++) {
    const row = [];
    columns.forEach(function (column) {
      const value =
        (typeof data[i][column] == "object" && data[i][column] && "[Object]") ||
        (typeof data[i][column] == "number" && String(data[i][column])) ||
        data[i][column] ||
        "";
      row.push(value);
    });
    rows.push(row);
  }

  return convertToCsv(rows);
}

/**
 * Creates a CSV download link from data
 * @param {Array<Object>} dataArray - Data rows
 * @param {Array<string>} fieldsArray - Column names
 * @param {string} linkText - Link label
 * @param {Object} d3SelectionToAppend - D3 selection to append link to
 * @returns {Object} D3 selection for the link
 */
export function arrToCSV(
  dataArray,
  fieldsArray,
  linkText,
  d3SelectionToAppend,
) {
  const csv = convert(dataArray, fieldsArray);
  const blob = new Blob([csv], { type: "data:text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  return d3SelectionToAppend.append("a").attr("href", url).text(linkText);
}

/**
 * Generates CSV export link for review data
 * This function should be called with the global revlogTable variable in scope
 * Expected format: generateReviewsCSV(revlogTable, d3)
 * @param {Array<Object>} revlogTable - Review log data
 * @param {Object} d3 - D3 library instance
 * @returns {void} Appends CSV download link to DOM
 */
export function generateReviewsCSV(revlogTable, d3) {
  if (!revlogTable || revlogTable.length === 0) {
    console.warn("No review data available for CSV export");
    return;
  }

  const d3Selection = arrToCSV(
    revlogTable,
    "dateString,ease,interval,lastInterval,timeToAnswer,noteSortKeyFact,deckName,modelName,lapses,\
reps,cardId,noteFactsJSON".split(","),
    "Download CSV",
    d3.select("#export-request").append("li").attr("id", "export-completed"),
  );
  d3Selection.classed("csv-download", true);
}
