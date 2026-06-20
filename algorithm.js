/**
 * Seating Algorithm for SeatPick
 * Handles random shuffling, fixed seats, excluded seats, front-row (vision protection) constraints,
 * and avoid-pairing constraints with a trial-and-shuffle heuristic.
 */

/**
 * Check if two grid indices are adjacent (8-way: horizontal, vertical, diagonal).
 */
export function areAdjacent(idx1, idx2, cols) {
  const r1 = Math.floor(idx1 / cols);
  const c1 = idx1 % cols;
  const r2 = Math.floor(idx2 / cols);
  const c2 = idx2 % cols;

  return Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1;
}

/**
 * Parse roster text into structured student objects.
 * Format: "Name" or "Name(score)" or "Name: score"
 */
export function parseRoster(text) {
  if (!text || !text.trim()) return [];

  const lines = text.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
  return lines.map(line => {
    // Regex matches name followed by number in parenthesis or colon
    // e.g. "홍길동(5)", "이순신:10", "김영희 (2)"
    const match = line.match(/^([^(:\s]+)(?:\s*[({:]\s*(\d+)\s*\)?)?$/);
    if (match) {
      return {
        name: match[1].trim(),
        tokens: match[2] ? parseInt(match[2], 10) : 0,
        frontRow: false,
        fixedSeat: null
      };
    }
    return {
      name: line,
      tokens: 0,
      frontRow: false,
      fixedSeat: null
    };
  });
}

/**
 * Generate a seating arrangement.
 * 
 * @param {Array} students List of student objects: { name, tokens, frontRow }
 * @param {number} rows Number of classroom rows
 * @param {number} cols Number of classroom columns
 * @param {Array} excludedSeats Array of seat indices that are blocked/empty
 * @param {Map} fixedSeats Map of seatIndex -> studentName (explicitly fixed seats)
 * @param {Array} avoidPairs Array of string arrays, e.g. [['A', 'B'], ['C', 'D']]
 * @returns {Object} { layout: Array of strings/nulls, violationsCount: number, success: boolean }
 */
export function generateSeating({
  students,
  rows,
  cols,
  excludedSeats = [],
  fixedSeats = new Map(),
  avoidPairs = []
}) {
  const totalSeats = rows * cols;
  const excludedSet = new Set(excludedSeats);
  
  // 1. Identify which students are already placed in fixed seats
  const fixedStudentNames = new Set(fixedSeats.values());
  
  // 2. Separate remaining students into front-row priority and general
  const pool = students.filter(s => !fixedStudentNames.has(s.name));
  const frontRowPool = pool.filter(s => s.frontRow);
  const generalPool = pool.filter(s => !s.frontRow);

  // Helper to shuffle an array in place (Fisher-Yates)
  const shuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]);
    }
    return array;
  };

  let bestLayout = null;
  let minViolations = Infinity;
  const maxAttempts = 800;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const currentLayout = new Array(totalSeats).fill(null);

    // Apply excluded seats
    for (const seatIdx of excludedSet) {
      currentLayout[seatIdx] = 'EXCLUDED';
    }

    // Apply fixed seats
    for (const [seatIdx, studentName] of fixedSeats.entries()) {
      if (seatIdx < totalSeats) {
        currentLayout[seatIdx] = studentName;
      }
    }

    // Prepare lists to place
    const toPlaceFront = [...frontRowPool];
    const toPlaceGeneral = [...generalPool];

    shuffle(toPlaceFront);
    shuffle(toPlaceGeneral);

    // Identify eligible front row seats (typically rows 0 and 1, index < cols * 2)
    // and eligible general seats (all other empty seats)
    const availableFrontRowIndices = [];
    const availableGeneralIndices = [];

    for (let i = 0; i < totalSeats; i++) {
      if (currentLayout[i] === null) {
        // If seat is in the first two rows, it's eligible for frontRow
        if (i < cols * 2) {
          availableFrontRowIndices.push(i);
        } else {
          availableGeneralIndices.push(i);
        }
      }
    }

    // Shuffle available slot indices so placement order is random
    shuffle(availableFrontRowIndices);
    shuffle(availableGeneralIndices);

    let placementPossible = true;

    // Place front-row priority students first
    for (const student of toPlaceFront) {
      if (availableFrontRowIndices.length > 0) {
        const seatIdx = availableFrontRowIndices.pop();
        currentLayout[seatIdx] = student.name;
      } else if (availableGeneralIndices.length > 0) {
        // Fallback: if front row seats are full, place in general seats
        const seatIdx = availableGeneralIndices.pop();
        currentLayout[seatIdx] = student.name;
      } else {
        placementPossible = false;
        break;
      }
    }

    if (!placementPossible) continue;

    // Put remaining front row indices back to general list since they are empty
    const remainingGeneralIndices = [...availableGeneralIndices, ...availableFrontRowIndices];
    shuffle(remainingGeneralIndices);

    // Place general students
    for (const student of toPlaceGeneral) {
      if (remainingGeneralIndices.length > 0) {
        const seatIdx = remainingGeneralIndices.pop();
        currentLayout[seatIdx] = student.name;
      } else {
        placementPossible = false;
        break;
      }
    }

    if (!placementPossible) continue;

    // Count avoid-pairing violations in this layout
    let violations = 0;

    for (let i = 0; i < totalSeats; i++) {
      const name1 = currentLayout[i];
      if (!name1 || name1 === 'EXCLUDED') continue;

      // Check all other seats to see if they are adjacent and match avoid pairs
      for (let j = i + 1; j < totalSeats; j++) {
        const name2 = currentLayout[j];
        if (!name2 || name2 === 'EXCLUDED') continue;

        if (areAdjacent(i, j, cols)) {
          // Check if {name1, name2} is an avoided pair
          const isAvoided = avoidPairs.some(pair => 
            (pair[0] === name1 && pair[1] === name2) || 
            (pair[0] === name2 && pair[1] === name1)
          );
          if (isAvoided) {
            violations++;
          }
        }
      }
    }

    // If zero violations, we found a perfect solution!
    if (violations === 0) {
      return {
        layout: currentLayout,
        violationsCount: 0,
        success: true
      };
    }

    // Keep track of the best layout so far (fewest violations)
    if (violations < minViolations) {
      minViolations = violations;
      bestLayout = currentLayout;
    }
  }

  // If we couldn't find a 0-violation layout, return the best we got
  return {
    layout: bestLayout,
    violationsCount: minViolations,
    success: false
  };
}
