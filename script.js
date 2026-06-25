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

// Rolling dice functionality
btnRoll.addEventListener('click', function () {
  if (playing) {
    // 1. Generating a random dice roll
    const dice = Math.trunc(Math.random() * 6) + 1;

    // 2. Display dice
    diceEl.src = `dice-${dice}.png`;
    diceEl.classList.remove('hidden');
    
    // 3. Check for rolled 1
    if (dice !== 1) {
      // Add dice to current score
      currentScore += dice;
      document.getElementById(
        `current--${activePlayer}`
      ).textContent = currentScore;
    } else {
      // Switch to next player
      switchPlayer();
    }

    updateOptimalHint();
  }
});

btnHold.addEventListener('click', function () {
  if (playing) {
    // 1. Add current score to active player's score
    scores[activePlayer] += currentScore;
    // scores[1] = scores[1] + currentScore

    document.getElementById(`score--${activePlayer}`).textContent =
      scores[activePlayer];

    // 2. Check if player's score is >= 100
    if (scores[activePlayer] >= 100) {
      // Finish the game
      playing = false;
      diceEl.classList.add('hidden');

      document
        .querySelector(`.player--${activePlayer}`)
        .classList.add('player--winner');
      document
        .querySelector(`.player--${activePlayer}`)
        .classList.remove('player--active');
    } else {
      // Switch to the next player
      switchPlayer();
    }

    updateOptimalHint();
  }
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
