// Import modules
import {
  createHistogram,
  createScatterPlot,
  createTimeSeriesChart,
} from "./modules/chartHelpers.js";
import { ANK_SEPARATOR, GLOBAL_CORS_PROXY } from "./modules/constants.js";
import {
  arrToCSV,
  generateReviewsCSV as generateReviewsCSVModule,
} from "./modules/csvExport.js";
import { processDeckData } from "./modules/deckProcessing.js";
import {
  showError,
  validateFileExtension,
  validateFileSize,
  validateSqliteHeader,
  validateURL,
  validateZipHeader,
} from "./modules/errorHandling.js";
import {
  createButton,
  createChartContainer,
  createCheckbox,
  createSafeFileReaderHandler,
} from "./modules/uiHelpers.js";
import { arrayNamesToObj, updateNestedObj } from "./modules/utils.js";

// For backward compatibility within this file
const ankiSeparator = ANK_SEPARATOR;

// Memory cleanup functions
function cleanupReviewData() {
  // Clear review data to free memory
  revlogTable = null;
  sqliteGlobal = null;
  decksReviewed = {};
  modelsReviewed = {};
  allDecks = null;
  allModels = null;
}

// deckNotes contains the contents of any APKG decks uploaded. It is an array of
// objects with the following properties:
// - "name", a string
// - "fieldNames", an array of strings
// - "notes", an array of objects, each with properties corresponding to the
// entries of fieldNames.
let deckNotes;
let SQL;

// Huge props to http://stackoverflow.com/a/9507713/500207
/**
 * Creates an HTML table from data and appends it to a specified container
 * @param {Array<Object>} datatable - Array of objects representing table rows
 * @param {Array<string>} columns - Column names to display
 * @param {string} containerString - CSS selector for the container element
 * @returns {Object} D3 selection of the created table
 */
function tabulate(datatable, columns, containerString) {
  const table = d3.select(containerString).append("table");
  const thead = table.append("thead");
  const tbody = table.append("tbody");

  // append the header row
  thead
    .append("tr")
    .selectAll("th")
    .data(columns)
    .enter()
    .append("th")
    .text(function (column) {
      return column;
    })
    .attr("class", function (d) {
      return "field-" + d.replace(" ", "-");
    });

  // create a row for each object in the data
  const rows = tbody.selectAll("tr").data(datatable).enter().append("tr");

  // create a cell in each row for each column
  rows
    .selectAll("td")
    .data(function (row) {
      return columns.map(function (column) {
        return { column: column, value: row[column] };
      });
    })
    .enter()
    .append("td")
    .text(function (d) {
      return d.value;
    })
    .attr("class", function (d) {
      return "field-" + d.column.replace(" ", "-");
    });

  return table;
}

/**
 * Renders the deck hierarchy as expandable tree sections with note tables
 * @param {Object} deckHierarchy - Notes organized by deck path
 * @param {string} containerId - CSS selector for container element
 */
function renderDeckTree(deckHierarchy, containerId) {
  const container = d3.select(containerId);
  const pathKeys = Object.keys(deckHierarchy).sort();
  let tableCounter = 0;

  pathKeys.forEach(function (pathKey) {
    const deckData = deckHierarchy[pathKey];
    const path = deckData.path;

    // Create expandable section for each deck
    const details = container
      .append("details")
      .attr("class", "deck-details")
      .attr("open", true); // Open by default - can be changed to false

    const summary = details
      .append("summary")
      .attr("class", "deck-summary")
      .style("cursor", "pointer")
      .style("font-weight", "bold")
      .style("padding", "8px");

    summary.text(path.join(" > "));

    const deckContent = details
      .append("div")
      .attr("class", "deck-content")
      .style("padding", "8px")
      .style("border-left", "3px solid #ccc")
      .style("margin-left", "10px")
      .style("margin-top", "8px");

    // Group notes by model within each deck
    const notesByModel = {};
    deckData.notes.forEach(function (note) {
      const modelName = note.modelName;
      if (!notesByModel[modelName]) {
        notesByModel[modelName] = {
          fieldNames: note.fieldNames,
          notes: [],
        };
      }
      notesByModel[modelName].notes.push(note.data);
    });

    // Render a table for each model in this deck
    Object.keys(notesByModel).forEach(function (modelName) {
      const modelData = notesByModel[modelName];

      // Add model heading
      deckContent
        .append("h4")
        .style("margin-top", "12px")
        .style("margin-bottom", "8px")
        .text(
          modelName +
            " (" +
            modelData.notes.length +
            " note" +
            (modelData.notes.length !== 1 ? "s" : "") +
            ")",
        );

      // Create table div with unique ID
      const tableDivId = "deck-table-" + tableCounter++;
      const tableDiv = deckContent
        .append("div")
        .attr("id", tableDivId)
        .attr("class", "deck-model-table");

      // Create table using the tabulate function with CSS selector
      tabulate(modelData.notes, modelData.fieldNames, "#" + tableDivId);
    });
  });
}

/**
 * Converts SQLite binary data to table format and displays deck contents
 * @param {Uint8Array} uInt8ArraySQLdb - SQLite database binary data
 */
function sqlToTable(uInt8ArraySQLdb) {
  const deckData = processDeckData(uInt8ArraySQLdb, SQL);
  deckNotes = deckData.deckNotes;

  // Visualize!
  if (0 == specialDisplayHandlers()) {
    renderDeckTree(deckData.deckHierarchy, "#anki");
  }
}

/**
 * Maps deck media filenames to base64 data and swaps image sources in the DOM
 * @param {Object} imageTable - Media filename map from Anki
 * @param {Object} unzip - Zlib.Unzip instance
 * @param {Array<string>} filenames - List of filenames in the APKG
 */
function parseImages(imageTable, unzip, filenames) {
  const map = {};
  for (const prop in imageTable) {
    if (filenames.indexOf(prop) >= 0) {
      const file = unzip.decompress(prop);
      map[imageTable[prop]] = converterEngine(file);
    }
  }
  d3.selectAll("img").attr("src", function () {
    //Some filenames may be encoded. Decode them beforehand.
    const key = decodeURI(this.src.split("/").pop());
    if (key in map) {
      return "data:image/png;base64," + map[key];
    }
    return this.src;
  });
}

/**
 * Converts a byte array to a base64 string
 * @param {ArrayBuffer} input - Binary data
 * @returns {string} Base64-encoded string
 */
function converterEngine(input) {
  // fn BLOB => Binary => Base64 ?
  // adopted from https://github.com/NYTimes/svg-crowbar/issues/16
  const uInt8Array = new Uint8Array(input);
  let i = uInt8Array.length;
  const biStr = []; //new Array(i);
  while (i--) {
    biStr[i] = String.fromCharCode(uInt8Array[i]);
  }
  const base64 = window.btoa(biStr.join(""));
  return base64;
}

/**
 * Converts Anki APKG binary data to table format and displays deck contents
 * Validates ZIP header before decompression to prevent errors with corrupted files
 * @param {ArrayBuffer} ankiArray - APKG file binary data
 * @param {Object} options - Configuration options { loadImage: boolean }
 */
function ankiBinaryToTable(ankiArray, options) {
  // Validate ZIP header before attempting decompression
  if (!validateZipHeader(ankiArray)) {
    showError(
      "Invalid or corrupted APKG file. The file does not appear to be a valid ZIP archive.",
    );
    return;
  }

  const compressed = new Uint8Array(ankiArray);
  const unzip = new Zlib.Unzip(compressed);
  const filenames = unzip.getFilenames();
  const anki21Exists = filenames.indexOf("collection.anki21") >= 0;
  const sqliteFile = anki21Exists ? "collection.anki21" : "collection.anki2";
  if (filenames.indexOf(sqliteFile) >= 0) {
    const plain = unzip.decompress(sqliteFile);
    sqlToTable(plain);
    if (options && options.loadImage) {
      if (filenames.indexOf("media") >= 0) {
        const plainmedia = unzip.decompress("media");
        const bb = new Blob([new Uint8Array(plainmedia)]);
        const f = new FileReader();
        f.onload = function (e) {
          parseImages(JSON.parse(e.target.result), unzip, filenames);
        };
        f.readAsText(bb);
      }
    }
  }
}

/**
 * Fetches and loads an Anki deck from a URL using Fetch API
 * Supports CORS proxy for cross-origin URLs with privacy warning
 * @param {string} ankiURL - URL of the APKG file to download
 * @param {Object} options - Configuration options { loadImage: boolean }
 * @param {boolean} useCorsProxy - Whether to route through CORS proxy
 * @param {string} corsProxyURL - CORS proxy URL (defaults to GLOBAL_CORS_PROXY)
 */
function ankiURLToTable(ankiURL, options, useCorsProxy, corsProxyURL) {
  if (typeof useCorsProxy === "undefined") {
    useCorsProxy = false;
  }
  if (typeof corsProxyURL === "undefined") {
    corsProxyURL = GLOBAL_CORS_PROXY;
  }

  // Validate URL before proceeding
  if (!validateURL(ankiURL)) {
    showError("Invalid URL provided. Please enter a valid HTTP or HTTPS URL.");
    return;
  }

  // Warn about CORS proxy privacy implications
  if (useCorsProxy) {
    if (
      !confirm(
        "Warning: Using a third-party CORS proxy means your download URL will be sent through " +
          corsProxyURL +
          ". This service can see and potentially log your activity. Continue?",
      )
    ) {
      return;
    }
  }

  // Use Fetch API instead of XMLHttpRequest for better promise-based handling
  const fetchUrl = (useCorsProxy ? corsProxyURL : "") + ankiURL;
  fetch(fetchUrl)
    .then(function (response) {
      if (!response.ok) {
        throw new Error("Failed to download deck. Status: " + response.status);
      }
      return response.arrayBuffer();
    })
    .then(function (arrayBuffer) {
      ankiBinaryToTable(arrayBuffer, options);
    })
    .catch(function (error) {
      showError("Error downloading deck: " + error.message);
    });
}

/**
 * Builds the review results UI and visualization options
 */
function displayRevlogOutputOptions() {
  const ul = d3
    .select("body")
    .append("div")
    .attr("id", "reviews")
    .append("div")
    .attr("id", "reviews-options")
    .append("ul")
    .attr("id", "reviews-options-list");
  const tooMuch = 101;
  if (revlogTable.length > tooMuch) {
    createButton(
      ul,
      "tabulate-request",
      "Tabulate " +
        revlogTable.length +
        " review" +
        (revlogTable.length > 1 ? "s" : ""),
      function () {
        tabulateReviews();
      },
    );

    createButton(ul, "export-request", "Generate CSV spreadsheet", function () {
      generateReviewsCSV();
    });
  } else {
    tabulateReviews();
    generateReviewsCSV();
  }

  const viz = ul.append("li").attr("id", "viz-options");

  createButton(viz, "viz-run", "Visualize performance", function () {
    const selectedFields = d3
      .selectAll("#viz-models-list > li.viz-model")
      .selectAll("input:checked");
    let config = selectedFields.map(function (mod) {
      const mid = /[0-9]+/.exec(mod.parentNode.id)[0];
      const fs = mod.map(function (sub) {
        const fnum = /field-([0-9]+)/.exec(sub.id)[1];
        return allModels[mid].flds[fnum].name;
      });
      return { modelID: mid, fieldNames: fs };
    });
    config = arrayNamesToObj(
      config.map(function (entry) {
        return entry.modelID;
      }),
      config.map(function (entry) {
        return entry.fieldNames;
      }),
    );

    revlogVisualizeProgress(config, getSelectedDeckIDs());
  });

  const vizDecks = viz
    .append("ul")
    .append("li")
    .text("Select decks to analyze")
    .append("ul")
    .attr("id", "viz-decks-list");
  const vizModels = viz
    .append("ul")
    .append("li")
    .text("Select fields for each model to display in plots")
    .append("ul")
    .attr("id", "viz-models-list");

  // Data: elements of decksReviewed (which are {deck IDs -> object})
  // TODO: enable visualization of unknown decks: .data(Object.keys(decksReviewed))
  const decksReviewedKeysAlphabetized = Object.keys(decksReviewed)
    .filter(function (did) {
      return did !== "null";
    })
    .sort(function (a, b) {
      const nameA = allDecks[a] ? allDecks[a].name : "zzzUnknown";
      const nameB = allDecks[b] ? allDecks[b].name : "zzzUnknown";
      return nameA.localeCompare(nameB);
    });
  const vizDecksList = vizDecks
    .selectAll("li")
    .data(decksReviewedKeysAlphabetized)
    .enter()
    .append("li");

  vizDecksList.each(function (d) {
    const label = createCheckbox(
      d3.select(this),
      "viz-deck-" + d,
      d !== "null" ? allDecks[d].name : "Unknown deck",
      true,
    );

    const thisModels = Object.keys(decksReviewed[d])
      .map(function (mid) {
        return d !== "null" ? allModels[mid].name : null;
      })
      .filter(function (value) {
        return value;
      });

    if (thisModels.length > 0) {
      label
        .append("text")
        .text(
          " (contains model" +
            (thisModels.length > 1 ? "s " : " ") +
            thisModels.join(", ") +
            ")",
        );
    }
  });

  $("#viz-deck-null").attr("checked", false);

  $("#viz-decks-list input:checkbox").click(function () {
    updateModelChoices();
  });
  updateModelChoices();
}

/**
 * Reads selected deck IDs from the UI
 * @returns {Array<string|null>} Selected deck IDs
 */
function getSelectedDeckIDs() {
  const selectedDecks = $("#viz-decks-list input:checked")
    .map(function () {
      return this.id;
    })
    .get();
  // In case the above is too fancy across browsers, this is equivalent:
  // `$.map($('#viz-decks-list input:checked'), function(x){return x.id;})`

  const selectedDeckIDs = selectedDecks.map(function (id) {
    return id !== "viz-deck-null" ? /[0-9]+/.exec(id)[0] : null;
  });
  return selectedDeckIDs;
}

/**
 * Updates model choices based on selected decks
 */
function updateModelChoices() {
  const selectedDeckIDs = getSelectedDeckIDs();

  const modelIDs = Array.from(
    new Set(
      selectedDeckIDs
        .map(function (did) {
          return decksReviewed[did];
        })
        .filter(function (val) {
          return val;
        })
        .reduce(function (acc, val) {
          return acc.concat(Object.keys(val));
        }, []),
    ),
  );

  const vizModels = d3.select("#viz-models-list");
  const modelsData = vizModels
    .selectAll("li.viz-model")
    .data(modelIDs, function (mid) {
      return mid;
    });
  // For an explanation of the CSS class 'viz-model' see
  // http://stackoverflow.com/a/25599142/500207

  modelsData.exit().remove();

  const vizModelsList = modelsData
    .enter()
    .append("li")
    .attr("id", function (mid) {
      return "viz-model-" + mid;
    })
    .text(function (mid) {
      return mid !== "null" ? allModels[mid].name : "Unknown model";
    })
    /*.on("click", function(mid) {
                $('#viz-model-' + mid + '-list').slideToggle();
            })*/
    .classed("viz-model", true)
    .append("ul")
    .append("li");

  const vizFields = vizModelsList
    .selectAll("span")
    .data(function (d) {
      return d !== "null"
        ? allModels[d].flds.map(function (field, idx) {
            return {
              name: field.name,
              modelId: d,
              total: allModels[d].flds.length,
              idx: idx,
            };
          })
        : [];
    })
    .enter()
    .append("span")
    .classed("viz-field-span", true);

  vizFields.each(function (d) {
    const label = createCheckbox(
      d3.select(this),
      "viz-model-" + d.modelId + "-field-" + d.idx,
      d.name + (d.idx + 1 < d.total ? ", " : ""),
    );
  });
}

/**
 * Generates CSV export link for review data
 */
function generateReviewsCSV() {
  generateReviewsCSVModule(revlogTable, d3);
}

/**
 * Renders review table in the DOM
 */
function tabulateReviews() {
  tabulate(
    revlogTable,
    "date,ease,interval,lastInterval,timeToAnswer,noteSortKeyFact,deckName,modelName,lapses,\
reps,cardId,noteFactsJSON".split(","),
    "div#reviews",
  );
}

let sqliteGlobal;
let revlogTable;
let decksReviewed = {};
let modelsReviewed = {};
let allDecks;
let allModels;
/**
 * Converts Anki collection.anki2 file to review log table format
 * Processes review history and displays performance analytics
 * Validates SQLite header before processing to catch corrupted files early
 * @param {ArrayBuffer} array - SQLite database binary data from collection.anki2
 * @param {Object} options - Configuration { limit: number, recent: boolean }
 */
function ankiSQLToRevlogTable(array, options) {
  if (typeof options === "undefined") {
    options = { limit: 100, recent: true };
  }

  // Validate SQLite header before processing
  if (!validateSqliteHeader(array)) {
    showError(
      "Invalid or corrupted SQLite file. The file does not appear to be a valid Anki collection database.",
    );
    return;
  }

  const sqliteBinary = new Uint8Array(array);
  const sqlite = new SQL.Database(sqliteBinary);
  sqliteGlobal = sqlite;

  // The deck name is in decks, and the field names are in models
  // which are JSON, and have to be handled outside SQL.
  const allModelsDecks = sqlite.exec("SELECT models,decks FROM col")[0]
    .values[0];
  allModels = JSON.parse(allModelsDecks[0]);
  allDecks = JSON.parse(allModelsDecks[1]);

  // The reviews
  const query =
    "SELECT revlog.id, revlog.ease, revlog.ivl, revlog.lastIvl, revlog.time, notes.flds, notes.sfld, cards.id, cards.reps, cards.lapses, cards.did, notes.mid, cards.ord \
FROM revlog \
LEFT OUTER JOIN cards ON revlog.cid=cards.id \
LEFT OUTER JOIN notes ON cards.nid=notes.id \
ORDER BY revlog.id" +
    (options.recent ? " DESC " : "") +
    (options.limit && options.limit > 0 ? " LIMIT " + options.limit : "");
  const queryResultNames =
    "revId,ease,interval,lastInterval,timeToAnswer,noteFacts,noteSortKeyFact,cardId,reps,lapses,deckId,\
modelId,templateNum".split(",");

  // Run the query and convert the resulting array of arrays into an array of
  // objects
  revlogTable = sqlite.exec(query)[0].values;

  const unknownDeckString = "unknown deck";
  const unknownNoteString = "unknown note facts";
  const unknownModelString = "unknown model";
  // TODO add "Date of first review" field
  revlogTable = revlogTable.map(function (rev) {
    // First, convert this review from an array to an object
    rev = arrayNamesToObj(queryResultNames, rev);

    // Add deck name
    rev.deckName = rev.deckId ? allDecks[rev.deckId].name : unknownDeckString;

    // Convert facts string to a fact object
    const fieldNames = rev.modelId
      ? allModels[rev.modelId].flds.map(function (f) {
          return f.name;
        })
      : null;
    rev.noteFacts = rev.noteFacts
      ? arrayNamesToObj(fieldNames, rev.noteFacts.split(ankiSeparator))
      : unknownNoteString;
    // Add model name
    rev.modelName = rev.modelId
      ? allModels[rev.modelId].name
      : unknownModelString;
    // delete rev.modelId;

    // Decks need to know what models are in them. decksReviewed is an
    // object of objects: what matters are the keys, at both levels, not the
    // values. TODO can this be done faster in SQL?
    updateNestedObj(decksReviewed, rev.deckId, rev.modelId, rev.modelName);
    // But let's also keep track of models in the same way, since we're lazy
    // FIXME
    updateNestedObj(modelsReviewed, rev.modelId, rev.deckId, rev.deckName);

    // Add review date
    rev.date = new Date(rev.revId);
    rev.dateString = rev.date.toString();

    // Add a JSON representation of facts
    rev.noteFactsJSON =
      typeof rev.noteFacts === "object"
        ? JSON.stringify(rev.noteFacts)
        : unknownNoteString;

    // Switch timeToAnswer from milliseconds to seconds
    rev.timeToAnswer /= 1000;

    return rev;
  });

  /*
    // decks and models that are only associated with reviews. Will this be
    // faster in sql.js or inside plain Javascript? TODO find out.
    var modelIDsReviewed = sqlite.exec(
                                      "SELECT DISTINCT notes.mid \
FROM revlog \
LEFT OUTER JOIN cards ON revlog.cid=cards.id \
LEFT OUTER JOIN notes ON cards.nid=notes.id")[0].values;
    modelsReviewed = modelIDsReviewed.map(function(mid) {
        return mid[0] ? allModels[mid[0]].name : unknownModelString;
    });
    modelIdToName =
      arrayNamesToObj(modelIDsReviewed.map(function (pair) { return pair[0]; }), modelsReviewed);

    var deckIDsReviewed = sqlite.exec(
                                     "SELECT DISTINCT cards.did \
FROM revlog \
LEFT OUTER JOIN cards ON revlog.cid=cards.id")[0].values;
    decksReviewed = deckIDsReviewed.map(function(did) {
        return did[0] ? allDecks[did[0]].name : unknownDeckString;
    });
    deckIdToName = arrayNamesToObj(deckIDsReviewed.map(function (pair) { return pair[0]; }), decksReviewed);
    */

  // Create div for results
  displayRevlogOutputOptions();
}

/**
 * Reduces review log to a per-card summary for visualization
 * @param {Array<string|number>} deckIDsWanted - Deck IDs to include
 * @returns {Object} Reduced review database and index map
 */
function reduceRevlogTable(deckIDsWanted) {
  const deckIDs = deckIDsWanted.map(function (i) {
    return parseInt(i);
  });

  // See if revlogTable is sorted ascending or descending by examining the
  // first two elements.
  // NB. This will fail if the SQL query isn't sorted by time!
  const oldestFirst = revlogTable[0].date < revlogTable[1].date;

  // We wanted to know whether the oldest came first or last because a key
  // element of this visualization is the date each note was learned.

  // Build the cardId-indexed array using reduce since it can reduce (left)
  // or reduceRight. Just accumulate the individual reviews. We don't need to
  // keep track of dates, or lapses, or total reps since the database gave us
  // that.
  let uniqueKeysSeenSoFar = 0;
  const temporalIndexToCardArray = [];
  let revDb;

  const reductionFunction = function (dbSoFar, rev) {
    const key = rev.cardId;
    if (deckIDs && deckIDs.indexOf(rev.deckId) < 0) {
      return dbSoFar;
    }

    if (key in dbSoFar) {
      // Already seen this card ID
      dbSoFar[key].allRevlogs.push(rev);
    } else {
      // Fist time seeing this card ID
      dbSoFar[key] = {
        allRevlogs: [rev],
        reps: rev.reps,
        lapses: rev.lapses,
        cardId: rev.cardId,
        modelId: rev.modelId,
        dateLearned: rev.date,
        noteFacts: rev.noteFacts,
        temporalIndex: uniqueKeysSeenSoFar,
      };
      temporalIndexToCardArray[uniqueKeysSeenSoFar] = key;
      uniqueKeysSeenSoFar++;
    }
    return dbSoFar;
  };

  // We know whether to reduce or reduceRight
  if (oldestFirst) {
    revDb = revlogTable.reduce(reductionFunction, {});
  } else {
    revDb = revlogTable.reduceRight(reductionFunction, {});
  }

  return {
    revDb: revDb,
    temporalIndexToCardArray: temporalIndexToCardArray,
  };
}

/**
 * Builds a display string for a card based on selected fields
 * @param {Object} cardObj - Card data object
 * @param {Object} config - Model/field selection config
 * @returns {string} Display string
 */
function cardAndConfigToString(cardObj, config) {
  return config[cardObj.modelId].length > 0
    ? config[cardObj.modelId]
        .map(function (factName) {
          return cardObj.noteFacts[factName];
        })
        .join(", ")
    : "card ID: " + cardObj.cardId;
}

let revDb;
let temporalIndexToCardArray;
/**
 * Renders review performance visualizations
 * @param {Object} configModelsFacts - Selected model fields
 * @param {Array<string|number>} deckIDsWanted - Deck IDs to include
 */
function revlogVisualizeProgress(configModelsFacts, deckIDsWanted) {
  // This function needs to take, as logical inputs, the decks and models to
  // limit the visualization to, plus a boolean operation AND or OR to combine
  // the two, and finally a way to display the pertinent facts about a card so
  // that cards are better-distinguished than card IDs (a long nunmber).
  if (typeof deckIDsWanted === "undefined") {
    deckIDsWanted = [];
  }

  const reduced = reduceRevlogTable(deckIDsWanted);
  temporalIndexToCardArray = reduced.temporalIndexToCardArray;
  revDb = reduced.revDb;

  // So now we've generated an object indexed by whatever keyFactId was chosen
  // (and potentially restricted to a deck/model) that tells us performance
  // details about each card. Sibling cards are currently treated as different
  // cards: TODO: allow user to select treating them as the same card.

  // Create chart containers
  createChartContainer(
    d3.select("#reviews"),
    "Performance since acquisition",
    "Number of lapses since card learned. Drag to pan, and mouse-weel to zoom.",
    "scatter-norm-rep-lapse",
  );

  createChartContainer(
    d3.select("#reviews"),
    "Performance histogram",
    "Histogram of per-card performance, where ease of 1 is failure and all other eases are success.",
    "histogram",
  );

  createChartContainer(
    d3.select("#reviews"),
    "Calendar view of acquisition",
    "Time series showing when cards were learned. Large circles indicate perfect performance, smaller circles indicate poorer performance. Zoomable and pannable.",
    "chart",
  );

  createChartContainer(
    d3.select("#reviews"),
    "Scatter plot of lapses versus reps",
    "Lapses and reps are correlated with poor performance, so this scatter plot cannot be easily used for analysis.",
    "scatter-rep-lapse",
  );

  //------------------------------------------------------------------------
  // Pass rate per unique card
  //------------------------------------------------------------------------
  // Generate the column-wise array of arrays that c3js wants
  const revDbKeys = Object.keys(revDb);
  const chartArr = revDbKeys.map(function (key) {
    const val = revDb[key];
    return [val.dateLearned, 1 + val.temporalIndex];
  });
  chartArr.unshift(["date", "card index"]);

  // Invoke the c3js method
  createTimeSeriesChart("#chart", chartArr, {
    yLabel: "Card index",
    xLabel: "Date",
    onmouseover: function (d) {
      $(".c3-circle-" + d.index).css({
        "stroke-width": 5,
      });
    },
    onmouseout: function (d) {
      $(".c3-circle-" + d.index).css({
        "stroke-width": 1,
      });
    },
    tooltip: {
      format: {
        value: function (value) {
          // value: 1-index!
          const key = temporalIndexToCardArray[value - 1];
          const str = cardAndConfigToString(revDb[key], configModelsFacts);
          const reps = revDb[key].reps;
          const lapses = revDb[key].lapses;
          return (
            str +
            " (#" +
            (value - 1 + 1) +
            ", " +
            (reps - lapses) +
            "/" +
            reps +
            " reps passed)"
          );
        },
      },
    },
  });

  // Make the radius and opacity of each data circle depend on the pass rate
  const grader = function (dbentry) {
    return 1 - dbentry.lapses / dbentry.reps;
  };
  const revDbValues = revDbKeys.map(function (key) {
    return revDb[key];
  });
  const worstRate = grader(
    revDbValues.reduce(function (minVal, current) {
      return grader(current) < grader(minVal) ? current : minVal;
    }, revDbValues[0]),
  );
  let scaleRadius = d3
    .scaleLinear()
    .domain([worstRate - 0.005, 1])
    .range([2, 45]);
  let scaleOpacity = d3
    .scalePow()
    .exponent(-17)
    .domain([worstRate, 1])
    .range([1, 0.05]);

  // The following helps smooth out the diversity of radii and opacities by
  // putting more slope in the linear scale where there's more mass in the
  // histogram, so when there's lots of things with about the same value,
  // they'll have more different radii/opacities than they would otherwise. It
  // looks good, but it depends on the user's data, and requires some
  // automatic histogram analysis: TODO.
  if (false) {
    let lin = d3.scaleLinear().domain([0, 1]).range(scaleRadius.range());
    scaleRadius = d3
      .scaleLinear()
      .domain([worstRate, 0.85, 0.93, 0.96, 1])
      .range([lin(0), lin(0.2), lin(0.8), lin(0.99), lin(1)]);
    lin = d3.scaleLinear().domain([0, 1]).range(scaleOpacity.range());
    scaleOpacity = d3
      .scaleLinear()
      .domain([worstRate, 0.85, 0.93, 0.96, 1])
      .range([lin(0), lin(0.2), lin(0.8), lin(0.99), lin(1)]);
  }

  temporalIndexToCardArray.forEach(function (_, idx) {
    const dbentry = revDb[temporalIndexToCardArray[idx]];
    const rate = grader(dbentry);
    d3.select(".c3-circle-" + idx).attr({
      r: scaleRadius(rate),
      //'fill-opacity' : 0,
      //'fill' : 'none',
      "stroke-opacity": scaleOpacity(rate),
    });
  });
  $(".c3-circle").css({
    stroke: "rgb(31,119,180)",
    fill: "none",
    "fill-opacity": 0,
  });

  //------------------------------------------------------------------------
  // Histogram of pass rates
  //------------------------------------------------------------------------
  // High to low, then reverse, to make sure 1.01 and 1 have no roundoff.
  // Include 1.01 to capture 1 in its own bin
  const binDistance = 0.01;
  const histEdges = [];
  const histEnd = Math.floor(worstRate * 100) / 100;
  for (let edge = 1.01; edge > histEnd; edge -= binDistance) {
    histEdges.push(edge);
  }
  histEdges.reverse();

  const histData = d3.histogram().domain([0, 1]).thresholds(histEdges)(
    revDbValues.map(grader),
  );
  const normalizeHistToPercent = 1 / temporalIndexToCardArray.length;
  const chartHistData = histData.map(function (bar) {
    return [bar.x, bar.y];
  });
  chartHistData.unshift(["x", "frequency"]);
  createHistogram("#histogram", chartHistData, {
    yLabel: "Number of cards",
    xLabel: "Pass rate",
    xTick: { format: d3.format(".2p") },
    tooltip: {
      format: {
        value: function (value) {
          return (
            value +
            " cards (" +
            d3.format(".3p")(value * normalizeHistToPercent) +
            " of cards)"
          );
        },
      },
    },
  });

  //-----------------
  // Time to failure plots
  //--------------------
  const unitRandom = function () {
    return (Math.random() - 0.5) * 0.5;
  };
  const lapsesReps = temporalIndexToCardArray.map(function (key) {
    return [revDb[key].lapses + unitRandom(), revDb[key].reps + unitRandom()];
  });
  lapsesReps.unshift(["lapses", "reps"]);
  createScatterPlot("#scatter-rep-lapse", lapsesReps, {
    xColumn: "reps",
    xLabel: "# reps, integer with jitter",
    yLabel: "# lapses, integer with jitter",
  });

  //-----------
  // Normalized
  //-----------
  const current = new Date().getTime();
  const dayDiff = function (initial) {
    return (current - initial.getTime()) / (1000 * 3600 * 24);
  };
  const jitteredTimeToCard = {};
  const lapsesTime = temporalIndexToCardArray.map(function (key) {
    const jitteredTime = dayDiff(revDb[key].dateLearned) + unitRandom();
    jitteredTimeToCard[jitteredTime] = key;
    return [revDb[key].lapses + unitRandom(), jitteredTime];
  });
  lapsesTime.unshift(["lapses", "daysKnown"]);

  /*
    var lapsesTimesTranspose = [];
    for (var inputCol = 0;inputCol < lapsesTime[0].length; inputCol++) {
        lapsesTimesTranspose[inputCol] = [];
        for (var inputRow = 0; inputRow < lapsesTime.length; inputRow++) {
            lapsesTimesTranspose[inputCol][inputRow] = lapsesTime[inputRow][inputCol];
        }
    }
    */ /*data --> columns : lapsesTimesTranspose*/

  createScatterPlot("#scatter-norm-rep-lapse", lapsesTime, {
    xColumn: "daysKnown",
    xLabel: "days known, with jitter",
    yLabel: "# lapses, with jitter",
    enableZoom: true,
    tooltip: {
      contents: function (d, defaultTitleFormat, defaultValueFormat, color) {
        const key = jitteredTimeToCard[d[0].x];
        const str = cardAndConfigToString(revDb[key], configModelsFacts);
        this.config.tooltip_format_title = function (dayValue) {
          return "Known for " + d3.round(dayValue) + " days (" + str + ")";
        };
        this.config.tooltip_format_value = function (value) {
          return d3.round(value) + " (" + str + ")";
        };
        const retval = this.getTooltipContent
          ? this.getTooltipContent(d, [], [], color)
          : "";
        return retval;
      },
      format: {
        title: function (d) {
          return "Known for " + d3.round(d) + " days";
        },
        name: function (id) {
          if (id === "lapses") {
            return "Lapses";
          }
          return "Card key";
        },
        value: function (value, ratio, id) {
          if (id === "lapses") {
            return d3.round(value);
          }
          return temporalIndexToCardArray[value];
        },
      },
    },
  });
}

// Lifted from
// https://github.com/matteofigus/nice-json2csv/blob/master/lib/nice-json2csv.js
// (MIT License)

$(document).ready(function () {
  initSqlJs({ locateFile: (filename) => filename }).then(function (localSQL) {
    SQL = localSQL;
    readySetup();
  });
});
/**
 * Registers UI handlers once SQL.js is ready
 */
function readySetup() {
  const options = {};
  const setOptionsImageLoad = function () {
    options.loadImage = $("input#showImage").is(":checked");
    return options;
  };
  const eventHandleToTable = function (event) {
    event.stopPropagation();
    event.preventDefault();
    let f = event.target.files[0];
    if (!f) {
      f = event.dataTransfer.files[0];
    }

    if (!f) {
      showError("No file selected.");
      return;
    }

    // Validate file type based on context
    const expectApkg = event.target.id === "ankiFile";
    const expectSqlite = event.target.id === "sqliteFile";

    if (expectApkg) {
      if (!validateFileExtension(f, [".apkg"], "APKG")) {
        return;
      }
    }

    if (expectSqlite) {
      if (!validateFileExtension(f, [".anki2", ".anki21"], "SQLite")) {
        return;
      }
    }

    // Validate file size
    if (!validateFileSize(f)) {
      return;
    }

    const reader = new FileReader();
    if ("function" in event.data) {
      reader.onload = createSafeFileReaderHandler(
        event.data.function,
        showError,
      );
    } else {
      reader.onload = createSafeFileReaderHandler(function (data) {
        ankiBinaryToTable(data, setOptionsImageLoad());
      }, showError);
    }
    reader.onerror = function () {
      showError("Error reading file.");
    };
    reader.readAsArrayBuffer(f);
  };

  // Deck browser
  $("#ankiFile").change(
    {
      function: function (data) {
        ankiBinaryToTable(data, setOptionsImageLoad());
      },
    },
    eventHandleToTable,
  );
  $("#ankiURLSubmit").click(function () {
    ankiURLToTable($("#ankiURL").val(), setOptionsImageLoad(), true);
    $("#ankiURL").val("");
  });

  // Review browser
  $("#sqliteFile").change(
    {
      function: function (data) {
        const limitValue = $("input#sqliteLimit").val();
        const limitNum = parseInt(limitValue);
        // Validate that the limit is a valid positive integer
        if (isNaN(limitNum) || limitNum <= 0) {
          showError(
            "Please enter a valid positive number for the review limit.",
          );
          return;
        }
        ankiSQLToRevlogTable(data, {
          limit: limitNum,
          recent: $("input#sqliteRecent").is(":checked"),
        });
      },
    },
    eventHandleToTable,
  );
}

/**
 * Hook that modifies Nayr's Japanese Core5000 Anki deck
 * (see https://ankiweb.net/shared/info/631662071)
 *
 * @param {Array} deckNotes - array of Anki Notes from the above deck
 * @param {String[]} deckFields - names of the fields of the Notes
 * @return {Array} an updated version of deckNotes
 *
 * Each Note object containing properties Expression, Meaning, Reading, English
 * Translation, Word, Frequency Order, and Sound.
 *
 * Kana in the "Reading" field will be changed from "[kana]" to being wrapped in
 *<span> tags. And each of the items in the "Word" field, which contains the
 *Japanese word, its reading in roumaji (Latin characters), one or more
 *parts-of-speech, and English translations, will be encased in <span> tags
 *(ideally these would be their own independent fields, but some rows have more
 *than one part-of-speech).
 */
function core5000Modify(deckNotes, deckFields, deckName) {
  d3.select("body").append("div").attr("id", "core5000");
  d3.select("#core5000").append("h2").text(deckName);
  const divForLink = d3.select("#core5000").append("p");

  //------------------------------------------------------------
  // Variables and functions to help deal with the "Word" column
  //------------------------------------------------------------
  // Parts of speech abbreviations
  const abbreviations =
    "adn.,adv.,aux.,conj.,cp.,i-adj.,interj.,n.,na-adj.,num.,p.,p. \
case,p. conj.,p. disc.,pron.,v.,suffix,prefix".split(",");
  const abbreviationsOr = abbreviations.join("|").replace(/\./g, "\\.");

  // The basic structure of the "Word" column is:
  //
  // 1. some kanji or kana, plus other random things like commas, parentheses,
  // both ascii and full-width.
  // 2. Some roumaji
  // 3. One or more parts of speech, using the above abbreviations
  // 4. English translations.
  //
  // The following three strings will be the regexps that match #1--#3.
  // They've been carefully chosen to work with wrinkles in the database,
  // e.g., more than one of the above four-step sequences in a single row,
  // multiple adjacent parts-of-speech, or multiple
  // part-of-speech-and-translation pairs. All these strings intended to
  // become regexps will go through XRegExp, which expands out the
  // Han/Katakana/Hiragana groups.
  const kanaKanjiWordRegexp = "([^a-z]+)";
  const romajiRegexp = "([a-z\\s,\\-()’]+)";
  const partOfSpeechRegexp = "((?: |,|" + abbreviationsOr + ")+)";

  // Break up a string containing one {kanji/kana + roumaji + part-of-speech +
  // translations} sequence. The critical idea in this function is to split
  // the input string between part-of-speech-abbreviations, and do some
  // processing on that to handle two edge cases:
  //
  // 1. "いろいろ iroiro adv., na-adj. various" <-- more than one adjacent
  //     part-of-speech abbreviation separated by a comma
  // 2. "余り amari adv. the rest n. (not) much" <-- more than one
  //     part-of-speech/translation pairs.
  //
  // It handles both these cases by splitting the string into an array along
  // (and including) part-of-speech-abbreviation boundaries. To handle edge
  // case 1 above, it finds elements of the resulting array that are
  // between part-of-speech abbreviations but which are
  // whitespace/punctuation, and merges those elements into a single
  // "part-of-speech" element.
  //
  // Then it builds an array of parts-of-speech and a matching array of
  // translations. This handles case 2 above. These two arrays, as well as the
  // kanji/kana and roumaji, are returned as an object.
  function bar(seqString) {
    // How much hackier can we get :)
    if (
      0 == seqString.localeCompare("（お）姉さん(o)-nee-san n. elder sister")
    ) {
      // Add space between Japanese and reading
      seqString = "（お）姉さん (o)-nee-san n. elder sister";
    } else if (
      0 ==
      seqString.localeCompare(
        "相変わらず ai-kawara zu adv as ever, as usual, the \
same, as before [always]",
      )
    ) {
      // Add dot to "adv", completing the abbreviation instead of adding
      // another abbreviation which might trigger elsewhere
      seqString =
        "相変わらず ai-kawara zu adv. as ever, as usual, the same, as \
before [always]";
    } else if (0 == seqString.localeCompare("ごと-goto suffix every")) {
      seqString = "ごと goto suffix every";
    } else if (0 == seqString.localeCompare("家 uchi n house, home")) {
      seqString = "家 uchi n. house, home";
    }

    let arr = seqString.split(XRegExp("(" + abbreviationsOr + ")"));

    const isAbbreviation = arr.map(function (x) {
      return abbreviations.indexOf(x) >= 0 ? 1 : 0;
    });
    const isWhitePunctuation = arr.map(function (x) {
      return x.match(/^[\s,]*$/) ? 1 : 0;
    });
    let isAbbrOrWhitePunct = isAbbreviation.map(function (x, i) {
      return x + isWhitePunctuation[i];
    });

    // combineJunk will find [..., "adv.", ",", "na-adj.", ...] and splice
    // it into [..., "adv., na-adj.", ...].
    const tmp = combineJunk(isAbbrOrWhitePunct, arr);
    arr = tmp.data_array;
    isAbbrOrWhitePunct = tmp.indicator_array;
    // Updated arr and isAbbrOrWhitePunct. We need the latter to build the
    // return object.

    // Part-of-speech array and translation array, which will go itno the
    // return object. We rely on each part-of-speech element in arr to be
    // followed by a translation. So far, this happens.
    const pos = [];
    const translation = [];
    arr.forEach(function (x, i) {
      if (isAbbrOrWhitePunct[i]) {
        pos.push(x);
        translation.push(arr[i + 1]);
      }
    });

    // Grab the initial kanji/kana as well as the roumaji. String.match()
    // will return a three-element array here: the total match, and the two
    // groups corresponding to the two regexps.
    const kanaKanjiMatch = seqString.match(
      XRegExp(
        kanaKanjiWordRegexp + " " + romajiRegexp + " " + partOfSpeechRegexp,
      ),
    );

    if (0 == seqString.localeCompare("Oa oobii n. OB (old boy), alumnus")) {
      return {
        pos: pos,
        translation: translation,
        word: "OB",
        romaji: "oobii",
      };
    }
    return {
      pos: pos,
      translation: translation,
      word: kanaKanjiMatch[1],
      romaji: kanaKanjiMatch[2],
    };
  }

  function combineJunk(indicator_array, data_array) {
    let i = 1;
    while (i < indicator_array.length) {
      if (
        indicator_array[i] == indicator_array[i - 1] &&
        indicator_array[i] > 0
      ) {
        indicator_array.splice(i - 1, 2, 1);
        data_array.splice(i - 1, 2, data_array[i - 1] + data_array[i]);
      } else {
        i++;
      }
    }
    return { data_array: data_array, indicator_array: indicator_array };
  }

  // Get rid of &nbsp; and such. It'll mess up my regexping.
  function decodeHtml(html) {
    const txt = document.createElement("textarea");
    txt.innerHTML = html;
    return txt.value;
  }

  const wordColumnReplace = function (s) {
    if (s.search("&") >= 0) {
      s = decodeHtml(s);
    }

    const arr = s.split("<div>");

    return arr
      .map(function (s) {
        const decomp = bar(s);
        const posTrans = decomp.pos
          .map(function (pos, i) {
            return (
              '<span class="part-of-speech">' +
              pos +
              '</span> <span class="target-words-meaning">' +
              decomp.translation[i] +
              "</span>"
            );
          })
          .join(" ");
        return (
          '<span class="target-words">' +
          decomp.word +
          '</span> <span class="target-words-romaji">' +
          decomp.romaji +
          "</span> " +
          posTrans
        );
      })
      .join("<div>");
  };

  //--------------------------------------------
  // Variable for Reading column cleanup of kana
  //--------------------------------------------
  const kanaRegexp = XRegExp("\\[([\\p{Hiragana}\\p{Katakana}]+)\\]", "g");

  //-----------------
  // Complete cleanup
  //-----------------
  deckNotes.map(function (note) {
    // Again, how much hackier can you get :)
    if (
      0 ==
      note.Reading.localeCompare(
        "この 単語[たんご]はどういう 意味[いみ]ですか。",
      )
    ) {
      note.Word = "語 go n. word; language";
    }

    // Break up Word column into its four separate components
    note.Word = wordColumnReplace(note.Word);

    // Replace [kana] with spans
    note.Reading = note.Reading.replace(kanaRegexp, function (match, kana) {
      return '<span class="reading kana">' + kana + "</span>";
    });

    return note;
  });

  //-------------------------
  // Visualization and return
  //-------------------------
  arrToCSV(deckNotes, deckFields, "Download Nyar's Core5k CSV", divForLink);

  tabulate(deckNotes, deckFields, "#core5000");

  // Instead of setting the styles of thousands of <td> tags individually,
  // just slash on a CSS tag to the DOM.
  d3.select("head").insert("style", ":first-child").text(
    "#core5000 th.field-Meaning, #core5000 th.field-Sound {font-size: 10%}\
#core5000 th.field-Frequency-Order {font-size:50%}\
#core5000 td.field-Expression, #core5000 td.field-Reading {font-size: 150%}\
#core5000 td.field-English-Translation, #core5000  td.field-Word {font-size: 75%}",
  );

  return deckNotes;
}

/**
 * Allows custom display logic for specific decks
 * @returns {number} 1 if a handler ran, otherwise 0
 */
function specialDisplayHandlers() {
  if (false) {
    const modifiedDeckNotes = deckNotes
      .filter(function (model) {
        return 0 == "Nayr's Japanese Core5000".localeCompare(model.name);
      })
      .map(function (model) {
        return core5000Modify(model.notes, model.fieldNames, model.name);
      });
    if (modifiedDeckNotes.length > 0) {
      return 1;
    }
  }
  return 0;
}
