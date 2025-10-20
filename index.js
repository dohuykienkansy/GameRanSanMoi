/* ---------- Basic constants & DOM ---------- */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const box = 20, gridSize = 20;
const difficultyRow = document.getElementById('difficultyRow');
const curDifficulty = document.getElementById('curDifficulty');
const btnCreate = document.getElementById('btnCreate');
const btnPresets = document.getElementById('btnPresets');
const btn2P = document.getElementById('btn2P');
const presetPanel = document.getElementById('presetPanel');
const editorPanel = document.getElementById('editorPanel');
const startPresetBtn = document.getElementById('startPreset');
const backFromPreset = document.getElementById('backFromPreset');
const startFromEditor = document.getElementById('startFromEditor');
const backFromEditor = document.getElementById('backFromEditor');
const saveMapBtn = document.getElementById('saveMap');
const clearMapBtn = document.getElementById('clearMap');

const p1ScoreEl = document.getElementById('p1Score');
const p2ScoreEl = document.getElementById('p2Score');
const p1LivesEl = document.getElementById('p1Lives');
const p2LivesEl = document.getElementById('p2Lives');
const p2Hud = document.getElementById('p2Hud');
const hudMapEl = document.getElementById('hudMap');
const hudBestEl = document.getElementById('hudBest');
const highscoreInfo = document.getElementById('highscoreInfo');

const btnPause = document.getElementById('btnPause');
const btnRestart = document.getElementById('btnRestart');
const btnShowMenu = document.getElementById('btnShowMenu');

const colorModal = document.getElementById('colorModal');
const p1ColorRow = document.getElementById('p1ColorRow');
const p2ColorRow = document.getElementById('p2ColorRow');
const confirmColorsBtn = document.getElementById('confirmColors');
const cancelColorsBtn = document.getElementById('cancelColors');

const gameContainer = document.getElementById('gameContainer');

/* ---------- Game state ---------- */
let difficulty = 'medium';
const speedMap = { easy:150, medium:100, hard:70 };
let baseDelay = speedMap[difficulty], delay = baseDelay;
let gameInterval = null;
let paused = false;

// preset maps
const presetMaps = {
  classic: [],
  desert: [{x:5*box,y:5*box},{x:6*box,y:5*box},{x:5*box,y:6*box},{x:15*box,y:15*box}],
  forest: [{x:3*box,y:8*box},{x:4*box,y:8*box},{x:7*box,y:12*box},{x:8*box,y:12*box},{x:9*box,y:12*box}],
  maze: [...Array.from({length:8},(_,i)=>({x:(5+i)*box,y:5*box})), ...Array.from({length:8},(_,i)=>({x:(5+i)*box,y:15*box})), ...Array.from({length:4},(_,i)=>({x:12*box,y:(8+i)*box}))]
};

let obstacles = [];
let snake1 = [], snake2 = [];
let dir1 = 'RIGHT', dir2 = 'LEFT';
let food = null;
let p1Lives = 3, p2Lives = 3;
let invuln1 = false, invuln2 = false;
let speedTimeoutId = null;
let usingCustomMap = false;
let currentMapName = 'classic';

// per-player score & colors
let p1Score = 0, p2Score = 0;
let p1Color = '#39d353', p2Color = '#ff9e4d';
let selectedP1Color = null, selectedP2Color = null;
let isTwoPlayersMode = false;

// editor storage
let editorSet = new Set();
try {
  const saved = localStorage.getItem('snake_custom_map');
  if (saved) JSON.parse(saved).forEach(s => editorSet.add(s));
} catch(e){ console.warn('load custom map failed', e); }

// startMode controls what startPreset does: 'single' or '2p' or 'editor'
let startMode = 'single'; // default

/* ---------- Utility functions ---------- */
function capitalize(s){ return s.charAt(0).toUpperCase() + s.slice(1); }
function heartsDisplay(n){ const full='❤️', empty='🤍'; let s=''; for (let i=0;i<3;i++) s += (i<n?full:empty); return s; }
function showToast(text, timeout=900){
  const t = document.createElement('div'); t.className='toast'; t.textContent = text;
  gameContainer.appendChild(t);
  setTimeout(()=>t.remove(), timeout);
}
function shadeColor(hex, percent) {
  if (!hex) return '#000';
  const f = hex.replace('#','');
  const r = parseInt(f.substring(0,2),16), g = parseInt(f.substring(2,4),16), b = parseInt(f.substring(4,6),16);
  const t = percent < 0 ? 0 : 255; const p = Math.abs(percent)/100;
  const R = Math.round((t - r) * p) + r;
  const G = Math.round((t - g) * p) + g;
  const B = Math.round((t - b) * p) + b;
  return '#' + (R.toString(16).padStart(2,'0')) + (G.toString(16).padStart(2,'0')) + (B.toString(16).padStart(2,'0'));
}

/* ---------- Persisted highscore helpers ---------- */
function highScoreKey(mapName, diff){ return `snake_high_${mapName}_${diff}`; }
function getHighScoreFor(mapName, diff){ return Number(localStorage.getItem(highScoreKey(mapName,diff)) || 0); }
function setHighScoreFor(mapName, diff, val){ localStorage.setItem(highScoreKey(mapName,diff), String(val)); }

/* ---------- UI wiring: difficulty, modes ---------- */
// difficulty UI
difficultyRow.querySelectorAll('button').forEach(b => {
  b.addEventListener('click', () => {
    difficulty = b.dataset.diff;
    difficultyRow.querySelectorAll('button').forEach(x => x.className = (x.dataset.diff === difficulty) ? 'btn' : 'btn ghost');
    curDifficulty.textContent = capitalize(difficulty);
    baseDelay = speedMap[difficulty];
    delay = baseDelay;
    updateHUD();
  });
});

// modes
btnCreate.addEventListener('click', () => {
  showEditor();
  startMode = 'editor';
});
btnPresets.addEventListener('click', () => {
  showPresetSelector();
  startMode = 'single';
});
btn2P.addEventListener('click', () => {
  openColorSelectionFor2P();
  startMode = '2p'; // will be used by Start Preset after confirm colors
});

/* ---------- Preset map buttons: safe binding ---------- */
function setupPresetButtons(){
  // ensure we attach handlers and visual selection
  const mapButtons = document.querySelectorAll('.mapList button');
  mapButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // remove outlines
      mapButtons.forEach(x => x.style.outline = 'none');
      btn.style.outline = '3px solid rgba(255,255,255,0.06)';
      currentMapName = btn.dataset.map;
      // reflect in HUD quickly
      hudMapEl.textContent = currentMapName;
      updateHUD();
    });
  });
}
setupPresetButtons();

/* startPreset: use startMode to decide single vs 2p */
startPresetBtn.addEventListener('click', ()=> {
  if (startMode === '2p') {
    usingCustomMap = false;
    obstacles = presetMaps[currentMapName].slice();
    startGame(true);
  } else {
    usingCustomMap = false;
    obstacles = presetMaps[currentMapName].slice();
    startGame(false);
  }
});
backFromPreset.addEventListener('click', ()=> { presetPanel.style.display = 'none'; });

/* ---------- Editor handlers ---------- */
startFromEditor.addEventListener('click', ()=> {
  // When starting from editor we default to single player, unless you explicitly want 2p later.
  usingCustomMap = true;
  obstacles = [...editorSet].map(s => { const [x,y] = s.split(':').map(Number); return {x:x*box, y:y*box}; });
  currentMapName = 'custom';
  startMode = 'single';
  startGame(false);
});
backFromEditor.addEventListener('click', ()=> { editorPanel.style.display = 'none'; });

saveMapBtn.addEventListener('click', ()=> {
  localStorage.setItem('snake_custom_map', JSON.stringify([...editorSet]));
  alert('Saved map to localStorage (key: snake_custom_map).');
});
clearMapBtn.addEventListener('click', ()=> {
  if (confirm('Clear map?')) { editorSet.clear(); drawEditorGrid(); }
});

/* canvas click toggles obstacle only when editor open */
canvas.addEventListener('click', (ev) => {
  if (editorPanel.style.display === 'block') {
    const rect = canvas.getBoundingClientRect();
    const cx = ev.clientX - rect.left;
    const cy = ev.clientY - rect.top;
    const gx = Math.floor(cx / box);
    const gy = Math.floor(cy / box);
    if (gx >= 0 && gx < gridSize && gy >= 0 && gy < gridSize) {
      const key = gx + ':' + gy;
      if (editorSet.has(key)) editorSet.delete(key); else editorSet.add(key);
      drawEditorGrid();
    }
  }
});

/* ---------- Color selection for 2P ---------- */
function openColorSelectionFor2P(){
  // reset
  selectedP1Color = null; selectedP2Color = null;
  // remove previous selected class
  document.querySelectorAll('#p1ColorRow .color-btn').forEach(b => b.classList.remove('selected'));
  document.querySelectorAll('#p2ColorRow .color-btn').forEach(b => b.classList.remove('selected'));
  // set click handlers
  document.querySelectorAll('#p1ColorRow .color-btn').forEach(btn => {
    btn.onclick = () => {
      selectedP1Color = btn.dataset.color;
      document.querySelectorAll('#p1ColorRow .color-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    };
  });
  document.querySelectorAll('#p2ColorRow .color-btn').forEach(btn => {
    btn.onclick = () => {
      selectedP2Color = btn.dataset.color;
      document.querySelectorAll('#p2ColorRow .color-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    };
  });

  confirmColorsBtn.onclick = () => {
    if (!selectedP1Color || !selectedP2Color) { alert('Chọn màu cho cả 2 người nhé!'); return; }
    // allow same color but warn
    if (selectedP1Color === selectedP2Color) {
      if (!confirm('Hai người chọn cùng màu — tiếp tục?')) return;
    }
    p1Color = selectedP1Color; p2Color = selectedP2Color;
    colorModal.style.display = 'none';
    // show preset map selector so user picks map for 2P
    showPresetSelector();
    presetPanel.style.display = 'block';
    // startMode already set to '2p'
  };
  cancelColorsBtn.onclick = () => {
    colorModal.style.display = 'none';
  };

  colorModal.style.display = 'flex';
}

/* ---------- Editor drawing ---------- */
function drawEditorGrid(){
  // clear canvas and draw 20x20 grid (used both by editor and default UI)
  ctx.clearRect(0,0,canvas.width,canvas.height);
  for (let gx=0; gx<gridSize; gx++){
    for (let gy=0; gy<gridSize; gy++){
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      ctx.fillRect(gx*box, gy*box, box-1, box-1);
    }
  }
  // draw saved obstacles (editorSet)
  editorSet.forEach(s => {
    const [ex,ey] = s.split(':').map(Number);
    ctx.fillStyle = '#7a7a7a';
    ctx.fillRect(ex*box, ey*box, box-1, box-1);
  });
}

/* ---------- Food spawn & rules ---------- */
function spawnFood(){
  const attempts = 2000;
  for (let i=0;i<attempts;i++){
    const fx = Math.floor(Math.random()*gridSize)*box;
    const fy = Math.floor(Math.random()*gridSize)*box;
    if (!isCellFreeForFood(fx,fy)) continue;
    const r = Math.random();
    let type = 'red';
    if (r < 0.60) type = 'red';
    else if (r < 0.70) type = 'gold';
    else if (r < 0.88) type = 'purple';
    else type = 'green';
    food = { x: fx, y: fy, type };
    return;
  }
  // fallback
  food = { x: 0, y: 0, type: 'red' };
}

function isCellFreeForFood(x,y){
  if (obstacles.some(o => o.x===x && o.y===y)) return false;
  if (snake1.some(s => s.x===x && s.y===y)) return false;
  if (snake2.some(s => s.x===x && s.y===y)) return false;
  return true;
}

/* ---------- Start / Reset game ---------- */
function startGame(isTwoPlayers){
  isTwoPlayersMode = !!isTwoPlayers;
  startMode = isTwoPlayers ? '2p' : 'single';
  resetCommon();
  if (!isTwoPlayersMode){
    snake1 = [{x:9*box,y:10*box},{x:8*box,y:10*box},{x:7*box,y:10*box}];
    snake2 = [];
    dir1 = 'RIGHT'; dir2 = 'LEFT';
  } else {
    snake1 = [{x:6*box,y:10*box},{x:5*box,y:10*box},{x:4*box,y:10*box}];
    snake2 = [{x:14*box,y:10*box},{x:15*box,y:10*box},{x:16*box,y:10*box}];
    dir1 = 'RIGHT'; dir2 = 'LEFT';
  }
  if (!usingCustomMap) obstacles = presetMaps[currentMapName].slice();
  spawnFood();
  updateHUD();
  if (gameInterval) clearInterval(gameInterval);
  delay = baseDelay;
  gameInterval = setInterval(loop, delay);
  draw();
  // HUD visibility
  p2Hud.style.display = isTwoPlayersMode ? 'block' : 'none';
  // ensure p2 lives box displays only when 2P
  document.getElementById('p2Lives').parentElement.style.display = isTwoPlayersMode ? 'block' : 'none';
}

/* restart from preset/editor wrappers */
function startSingleFromPreset(){ usingCustomMap=false; obstacles = presetMaps[currentMapName].slice(); startGame(false); }
function startSingleFromEditor(){ usingCustomMap=true; obstacles = [...editorSet].map(s=>{ const [x,y]=s.split(':').map(Number); return {x:x*box,y:y*box}; }); currentMapName='custom'; startGame(false); }

/* ---------- Main loop ---------- */
function loop(){
  if (!gameInterval) return;
  if (snake1.length>0) moveSnake(snake1, dir1);
  if (snake2.length>0) moveSnake(snake2, dir2);

  // head-on detection (special rule: head-on => draw this tick no life lost)
  if (snake1.length>0 && snake2.length>0 && snake1[0].x===snake2[0].x && snake1[0].y===snake2[0].y){
    showToast('Head-on — draw this tick');
    // skip penalty checks for head-other collisions that would come from head overlap
  } else {
    // check collisions for each player separately
    if (snake1.length>0 && checkCollisionForSnake(snake1, snake2, 1)) handlePlayerHit(1);
    if (snake2.length>0 && checkCollisionForSnake(snake2, snake1, 2)) handlePlayerHit(2);
  }

  // apples per snake
  if (snake1.length>0) checkAppleForSnake(snake1, 1);
  if (snake2.length>0) checkAppleForSnake(snake2, 2);

  updateHUD();
  draw();
}

/* ---------- Movement & Eating ---------- */
function moveSnake(snake, dir){
  for (let i=snake.length-1;i>0;i--){
    snake[i].x = snake[i-1].x; snake[i].y = snake[i-1].y;
  }
  const head = snake[0];
  if (dir === 'LEFT') head.x -= box;
  if (dir === 'RIGHT') head.x += box;
  if (dir === 'UP') head.y -= box;
  if (dir === 'DOWN') head.y += box;
}

function checkAppleForSnake(snake, playerNum){
  if (!food) return;
  if (snake[0].x === food.x && snake[0].y === food.y){
    applyFoodEffect(food.type, playerNum);
    const tail = snake[snake.length-1];
    snake.push({x:tail.x, y:tail.y});
    spawnFood();
  }
}

/* apply food effect */
function applyFoodEffect(type, playerNum){
  if (type === 'red'){
    if (playerNum === 1) { p1Score += 1; showToast('P1 +1'); }
    else { p2Score += 1; showToast('P2 +1'); }
  } else if (type === 'gold'){
    if (playerNum === 1) { p1Score += 3; showToast('P1 +3 ⭐'); }
    else { p2Score += 3; showToast('P2 +3 ⭐'); }
  } else if (type === 'purple'){
    showToast('Speed Boost ⚡');
    applySpeedBoost();
  } else if (type === 'green'){
    if (playerNum === 1){
      if (p1Lives < 3) { p1Lives++; updateHUD(); showToast('P1 healed +1'); } else showToast('P1 full HP');
    } else {
      if (p2Lives < 3) { p2Lives++; updateHUD(); showToast('P2 healed +1'); } else showToast('P2 full HP');
    }
  }
}

/* ---------- Speed boost ---------- */
function applySpeedBoost(){
  if (speedTimeoutId) clearTimeout(speedTimeoutId);
  delay = Math.max(30, Math.round(baseDelay * 0.7));
  restartIntervalWithDelay();
  speedTimeoutId = setTimeout(()=>{
    delay = baseDelay;
    restartIntervalWithDelay();
    speedTimeoutId = null;
    showToast('Speed back');
  }, 5000);
}

/* ---------- Collision checks & hit handling ---------- */
function checkCollisionForSnake(snakeA, otherSnake, playerNum){
  const head = snakeA[0];
  // boundary
  if (head.x < 0 || head.x >= gridSize*box || head.y < 0 || head.y >= gridSize*box) return true;
  // self
  for (let i=1;i<snakeA.length;i++) if (head.x===snakeA[i].x && head.y===snakeA[i].y) return true;
  // obstacle
  if (obstacles.some(o => o.x===head.x && o.y===head.y)) return true;
  // head hits other body (excluding other's head)
  for (let i=1;i<otherSnake.length;i++) if (head.x===otherSnake[i].x && head.y===otherSnake[i].y) return true;
  return false;
}

function handlePlayerHit(playerNum){
  if (playerNum === 1){
    if (invuln1) return;
    p1Lives--; updateHUD();
    if (p1Lives <= 0) { finishMatch('p2'); return; }
    invuln1 = true;
    showToast('P1 lost 1 life');
    clearInterval(gameInterval);
    setTimeout(()=>{
      snake1 = [{x:6*box,y:10*box},{x:5*box,y:10*box},{x:4*box,y:10*box}];
      dir1 = 'RIGHT';
      if (!isCellFreeForFood(food.x,food.y)) spawnFood();
      setTimeout(()=>{ invuln1 = false; }, 900);
      restartIntervalWithDelay();
    }, 600);
  } else {
    if (invuln2) return;
    p2Lives--; updateHUD();
    if (p2Lives <= 0) { finishMatch('p1'); return; }
    invuln2 = true;
    showToast('P2 lost 1 life');
    clearInterval(gameInterval);
    setTimeout(()=>{
      snake2 = [{x:14*box,y:10*box},{x:15*box,y:10*box},{x:16*box,y:10*box}];
      dir2 = 'LEFT';
      if (!isCellFreeForFood(food.x,food.y)) spawnFood();
      setTimeout(()=>{ invuln2 = false; }, 900);
      restartIntervalWithDelay();
    }, 600);
  }
}

/* ---------- Finish match ---------- */
function finishMatch(winner){
  clearInterval(gameInterval);
  const overlay = document.createElement('div'); overlay.className = 'overlay';
  let title = 'Match Over', msg = '';
  if (winner === 'p1') msg = 'Player 1 wins!';
  else if (winner === 'p2') msg = 'Player 2 wins!';
  else msg = 'Draw!';
  overlay.innerHTML = `<div class="modal"><h2>${title}</h2><p style="font-size:18px">${msg}</p>
    <p style="margin-top:8px;"><strong>P1 Score:</strong> ${p1Score} — <strong>P2 Score:</strong> ${p2Score}</p>
    <div style="margin-top:12px;"><button class="btn" id="modalRestart">Play Again</button> <button class="btn ghost" id="modalMenu">Menu</button></div></div>`;
  gameContainer.appendChild(overlay);
  document.getElementById('modalRestart').addEventListener('click', ()=>{
    overlay.remove();
    // restart 2-player flow if was 2p
    if (startMode === '2p') startGame(true); else startGame(false);
  });
  document.getElementById('modalMenu').addEventListener('click', ()=>{
    overlay.remove();
    showMenu();
  });
}

/* ---------- Draw render ---------- */
function draw(){
  // clear
  ctx.fillStyle = '#000'; ctx.fillRect(0,0,canvas.width,canvas.height);

  // obstacles
  for (const ob of obstacles){
    ctx.fillStyle = (currentMapName === 'desert' ? '#d9b44a' : currentMapName === 'forest' ? '#1f7a3a' : '#7a7a7a');
    ctx.fillRect(ob.x, ob.y, box-1, box-1);
  }

  // snake1
  for (let i=snake1.length-1;i>=0;i--){
    const s = snake1[i];
    ctx.fillStyle = (i===0 ? shadeColor(p1Color, -10) : p1Color);
    ctx.globalAlpha = (invuln1 && i===0) ? 0.5 : 1;
    ctx.fillRect(s.x, s.y, box-1, box-1);
  }
  // snake2
  for (let i=snake2.length-1;i>=0;i--){
    const s = snake2[i];
    ctx.fillStyle = (i===0 ? shadeColor(p2Color, -10) : p2Color);
    ctx.globalAlpha = (invuln2 && i===0) ? 0.5 : 1;
    ctx.fillRect(s.x, s.y, box-1, box-1);
  }
  ctx.globalAlpha = 1;

  // food
  if (food){
    if (food.type === 'red') ctx.fillStyle = '#ff4d4d';
    else if (food.type === 'gold') ctx.fillStyle = '#ffd24d';
    else if (food.type === 'purple') ctx.fillStyle = '#b57cf7';
    else if (food.type === 'green') ctx.fillStyle = '#4dd68a';
    ctx.fillRect(food.x, food.y, box-1, box-1);
  }

  // grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.02)';
  for (let gx=0; gx<=gridSize; gx++){
    ctx.beginPath(); ctx.moveTo(gx*box,0); ctx.lineTo(gx*box,gridSize*box); ctx.stroke();
  }
  for (let gy=0; gy<=gridSize; gy++){
    ctx.beginPath(); ctx.moveTo(0,gy*box); ctx.lineTo(gridSize*box,gy*box); ctx.stroke();
  }
}

/* ---------- Input handling ---------- */
document.addEventListener('keydown', (e) => {
  // P toggle pause/resume
  if (e.key === 'p' || e.key === 'P') { togglePause(); return; }
  if (e.key === 'r' || e.key === 'R') { restartGame(); return; }

  // P1 arrows
  if ((e.key === 'ArrowLeft' || e.key === 'Left') && dir1 !== 'RIGHT') dir1 = 'LEFT';
  else if ((e.key === 'ArrowRight' || e.key === 'Right') && dir1 !== 'LEFT') dir1 = 'RIGHT';
  else if ((e.key === 'ArrowUp' || e.key === 'Up') && dir1 !== 'DOWN') dir1 = 'UP';
  else if ((e.key === 'ArrowDown' || e.key === 'Down') && dir1 !== 'UP') dir1 = 'DOWN';

  // P2 WASD (only when two-player mode)
  if (isTwoPlayersMode){
    if ((e.key === 'a' || e.key === 'A') && dir2 !== 'RIGHT') dir2 = 'LEFT';
    else if ((e.key === 'd' || e.key === 'D') && dir2 !== 'LEFT') dir2 = 'RIGHT';
    else if ((e.key === 'w' || e.key === 'W') && dir2 !== 'DOWN') dir2 = 'UP';
    else if ((e.key === 's' || e.key === 'S') && dir2 !== 'UP') dir2 = 'DOWN';
  }
});

/* ---------- Pause / resume / restart ---------- */
btnPause.addEventListener('click', togglePause);
btnRestart.addEventListener('click', restartGame);
btnShowMenu.addEventListener('click', showMenu);

function togglePause(){
  if (!gameInterval) return;
  paused = !paused;
  if (paused){
    clearInterval(gameInterval);
    gameInterval = null;
    showToast('Paused');
  } else {
    restartIntervalWithDelay();
    showToast('Resumed');
  }
}

function restartIntervalWithDelay(){
  if (gameInterval) clearInterval(gameInterval);
  gameInterval = setInterval(loop, delay);
}

function restartGame(){
  if (!usingCustomMap) obstacles = presetMaps[currentMapName].slice();
  startGame(isTwoPlayersMode);
}

/* ---------- HUD ---------- */
function updateHUD(){
  p1ScoreEl.textContent = p1Score;
  p2ScoreEl.textContent = p2Score;
  p1LivesEl.textContent = heartsDisplay(p1Lives);
  p2LivesEl.textContent = heartsDisplay(p2Lives);
  hudMapEl.textContent = currentMapName;
  hudBestEl.textContent = getHighScoreFor(currentMapName, difficulty);
  highscoreInfo.textContent = `Map: ${currentMapName || '—'} · Difficulty: ${capitalize(difficulty)}`;
  p2Hud.style.display = isTwoPlayersMode ? 'block' : 'none';
  document.getElementById('p2Lives').parentElement.style.display = isTwoPlayersMode ? 'block' : 'none';
}

/* ---------- Reset common ---------- */
function resetCommon(){
  p1Score = 0; p2Score = 0;
  p1Lives = 3; p2Lives = 3;
  invuln1 = false; invuln2 = false;
  spawnFood();
  updateHUD();
  // remove overlays if any
  Array.from(document.querySelectorAll('.overlay')).forEach(o => o.remove());
}

/* ---------- Menu helpers ---------- */
function showPresetSelector(){
  presetPanel.style.display = 'block';
  editorPanel.style.display = 'none';
  // visually select current map button if none selected
  const mapButtons = document.querySelectorAll('.mapList button');
  mapButtons.forEach(b => {
    if (b.dataset.map === currentMapName) b.style.outline = '3px solid rgba(255,255,255,0.06)';
    else b.style.outline = 'none';
  });
}
function showEditor(){
  editorPanel.style.display = 'block';
  presetPanel.style.display = 'none';
  drawEditorGrid();
}
function showMenu(){
  if (gameInterval) clearInterval(gameInterval);
  gameInterval = null;
  editorPanel.style.display = 'none';
  presetPanel.style.display = 'none';
  ctx.clearRect(0,0,canvas.width,canvas.height);
  updateHUD();
}

/* ---------- init on load ---------- */
(function init(){
  // set default difficulty button visuals
  difficultyRow.querySelectorAll('button').forEach(x => {
    if (x.dataset.diff === difficulty) x.className = 'btn';
    else x.className = 'btn ghost';
  });
  curDifficulty.textContent = capitalize(difficulty);
  currentMapName = 'classic';
  drawEditorGrid();
  updateHUD();
  // small sample draw
  ctx.fillStyle = '#000'; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = '#39d353'; ctx.fillRect(9*box,10*box,box-1,box-1);
  ctx.fillStyle = '#ff4d4d'; ctx.fillRect(5*box,5*box,box-1,box-1);
})();