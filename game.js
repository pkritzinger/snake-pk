(() => {
  'use strict';

  // --- Config ---------------------------------------------------------------
  const COLS = 24;
  const ROWS = 14;
  const CELL = 16;                 // canvas px per cell (384 x 224)
  const INK = '#1e2a0e';
  const LCD = '#9bbc0f';
  const MAX_LEVEL = 9;
  const BONUS_EVERY = 5;           // a bonus critter appears every N foods
  const BONUS_TICKS = 40;          // how long the critter stays

  const DIRS = {
    up:    { x: 0,  y: -1 },
    down:  { x: 0,  y: 1 },
    left:  { x: -1, y: 0 },
    right: { x: 1,  y: 0 },
  };

  // --- DOM -------------------------------------------------------------------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const levelEl = document.getElementById('level');
  const bonusEl = document.getElementById('bonus');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayText = document.getElementById('overlay-text');
  const hiscoreEl = document.getElementById('hiscore');

  // --- State -----------------------------------------------------------------
  let state = 'title';             // title | playing | paused | dying | over
  let snake, dir, dirQueue, food, bonus, score, eaten, grow, timer;
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
    snake = [{ x: 8, y: cy }, { x: 7, y: cy }, { x: 6, y: cy }, { x: 5, y: cy }];
    dir = DIRS.right;
    dirQueue = [];
    score = 0;
    eaten = 0;
    grow = 0;
    bonus = null;
    food = randomFreeCell();
    updateHud();
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
    hideOverlay();
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

    updateHud();
    draw();
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

  function gameOver(won = false) {
    state = 'dying';                // ignore input while the snake flashes
    clearTimeout(timer);
    vibrate(200);
    if (score > hiscore) {
      hiscore = score;
      saveNumber('snake.hiscore', hiscore);
    }
    flash(6, () => {
      state = 'over';
      showOverlay(won ? 'YOU WIN' : 'GAME OVER', `Score ${score} · press 5 / Enter`);
    });
  }

  function togglePause() {
    if (state === 'playing') {
      state = 'paused';
      clearTimeout(timer);
      showOverlay('PAUSED', 'Press 5 / Space to continue');
    } else if (state === 'paused') {
      state = 'playing';
      hideOverlay();
      schedule();
    }
  }

  function changeLevel() {
    level = level % MAX_LEVEL + 1;
    saveNumber('snake.level', level);
    updateHud();
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

  // --- Rendering -------------------------------------------------------------
  function draw(showSnake = true) {
    ctx.fillStyle = LCD;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = INK;

    if (food) drawFood(food);
    if (bonus) drawBonus(bonus);
    if (showSnake) snake.forEach((c, i) => drawSegment(c, i === 0));
  }

  function drawSegment(c, isHead) {
    const px = c.x * CELL, py = c.y * CELL;
    ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
    if (isHead) {
      // little eye
      ctx.fillStyle = LCD;
      const ex = px + CELL / 2 + dir.x * 3 - 2 + (dir.y !== 0 ? 3 : 0);
      const ey = py + CELL / 2 + dir.y * 3 - 2 + (dir.x !== 0 ? -3 : 0);
      ctx.fillRect(ex, ey, 4, 4);
      ctx.fillStyle = INK;
    }
  }

  function drawFood(c) {
    // Diamond-shaped pixel food, like the original
    const px = c.x * CELL, py = c.y * CELL, u = CELL / 4;
    ctx.fillRect(px + u * 1.5, py + u * 0.5, u, u);
    ctx.fillRect(px + u * 0.5, py + u * 1.5, u, u);
    ctx.fillRect(px + u * 2.5, py + u * 1.5, u, u);
    ctx.fillRect(px + u * 1.5, py + u * 2.5, u, u);
  }

  function drawBonus(b) {
    // Simple 2-cell bug sprite
    const sprite = [
      '.X....X.',
      '..XXXX..',
      '.XXXXXX.',
      'XX.XX.XX',
      'XXXXXXXX',
      '.XXXXXX.',
      '.X.XX.X.',
      'X......X',
    ];
    const ox = b.cells[0].x * CELL, oy = b.cells[0].y * CELL;
    const sx = (CELL * 2) / 8, sy = CELL / 8;
    sprite.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch === 'X') ctx.fillRect(ox + x * sx, oy + y * sy, sx, sy);
      });
    });
  }

  function flash(times, done) {
    let n = 0;
    const iv = setInterval(() => {
      draw(n % 2 === 1);
      if (++n >= times) { clearInterval(iv); draw(); done(); }
    }, 150);
  }

  function updateHud() {
    scoreEl.textContent = String(score).padStart(4, '0');
    levelEl.textContent = 'LV ' + level;
    if (bonus) {
      bonusEl.hidden = false;
      bonusEl.textContent = '✱ ' + bonus.ticks;
    } else {
      bonusEl.hidden = true;
    }
  }

  function showOverlay(title, text) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    hiscoreEl.textContent = hiscore;
    overlay.hidden = false;
  }
  function hideOverlay() { overlay.hidden = true; }

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

  document.addEventListener('keydown', e => {
    if (KEYMAP[e.key]) {
      e.preventDefault();
      queueDirection(KEYMAP[e.key]);
    } else if (e.key === ' ' || e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      if (state === 'title' || state === 'over') start(); else togglePause();
    } else if (e.key === 'Enter' || e.key === '5') {
      e.preventDefault();
      okPressed();
    } else if (e.key === 'l' || e.key === 'L') {
      changeLevel();
    }
  });

  document.querySelectorAll('.key').forEach(btn => {
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (btn.dataset.dir) queueDirection(btn.dataset.dir);
      else if (btn.dataset.action === 'ok') okPressed();
    });
  });

  document.getElementById('btn-pause').addEventListener('click', okPressed);
  document.getElementById('btn-level').addEventListener('click', changeLevel);

  // Swipe on the screen
  let touchStart = null;
  const screenEl = document.querySelector('.screen');
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
  draw();
  showOverlay('SNAKE', 'Press 5 / Enter to start');
})();
