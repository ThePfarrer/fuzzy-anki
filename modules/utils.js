/**
 * Utility functions for the Fuzzy-Anki application
 */

/**
 * Converts two parallel arrays into an object mapping
 * @param {Array<string>} fields - Keys for the object
 * @param {Array<*>} values - Values for the object
 * @returns {Object} Mapping of fields to values
 */
export function arrayNamesToObj(fields, values) {
  const obj = {};
  for (let i = 0; i < values.length; i++) {
    obj[fields[i]] = values[i];
  }
  return obj;
}

/**
 * Updates nested object structure for tracking relationships
 * Note: This function changes obj's parameters ("call by sharing") so the return value
 * is purely a nicety: the object WILL be changed in the caller's scope.
 * @param {Object} obj - The outer object to modify
 * @param {string} outerKey - The outer key to access/create
 * @param {string} innerKey - The inner key to access/create
 * @param {*} innerVal - The value to set at obj[outerKey][innerKey]
 * @returns {Object} - The modified obj
 */
export function updateNestedObj(obj, outerKey, innerKey, innerVal) {
  if (!(outerKey in obj)) {
    obj[outerKey] = {};
    obj[outerKey][innerKey] = innerVal;
  } else {
    if (!(innerKey in obj[outerKey])) {
      obj[outerKey][innerKey] = innerVal;
    }
  }
  return obj;
}

/**
 * Sums numeric array values
 * @param {Array<number>} arr - Input values
 * @returns {number} Sum
 */
export const summer = function (arr) {
  return arr.reduce(function (memo, num) {
    return memo + num;
  }, 0);
};

/**
 * Computes mean value for numeric array
 * @param {Array<number>} arr - Input values
 * @returns {number} Mean
 */
export const mean = function (arr) {
  return summer(arr) / arr.length;
};
