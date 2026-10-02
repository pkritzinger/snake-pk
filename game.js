(() => {
  'use strict';

  // --- Config ---------------------------------------------------------------
  // The real 3310 LCD is 84 x 48 pixels. A score line sits on top, the
  // playfield (20 x 9 cells of 4 x 4 px) inside a 1px frame below it.
  const LCD_W = 84;
  const LCD_H = 48;
  const SCALE = 8;                 // canvas px per LCD pixel (672 x 384)
  const DOT = SCALE - 1;           // leaves a hairline gap between LCD pixels
  const COLS = 20;
  const ROWS = 9;
  const CELL = 4;
  const FIELD_X = 2;               // LCD px of cell (0, 0)
  const FIELD_Y = 10;
  const INK = '#18210d';
  const MAX_LEVEL = 9;
  const BONUS_EVERY = 5;           // a bonus critter appears every N foods
  const BONUS_TICKS = 40;          // how long the critter stays

  const DIRS = {
    up:    { x: 0,  y: -1 },
    down:  { x: 0,  y: 1 },
    left:  { x: -1, y: 0 },
    right: { x: 1,  y: 0 },
  };

  // 3 x 5 pixel font
  const FONT = {
    '0': '111101101101111', '1': '010110010010111', '2': '111001111100111',
    '3': '111001011001111', '4': '101101111001001', '5': '111100111001111',
    '6': '111100111101111', '7': '111001001010010', '8': '111101111101111',
    '9': '111101111001111',
    A: '010101111101101', B: '110101110101110', C: '011100100100011',
    D: '110101101101110', E: '111100110100111', F: '111100110100100',
    G: '011100101101011', H: '101101111101101', I: '111010010010111',
    J: '001001001101010', K: '101101110101101', L: '100100100100111',
    M: '101111111101101', N: '110101101101101', O: '010101101101010',
    P: '110101110100100', Q: '010101101110011', R: '110101110101101',
    S: '011100010001110', T: '111010010010010', U: '101101101101111',
    V: '101101101101010', W: '101101111111101', X: '101101010101101',
    Y: '101101010010010', Z: '111001010100111',
    ' ': '000000000000000', '!': '010010010000010', ':': '000010000010000',
    '.': '000000000000010', '=': '000111000111000', '-': '000000111000000',
  };

  // Bonus critter, 2 cells wide
  const CRITTER = [
    '.X.XX.X.',
    'XXXXXXXX',
    '.XXXXXX.',
    'X.X..X.X',
  ];

  // --- DOM -------------------------------------------------------------------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // --- State -----------------------------------------------------------------
  let state = 'title';             // title | playing | paused | dying | over
  let snake, dir, dirQueue, food, bonus, score, eaten, grow, timer, won, newTop;
  let level = loadNumber('snake.level', 5);
  let hiscore = loadNumber('snake.hiscore', 0);

  function loadNumber(key, fallback) {
    try {
      const v = parseInt(localStorage.getItem(key), 10);
      return Number.isFinite(v) ? v : fallback;
    } catch { return fallback; }
  }
  function saveNumber(key, value) {
    try { localStorage.setItem(key, String(value)); } catch { /* ignore */ }
  }

  // --- Game logic ------------------------------------------------------------
  function reset() {
    const cy = Math.floor(ROWS / 2);
    snake = [{ x: 6, y: cy }, { x: 5, y: cy }, { x: 4, y: cy }, { x: 3, y: cy }];
    dir = DIRS.right;
    dirQueue = [];
    score = 0;
    eaten = 0;
    grow = 0;
    bonus = null;
    won = false;
    newTop = false;
    food = randomFreeCell();
  }

  function randomFreeCell(exclude = []) {
    const taken = new Set(snake.concat(exclude).map(c => c.x + ',' + c.y));
    if (taken.size >= COLS * ROWS) return null;
    let c;
    do {
      c = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
    } while (taken.has(c.x + ',' + c.y));
    return c;
  }

  function tickDelay() {
    // Level 1 = slow (~260ms), level 9 = fast (~60ms)
    return 285 - level * 25;
  }

  function start() {
    reset();
    state = 'playing';
    render();
    schedule();
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(step, tickDelay());
  }

  function step() {
    if (state !== 'playing') return;

    if (dirQueue.length) dir = dirQueue.shift();

    const head = snake[0];
    // Classic Nokia mode: walls wrap around
    const next = {
      x: (head.x + dir.x + COLS) % COLS,
      y: (head.y + dir.y + ROWS) % ROWS,
    };

    // Tail moves away this tick unless we're growing, so it's safe to enter
    const body = grow > 0 ? snake : snake.slice(0, -1);
    if (body.some(c => c.x === next.x && c.y === next.y)) {
      return gameOver();
    }

    snake.unshift(next);

    if (food && next.x === food.x && next.y === food.y) {
      score += level;
      eaten++;
      grow += 1;
      food = randomFreeCell(bonus ? bonus.cells : []);
      if (eaten % BONUS_EVERY === 0 && !bonus) spawnBonus();
      vibrate(15);
    } else if (bonus && bonus.cells.some(c => c.x === next.x && c.y === next.y)) {
      score += 5 * level + bonus.ticks;
      bonus = null;
      vibrate([20, 30, 20]);
    }

    if (grow > 0) grow--;
    else snake.pop();

    if (bonus && --bonus.ticks <= 0) bonus = null;

    if (!food) return gameOver(true); // board full — you win!

    render();
    schedule();
  }

  function spawnBonus() {
    // Critter takes up two horizontally adjacent cells
    for (let tries = 0; tries < 50; tries++) {
      const a = randomFreeCell([food]);
      if (!a || a.x >= COLS - 1) continue;
      const b = { x: a.x + 1, y: a.y };
      const clash = snake.concat([food]).some(c => c.x === b.x && c.y === b.y);
      if (!clash) {
        bonus = { cells: [a, b], ticks: BONUS_TICKS };
        return;
      }
    }
  }

  function gameOver(hasWon = false) {
    state = 'dying';                // ignore input while the snake flashes
    won = hasWon;
    clearTimeout(timer);
    vibrate(200);
    if (score > hiscore) {
      hiscore = score;
      newTop = true;
      saveNumber('snake.hiscore', hiscore);
    }
    flash(6, () => {
      state = 'over';
      render();
    });
  }

  function togglePause() {
    if (state === 'playing') {
      state = 'paused';
      clearTimeout(timer);
      render();
    } else if (state === 'paused') {
      state = 'playing';
      render();
      schedule();
    }
  }

  function changeLevel() {
    level = level % MAX_LEVEL + 1;
    saveNumber('snake.level', level);
    if (state === 'title') render();
  }

  function queueDirection(name) {
    const d = DIRS[name];
    if (!d) return;
    if (state === 'title' || state === 'over') return start();
    if (state !== 'playing') return;
    // Compare against the last queued direction so quick double-taps work
    const last = dirQueue.length ? dirQueue[dirQueue.length - 1] : dir;
    if (d === last || (d.x === -last.x && d.y === -last.y)) return;
    if (dirQueue.length < 3) dirQueue.push(d);
  }

  function okPressed() {
    if (state === 'title' || state === 'over') start();
    else togglePause();
  }

  // --- LCD drawing primitives (coordinates in LCD pixels) --------------------
  function clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); }

  function px(x, y) { ctx.fillRect(x * SCALE, y * SCALE, DOT, DOT); }

  function rect(x, y, w, h) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j);
  }

  function erase(x, y, w, h) {
    ctx.clearRect(x * SCALE, y * SCALE, w * SCALE, h * SCALE);
  }

  function frame(x, y, w, h) {
    rect(x, y, w, 1);
    rect(x, y + h - 1, w, 1);
    rect(x, y, 1, h);
    rect(x + w - 1, y, 1, h);
  }

  function bitmap(rows, x, y) {
    rows.forEach((row, j) => {
      [...row].forEach((ch, i) => { if (ch === 'X') px(x + i, y + j); });
    });
  }

  function text(str, x, y, size = 1) {
    [...str.toUpperCase()].forEach((ch, n) => {
      const glyph = FONT[ch] || FONT[' '];
      for (let j = 0; j < 5; j++) {
        for (let i = 0; i < 3; i++) {
          if (glyph[j * 3 + i] === '1') rect(x + n * 4 * size + i * size, y + j * size, size, size);
        }
      }
    });
  }

  function centerText(str, y, size = 1) {
    const w = str.length * 4 * size - size;
    text(str, Math.floor((LCD_W - w) / 2), y, size);
  }

  function pad(n) { return String(n).padStart(4, '0'); }

  // --- Screens ---------------------------------------------------------------
  function render() {
    if (state === 'title') return drawTitle();
    if (state === 'over') return drawGameOver();
    drawGame();
    if (state === 'paused') drawDialog('PAUSED');
  }

  function drawTitle() {
    clear();
    centerText('SNAKE II', 3, 2);
    // a little snake under the title
    rect(22, 16, 36, 2);
    rect(58, 14, 2, 4);
    px(61, 15);
    centerText('LEVEL ' + level, 23);
    centerText('TOP ' + pad(hiscore), 31);
    centerText('5 = START', 41);
  }

  function drawHud() {
    text(pad(score), 0, 1);
    if (bonus) {
      bitmap(CRITTER, 64, 1);
      text(String(bonus.ticks).padStart(2, '0'), 77, 1);
    }
    frame(0, 8, LCD_W, LCD_H - 8);
  }

  function drawGame(showSnake = true) {
    clear();
    drawHud();
    if (food) drawFood(food);
    if (bonus) bitmap(CRITTER, FIELD_X + bonus.cells[0].x * CELL, FIELD_Y + bonus.cells[0].y * CELL);
    if (showSnake) drawSnake();
  }

  function drawSnake() {
    snake.forEach((c, i) => {
      const x = FIELD_X + c.x * CELL, y = FIELD_Y + c.y * CELL;
      rect(x, y, 3, 3);
      // close the gap towards the next segment, unless it wrapped around a wall
      const n = snake[i + 1];
      if (n) {
        if (n.y === c.y && n.x === c.x + 1) rect(x + 3, y, 1, 3);
        if (n.y === c.y && n.x === c.x - 1) rect(x - 1, y, 1, 3);
        if (n.x === c.x && n.y === c.y + 1) rect(x, y + 3, 3, 1);
        if (n.x === c.x && n.y === c.y - 1) rect(x, y - 1, 3, 1);
      }
    });
    // eye: knock one pixel out of the head's leading corner
    const h = snake[0];
    const hx = FIELD_X + h.x * CELL, hy = FIELD_Y + h.y * CELL;
    const ex = dir === DIRS.right ? 2 : 0;
    const ey = dir === DIRS.down ? 2 : 0;
    erase(hx + ex, hy + ey, 1, 1);
  }

  function drawFood(c) {
    // 3 x 3 diamond, like the original
    const x = FIELD_X + c.x * CELL, y = FIELD_Y + c.y * CELL;
    px(x + 1, y);
    px(x, y + 1);
    px(x + 2, y + 1);
    px(x + 1, y + 2);
  }

  function drawDialog(label) {
    const w = label.length * 4 + 9, h = 13;
    const x = Math.floor((LCD_W - w) / 2), y = 20;
    erase(x, y, w, h);
    frame(x + 1, y + 1, w - 2, h - 2);
    centerText(label, y + 4);
  }

  function drawGameOver() {
    clear();
    drawHud();
    centerText(won ? 'YOU WIN!' : 'GAME OVER!', 12);
    centerText('SCORE ' + pad(score), 20);
    if (newTop) centerText('NEW TOP!', 28);
    centerText('5 = AGAIN', 38);
  }

  function flash(times, done) {
    let n = 0;
    const iv = setInterval(() => {
      drawGame(n % 2 === 1);
      if (++n >= times) { clearInterval(iv); done(); }
    }, 150);
  }

  function vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  // --- Input -----------------------------------------------------------------
  const KEYMAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right',
    '2': 'up', '8': 'down', '4': 'left', '6': 'right',
  };

  // Light up the matching key on the phone when the keyboard is used
  const DIR_KEY = { up: '2', left: '4', right: '6', down: '8' };
  function pressKey(selector) {
    const btn = document.querySelector(selector);
    if (!btn) return;
    btn.classList.add('pressed');
    setTimeout(() => btn.classList.remove('pressed'), 120);
  }

  document.addEventListener('keydown', e => {
    if (KEYMAP[e.key]) {
      e.preventDefault();
      pressKey(`.hot[data-key="${DIR_KEY[KEYMAP[e.key]]}"]`);
      queueDirection(KEYMAP[e.key]);
    } else if (e.key === ' ' || e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      pressKey('.hot[data-action="pause"]');
      okPressed();
    } else if (e.key === 'Enter' || e.key === '5') {
      e.preventDefault();
      pressKey(e.key === '5' ? '.hot[data-key="5"]' : '.hot[aria-label^="Navi"]');
      okPressed();
    } else if (e.key === 'l' || e.key === 'L') {
      pressKey('.hot[data-action="level"]');
      changeLevel();
    }
  });

  document.querySelectorAll('.hot').forEach(btn => {
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      const { dir: d, action } = btn.dataset;
      if (d) queueDirection(d);
      else if (action === 'ok' || action === 'pause') okPressed();
      else if (action === 'level') changeLevel();
    });
  });

  // Swipe / tap on the screen
  let touchStart = null;
  const screenEl = document.getElementById('screen');
  screenEl.addEventListener('touchstart', e => {
    const t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  screenEl.addEventListener('touchend', e => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return okPressed();
    if (Math.abs(dx) > Math.abs(dy)) queueDirection(dx > 0 ? 'right' : 'left');
    else queueDirection(dy > 0 ? 'down' : 'up');
  });

  // --- Boot ------------------------------------------------------------------
  reset();
  render();
})();
