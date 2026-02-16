/**
 * Display and rendering functions for the Fuzzy-Anki application
 * Depends on: d3 (v6), utils
 */

/**
 * Creates a tabular HTML representation of data
 * @param {Array<Object>} datatable - Array of objects representing table rows
 * @param {Array<string>} columns - Column names to display from each object
 * @param {string} containerString - CSS selector or ID for the container element
 * @returns {void} Renders table directly to the DOM
 */
export function tabulate(datatable, columns, containerString) {
  const container = document.querySelector(containerString);

  if (!container) {
    console.warn(`Container "${containerString}" not found`);
    return;
  }

  // Create table element
  const table = document.createElement("table");
  table.className = "note-table";

  // Create table header
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  columns.forEach(function (column) {
    const th = document.createElement("th");
    th.textContent = column;
    th.className = "table-header-" + column.toLowerCase().replace(/\s+/g, "-");
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Create table body
  const tbody = document.createElement("tbody");

  datatable.forEach(function (row) {
    const tr = document.createElement("tr");
    tr.className = "note-row";

    columns.forEach(function (column) {
      const td = document.createElement("td");
      const cellValue = row[column];

      // Handle various data types
      if (cellValue === null || cellValue === undefined) {
        td.textContent = "";
      } else if (typeof cellValue === "object") {
        td.textContent = JSON.stringify(cellValue);
      } else {
        // Escape HTML to prevent XSS
        td.textContent = String(cellValue);
      }

      td.className = "table-cell-" + column.toLowerCase().replace(/\s+/g, "-");
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);

  // Clear container and append table
  container.innerHTML = "";
  container.appendChild(table);
}

/**
 * Renders a hierarchical deck tree structure using D3
 * @param {Object} deckHierarchy - Deck hierarchy object from organizeNotesByDeck
 *   Format: { "Deck > SubDeck": { path: [...], deckId: id, notes: [...] }, ... }
 * @param {string} containerId - ID of the container element for the tree
 * @returns {void} Renders tree directly to the DOM
 */
export function renderDeckTree(deckHierarchy, containerId) {
  const container = document.getElementById(containerId);

  if (!container) {
    console.warn(`Container with ID "${containerId}" not found`);
    return;
  }

  // Clear container
  container.innerHTML = "";

  // Create a hierarchical structure from the flat deckHierarchy
  const root = {
    name: "Root",
    children: [],
    nodesMap: {},
  };

  // Build tree structure
  Object.keys(deckHierarchy).forEach(function (pathKey) {
    const deckData = deckHierarchy[pathKey];
    const path = deckData.path;

    let currentNode = root;

    // Navigate/create path in tree
    path.forEach(function (deckName, index) {
      const nodeName = path.slice(0, index + 1).join(" > ");
      let childNode = null;

      // Look for existing child with this name
      if (!currentNode.nodesMap) {
        currentNode.nodesMap = {};
      }

      if (currentNode.nodesMap[nodeName]) {
        childNode = currentNode.nodesMap[nodeName];
      } else {
        // Create new child node
        childNode = {
          name: deckName,
          fullPath: nodeName,
          deckId: deckData.deckId,
          noteCount: index === path.length - 1 ? deckData.notes.length : 0,
          children: [],
          nodesMap: {},
        };

        currentNode.children.push(childNode);
        currentNode.nodesMap[nodeName] = childNode;
      }

      // Update note count if this is the leaf node
      if (index === path.length - 1) {
        childNode.noteCount = deckData.notes.length;
      }

      currentNode = childNode;
    });
  });

  // Render tree using D3
  if (typeof d3 !== "undefined") {
    renderD3Tree(container, root, containerId);
  } else {
    renderSimpleTree(container, root);
  }
}

/**
 * Renders tree using D3 (tree layout)
 * @private
 */
function renderD3Tree(container, root, containerId) {
  const width = Math.max(800, container.clientWidth || 800);
  const height = Math.max(600, root.children.length * 60 + 100);

  // Create SVG
  const svg = d3
    .select("#" + containerId)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("class", "deck-tree-svg");

  const g = svg.append("g").attr("transform", "translate(40,20)");

  // Create tree layout
  const tree = d3.tree().size([width - 80, height - 40]);

  // Create hierarchy
  const hierarchy = d3.hierarchy(root);
  const nodes = tree(hierarchy);

  // Draw links
  g.selectAll(".link")
    .data(nodes.links())
    .enter()
    .append("path")
    .attr("class", "deck-tree-link")
    .attr(
      "d",
      d3
        .linkVertical()
        .x(function (d) {
          return d.x;
        })
        .y(function (d) {
          return d.y;
        }),
    );

  // Draw nodes
  const nodeGroups = g
    .selectAll(".node")
    .data(nodes.descendants())
    .enter()
    .append("g")
    .attr("class", "deck-tree-node")
    .attr("transform", function (d) {
      return "translate(" + d.x + "," + d.y + ")";
    });

  // Add circles for nodes
  nodeGroups
    .append("circle")
    .attr("r", 6)
    .attr("class", function (d) {
      return d.depth === 0 ? "deck-tree-root-node" : "deck-tree-leaf-node";
    });

  // Add labels
  nodeGroups
    .append("text")
    .attr("dy", function (d) {
      return d.children || d._children ? -12 : 12;
    })
    .attr("text-anchor", "middle")
    .attr("class", "deck-tree-label")
    .text(function (d) {
      const label = d.data.name;
      const noteCount = d.data.noteCount || 0;
      return label + (noteCount > 0 ? " (" + noteCount + ")" : "");
    });
}

/**
 * Simple fallback tree rendering without D3
 * @private
 */
function renderSimpleTree(container, root) {
  const ul = document.createElement("ul");
  ul.className = "deck-tree-simple";

  function addTreeNode(node, list) {
    if (node === root) {
      // Skip root node, process children directly
      node.children.forEach(function (child) {
        addTreeNode(child, list);
      });
      return;
    }

    const li = document.createElement("li");
    li.className = "deck-tree-item";

    const span = document.createElement("span");
    span.className = "deck-tree-item-label";
    const noteCount = node.noteCount || 0;
    span.textContent =
      node.name + (noteCount > 0 ? " (" + noteCount + ")" : "");
    li.appendChild(span);

    if (node.children && node.children.length > 0) {
      const childList = document.createElement("ul");
      childList.className = "deck-tree-nested";

      node.children.forEach(function (child) {
        addTreeNode(child, childList);
      });

      li.appendChild(childList);
    }

    list.appendChild(li);
  }

  root.children.forEach(function (child) {
    addTreeNode(child, ul);
  });

  container.appendChild(ul);
}
