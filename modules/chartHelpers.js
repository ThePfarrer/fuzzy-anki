/**
 * Chart generation helpers for C3.js visualizations
 */

/**
 * Creates a C3 time series chart
 * @param {string} bindto - CSS selector for chart container
 * @param {Array} data - Chart data in C3 row format
 * @param {Object} config - Chart configuration options
 * @returns {Object} C3 chart instance
 */
export function createTimeSeriesChart(bindto, data, config = {}) {
  const defaultConfig = {
    bindto: bindto,
    data: {
      x: config.xColumn || "date",
      rows: data,
      onmouseover: config.onmouseover,
      onmouseout: config.onmouseout,
    },
    axis: {
      y: { label: { text: config.yLabel || "" } },
      x: {
        type: "timeseries",
        label: { text: config.xLabel || "Date" },
        tick: config.xTick || {
          rotate: 15,
          count: 50,
          format: "%Y-%m-%d %I:%M",
        },
        height: 40,
      },
    },
    tooltip: config.tooltip || {},
    legend: {
      show: config.showLegend !== undefined ? config.showLegend : false,
    },
    zoom: config.zoom || { enabled: true, extent: [1, 2] },
    point: config.point || { focus: { expand: { enabled: false } } },
  };

  return c3.generate(defaultConfig);
}

/**
 * Creates a C3 histogram (bar chart)
 * @param {string} bindto - CSS selector for chart container
 * @param {Array} data - Chart data in C3 row format
 * @param {Object} config - Chart configuration options
 * @returns {Object} C3 chart instance
 */
export function createHistogram(bindto, data, config = {}) {
  const defaultConfig = {
    bindto: bindto,
    data: {
      x: config.xColumn || "x",
      rows: data,
      type: "bar",
    },
    bar: { width: { ratio: config.barWidthRatio || 0.95 } },
    axis: {
      y: { label: { text: config.yLabel || "" } },
      x: {
        label: { text: config.xLabel || "" },
        tick: config.xTick || {},
      },
    },
    tooltip: config.tooltip || {},
    legend: {
      show: config.showLegend !== undefined ? config.showLegend : false,
    },
  };

  return c3.generate(defaultConfig);
}

/**
 * Creates a C3 scatter plot
 * @param {string} bindto - CSS selector for chart container
 * @param {Array} data - Chart data in C3 row format
 * @param {Object} config - Chart configuration options
 * @returns {Object} C3 chart instance
 */
export function createScatterPlot(bindto, data, config = {}) {
  const defaultConfig = {
    bindto: bindto,
    data: {
      x: config.xColumn || "x",
      rows: data,
      type: "scatter",
    },
    axis: {
      x: {
        label: { text: config.xLabel || "" },
        tick: config.xTick || { fit: false },
      },
      y: { label: { text: config.yLabel || "" } },
    },
    legend: {
      show: config.showLegend !== undefined ? config.showLegend : false,
    },
    tooltip: config.tooltip || {},
    zoom:
      config.zoom ||
      (config.enableZoom ? { enabled: true, extent: [1, 2] } : undefined),
  };

  return c3.generate(defaultConfig);
}
