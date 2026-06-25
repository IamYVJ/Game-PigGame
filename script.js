'use strict';

// Selecting elements
const player0El = document.querySelector('.player--0');
const player1El = document.querySelector('.player--1');
const score0El = document.querySelector('#score--0');
const score1El = document.getElementById('score--1');
const current0El = document.getElementById('current--0');
const current1El = document.getElementById('current--1');

const diceEl = document.querySelector('.dice');
const btnNew = document.querySelector('.btn--new');
const btnRoll = document.querySelector('.btn--roll');
const btnHold = document.querySelector('.btn--hold');
const btnRules = document.querySelector('.btn--rules');
const btnOptimalInfo = document.querySelector('.btn--optimal-info');
const rulesModalEl = document.querySelector('.modal--rules');
const optimalModalEl = document.querySelector('.modal--optimal');
const overlayEl = document.querySelector('.overlay');

let scores, currentScore, activePlayer, playing;

// ----- Optimal play indicator (Neller & Presser, win-probability optimal) -----
const optimalCheckbox = document.querySelector('.optimal-checkbox');
const hint0El = document.getElementById('hint--0');
const hint1El = document.getElementById('hint--1');

const TARGET = 100;
let optimalOn = false;
let policyP = null; // win-probability table for the player to move, computed lazily

// P[i][j][k]: probability the player to move (score i, opponent j, turn total k) wins.
const pIdx = (i, j, k) => (i * 100 + j) * 100 + k;

// Solve the win-probability fixed point by value iteration (Gauss-Seidel sweeps).
const computeOptimalPolicy = function () {
  const P = new Float64Array(100 * 100 * 100).fill(0.5);

  for (let sweep = 0; sweep < 100; sweep++) {
    let maxDelta = 0;
    for (let i = 99; i >= 0; i--) {
      for (let j = 99; j >= 0; j--) {
        for (let k = 99 - i; k >= 0; k--) {
          // Hold: bank i + k (< 100 here), then opponent moves.
          const pHold = 1 - P[pIdx(j, i + k, 0)];

          // Roll: 1/6 lose the turn, else accumulate (reaching 100 wins).
          let pRoll = 1 - P[pIdx(j, i, 0)];
          for (let r = 2; r <= 6; r++) {
            const nk = k + r;
            pRoll += i + nk >= TARGET ? 1 : P[pIdx(i, j, nk)];
          }
          pRoll /= 6;

          const best = pRoll > pHold ? pRoll : pHold;
          const d = Math.abs(best - P[pIdx(i, j, k)]);
          if (d > maxDelta) maxDelta = d;
          P[pIdx(i, j, k)] = best;
        }
      }
    }
    if (maxDelta < 1e-9) break;
  }
  return P;
};

const recommend = function (i, j, k) {
  if (i + k >= TARGET) return { action: 'hold', winProb: 1 };

  const pHold = 1 - policyP[pIdx(j, i + k, 0)];

  let pRoll = 1 - policyP[pIdx(j, i, 0)];
  for (let r = 2; r <= 6; r++) {
    const nk = k + r;
    pRoll += i + nk >= TARGET ? 1 : policyP[pIdx(i, j, nk)];
  }
  pRoll /= 6;

  return pRoll > pHold
    ? { action: 'roll', winProb: pRoll }
    : { action: 'hold', winProb: pHold };
};

const updateOptimalHint = function () {
  hint0El.classList.add('hidden');
  hint1El.classList.add('hidden');
  btnRoll.classList.remove('btn--optimal');
  btnHold.classList.remove('btn--optimal');

  if (!optimalOn || !playing || !policyP) return;

  const opponent = activePlayer === 0 ? 1 : 0;
  const { action, winProb } = recommend(
    scores[activePlayer],
    scores[opponent],
    currentScore
  );

  const hintEl = activePlayer === 0 ? hint0El : hint1El;
  hintEl.textContent = `💡 ${
    action === 'roll' ? 'Roll' : 'Hold'
  } · win ${Math.round(winProb * 100)}%`;
  hintEl.classList.remove('hidden');
  (action === 'roll' ? btnRoll : btnHold).classList.add('btn--optimal');
};

// ----- Computer opponent -----
const cpuCheckbox = document.querySelector('.cpu-checkbox');
const cpuDifficultyEl = document.querySelector('.cpu-difficulty');
const name1El = document.getElementById('name--1');

const CPU = 1; // Player 2 is the computer
const CPU_DELAY = 900; // ms between the computer's actions
let cpuEnabled = false;
let cpuDifficulty = 'medium';
let cpuBusy = false; // locks human input while the computer is playing
let cpuToken = 0; // bumped on new game to cancel any scheduled computer steps

const ensurePolicy = function () {
  if (!policyP) policyP = computeOptimalPolicy();
};

// Core moves, shared by the human buttons and the computer.
const doRoll = function () {
  const dice = Math.trunc(Math.random() * 6) + 1;
  diceEl.src = `dice-${dice}.png`;
  diceEl.classList.remove('hidden');

  if (dice !== 1) {
    currentScore += dice;
    document.getElementById(`current--${activePlayer}`).textContent =
      currentScore;
  } else {
    switchPlayer();
  }
  return dice;
};

const doHold = function () {
  scores[activePlayer] += currentScore;
  document.getElementById(`score--${activePlayer}`).textContent =
    scores[activePlayer];

  if (scores[activePlayer] >= 100) {
    playing = false;
    diceEl.classList.add('hidden');
    document
      .querySelector(`.player--${activePlayer}`)
      .classList.add('player--winner');
    document
      .querySelector(`.player--${activePlayer}`)
      .classList.remove('player--active');
  } else {
    switchPlayer();
  }
};

const setCpuBusy = function (busy) {
  cpuBusy = busy;
  btnRoll.disabled = busy;
  btnHold.disabled = busy;
};

// Decide the computer's move for the chosen difficulty.
const cpuDecision = function (i, j, k) {
  if (i + k >= TARGET) return 'hold'; // banking now wins the game
  if (cpuDifficulty === 'hard') {
    ensurePolicy();
    return recommend(i, j, k).action;
  }
  const holdAt = cpuDifficulty === 'easy' ? 10 : 20; // medium = classic "hold at 20"
  return k >= holdAt ? 'hold' : 'roll';
};

const maybeStartComputerTurn = function () {
  if (cpuEnabled && playing && activePlayer === CPU && !cpuBusy) {
    setCpuBusy(true);
    const token = cpuToken;
    setTimeout(() => computerStep(token), CPU_DELAY);
  }
};

// One computer action, then either schedule the next or hand control back.
const computerStep = function (token) {
  if (token !== cpuToken || !playing || !cpuEnabled || activePlayer !== CPU) {
    setCpuBusy(false);
    return;
  }

  const action = cpuDecision(scores[CPU], scores[1 - CPU], currentScore);

  if (action === 'roll') {
    const dice = doRoll();
    updateOptimalHint();
    if (dice === 1) {
      setCpuBusy(false); // busted: turn has passed back to the human
    } else {
      setTimeout(() => computerStep(token), CPU_DELAY);
    }
  } else {
    doHold();
    updateOptimalHint();
    setCpuBusy(false); // held: turn has passed back (or the game is over)
  }
};

// Starting conditions
const init = function () {
  scores = [0, 0];
  currentScore = 0;
  activePlayer = 0;
  playing = true;

  score0El.textContent = 0;
  score1El.textContent = 0;
  current0El.textContent = 0;
  current1El.textContent = 0;

  diceEl.classList.add('hidden');
  player0El.classList.remove('player--winner');
  player1El.classList.remove('player--winner');
  player0El.classList.add('player--active');
  player1El.classList.remove('player--active');

  cpuToken++; // cancel any scheduled computer steps from the previous game
  setCpuBusy(false);
  updateOptimalHint();
};
init();

const switchPlayer = function () {
  document.getElementById(`current--${activePlayer}`).textContent = 0;
  currentScore = 0;
  activePlayer = activePlayer === 0 ? 1 : 0;
  player0El.classList.toggle('player--active');
  player1El.classList.toggle('player--active');
};

// Human controls (ignored while the computer is taking its turn)
btnRoll.addEventListener('click', function () {
  if (!playing || cpuBusy) return;
  doRoll();
  updateOptimalHint();
  maybeStartComputerTurn();
});

btnHold.addEventListener('click', function () {
  if (!playing || cpuBusy) return;
  doHold();
  updateOptimalHint();
  maybeStartComputerTurn();
});

btnNew.addEventListener('click', init);

// Toggle the optimal play indicator (computes the policy lazily on first enable)
optimalCheckbox.addEventListener('change', function () {
  optimalOn = optimalCheckbox.checked;

  if (optimalOn && !policyP) {
    const hintEl = activePlayer === 0 ? hint0El : hint1El;
    hintEl.textContent = '💡 Calculating…';
    hintEl.classList.remove('hidden');
    setTimeout(function () {
      policyP = computeOptimalPolicy();
      updateOptimalHint();
    }, 30);
  } else {
    updateOptimalHint();
  }
});

// Enable / disable the computer opponent (Player 2)
cpuCheckbox.addEventListener('change', function () {
  cpuEnabled = cpuCheckbox.checked;
  cpuDifficultyEl.classList.toggle('hidden', !cpuEnabled);
  name1El.textContent = cpuEnabled ? '🤖 Computer' : 'Player 2';
  if (cpuEnabled && cpuDifficulty === 'hard') ensurePolicy();
  maybeStartComputerTurn(); // take over immediately if it is already Player 2's turn
});

cpuDifficultyEl.addEventListener('change', function () {
  cpuDifficulty = cpuDifficultyEl.value;
  if (cpuEnabled && cpuDifficulty === 'hard') ensurePolicy();
});

// Info modals (how to play / how optimal play works)
const openModal = function (modalEl) {
  modalEl.classList.remove('hidden');
  overlayEl.classList.remove('hidden');
};

const closeModal = function () {
  document
    .querySelectorAll('.modal')
    .forEach((m) => m.classList.add('hidden'));
  overlayEl.classList.add('hidden');
};

btnRules.addEventListener('click', () => openModal(rulesModalEl));
btnOptimalInfo.addEventListener('click', () => openModal(optimalModalEl));
document
  .querySelectorAll('.modal__close')
  .forEach((btn) => btn.addEventListener('click', closeModal));
overlayEl.addEventListener('click', closeModal);

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeModal();
});
