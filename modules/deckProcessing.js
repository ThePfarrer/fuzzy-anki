/**
 * Deck processing and note organization for the Fuzzy-Anki application
 */

import { ANK_SEPARATOR } from "./constants.js";
import { arrayNamesToObj } from "./utils.js";

// Global state
let deckNotes;

/**
 * Builds a deck tree structure from Anki's decks JSON object
 * @param {Object} decks - Anki's decks JSON object
 * @returns {Object} Tree structure with deck hierarchy
 */
export function buildDeckTree(decks) {
  const tree = {};

  Object.keys(decks).forEach(function (deckId) {
    const deck = decks[deckId];
    if (deck.name) {
      tree[deckId] = {
        name: deck.name,
        id: deckId,
        parent: deck.mid ? null : deck.parent || null,
        children: {},
        notes: [],
      };
    }
  });

  return tree;
}

/**
 * Gets the full path of a deck from the decks JSON
 * @param {number} deckId - The deck ID to get the path for
 * @param {Object} decks - Anki's decks JSON object
 * @returns {Array<string>} Array of deck names from root to this deck
 */
export function getDeckPath(deckId, decks) {
  const deck = decks[deckId];

  if (!deck || !deck.name) {
    return ["Default"];
  }

  // Anki stores deck names with "::" to denote hierarchy
  // e.g., "Russian::Verbs::PastTense"
  const path = deck.name.split("::");

  return path.length > 0 ? path : ["Default"];
}

/**
 * Organizes notes by their deck hierarchy
 * @param {Object} decks - Anki's decks JSON object
 * @param {Array} notesData - Array of [mid, flds, did] tuples from database
 * @param {Object} models - Anki's models JSON object
 * @returns {Object} Notes organized by deck path
 */
export function organizeNotesByDeck(decks, notesData, models) {
  const deckHierarchy = {};

  notesData.forEach(function (noteRow) {
    const modelId = noteRow[0];
    const fields = noteRow[1];
    const deckId = noteRow[2] || 1; // Default to deck ID 1 if not found

    const deckPath = getDeckPath(deckId, decks);
    const pathKey = deckPath.join(" > ");

    if (!deckHierarchy[pathKey]) {
      deckHierarchy[pathKey] = {
        path: deckPath,
        deckId: deckId,
        notes: [],
      };
    }

    if (models[modelId]) {
      const fieldNames = models[modelId].fields || [];
      const fieldArray = fields.split(ANK_SEPARATOR);
      const noteObject = arrayNamesToObj(fieldNames, fieldArray);

      deckHierarchy[pathKey].notes.push({
        modelId: modelId,
        modelName: models[modelId].name,
        fieldNames: fieldNames,
        data: noteObject,
      });
    }
  });

  return deckHierarchy;
}

/**
 * Converts SQLite binary data to organized deck structure
 * @param {Uint8Array} uInt8ArraySQLdb - SQLite database binary data
 * @param {Object} SQL - SQL.Database instance
 * @returns {Object} Organized deck data { decks, models, deckHierarchy, deckNotes }
 */
export function processDeckData(uInt8ArraySQLdb, SQL) {
  const db = new SQL.Database(uInt8ArraySQLdb);

  // Decks table (for deck names)
  const decksResult = db.exec("SELECT decks FROM col");
  // Using JSON.parse for security (prevents code injection)
  const decks = JSON.parse(decksResult[0].values[0][0]);

  // Models table (for field names)
  const colResult = db.exec("SELECT models FROM col");
  // Using JSON.parse for security (prevents code injection)
  const models = JSON.parse(colResult[0].values[0][0]);

  // Notes table with deck information - JOIN notes with cards to get deck IDs
  let notesWithDeckData = db.exec(
    "SELECT n.mid, n.flds, c.did FROM notes n LEFT JOIN cards c ON n.id = c.nid",
  );

  Object.keys(models).forEach(function (key) {
    models[key].fields = models[key].flds.map(function (field) {
      return field.name;
    });
  });

  // Store the raw data
  deckNotes = notesWithDeckData[0].values;

  const deckHierarchy = organizeNotesByDeck(decks, deckNotes, models);

  return {
    decks: decks,
    models: models,
    deckHierarchy: deckHierarchy,
    deckNotes: deckNotes,
  };
}

/**
 * Gets the current deck notes
 * @returns {Array} Current deck notes data
 */
export function getDeckNotes() {
  return deckNotes;
}

/**
 * Clears deck data from memory
 */
export function cleanupDeckData() {
  deckNotes = null;
}
