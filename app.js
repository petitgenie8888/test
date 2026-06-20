import { audioService } from './audio.js';
import { parseRoster, generateSeating, areAdjacent } from './algorithm.js';

// Application State
const state = {
  students: [],
  rows: 5,
  cols: 6,
  excludedSeats: [], // Array of seat indices
  fixedSeats: new Map(), // Map of seatIndex -> studentName
  avoidPairs: [], // Array of [name1, name2]
  currentMode: 'classic', // classic | roulette | card | box
  layoutPreset: 'classic', // classic | pairs | groups3 | ushape
  gameState: 'setup', // setup | prioritySelection | picking | completed
  
  // Seating outputs
  targetLayout: [], // Completed pre-calculated seating grid of student names or 'EXCLUDED'/null
  revealedLayout: [], // Current visible layout during draw
  
  // Priority Selection State
  priorityQueue: [], // Students with tokens > 0, sorted by tokens desc
  priorityIndex: 0,
  
  // Animation / Reveal tracking
  unrevealedNames: [], // Array of names yet to be revealed
  isAnimating: false,
  soundEnabled: true,
  darkTheme: false
};

// UI Element References
const rosterInput = document.getElementById('rosterInput');
const studentCountBadge = document.getElementById('studentCountBadge');
const rowsInput = document.getElementById('rowsInput');
const colsInput = document.getElementById('colsInput');
const presetSelect = document.getElementById('presetSelect');
const tokenModeCheckbox = document.getElementById('tokenModeCheckbox');
const avoidName1 = document.getElementById('avoidName1');
const avoidName2 = document.getElementById('avoidName2');
const addAvoidBtn = document.getElementById('addAvoidBtn');
const avoidList = document.getElementById('avoidList');
const fixedList = document.getElementById('fixedList');
const startBatchBtn = document.getElementById('startBatchBtn');

const priorityBanner = document.getElementById('priorityBanner');
const priorityStudentName = document.getElementById('priorityStudentName');
const priorityStudentTokens = document.getElementById('priorityStudentTokens');

const modesBar = document.getElementById('modesBar');
const classroomGrid = document.getElementById('classroomGrid');
const rouletteArena = document.getElementById('rouletteArena');
const rouletteWheel = document.getElementById('rouletteWheel');
const spinWheelBtn = document.getElementById('spinWheelBtn');
const drawBoxArena = document.getElementById('drawBoxArena');
const luckyDrawBox = document.getElementById('luckyDrawBox');
const extractedCard = document.getElementById('extractedCard');
const extractedName = document.getElementById('extractedName');
const extractedSeatLabel = document.getElementById('extractedSeatLabel');

const saveImageBtn = document.getElementById('saveImageBtn');
const printBtn = document.getElementById('printBtn');
const resetBtn = document.getElementById('resetBtn');

const soundToggleBtn = document.getElementById('soundToggleBtn');
const themeToggleBtn = document.getElementById('themeToggleBtn');

const modalOverlay = document.getElementById('modalOverlay');
const modalContent = document.getElementById('modalContent');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalCancelBtn = document.getElementById('modalCancelBtn');
const modalConfirmBtn = document.getElementById('modalConfirmBtn');

// Initialize App
window.addEventListener('DOMContentLoaded', () => {
  loadFromLocalStorage();
  setupEventListeners();
  updateRosterInfo();
  applyLayoutPreset();
  renderGrid();
});

// Event Listeners Configuration
function setupEventListeners() {
  // Roster input listener
  rosterInput.addEventListener('input', () => {
    updateRosterInfo();
    saveToLocalStorage();
  });

  // Grid dimensions
  rowsInput.addEventListener('change', () => {
    state.rows = parseInt(rowsInput.value, 10) || 5;
    applyLayoutPreset();
    renderGrid();
    saveToLocalStorage();
  });
  colsInput.addEventListener('change', () => {
    state.cols = parseInt(colsInput.value, 10) || 6;
    applyLayoutPreset();
    renderGrid();
    saveToLocalStorage();
  });

  // Layout template presets
  presetSelect.addEventListener('change', () => {
    state.layoutPreset = presetSelect.value;
    applyLayoutPreset();
    renderGrid();
    saveToLocalStorage();
  });

  // Avoid pairs management
  addAvoidBtn.addEventListener('click', addAvoidPair);
  
  // Main draw trigger
  startBatchBtn.addEventListener('click', startDrawWorkflow);

  // Mode selection buttons
  const modeButtons = document.querySelectorAll('.modes-selectors .mode-btn');
  modeButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const mode = e.target.getAttribute('data-mode');
      switchMode(mode);
    });
  });

  // Action triggers
  saveImageBtn.addEventListener('click', downloadAsImage);
  printBtn.addEventListener('click', () => window.print());
  resetBtn.addEventListener('click', resetSession);

  // Sound and Theme toggles
  soundToggleBtn.addEventListener('click', toggleSoundSetting);
  themeToggleBtn.addEventListener('click', toggleThemeSetting);

  // Modal Cancel
  modalCancelBtn.addEventListener('click', closeModal);
}

// Sound and Theme handlers
function toggleSoundSetting() {
  state.soundEnabled = !state.soundEnabled;
  audioService.toggleSound(state.soundEnabled);
  soundToggleBtn.textContent = state.soundEnabled ? '🔊' : '🔇';
  saveToLocalStorage();
}

function toggleThemeSetting() {
  state.darkTheme = !state.darkTheme;
  document.documentElement.setAttribute('data-theme', state.darkTheme ? 'dark' : 'light');
  themeToggleBtn.textContent = state.darkTheme ? '☀️' : '🌙';
  saveToLocalStorage();
}

// LocalStorage helpers
function saveToLocalStorage() {
  const data = {
    rosterText: rosterInput.value,
    rows: state.rows,
    cols: state.cols,
    layoutPreset: state.layoutPreset,
    avoidPairs: state.avoidPairs,
    excludedSeats: state.excludedSeats,
    fixedSeats: Array.from(state.fixedSeats.entries()),
    soundEnabled: state.soundEnabled,
    darkTheme: state.darkTheme
  };
  localStorage.setItem('seatpick_config', JSON.stringify(data));
}

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem('seatpick_config');
    if (!raw) return;

    const data = JSON.parse(raw);
    rosterInput.value = data.rosterText || '';
    state.rows = data.rows || 5;
    state.cols = data.cols || 6;
    state.layoutPreset = data.layoutPreset || 'classic';
    state.avoidPairs = data.avoidPairs || [];
    state.excludedSeats = data.excludedSeats || [];
    state.fixedSeats = new Map(data.fixedSeats || []);
    state.soundEnabled = data.soundEnabled !== undefined ? data.soundEnabled : true;
    state.darkTheme = data.darkTheme !== undefined ? data.darkTheme : false;

    // Apply values to inputs
    rowsInput.value = state.rows;
    colsInput.value = state.cols;
    presetSelect.value = state.layoutPreset;
    
    // Sound & Theme UI
    audioService.toggleSound(state.soundEnabled);
    soundToggleBtn.textContent = state.soundEnabled ? '🔊' : '🔇';
    document.documentElement.setAttribute('data-theme', state.darkTheme ? 'dark' : 'light');
    themeToggleBtn.textContent = state.darkTheme ? '☀️' : '🌙';

    renderAvoidList();
  } catch (e) {
    console.error('Error loading config from LocalStorage', e);
  }
}

// Roster Parsing & Stats
function updateRosterInfo() {
  state.students = parseRoster(rosterInput.value);
  studentCountBadge.textContent = `${state.students.length}명`;
}

// Preset logic to set default excluded tiles
function applyLayoutPreset() {
  state.excludedSeats = [];
  const rows = state.rows;
  const cols = state.cols;

  if (state.layoutPreset === 'pairs') {
    // Exclude columns to make pairs (e.g. spaces at column index 2, 5, 8...)
    // Creates a corridor layout: Desk Desk | Corridor | Desk Desk | Corridor...
    for (let r = 0; r < rows; r++) {
      for (let c = 2; c < cols; c += 3) {
        if (c < cols - 1) { // Only make corridor if not the very last column
          state.excludedSeats.push(r * cols + c);
        }
      }
    }
  } else if (state.layoutPreset === 'groups3') {
    // Three blocks of desks: column 2 and column 5 are corridors (0-indexed)
    for (let r = 0; r < rows; r++) {
      if (cols > 2) state.excludedSeats.push(r * cols + 2);
      if (cols > 5) state.excludedSeats.push(r * cols + 5);
    }
  } else if (state.layoutPreset === 'ushape') {
    // U-shape desk setup: exclude middle tables except perimeter
    // Perimeter is row 0 (front? No, let's keep bottom row rows-1, left col 0, right col cols-1)
    // Actually classroom blackboard is top, so row 0 is front. Let's make U shape where bottom row rows-1,
    // and outer columns 0 and cols-1 are desks. The middle of row 0 to rows-2 are empty corridors.
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        state.excludedSeats.push(r * cols + c);
      }
    }
  }
}

// Add non-preferred combinations (avoid pairs)
function addAvoidPair() {
  const name1 = avoidName1.value.trim();
  const name2 = avoidName2.value.trim();

  if (!name1 || !name2) return;
  if (name1 === name2) {
    showAlert('동일한 이름을 입력할 수 없습니다.');
    return;
  }

  // Check if pair already exists
  const exists = state.avoidPairs.some(pair => 
    (pair[0] === name1 && pair[1] === name2) || (pair[0] === name2 && pair[1] === name1)
  );

  if (exists) {
    showAlert('이미 등록된 비선호 조합입니다.');
    return;
  }

  state.avoidPairs.push([name1, name2]);
  avoidName1.value = '';
  avoidName2.value = '';

  audioService.playClick();
  renderAvoidList();
  saveToLocalStorage();
}

function removeAvoidPair(idx) {
  state.avoidPairs.splice(idx, 1);
  audioService.playReset();
  renderAvoidList();
  saveToLocalStorage();
}

function renderAvoidList() {
  avoidList.innerHTML = '';
  state.avoidPairs.forEach((pair, idx) => {
    const div = document.createElement('div');
    div.className = 'avoid-item';
    div.innerHTML = `
      <span>❌ ${pair[0]} ↔️ ${pair[1]}</span>
      <button class="btn-danger-text" data-idx="${idx}">제거</button>
    `;
    div.querySelector('button').addEventListener('click', () => removeAvoidPair(idx));
    avoidList.appendChild(div);
  });
}

// Grid Seating Renderer
function renderGrid() {
  classroomGrid.innerHTML = '';
  classroomGrid.style.gridTemplateColumns = `repeat(${state.cols}, 1fr)`;
  // Setup CSS variable for print
  document.documentElement.style.setProperty('--grid-cols', state.cols);

  const totalSeats = state.rows * state.cols;

  for (let i = 0; i < totalSeats; i++) {
    const seatIdx = i;
    const deskElement = document.createElement('div');
    deskElement.className = 'desk';
    deskElement.setAttribute('data-index', seatIdx);

    // Render Desk Number
    const row = Math.floor(i / state.cols) + 1;
    const col = (i % state.cols) + 1;
    deskElement.innerHTML = `<span class="desk-number">${row}-${col}</span>`;

    // Visual styles based on gameState
    if (state.gameState === 'setup') {
      // Setup Mode: Toggle Excluded/Fixed/Normal
      if (state.excludedSeats.includes(seatIdx)) {
        deskElement.classList.add('excluded');
        deskElement.innerHTML += `
          <span class="desk-status-icon">🚫</span>
          <span class="student-name">제외석</span>
        `;
      } else if (state.fixedSeats.has(seatIdx)) {
        deskElement.classList.add('fixed');
        const studentName = state.fixedSeats.get(seatIdx);
        // Find if this student is front-row
        const sObj = state.students.find(s => s.name === studentName);
        const tokenVal = sObj ? sObj.tokens : 0;
        
        deskElement.innerHTML += `
          <span class="desk-status-icon">🔒</span>
          <span class="student-name">${studentName}</span>
          ${tokenVal > 0 ? `<span class="token-badge">${tokenVal}</span>` : ''}
        `;
      } else {
        deskElement.classList.add('empty');
        deskElement.innerHTML += `
          <span class="desk-status-icon">🪑</span>
          <span class="student-name" style="font-size:0.75rem; color:var(--text-secondary);">빈 좌석</span>
        `;
      }

      // Add Click Listener to toggle/configure desk
      deskElement.addEventListener('click', () => handleDeskSetupClick(seatIdx));

    } else if (state.gameState === 'prioritySelection') {
      // Priority Choice Phase: Enable choosing
      const isExcluded = state.excludedSeats.includes(seatIdx);
      const isFixed = state.fixedSeats.has(seatIdx);
      const isOccupied = state.revealedLayout[seatIdx] !== null && state.revealedLayout[seatIdx] !== undefined;

      if (isExcluded) {
        deskElement.classList.add('excluded');
        deskElement.innerHTML += `<span class="student-name">제외석</span>`;
      } else if (isFixed) {
        deskElement.classList.add('fixed');
        deskElement.innerHTML += `
          <span class="desk-status-icon">🔒</span>
          <span class="student-name">${state.fixedSeats.get(seatIdx)}</span>
        `;
      } else if (isOccupied) {
        // Already selected by another priority student
        const occupant = state.revealedLayout[seatIdx];
        const studentObj = state.students.find(s => s.name === occupant);
        const tokens = studentObj ? studentObj.tokens : 0;
        deskElement.innerHTML += `
          <span class="student-name">${occupant}</span>
          ${tokens > 0 ? `<span class="token-badge">${tokens}</span>` : ''}
        `;
      } else {
        // Seat is open for priority choice!
        deskElement.classList.add('priority-selectable');
        deskElement.innerHTML += `
          <span class="desk-status-icon">⭐️</span>
          <span class="student-name" style="font-size:0.75rem; color:var(--accent-emerald);">선택 가능</span>
        `;
        deskElement.addEventListener('click', () => selectPrioritySeat(seatIdx));
      }

    } else {
      // Playing Seating / Reveal modes
      const item = state.revealedLayout[seatIdx];
      const isExcluded = state.excludedSeats.includes(seatIdx);

      if (isExcluded) {
        deskElement.classList.add('excluded');
        deskElement.innerHTML += `<span class="student-name">제외석</span>`;
      } else if (item) {
        // Revealed occupant (or fixed)
        const studentObj = state.students.find(s => s.name === item);
        const tokens = studentObj ? studentObj.tokens : 0;
        const isFixed = state.fixedSeats.has(seatIdx);

        if (isFixed) deskElement.classList.add('fixed');
        
        deskElement.innerHTML += `
          <span class="student-name">${item}</span>
          ${isFixed ? '<span class="desk-status-icon" style="font-size:0.6rem; position:absolute; top:5px; right:8px;">🔒</span>' : ''}
          ${tokens > 0 ? `<span class="token-badge">${tokens}</span>` : ''}
        `;
      } else {
        // Unrevealed seat
        if (state.currentMode === 'card') {
          // Card Flip mode shows a flipping 3D card
          const cardWrapper = document.createElement('div');
          cardWrapper.className = 'desk-card-wrapper';
          cardWrapper.innerHTML = `
            <div class="desk-card-inner">
              <div class="desk-card-back">
                <span class="question-mark">?</span>
              </div>
              <div class="desk-card-front">
                <span class="student-name">${state.targetLayout[seatIdx]}</span>
              </div>
            </div>
          `;
          cardWrapper.addEventListener('click', () => flipCard(seatIdx, cardWrapper));
          deskElement.innerHTML = '';
          deskElement.className = 'desk-card-container';
          deskElement.appendChild(cardWrapper);
        } else {
          // Other modes: show empty layout placeholder
          deskElement.classList.add('empty');
          deskElement.innerHTML += `
            <span class="desk-status-icon">❓</span>
          `;
        }
      }
    }

    classroomGrid.appendChild(deskElement);
  }
}

// Handles clicking desks in Setup Mode
function handleDeskSetupClick(seatIdx) {
  // Read active tool selected
  const activeRadio = document.querySelector('input[name="deskEditMode"]:checked');
  const mode = activeRadio ? activeRadio.value : 'normal';
  const isFrontRowChecked = document.getElementById('deskFrontRowToggle').checked;

  if (mode === 'exclude') {
    // Exclude mode
    state.fixedSeats.delete(seatIdx);
    const exIdx = state.excludedSeats.indexOf(seatIdx);
    if (exIdx > -1) {
      state.excludedSeats.splice(exIdx, 1);
    } else {
      state.excludedSeats.push(seatIdx);
    }
    audioService.playClick();
    renderGrid();
    saveToLocalStorage();
  } else if (mode === 'fixed') {
    // Fixed seat mode: Choose which student to lock here
    if (state.excludedSeats.includes(seatIdx)) {
      showAlert('제외석에는 학생을 고정할 수 없습니다.');
      return;
    }
    
    // Open Student list picker modal
    openFixedStudentModal(seatIdx);
  } else {
    // Normal seat mode
    state.fixedSeats.delete(seatIdx);
    const exIdx = state.excludedSeats.indexOf(seatIdx);
    if (exIdx > -1) {
      state.excludedSeats.splice(exIdx, 1);
    }
    
    audioService.playReset();
    renderGrid();
    saveToLocalStorage();
  }
}

// Opens modal to map a student to a fixed desk
function openFixedStudentModal(seatIdx) {
  updateRosterInfo();
  if (state.students.length === 0) {
    showAlert('먼저 학생 명렬을 입력해 주세요.');
    return;
  }

  modalTitle.textContent = '고정석 학생 지정';
  
  // List students not already fixed
  const currentlyFixedNames = Array.from(state.fixedSeats.values());
  const eligibleStudents = state.students.filter(s => !currentlyFixedNames.includes(s.name));

  if (eligibleStudents.length === 0) {
    modalBody.innerHTML = '<p style="color:var(--text-secondary);">고정할 수 있는 대기 학생이 없습니다.</p>';
    modalConfirmBtn.style.display = 'none';
  } else {
    let html = `
      <p style="margin-bottom:0.75rem; font-size:0.9rem;">이 자리에 고정 배치할 학생을 선택해 주세요:</p>
      <div style="max-height:220px; overflow-y:auto; display:flex; flex-direction:column; gap:0.5rem;">
    `;
    eligibleStudents.forEach(s => {
      html += `
        <label style="display:flex; align-items:center; gap:0.5rem; padding:0.5rem; background:rgba(255,255,255,0.05); border-radius:6px; cursor:pointer;">
          <input type="radio" name="modalStudentSelect" value="${s.name}">
          <span><strong>${s.name}</strong> ${s.tokens > 0 ? `(가산점: ${s.tokens})` : ''}</span>
        </label>
      `;
    });
    html += `</div>`;
    modalBody.innerHTML = html;
    modalConfirmBtn.style.display = 'block';
    
    // Setup Confirm Trigger
    modalConfirmBtn.onclick = () => {
      const selectedRadio = document.querySelector('input[name="modalStudentSelect"]:checked');
      if (selectedRadio) {
        const studentName = selectedRadio.value;
        
        // If "시력보호" checkbox is ticked during fixed assignment, mark student
        const isFrontRowChecked = document.getElementById('deskFrontRowToggle').checked;
        const studentIndex = state.students.findIndex(s => s.name === studentName);
        if (studentIndex > -1 && isFrontRowChecked) {
          state.students[studentIndex].frontRow = true;
          // Sync frontRow back to text string if needed, or we just keep local state
          // For consistency, let's keep it in local state. Roster textarea contains raw name.
        }
        
        state.fixedSeats.set(seatIdx, studentName);
        audioService.playSuccess();
        closeModal();
        renderGrid();
        saveToLocalStorage();
      }
    };
  }

  modalOverlay.style.display = 'flex';
}

// ----------------------------------------------------
// 🚀 DRAWING WORKFLOW STATE MACHINE
// ----------------------------------------------------
function startDrawWorkflow() {
  updateRosterInfo();
  
  if (state.students.length === 0) {
    showAlert('학생 명렬이 비어 있습니다. 먼저 입력해 주세요.');
    return;
  }

  // Count available seats
  const totalSeats = state.rows * state.cols;
  const activeSeats = totalSeats - state.excludedSeats.length;

  if (state.students.length > activeSeats) {
    showAlert(`좌석이 부족합니다!<br>학생 수: ${state.students.length}명 <br>이용 가능한 좌석 수: ${activeSeats}개`);
    return;
  }

  // 1. Prepare Priority Selection Queue (Token Mode)
  const isTokenModeActive = tokenModeCheckbox.checked;
  if (isTokenModeActive) {
    // Filter students with tokens > 0 who are NOT already in fixed seats
    const fixedStudentNames = new Set(state.fixedSeats.values());
    state.priorityQueue = state.students
      .filter(s => s.tokens > 0 && !fixedStudentNames.has(s.name))
      .sort((a, b) => b.tokens - a.tokens);
  } else {
    state.priorityQueue = [];
  }

  // Clean layouts
  state.revealedLayout = new Array(totalSeats).fill(null);
  // Apply excluded seats & fixed seats to revealed layout
  state.excludedSeats.forEach(idx => state.revealedLayout[idx] = 'EXCLUDED');
  for (const [idx, name] of state.fixedSeats.entries()) {
    state.revealedLayout[idx] = name;
  }

  // Check if we need to enter Priority Selection Phase
  if (state.priorityQueue.length > 0) {
    state.gameState = 'prioritySelection';
    state.priorityIndex = 0;
    setupPrioritySelectionStep();
  } else {
    // No priority phase, generate final seating layout immediately
    runGenerateSeatingAlgorithm();
  }
}

// Step-by-step setup for Priority Selection
function setupPrioritySelectionStep() {
  if (state.priorityIndex < state.priorityQueue.length) {
    const student = state.priorityQueue[state.priorityIndex];
    priorityBanner.style.display = 'flex';
    priorityStudentName.textContent = student.name;
    priorityStudentTokens.textContent = student.tokens;
    
    // Hide controls
    sidebar.classList.add('collapsed');
    modesBar.style.display = 'none';
    
    audioService.playClick();
    renderGrid();
  } else {
    // All priority students finished selecting!
    priorityBanner.style.display = 'none';
    runGenerateSeatingAlgorithm();
  }
}

// Action when a priority student chooses their seat
function selectPrioritySeat(seatIdx) {
  const student = state.priorityQueue[state.priorityIndex];
  
  // Assign seat
  state.revealedLayout[seatIdx] = student.name;
  
  // Save as temporarily fixed seat for this round of calculation
  // (so standard shuffle won't replace this seat)
  state.fixedSeats.set(seatIdx, student.name);

  // Advance
  state.priorityIndex++;
  audioService.playSuccess();
  setupPrioritySelectionStep();
}

// Calculates full seating layout using algorithm.js
function runGenerateSeatingAlgorithm() {
  const result = generateSeating({
    students: state.students,
    rows: state.rows,
    cols: state.cols,
    excludedSeats: state.excludedSeats,
    fixedSeats: state.fixedSeats,
    avoidPairs: state.avoidPairs
  });

  if (!result.success && result.violationsCount > 0) {
    // Show non-blocking warning if constraints are too tight
    showAlert(`⚠️ 조건 만족 실패: 모든 비선호 짝꿍 분리 조건을 완벽히 만족하지 못했습니다. (최소 충돌수: ${result.violationsCount}개)<br>이대로 배치를 진행합니다.`);
  }

  state.targetLayout = result.layout;
  state.gameState = 'picking';
  
  // Hide priority banner, show controls
  priorityBanner.style.display = 'none';
  sidebar.classList.add('collapsed');
  modesBar.style.display = 'flex';

  // Prepare unrevealed student lists
  // Find which students are already revealed (fixed or priority-assigned)
  const preRevealed = new Set();
  state.excludedSeats.forEach(idx => preRevealed.add('EXCLUDED'));
  for (const [idx, name] of state.fixedSeats.entries()) {
    preRevealed.add(name);
  }

  // Remaining students to reveal
  state.unrevealedNames = state.students
    .map(s => s.name)
    .filter(name => !preRevealed.has(name));

  // Initialize revealedLayout for the reveal process
  state.revealedLayout = new Array(state.rows * state.cols).fill(null);
  state.excludedSeats.forEach(idx => state.revealedLayout[idx] = 'EXCLUDED');
  for (const [idx, name] of state.fixedSeats.entries()) {
    state.revealedLayout[idx] = name;
  }

  // Direct switch to active mode UI
  switchMode(state.currentMode);
}

// Switch between game reveal modes
function switchMode(mode) {
  state.currentMode = mode;
  
  // Update button active state
  document.querySelectorAll('.modes-selectors .mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
  });

  // Hide all drawing arenas by default
  rouletteArena.style.display = 'none';
  drawBoxArena.style.display = 'none';
  classroomGrid.style.display = 'grid';

  if (state.gameState === 'picking') {
    if (mode === 'classic') {
      triggerClassicReveal();
    } else if (mode === 'roulette') {
      setupRouletteArena();
    } else if (mode === 'card') {
      renderGrid(); // Cards rendered in grid view
    } else if (mode === 'box') {
      setupLuckyDrawArena();
    }
  } else {
    // If not actively drawing (i.e. completed or setup), just render standard grid
    renderGrid();
  }
}

// ----------------------------------------------------
// 🎲 MODE 1: CLASSIC RANDOM REVEAL
// ----------------------------------------------------
function triggerClassicReveal() {
  if (state.isAnimating) return;
  state.isAnimating = true;

  // Stagger reveal of all unrevealed seats
  const drumCtx = audioService.startDrumroll();

  // Find all indices that need to be revealed
  const revealTargets = [];
  for (let i = 0; i < state.targetLayout.length; i++) {
    if (state.targetLayout[i] && !state.revealedLayout[i]) {
      revealTargets.push({ index: i, name: state.targetLayout[i] });
    }
  }

  // Shuffle target reveal orders so they pop up randomly
  const shuffleArray = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  shuffleArray(revealTargets);

  let step = 0;
  const intervalTime = Math.max(50, Math.min(200, 1500 / (revealTargets.length || 1)));

  const timer = setInterval(() => {
    if (step < revealTargets.length) {
      const target = revealTargets[step];
      state.revealedLayout[target.index] = target.name;
      
      // Update cell UI directly without complete repaint for performance
      const deskCell = document.querySelector(`.desk[data-index="${target.index}"]`);
      if (deskCell) {
        deskCell.className = 'desk';
        const sObj = state.students.find(s => s.name === target.name);
        const tokens = sObj ? sObj.tokens : 0;
        
        deskCell.innerHTML = `
          <span class="desk-number">${Math.floor(target.index/state.cols)+1}-${(target.index%state.cols)+1}</span>
          <span class="student-name">${target.name}</span>
          ${tokens > 0 ? `<span class="token-badge">${tokens}</span>` : ''}
        `;
        // Scale animate
        deskCell.style.transform = 'scale(1.15)';
        setTimeout(() => deskCell.style.transform = 'none', 150);
      }
      
      audioService.playClick();
      step++;
    } else {
      clearInterval(timer);
      if (drumCtx) drumCtx.stop();
      audioService.playSuccess();
      state.isAnimating = false;
      state.gameState = 'completed';
      state.unrevealedNames = [];
      showCompletionMessage();
    }
  }, intervalTime);
}

// ----------------------------------------------------
// 🎡 MODE 2: ROULETTE WHEEL
// ----------------------------------------------------
let rouletteNames = [];
let currentRotation = 0;

function setupRouletteArena() {
  if (state.unrevealedNames.length === 0) {
    state.gameState = 'completed';
    renderGrid();
    showCompletionMessage();
    return;
  }

  classroomGrid.style.display = 'none';
  rouletteArena.style.display = 'flex';
  drawBoxArena.style.display = 'none';

  rouletteNames = [...state.unrevealedNames];
  drawRouletteWheel();
}

function drawRouletteWheel() {
  rouletteWheel.innerHTML = '';
  
  const totalSlices = rouletteNames.length;
  const cx = 100, cy = 100, r = 85;
  const sliceAngle = 360 / totalSlices;

  // Curated wheel colors
  const colors = ['#6366f1', '#a855f7', '#10b981', '#f59e0b', '#f43f5e', '#06b6d4'];

  rouletteNames.forEach((name, i) => {
    const startAngle = i * sliceAngle;
    const endAngle = (i + 1) * sliceAngle;

    // Convert polar to cartesian coordinates
    const rad1 = ((startAngle - 90) * Math.PI) / 180;
    const rad2 = ((endAngle - 90) * Math.PI) / 180;

    const x1 = cx + r * Math.cos(rad1);
    const y1 = cy + r * Math.sin(rad1);
    const x2 = cx + r * Math.cos(rad2);
    const y2 = cy + r * Math.sin(rad2);

    // SVG path for a circle wedge
    const largeArcFlag = sliceAngle > 180 ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', colors[i % colors.length]);
    path.setAttribute('stroke', '#ffffff');
    path.setAttribute('stroke-width', '1');

    // Add Name label inside slice
    const textAngle = startAngle + sliceAngle / 2;
    const textRad = ((textAngle - 90) * Math.PI) / 180;
    // Put text at 65% of radius
    const tx = cx + (r * 0.6) * Math.cos(textRad);
    const ty = cy + (r * 0.6) * Math.sin(textRad);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', tx);
    text.setAttribute('y', ty);
    text.setAttribute('fill', '#ffffff');
    text.setAttribute('font-size', totalSlices > 15 ? '5' : totalSlices > 10 ? '7' : '9');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('text-anchor', 'middle');
    // Rotate text to match slice angle
    text.setAttribute('transform', `rotate(${textAngle}, ${tx}, ${ty})`);
    text.textContent = name;

    rouletteWheel.appendChild(path);
    rouletteWheel.appendChild(text);
  });

  // Attach click listener
  spinWheelBtn.onclick = spinRoulette;
}

function spinRoulette() {
  if (state.isAnimating || rouletteNames.length === 0) return;
  state.isAnimating = true;
  spinWheelBtn.disabled = true;

  // Decide winning index
  const winnerIndex = Math.floor(Math.random() * rouletteNames.length);
  const winnerName = rouletteNames[winnerIndex];

  // Calculate rotation angle to align winner wedge with the pointer at the top (270 degrees on SVG)
  // Pointer is at 12 o'clock (270 deg). Slices start at 12 o'clock and go clockwise.
  const sliceAngle = 360 / rouletteNames.length;
  const targetAngle = winnerIndex * sliceAngle + sliceAngle / 2;
  
  // Rotate extra 4-6 full spins, subtract targetAngle to align with top pointer
  const spinRotations = 4 + Math.floor(Math.random() * 3);
  currentRotation += spinRotations * 360 - targetAngle - (currentRotation % 360);

  rouletteWheel.style.transform = `rotate(${currentRotation}deg)`;

  // Simulate tick sounds during rotation deceleration
  let ticksCount = 0;
  const totalTicks = 35;
  const startSpeed = 50; // ms
  
  const playWheelTick = (index) => {
    if (index >= totalTicks) return;
    audioService.playClick();
    
    // Decelerating interval curve
    const delay = startSpeed + Math.pow(index / 1.7, 2.2);
    setTimeout(() => {
      playWheelTick(index + 1);
    }, delay);
  };
  playWheelTick(0);

  // Animation end callback
  setTimeout(() => {
    audioService.playSuccess();
    
    // Find where the student belongs in targetLayout
    const seatIdx = state.targetLayout.indexOf(winnerName);
    state.revealedLayout[seatIdx] = winnerName;
    
    // Remove from unrevealed pool
    state.unrevealedNames = state.unrevealedNames.filter(n => n !== winnerName);

    // Show temporary overlay dialog celebrating winner
    showWinnerCelebration(winnerName, seatIdx);
  }, 6100); // Must match transition duration of roulette-wheel (6s)
}

function showWinnerCelebration(name, seatIdx) {
  const row = Math.floor(seatIdx / state.cols) + 1;
  const col = (seatIdx % state.cols) + 1;

  modalTitle.innerHTML = '🎉 룰렛 당첨!';
  modalBody.innerHTML = `
    <div style="text-align:center; padding:1rem;">
      <div style="font-size:3rem; font-weight:bold; color:var(--primary); margin-bottom:1rem;">${name}</div>
      <p style="font-size:1.1rem; font-weight:500;">
        👉 <span style="color:var(--accent-purple); font-weight:bold;">${row}열 ${col}번째 자리</span>에 배치되었습니다!
      </p>
    </div>
  `;
  modalConfirmBtn.textContent = '자리 확인';
  modalCancelBtn.style.display = 'none';

  modalConfirmBtn.onclick = () => {
    closeModal();
    // Return to grid and highlight the seat
    rouletteArena.style.display = 'none';
    classroomGrid.style.display = 'grid';
    renderGrid();

    // Highlight new seat
    const cell = document.querySelector(`.desk[data-index="${seatIdx}"]`);
    if (cell) {
      cell.style.background = 'var(--primary-glow)';
      cell.style.transform = 'scale(1.1)';
      setTimeout(() => {
        cell.style.background = '';
        cell.style.transform = '';
      }, 2000);
    }

    state.isAnimating = false;
    spinWheelBtn.disabled = false;

    // Check if fully completed
    if (state.unrevealedNames.length === 0) {
      state.gameState = 'completed';
      showCompletionMessage();
    } else {
      // Go back to roulette setup
      setupRouletteArena();
    }
  };

  modalOverlay.style.display = 'flex';
}

// ----------------------------------------------------
// 🃏 MODE 3: CARD FLIP
// ----------------------------------------------------
function flipCard(seatIdx, cardWrapper) {
  if (cardWrapper.classList.contains('flipped') || state.isAnimating) return;

  audioService.playSwoosh();
  cardWrapper.classList.add('flipped');

  // Sync to revealed layout
  const name = state.targetLayout[seatIdx];
  state.revealedLayout[seatIdx] = name;
  state.unrevealedNames = state.unrevealedNames.filter(n => n !== name);

  if (state.unrevealedNames.length === 0) {
    state.gameState = 'completed';
    setTimeout(() => {
      audioService.playSuccess();
      showCompletionMessage();
    }, 800);
  }
}

// ----------------------------------------------------
// 🎁 MODE 4: LUCKY DRAW BOX
// ----------------------------------------------------
function setupLuckyDrawArena() {
  if (state.unrevealedNames.length === 0) {
    state.gameState = 'completed';
    renderGrid();
    showCompletionMessage();
    return;
  }

  classroomGrid.style.display = 'none';
  rouletteArena.style.display = 'none';
  drawBoxArena.style.display = 'flex';

  // Make box clickable
  luckyDrawBox.className = 'draw-box';
  extractedCard.style.display = 'none';
  luckyDrawBox.onclick = pullFromNameBox;
}

function pullFromNameBox() {
  if (state.isAnimating || state.unrevealedNames.length === 0) return;
  state.isAnimating = true;

  luckyDrawBox.className = 'draw-box shaking';
  extractedCard.style.display = 'none';
  
  // Play repetitive shake sound
  const shakeAudioInterval = setInterval(() => {
    audioService.playShake();
  }, 150);

  setTimeout(() => {
    clearInterval(shakeAudioInterval);
    luckyDrawBox.className = 'draw-box';

    // Pick random winner
    const winnerName = state.unrevealedNames[Math.floor(Math.random() * state.unrevealedNames.length)];
    const seatIdx = state.targetLayout.indexOf(winnerName);
    
    // Reveal
    state.revealedLayout[seatIdx] = winnerName;
    state.unrevealedNames = state.unrevealedNames.filter(n => n !== winnerName);

    // Render extracted card details
    extractedName.textContent = winnerName;
    const row = Math.floor(seatIdx / state.cols) + 1;
    const col = (seatIdx % state.cols) + 1;
    extractedSeatLabel.textContent = `📂 ${row}열 ${col}번째 자리 배정`;

    audioService.playSuccess();
    extractedCard.style.display = 'block';

    // Wait a brief period, then allow user to place them and draw again
    setTimeout(() => {
      state.isAnimating = false;
      
      // Let user click box again, or if finished, switch to completed
      if (state.unrevealedNames.length === 0) {
        state.gameState = 'completed';
        showAlert('모든 학생의 자리가 배치 완료되었습니다!');
        
        // Show layout
        drawBoxArena.style.display = 'none';
        classroomGrid.style.display = 'grid';
        renderGrid();
        showCompletionMessage();
      }
    }, 2000);

  }, 1200); // Shake duration
}

// ----------------------------------------------------
// 📸 EXPORT UTILITIES (html2canvas)
// ----------------------------------------------------
function downloadAsImage() {
  // Ensure we are viewing the classroom grid
  if (classroomGrid.style.display === 'none') {
    showAlert('자리 배치 결과판(그리드)이 보여야 이미지를 저장할 수 있습니다. 모드를 클래식이나 카드로 변경해 주세요.');
    return;
  }

  // Visual feedback
  const origBorder = classroomGrid.style.border;
  classroomGrid.style.border = 'none';

  // Wait a fraction of a second to prevent visual glitch
  setTimeout(() => {
    html2canvas(classroomGrid, {
      backgroundColor: document.documentElement.getAttribute('data-theme') === 'dark' ? '#0f172a' : '#ffffff',
      scale: 2 // Higher resolution
    }).then(canvas => {
      const link = document.createElement('a');
      link.download = '학급자리배치_SeatPick.png';
      link.href = canvas.toDataURL();
      link.click();

      classroomGrid.style.border = origBorder;
      audioService.playSuccess();
    }).catch(err => {
      console.error('Error saving image', err);
      showAlert('이미지 캡처 중 오류가 발생했습니다.');
    });
  }, 100);
}

// Session Reset
function resetSession() {
  state.gameState = 'setup';
  // Retrieve fixed seats from memory config, or clean it?
  // Clean dynamic selection state
  state.targetLayout = [];
  state.revealedLayout = [];
  state.priorityQueue = [];
  
  // Keep original fixed seats & exclusions
  // Restore sidebar
  sidebar.classList.remove('collapsed');
  
  audioService.playReset();
  switchMode('classic');
  renderGrid();
}

function resetSessionCompletely() {
  // Wipe fixed seats and exclusions too
  state.excludedSeats = [];
  state.fixedSeats.clear();
  resetSession();
  saveToLocalStorage();
}

// ----------------------------------------------------
// 💬 DIALOG & UTILITY WRAPPERS
// ----------------------------------------------------
function showAlert(message) {
  modalTitle.textContent = '안내';
  modalBody.innerHTML = `<p style="font-size:0.95rem; line-height:1.5;">${message}</p>`;
  modalConfirmBtn.textContent = '확인';
  modalConfirmBtn.onclick = closeModal;
  modalCancelBtn.style.display = 'none';
  modalOverlay.style.display = 'flex';
}

function showCompletionMessage() {
  // Show brief floating congratulations
  const banner = document.createElement('div');
  banner.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(90deg, var(--primary), var(--accent-emerald));
    color: white;
    padding: 0.8rem 2rem;
    border-radius: 50px;
    font-weight: bold;
    z-index: 10000;
    box-shadow: 0 10px 25px rgba(99,102,241,0.4);
    animation: slideDown 0.3s ease-out;
  `;
  banner.textContent = '🎉 모든 자리 배치가 완료되었습니다!';
  document.body.appendChild(banner);

  setTimeout(() => {
    banner.style.animation = 'fadeOut 0.5s ease-in';
    setTimeout(() => banner.remove(), 500);
  }, 3000);
}

function closeModal() {
  modalOverlay.style.display = 'none';
}
