// ============================================================
//  KINETIC FAILURE - game.js
//  Physics sandbox using Matter.js
//  Dr. Felix Crashmore's Lab of Doom
// ============================================================

'use strict';

// ---- Matter.js aliases ----
const { Engine, Render, Runner, Bodies, Body, Composite, Composites,
        Constraint, Events, Mouse, MouseConstraint, Vector, World } = Matter;

// ============================================================
//  READ INITIAL CONDITIONS FROM URL PARAMS
// ============================================================
const _p = new URLSearchParams(window.location.search);
const IC = {
  mode:     _p.get('mode')    || 'play',
  angle:    parseFloat(_p.get('angle'))   || 45,      // degrees
  power:    parseFloat(_p.get('power'))   || 0.7,     // 0–1
  mass:     parseFloat(_p.get('mass'))    || 70,      // kg
  gravity:  parseFloat(_p.get('gravity'))|| 9.81,    // m/s²
  friction: parseFloat(_p.get('friction'))|| 0.6,
  bounce:   parseFloat(_p.get('bounce')) || 0.3,
  wind:     parseFloat(_p.get('wind'))   || 0,       // N (horizontal force per frame)
  level:    _p.get('level')   || 'classic',
  vx:       parseFloat(_p.get('vx'))     || 0,       // initial velocity x m/s
  vy:       parseFloat(_p.get('vy'))     || 0,       // initial velocity y m/s
};

// ============================================================
//  CONSTANTS & CONFIG
// ============================================================
const CANVAS_W = window.innerWidth;
const CANVAS_H = window.innerHeight;
const GROUND_Y = CANVAS_H - 60;
const SCALE    = 1;
const MASS_KG  = IC.mass;
const GRAVITY  = IC.gravity;

// Colors
const C = {
  cyan:   '#00f5ff',
  purple: '#bf00ff',
  yellow: '#ffff00',
  pink:   '#ff00aa',
  orange: '#ff6600',
  green:  '#00ff88',
  dark:   '#0a0a1a',
  panel:  '#0d1117',
  ground: '#1a1a3a',
  wall:   '#0f1f3a',
};

// ============================================================
//  ENGINE SETUP
// ============================================================
// Map real gravity (9.81 m/s²) → engine scale (1.5 default at 9.81)
const gravityScale = (IC.gravity / 9.81) * 1.5;
const engine = Engine.create({ gravity: { x: 0, y: gravityScale } });
const world  = engine.world;

const canvas = document.getElementById('game-canvas');
canvas.width  = CANVAS_W;
canvas.height = CANVAS_H;
const ctx = canvas.getContext('2d');

// ============================================================
//  GAME STATE
// ============================================================
const state = {
  launched:    false,
  airborne:    false,
  slowmo:      false,
  dragging:    false,
  dragStart:   { x: 0, y: 0 },
  dragCurrent: { x: 0, y: 0 },
  score:       0,
  combo:       1,
  comboTimer:  0,
  flips:       0,
  lastAngle:   0,
  totalRotation: 0,
  distance:    0,
  airTime:     0,
  maxVel:      0,
  velHistory:  [],
  impactForce: 0,
  lastKE:      0,
  runTime:     0,
  replayFrames:[],
  recording:   false,
  replaying:   false,
  replayIdx:   0,
  hitObjects:  0,
  launchPad:   null,
  ragdoll:     null,
};

// ============================================================
//  NARRATOR LINES
// ============================================================
const narratorLines = [
  "Welcome to the lab, Dr. Crashmore. Try not to break anything... important.",
  "Excellent application of Newton's First Law! Objects in motion stay in motion — especially into walls.",
  "That's gonna leave a mark... and a lesson!",
  "Physics: 1, Scientist: 0",
  "F = ma. The 'a' stands for 'absolutely flying'.",
  "Momentum conserved! Dignity: not so much.",
  "KE = ½mv². The ½ is for half the bones intact.",
  "Gravitational potential energy converting nicely to kinetic energy... and pain.",
  "Newton's Third Law: For every action, there is an equal and opposite OUCH.",
  "That rotation was textbook! The textbook was also thrown at you.",
  "Impact force calculated. Medical bills: incalculable.",
  "Impressive air time! The ground disagrees.",
  "Coefficient of restitution: surprisingly high. Coefficient of dignity: zero.",
  "Science demands sacrifice. Usually yours.",
  "Terminal velocity achieved! Terminal is the key word here.",
  "Angular momentum preserved beautifully. Spine: less so.",
  "That's what we call an 'unplanned rapid deceleration event'.",
  "The data is clear: you are very bad at this. Scientifically speaking.",
  "Hypothesis: you will hit that wall. Result: confirmed.",
  "Every great scientist fails forward. Mostly forward, into things.",
];

let narratorIdx = 0;
let narratorTimer = 0;

function showNarrator(text) {
  const box = document.getElementById('narrator-box');
  const span = document.getElementById('narrator-text');
  span.textContent = text;
  box.style.opacity = '1';
  clearTimeout(box._hideTimer);
  box._hideTimer = setTimeout(() => { box.style.opacity = '0.4'; }, 4000);
}

function cycleNarrator() {
  narratorIdx = (narratorIdx + 1) % narratorLines.length;
  showNarrator(narratorLines[narratorIdx]);
}

// ============================================================
//  LEVEL GEOMETRY
// ============================================================
const levelBodies = [];

function buildLevel() {
  // Ground
  const ground = Bodies.rectangle(CANVAS_W / 2, GROUND_Y + 30, CANVAS_W * 3, 60,
    { isStatic: true, friction: IC.friction, restitution: IC.bounce,
      label: 'ground',
      render: { fillStyle: C.ground } });

  // Left wall
  const wallL = Bodies.rectangle(-30, CANVAS_H / 2, 60, CANVAS_H * 2,
    { isStatic: true, label: 'wall', render: { fillStyle: C.wall } });

  // Right boundary (far right)
  const wallR = Bodies.rectangle(CANVAS_W + 30, CANVAS_H / 2, 60, CANVAS_H * 2,
    { isStatic: true, label: 'wall', render: { fillStyle: C.wall } });

  // ---- Platforms ----
  const plat1 = Bodies.rectangle(350, GROUND_Y - 80, 160, 18,
    { isStatic: true, friction: 0.4, restitution: 0.2, label: 'platform',
      render: { fillStyle: '#1a2a4a' } });

  const plat2 = Bodies.rectangle(600, GROUND_Y - 160, 120, 18,
    { isStatic: true, friction: 0.3, restitution: 0.3, label: 'platform',
      render: { fillStyle: '#1a2a4a' } });

  const plat3 = Bodies.rectangle(900, GROUND_Y - 100, 200, 18,
    { isStatic: true, friction: 0.5, restitution: 0.15, label: 'platform',
      render: { fillStyle: '#1a2a4a' } });

  // ---- Ramp ----
  const ramp1 = Bodies.rectangle(480, GROUND_Y - 40, 200, 18,
    { isStatic: true, friction: 0.2, restitution: 0.1, label: 'ramp',
      angle: -0.35,
      render: { fillStyle: '#2a1a4a' } });

  const ramp2 = Bodies.rectangle(780, GROUND_Y - 50, 180, 18,
    { isStatic: true, friction: 0.15, restitution: 0.1, label: 'ramp',
      angle: 0.3,
      render: { fillStyle: '#2a1a4a' } });

  // ---- Bouncy trampoline ----
  const tramp1 = Bodies.rectangle(700, GROUND_Y - 12, 120, 24,
    { isStatic: true, friction: 0.05, restitution: 1.4, label: 'trampoline',
      render: { fillStyle: '#003a1a' } });

  const tramp2 = Bodies.rectangle(1050, GROUND_Y - 12, 100, 24,
    { isStatic: true, friction: 0.05, restitution: 1.6, label: 'trampoline',
      render: { fillStyle: '#003a1a' } });

  // ---- Wall obstacles ----
  const wallObs1 = Bodies.rectangle(550, GROUND_Y - 60, 20, 120,
    { isStatic: true, friction: 0.3, restitution: 0.5, label: 'wall_obs',
      render: { fillStyle: '#2a0a3a' } });

  const wallObs2 = Bodies.rectangle(850, GROUND_Y - 80, 20, 160,
    { isStatic: true, friction: 0.3, restitution: 0.5, label: 'wall_obs',
      render: { fillStyle: '#2a0a3a' } });

  // ---- Launch pad ----
  const launchPad = Bodies.rectangle(120, GROUND_Y - 15, 100, 30,
    { isStatic: true, friction: 0.1, restitution: 0.05, label: 'launchpad',
      render: { fillStyle: '#001a3a' } });
  state.launchPad = launchPad;

  levelBodies.push(ground, wallL, wallR, plat1, plat2, plat3,
    ramp1, ramp2, tramp1, tramp2, wallObs1, wallObs2, launchPad);

  Composite.add(world, levelBodies);
}

// ============================================================
//  DESTRUCTIBLE PROPS
// ============================================================
const props = [];

function buildProps() {
  // Stack of boxes
  for (let i = 0; i < 4; i++) {
    const box = Bodies.rectangle(300, GROUND_Y - 25 - i * 52, 48, 48,
      { friction: 0.4, restitution: 0.3, density: 0.002, label: 'box',
        render: { fillStyle: '#1a3a5a' } });
    props.push(box);
  }

  // Scattered boxes
  const box2 = Bodies.rectangle(420, GROUND_Y - 25, 44, 44,
    { friction: 0.4, restitution: 0.35, density: 0.002, label: 'box',
      render: { fillStyle: '#1a3a5a' } });
  const box3 = Bodies.rectangle(460, GROUND_Y - 25, 44, 44,
    { friction: 0.4, restitution: 0.35, density: 0.002, label: 'box',
      render: { fillStyle: '#1a3a5a' } });

  // Barrels
  const barrel1 = Bodies.circle(650, GROUND_Y - 28, 28,
    { friction: 0.2, restitution: 0.5, density: 0.003, label: 'barrel',
      render: { fillStyle: '#3a1a0a' } });
  const barrel2 = Bodies.circle(680, GROUND_Y - 28, 28,
    { friction: 0.2, restitution: 0.5, density: 0.003, label: 'barrel',
      render: { fillStyle: '#3a1a0a' } });

  // Target circles
  const target1 = Bodies.circle(900, GROUND_Y - 30, 30,
    { friction: 0.3, restitution: 0.6, density: 0.001, label: 'target',
      render: { fillStyle: '#3a0a1a' } });
  const target2 = Bodies.circle(960, GROUND_Y - 30, 30,
    { friction: 0.3, restitution: 0.6, density: 0.001, label: 'target',
      render: { fillStyle: '#3a0a1a' } });

  // Spinning obstacle (will be animated)
  const spinner = Bodies.rectangle(750, GROUND_Y - 200, 160, 16,
    { isStatic: true, friction: 0.1, restitution: 0.4, label: 'spinner',
      render: { fillStyle: '#3a003a' } });
  state.spinner = spinner;

  props.push(box2, box3, barrel1, barrel2, target1, target2, spinner);
  Composite.add(world, props);
}

// ============================================================
//  RAGDOLL
// ============================================================
function createRagdoll(x, y) {
  const group = Body.nextGroup(true);
  const opts  = (label, extra) => ({
    collisionFilter: { group },
    friction: 0.3, restitution: 0.3, density: 0.004,
    label, ...extra
  });

  // Body parts
  const head     = Bodies.circle(x, y - 90, 20, opts('head', { density: 0.003 }));
  const torso    = Bodies.rectangle(x, y - 45, 22, 44, opts('torso', { density: 0.005 }));
  const upperArmL= Bodies.rectangle(x - 28, y - 52, 10, 28, opts('arm', {}));
  const upperArmR= Bodies.rectangle(x + 28, y - 52, 10, 28, opts('arm', {}));
  const lowerArmL= Bodies.rectangle(x - 28, y - 22, 8, 22, opts('arm', { density: 0.002 }));
  const lowerArmR= Bodies.rectangle(x + 28, y - 22, 8, 22, opts('arm', { density: 0.002 }));
  const upperLegL= Bodies.rectangle(x - 12, y + 10, 12, 32, opts('leg', {}));
  const upperLegR= Bodies.rectangle(x + 12, y + 10, 12, 32, opts('leg', {}));
  const lowerLegL= Bodies.rectangle(x - 12, y + 42, 10, 28, opts('leg', { density: 0.002 }));
  const lowerLegR= Bodies.rectangle(x + 12, y + 42, 10, 28, opts('leg', { density: 0.002 }));

  const parts = [head, torso, upperArmL, upperArmR, lowerArmL, lowerArmR,
                 upperLegL, upperLegR, lowerLegL, lowerLegR];

  // Constraints (joints)
  const stiffness = 0.6;
  const damping   = 0.1;
  const mkC = (bA, bB, pA, pB) => Constraint.create({
    bodyA: bA, bodyB: bB,
    pointA: pA, pointB: pB,
    stiffness, damping,
    render: { strokeStyle: 'rgba(0,245,255,0.4)', lineWidth: 1 }
  });

  const constraints = [
    mkC(head,      torso,     { x: 0, y: 18 },  { x: 0, y: -20 }),
    mkC(torso,     upperArmL, { x: -10, y: -18 },{ x: 0, y: -12 }),
    mkC(torso,     upperArmR, { x: 10, y: -18 }, { x: 0, y: -12 }),
    mkC(upperArmL, lowerArmL, { x: 0, y: 12 },  { x: 0, y: -10 }),
    mkC(upperArmR, lowerArmR, { x: 0, y: 12 },  { x: 0, y: -10 }),
    mkC(torso,     upperLegL, { x: -8, y: 20 },  { x: 0, y: -14 }),
    mkC(torso,     upperLegR, { x: 8, y: 20 },   { x: 0, y: -14 }),
    mkC(upperLegL, lowerLegL, { x: 0, y: 14 },  { x: 0, y: -12 }),
    mkC(upperLegR, lowerLegR, { x: 0, y: 14 },  { x: 0, y: -12 }),
  ];

  Composite.add(world, [...parts, ...constraints]);

  return { parts, constraints, head, torso,
           upperArmL, upperArmR, lowerArmL, lowerArmR,
           upperLegL, upperLegR, lowerLegL, lowerLegR };
}

function spawnRagdoll() {
  if (state.ragdoll) {
    Composite.remove(world, [...state.ragdoll.parts, ...state.ragdoll.constraints]);
  }
  state.ragdoll = createRagdoll(120, GROUND_Y - 120);
  state.launched = false;
  state.airborne = false;
  state.totalRotation = 0;
  state.lastAngle = state.ragdoll.torso.angle;
  state.flips = 0;
  state.airTime = 0;
  state.runTime = 0;
  state.distance = 0;
  state.velHistory = [];
  state.replayFrames = [];
  state.recording = true;
  document.getElementById('replay-btn').style.display = 'none';
  document.getElementById('aim-hint').style.opacity = '1';
  updateHUD();
}

// ============================================================
//  LAUNCH SYSTEM
// ============================================================
function launchRagdoll(forceX, forceY) {
  if (!state.ragdoll || state.launched) return;
  state.launched = true;
  state.airborne = true;
  document.getElementById('aim-hint').style.opacity = '0';

  const rd = state.ragdoll;
  const allParts = rd.parts;

  // Apply force to all body parts
  allParts.forEach(part => {
    Body.applyForce(part, part.position, {
      x: forceX * part.mass,
      y: forceY * part.mass
    });
    // Apply any user-specified initial velocity offset (scaled)
    if (IC.vx !== 0 || IC.vy !== 0) {
      const cv = part.velocity;
      Body.setVelocity(part, {
        x: cv.x + IC.vx * 0.05,
        y: cv.y - IC.vy * 0.05   // vy positive = upward in real world
      });
    }
  });

  // Extra torque for fun spin
  Body.setAngularVelocity(rd.torso, (Math.random() - 0.5) * 0.3);

  showNarrator(narratorLines[Math.floor(Math.random() * 5) + 1]);
  state.combo = 1;
  state.hitObjects = 0;
}

// ============================================================
//  MOUSE / DRAG INPUT
// ============================================================
const LAUNCH_PAD_X = 120;
const LAUNCH_PAD_Y = GROUND_Y - 120;

canvas.addEventListener('mousedown', onMouseDown);
canvas.addEventListener('mousemove', onMouseMove);
canvas.addEventListener('mouseup',   onMouseUp);
canvas.addEventListener('touchstart', e => { e.preventDefault(); onMouseDown(e.touches[0]); }, { passive: false });
canvas.addEventListener('touchmove',  e => { e.preventDefault(); onMouseMove(e.touches[0]); }, { passive: false });
canvas.addEventListener('touchend',   e => { e.preventDefault(); onMouseUp(e.changedTouches[0]); }, { passive: false });

function getCanvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function onMouseDown(e) {
  if (state.launched || state.replaying) return;
  const pos = getCanvasPos(e);
  // Only start drag near the ragdoll
  const rd = state.ragdoll;
  if (!rd) return;
  const dx = pos.x - rd.torso.position.x;
  const dy = pos.y - rd.torso.position.y;
  if (Math.sqrt(dx*dx + dy*dy) < 80) {
    state.dragging = true;
    state.dragStart = { ...rd.torso.position };
    state.dragCurrent = pos;
    document.getElementById('power-bar-container').classList.add('visible');
  }
}

function onMouseMove(e) {
  if (!state.dragging) return;
  state.dragCurrent = getCanvasPos(e);
  // Update power bar
  const dx = state.dragStart.x - state.dragCurrent.x;
  const dy = state.dragStart.y - state.dragCurrent.y;
  const power = Math.min(Math.sqrt(dx*dx + dy*dy) / 200, 1);
  document.getElementById('power-bar-fill').style.width = (power * 100) + '%';
}

function onMouseUp(e) {
  if (!state.dragging) return;
  state.dragging = false;
  document.getElementById('power-bar-container').classList.remove('visible');
  document.getElementById('power-bar-fill').style.width = '0%';

  const pos = getCanvasPos(e);
  const dx = state.dragStart.x - pos.x;
  const dy = state.dragStart.y - pos.y;
  const dist = Math.sqrt(dx*dx + dy*dy);
  if (dist < 10) return;

  const maxForce = 0.055;
  const power = Math.min(dist / 200, 1) * IC.power;
  const fx = (dx / dist) * maxForce * power;
  const fy = (dy / dist) * maxForce * power;
  launchRagdoll(fx, fy);
}

// ============================================================
//  KEYBOARD INPUT
// ============================================================
document.addEventListener('keydown', e => {
  switch (e.code) {
    case 'Space':
      e.preventDefault();
      if (!state.launched && !state.replaying) {
        // Use IC angle and power for default launch
        const rad = (IC.angle * Math.PI) / 180;
        const maxForce = 0.055;
        const fx =  Math.cos(rad) * maxForce * IC.power;
        const fy = -Math.sin(rad) * maxForce * IC.power;
        launchRagdoll(fx, fy);
      }
      break;
    case 'KeyS':
      toggleSlowmo();
      break;
    case 'KeyR':
      resetRun();
      break;
  }
});

function toggleSlowmo() {
  state.slowmo = !state.slowmo;
  engine.timing.timeScale = state.slowmo ? 0.25 : 1.0;
  document.getElementById('slowmo-indicator').classList.toggle('active', state.slowmo);
  document.body.classList.toggle('slowmo', state.slowmo);
}

function resetRun() {
  // Reset props
  props.forEach(p => {
    if (!p.isStatic) {
      Body.setPosition(p, p._originalPos ? { x: p._originalPos.x, y: p._originalPos.y } : p.position);
      Body.setVelocity(p, { x: 0, y: 0 });
      Body.setAngularVelocity(p, 0);
      Body.setAngle(p, p._originalAngle || 0);
    }
  });
  state.score = 0;
  state.combo = 1;
  updateScore(0);
  spawnRagdoll();
  showNarrator("Reset! Let's try that again, shall we?");
}

// ============================================================
//  COLLISION EVENTS
// ============================================================
Events.on(engine, 'collisionStart', e => {
  if (state.replaying) return;
  e.pairs.forEach(pair => {
    const { bodyA, bodyB } = pair;
    const isRagdollPart = b => state.ragdoll && state.ragdoll.parts.includes(b);

    if (isRagdollPart(bodyA) || isRagdollPart(bodyB)) {
      const ragPart = isRagdollPart(bodyA) ? bodyA : bodyB;
      const other   = ragPart === bodyA ? bodyB : bodyA;

      const vel = ragPart.velocity;
      const speed = Math.sqrt(vel.x*vel.x + vel.y*vel.y);

      if (speed > 2) {
        handleImpact(ragPart, other, speed);
      }
    }
  });
});

function handleImpact(ragPart, other, speed) {
  const ke = 0.5 * MASS_KG * speed * speed;
  const momentum = MASS_KG * speed;
  const force = MASS_KG * speed * 10; // simplified impact force

  state.impactForce = force;
  const dke = Math.abs(ke - state.lastKE);
  state.lastKE = ke;

  // Update impact HUD
  const impactPanel = document.getElementById('impact-panel');
  impactPanel.style.opacity = '1';
  document.getElementById('hud-impact').textContent = force.toFixed(0) + ' N';
  document.getElementById('hud-dke').textContent = dke.toFixed(0) + ' J';
  setTimeout(() => { impactPanel.style.opacity = '0'; }, 3000);

  // Screen shake based on speed
  if (speed > 5) triggerScreenShake(Math.min(speed / 5, 3));

  // Spawn particles
  spawnParticles(ragPart.position.x, ragPart.position.y, speed);

  // Physics popups
  const pos = { x: ragPart.position.x, y: ragPart.position.y };
  if (speed > 3) {
    spawnPhysicsPopup(pos, 'fma',
      `F = ma  →  ${force.toFixed(0)} N`, 'popup-fma');
    setTimeout(() => spawnPhysicsPopup(
      { x: pos.x + 20, y: pos.y - 20 },
      'ke', `KE = ½mv²  →  ${ke.toFixed(0)} J`, 'popup-ke'), 200);
    setTimeout(() => spawnPhysicsPopup(
      { x: pos.x - 20, y: pos.y - 40 },
      'mom', `p = mv  →  ${momentum.toFixed(0)} kg·m/s`, 'popup-mom'), 400);
  }

  // Comic text
  if (speed > 8) {
    const words = ['POW!','CRASH!','SPLAT!','WHAM!','BONK!','OUCH!','ZAP!'];
    spawnComicText(pos, words[Math.floor(Math.random() * words.length)], speed);
  }

  // Score
  const pts = Math.floor(speed * 10 * state.combo);
  addScore(pts);

  // Combo
  state.hitObjects++;
  if (state.hitObjects > 1) {
    state.combo = Math.min(state.combo + 0.5, 8);
    state.comboTimer = 120;
  }

  // Narrator
  if (speed > 10 && Math.random() < 0.5) {
    const lines = narratorLines.slice(5);
    showNarrator(lines[Math.floor(Math.random() * lines.length)]);
  }

  // Label-specific effects
  if (other.label === 'trampoline') {
    showNarrator("Bouncy! The trampoline stores and releases elastic potential energy!");
    spawnPhysicsPopup(pos, 'fma', 'F = -kx  (Hooke\'s Law!)', 'popup-fma');
  }
  if (other.label === 'target') {
    addScore(500 * state.combo);
    spawnComicText(pos, 'TARGET!', 15);
    showNarrator("Direct hit! Momentum transferred perfectly!");
  }
}

// ============================================================
//  PARTICLES
// ============================================================
const particles = [];

function spawnParticles(x, y, speed) {
  const count = Math.floor(Math.min(speed * 3, 30));
  const colors = [C.cyan, C.purple, C.yellow, C.pink, C.orange, C.green];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const vel   = (Math.random() * speed * 0.5 + 1);
    particles.push({
      x, y,
      vx: Math.cos(angle) * vel,
      vy: Math.sin(angle) * vel - 2,
      life: 1.0,
      decay: 0.03 + Math.random() * 0.04,
      r: Math.random() * 4 + 1,
      color: colors[Math.floor(Math.random() * colors.length)],
      type: Math.random() < 0.3 ? 'spark' : 'dot'
    });
  }
  // Stars
  for (let i = 0; i < 5; i++) {
    particles.push({
      x: x + (Math.random()-0.5)*40,
      y: y + (Math.random()-0.5)*40,
      vx: (Math.random()-0.5)*2,
      vy: -Math.random()*3 - 1,
      life: 1.0,
      decay: 0.02,
      r: 6,
      color: C.yellow,
      type: 'star'
    });
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15;
    p.life -= p.decay;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  particles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = p.life;
    if (p.type === 'spark') {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 4, p.y - p.vy * 4);
      ctx.stroke();
    } else if (p.type === 'star') {
      drawStar(ctx, p.x, p.y, 5, p.r, p.r * 0.4, p.color);
    } else {
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}

function drawStar(ctx, cx, cy, spikes, outerR, innerR, color) {
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;
  ctx.moveTo(cx, cy - outerR);
  for (let i = 0; i < spikes; i++) {
    ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
    rot += step;
    ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
    rot += step;
  }
  ctx.lineTo(cx, cy - outerR);
  ctx.closePath();
  ctx.fill();
}

// ============================================================
//  PHYSICS POPUPS
// ============================================================
function spawnPhysicsPopup(pos, type, text, cssClass) {
  const layer = document.getElementById('popup-layer');
  const el = document.createElement('div');
  el.className = `physics-popup ${cssClass}`;
  el.textContent = text;
  el.style.left = Math.max(10, Math.min(pos.x - 80, window.innerWidth - 200)) + 'px';
  el.style.top  = Math.max(10, pos.y - 60) + 'px';
  layer.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

// ============================================================
//  COMIC TEXT
// ============================================================
function spawnComicText(pos, text, speed) {
  const layer = document.getElementById('popup-layer');
  const el = document.createElement('div');
  el.className = 'comic-text';
  const size = Math.min(20 + speed * 2, 60);
  el.style.fontSize = size + 'px';
  el.style.left = Math.max(20, pos.x - size * text.length * 0.3) + 'px';
  el.style.top  = (pos.y - 60) + 'px';
  el.style.color = [C.yellow, C.pink, C.cyan, C.orange][Math.floor(Math.random()*4)];
  el.textContent = text;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

// ============================================================
//  SCREEN SHAKE
// ============================================================
let shakeFrames = 0;
let shakeIntensity = 0;

function triggerScreenShake(intensity) {
  shakeIntensity = intensity;
  shakeFrames = Math.floor(intensity * 6);
}

function applyScreenShake() {
  if (shakeFrames > 0) {
    const s = shakeIntensity * (shakeFrames / 10);
    canvas.style.transform = `translate(${(Math.random()-0.5)*s*4}px, ${(Math.random()-0.5)*s*4}px)`;
    shakeFrames--;
  } else {
    canvas.style.transform = '';
  }
}

// ============================================================
//  SCORE SYSTEM
// ============================================================
function addScore(pts) {
  state.score += Math.floor(pts);
  updateScore(state.score);
}

function updateScore(val) {
  const el = document.getElementById('score-value');
  el.textContent = val.toLocaleString();
  // Failure rating
  const ratings = ['F-','F','F+','D-','D','D+','C-','C','C+','B-','B','B+','A-','A','A+','S','S+','SS','SSS','LEGENDARY'];
  const idx = Math.min(Math.floor(val / 500), ratings.length - 1);
  document.getElementById('failure-rating').textContent = 'RATING: ' + ratings[idx];
}

// ============================================================
//  HUD UPDATE
// ============================================================
function updateHUD() {
  if (!state.ragdoll) return;
  const torso = state.ragdoll.torso;
  const vel = torso.velocity;
  const speed = Math.sqrt(vel.x*vel.x + vel.y*vel.y);
  const speedMs = speed * 10; // scale to m/s feel

  // Velocity
  const velEl = document.getElementById('hud-vel');
  velEl.textContent = speedMs.toFixed(1) + ' m/s';
  velEl.className = 'hv' + (speedMs > 30 ? ' danger' : speedMs > 15 ? ' warn' : '');

  // KE
  const ke = 0.5 * MASS_KG * speedMs * speedMs;
  document.getElementById('hud-ke').textContent = ke.toFixed(0) + ' J';

  // Momentum
  const mom = MASS_KG * speedMs;
  document.getElementById('hud-mom').textContent = mom.toFixed(0) + ' kg·m/s';

  // G-force (approximate from velocity change)
  const gforce = Math.max(1, speedMs / 9.81);
  const gEl = document.getElementById('hud-gforce');
  gEl.textContent = gforce.toFixed(1) + ' g';
  gEl.className = 'hv' + (gforce > 10 ? ' danger' : gforce > 5 ? ' warn' : '');

  // Rotation
  const angVel = Math.abs(torso.angularVelocity) * 57.3 * 10;
  document.getElementById('hud-rot').textContent = angVel.toFixed(0) + '°/s';

  // Distance
  const startX = 120;
  const dist = Math.max(0, torso.position.x - startX) * 0.1;
  state.distance = dist;
  document.getElementById('hud-dist').textContent = dist.toFixed(1) + 'm';

  // Time
  document.getElementById('hud-time').textContent = state.runTime.toFixed(1) + 's';

  // Flips
  document.getElementById('hud-flips').textContent = state.flips;

  // Velocity history for graph
  state.velHistory.push(speedMs);
  if (state.velHistory.length > 90) state.velHistory.shift();
  drawVelGraph();
}

// ============================================================
//  VELOCITY GRAPH
// ============================================================
function drawVelGraph() {
  const gc = document.getElementById('vel-graph-canvas');
  const gx = gc.getContext('2d');
  const w = gc.width, h = gc.height;
  gx.clearRect(0, 0, w, h);

  if (state.velHistory.length < 2) return;

  const maxV = Math.max(...state.velHistory, 10);
  gx.beginPath();
  gx.strokeStyle = C.cyan;
  gx.lineWidth = 1.5;
  gx.shadowColor = C.cyan;
  gx.shadowBlur = 4;

  state.velHistory.forEach((v, i) => {
    const px = (i / (state.velHistory.length - 1)) * w;
    const py = h - (v / maxV) * h * 0.9;
    i === 0 ? gx.moveTo(px, py) : gx.lineTo(px, py);
  });
  gx.stroke();

  // Fill under curve
  gx.lineTo(w, h); gx.lineTo(0, h); gx.closePath();
  gx.fillStyle = 'rgba(0,245,255,0.08)';
  gx.fill();
}

// ============================================================
//  FLIP TRACKING
// ============================================================
function trackFlips() {
  if (!state.ragdoll || !state.airborne) return;
  const torso = state.ragdoll.torso;
  const angleDiff = torso.angle - state.lastAngle;
  state.lastAngle = torso.angle;

  // Normalize
  let diff = angleDiff;
  while (diff > Math.PI)  diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;

  state.totalRotation += Math.abs(diff);
  const newFlips = Math.floor(state.totalRotation / (Math.PI * 2));
  if (newFlips > state.flips) {
    state.flips = newFlips;
    addScore(200 * state.combo);
    showNarrator("FLIP! Angular momentum is beautiful... when it's not your spine.");
    spawnComicText(state.ragdoll.torso.position, 'FLIP!', 12);
  }
}

// ============================================================
//  REPLAY SYSTEM
// ============================================================
function recordFrame() {
  if (!state.recording || !state.ragdoll) return;
  const frame = state.ragdoll.parts.map(p => ({
    x: p.position.x, y: p.position.y, a: p.angle
  }));
  state.replayFrames.push(frame);
  // Keep last 600 frames (10s at 60fps)
  if (state.replayFrames.length > 600) state.replayFrames.shift();
}

function startReplay() {
  if (state.replayFrames.length < 2) return;
  state.replaying = true;
  state.replayIdx = 0;
  engine.timing.timeScale = 0;
  showNarrator("REPLAY! Reliving the glory... and the pain.");
}

function stopReplay() {
  state.replaying = false;
  engine.timing.timeScale = state.slowmo ? 0.25 : 1.0;
}

function updateReplay() {
  if (!state.replaying || !state.ragdoll) return;
  const frame = state.replayFrames[state.replayIdx];
  if (!frame) { stopReplay(); return; }

  state.ragdoll.parts.forEach((p, i) => {
    if (frame[i]) {
      Body.setPosition(p, { x: frame[i].x, y: frame[i].y });
      Body.setAngle(p, frame[i].a);
    }
  });

  state.replayIdx += 0.5; // slow replay
  if (state.replayIdx >= state.replayFrames.length) stopReplay();
}

// ============================================================
//  SPINNER ANIMATION
// ============================================================
let spinnerAngle = 0;
function updateSpinner() {
  if (!state.spinner) return;
  spinnerAngle += 0.02;
  Body.setAngle(state.spinner, spinnerAngle);
  Body.setAngularVelocity(state.spinner, 0.02);
}

// ============================================================
//  COMBO SYSTEM
// ============================================================
function updateCombo() {
  if (state.comboTimer > 0) {
    state.comboTimer--;
    if (state.comboTimer === 0) {
      state.combo = 1;
    }
  }
  const comboEl = document.querySelector('#hud-right .hud-panel:last-child div');
  if (comboEl) {
    comboEl.textContent = 'x' + state.combo.toFixed(1);
    comboEl.style.color = state.combo > 3 ? C.pink : state.combo > 2 ? C.orange : C.cyan;
  }
}

// ============================================================
//  AIRBORNE DETECTION
// ============================================================
function checkAirborne() {
  if (!state.ragdoll || !state.launched) return;
  const torso = state.ragdoll.torso;
  const onGround = torso.position.y > GROUND_Y - 30;

  if (!onGround) {
    state.airTime += 1/60;
    state.runTime += 1/60;
  } else if (state.airborne && onGround) {
    // Landed
    state.airborne = false;
    state.recording = false;
    document.getElementById('replay-btn').style.display = 'block';

    // Distance bonus
    const distBonus = Math.floor(state.distance * 50);
    addScore(distBonus);
    addScore(state.flips * 200);

    showNarrator(narratorLines[Math.floor(Math.random() * narratorLines.length)]);
  }
}

// ============================================================
//  CUSTOM RENDERER
// ============================================================

// Camera / viewport
const camera = { x: 0, y: 0, targetX: 0, targetY: 0 };

function updateCamera() {
  if (!state.ragdoll) return;
  const torso = state.ragdoll.torso;
  camera.targetX = torso.position.x - CANVAS_W * 0.35;
  camera.targetY = Math.max(0, torso.position.y - CANVAS_H * 0.55);
  // Smooth follow
  camera.x += (camera.targetX - camera.x) * 0.08;
  camera.y += (camera.targetY - camera.y) * 0.08;
  // Clamp
  camera.x = Math.max(0, camera.x);
  camera.y = Math.max(0, camera.y);
}

function worldToScreen(x, y) {
  return { x: x - camera.x, y: y - camera.y };
}

// ---- Draw background ----
function drawBackground() {
  // Sky gradient
  const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  grad.addColorStop(0, '#050510');
  grad.addColorStop(0.6, '#0a0a1a');
  grad.addColorStop(1, '#0d0d20');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Grid
  ctx.strokeStyle = 'rgba(0,245,255,0.04)';
  ctx.lineWidth = 1;
  const gridSize = 80;
  const offX = camera.x % gridSize;
  const offY = camera.y % gridSize;
  for (let x = -offX; x < CANVAS_W + gridSize; x += gridSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke();
  }
  for (let y = -offY; y < CANVAS_H + gridSize; y += gridSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke();
  }

  // Distant lab elements (parallax)
  drawLabBackground();
}

function drawLabBackground() {
  ctx.save();
  ctx.globalAlpha = 0.12;
  // Floating equations in background
  const eqs = ['F=ma','E=½mv²','p=mv','v=at','W=Fd','a=v²/r'];
  ctx.font = '14px Orbitron, monospace';
  ctx.fillStyle = C.cyan;
  eqs.forEach((eq, i) => {
    const bx = (i * 300 - camera.x * 0.2) % (CANVAS_W + 400) - 200;
    const by = 100 + i * 80;
    ctx.fillText(eq, bx, by);
  });
  ctx.restore();
}

// ---- Draw a body ----
function drawBody(body, fillColor, strokeColor, glowColor) {
  const pos = worldToScreen(body.position.x, body.position.y);
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(body.angle);

  if (glowColor) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 12;
  }

  ctx.fillStyle = fillColor || '#1a3a5a';
  ctx.strokeStyle = strokeColor || 'rgba(0,245,255,0.5)';
  ctx.lineWidth = 1.5;

  const verts = body.vertices;
  if (verts.length > 0) {
    ctx.beginPath();
    // Vertices are in world space, need to transform
    ctx.restore();
    ctx.save();
    if (glowColor) { ctx.shadowColor = glowColor; ctx.shadowBlur = 10; }
    ctx.fillStyle = fillColor || '#1a3a5a';
    ctx.strokeStyle = strokeColor || 'rgba(0,245,255,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const v0 = worldToScreen(verts[0].x, verts[0].y);
    ctx.moveTo(v0.x, v0.y);
    for (let i = 1; i < verts.length; i++) {
      const vi = worldToScreen(verts[i].x, verts[i].y);
      ctx.lineTo(vi.x, vi.y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.restore();
}

// ---- Draw circle body ----
function drawCircleBody(body, fillColor, strokeColor, glowColor) {
  const pos = worldToScreen(body.position.x, body.position.y);
  const r = body.circleRadius || 20;
  ctx.save();
  if (glowColor) { ctx.shadowColor = glowColor; ctx.shadowBlur = 12; }
  ctx.fillStyle = fillColor;
  ctx.strokeStyle = strokeColor || 'rgba(0,245,255,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// ---- Draw all level bodies ----
function drawLevel() {
  levelBodies.forEach(body => {
    const label = body.label;
    let fill, stroke, glow;

    if (label === 'ground') {
      fill = '#12122a'; stroke = 'rgba(0,245,255,0.2)'; glow = null;
    } else if (label === 'platform') {
      fill = '#1a2a4a'; stroke = C.cyan; glow = C.cyan;
    } else if (label === 'ramp') {
      fill = '#2a1a4a'; stroke = C.purple; glow = C.purple;
    } else if (label === 'trampoline') {
      fill = '#003a1a'; stroke = C.green; glow = C.green;
    } else if (label === 'wall_obs') {
      fill = '#2a0a3a'; stroke = C.pink; glow = C.pink;
    } else if (label === 'launchpad') {
      fill = '#001a3a'; stroke = C.cyan; glow = C.cyan;
    } else {
      fill = '#1a1a3a'; stroke = 'rgba(0,245,255,0.3)'; glow = null;
    }

    drawBodyVertices(body, fill, stroke, glow);

    // Trampoline stripes
    if (label === 'trampoline') {
      drawTrampolineStripes(body);
    }
    // Launch pad arrow
    if (label === 'launchpad') {
      drawLaunchPadArrow(body);
    }
  });
}

function drawBodyVertices(body, fill, stroke, glow) {
  const verts = body.vertices;
  if (!verts || verts.length === 0) return;
  ctx.save();
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 8; }
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const v0 = worldToScreen(verts[0].x, verts[0].y);
  ctx.moveTo(v0.x, v0.y);
  for (let i = 1; i < verts.length; i++) {
    const vi = worldToScreen(verts[i].x, verts[i].y);
    ctx.lineTo(vi.x, vi.y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawTrampolineStripes(body) {
  const pos = worldToScreen(body.position.x, body.position.y);
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(body.angle);
  ctx.strokeStyle = C.green;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.5;
  ctx.shadowColor = C.green;
  ctx.shadowBlur = 6;
  const w = 60, h = 12;
  for (let x = -w; x <= w; x += 15) {
    ctx.beginPath();
    ctx.moveTo(x, -h/2);
    ctx.lineTo(x + 8, h/2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLaunchPadArrow(body) {
  const pos = worldToScreen(body.position.x, body.position.y - 20);
  ctx.save();
  ctx.fillStyle = C.cyan;
  ctx.shadowColor = C.cyan;
  ctx.shadowBlur = 10;
  ctx.globalAlpha = 0.6 + 0.4 * Math.sin(Date.now() * 0.005);
  ctx.font = 'bold 20px Orbitron, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('▲', pos.x, pos.y);
  ctx.restore();
}

// ---- Draw props ----
function drawProps() {
  props.forEach(body => {
    const label = body.label;
    let fill, stroke, glow;

    if (label === 'box') {
      fill = '#1a3a5a'; stroke = C.cyan; glow = C.cyan;
    } else if (label === 'barrel') {
      fill = '#3a1a0a'; stroke = C.orange; glow = C.orange;
    } else if (label === 'target') {
      fill = '#3a0a1a'; stroke = C.pink; glow = C.pink;
    } else if (label === 'spinner') {
      fill = '#3a003a'; stroke = C.purple; glow = C.purple;
    } else {
      fill = '#1a2a3a'; stroke = C.cyan; glow = null;
    }

    if (body.circleRadius) {
      drawCircleBodyVerts(body, fill, stroke, glow);
      // Target rings
      if (label === 'target') drawTargetRings(body);
    } else {
      drawBodyVertices(body, fill, stroke, glow);
      // Box details
      if (label === 'box') drawBoxDetails(body);
    }
  });
}

function drawCircleBodyVerts(body, fill, stroke, glow) {
  const pos = worldToScreen(body.position.x, body.position.y);
  const r = body.circleRadius;
  ctx.save();
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 10; }
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawTargetRings(body) {
  const pos = worldToScreen(body.position.x, body.position.y);
  const r = body.circleRadius;
  ctx.save();
  ctx.strokeStyle = C.pink;
  ctx.shadowColor = C.pink;
  ctx.shadowBlur = 8;
  ctx.lineWidth = 1;
  [0.7, 0.4].forEach(scale => {
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r * scale, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.restore();
}

function drawBoxDetails(body) {
  const pos = worldToScreen(body.position.x, body.position.y);
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(body.angle);
  ctx.strokeStyle = 'rgba(0,245,255,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-20, -20); ctx.lineTo(20, 20);
  ctx.moveTo(20, -20);  ctx.lineTo(-20, 20);
  ctx.stroke();
  ctx.restore();
}

// ============================================================
//  RAGDOLL RENDERER
// ============================================================
function drawRagdoll() {
  if (!state.ragdoll) return;
  const rd = state.ragdoll;

  // Draw constraints (joints)
  rd.constraints.forEach(c => {
    if (!c.bodyA || !c.bodyB) return;
    const pA = worldToScreen(
      c.bodyA.position.x + (c.pointA ? c.pointA.x : 0),
      c.bodyA.position.y + (c.pointA ? c.pointA.y : 0)
    );
    const pB = worldToScreen(
      c.bodyB.position.x + (c.pointB ? c.pointB.x : 0),
      c.bodyB.position.y + (c.pointB ? c.pointB.y : 0)
    );
    ctx.save();
    ctx.strokeStyle = 'rgba(0,245,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pA.x, pA.y);
    ctx.lineTo(pB.x, pB.y);
    ctx.stroke();
    ctx.restore();
  });

  // Draw body parts with scientist appearance
  drawScientistBody(rd);
}

function drawScientistBody(rd) {
  // Helper to get screen pos
  const sp = body => worldToScreen(body.position.x, body.position.y);

  // ---- Legs ----
  drawLimb(rd.upperLegL, 12, 32, '#3a3a5c', '#5a5a8c');
  drawLimb(rd.upperLegR, 12, 32, '#3a3a5c', '#5a5a8c');
  drawLimb(rd.lowerLegL, 10, 28, '#3a3a5c', '#5a5a8c');
  drawLimb(rd.lowerLegR, 10, 28, '#3a3a5c', '#5a5a8c');

  // Shoes
  drawShoe(rd.lowerLegL);
  drawShoe(rd.lowerLegR);

  // ---- Torso (lab coat) ----
  drawTorso(rd.torso);

  // ---- Arms ----
  drawLimb(rd.upperArmL, 10, 28, '#d0d0e0', '#e0e0f0');
  drawLimb(rd.upperArmR, 10, 28, '#d0d0e0', '#e0e0f0');
  drawLimb(rd.lowerArmL, 8, 22, '#f0c090', '#f5d0a0');
  drawLimb(rd.lowerArmR, 8, 22, '#f0c090', '#f5d0a0');

  // ---- Head ----
  drawHead(rd.head);

  // ---- Force vectors ----
  if (state.airborne) drawForceVectors(rd.torso);
}

function drawLimb(body, w, h, fill, stroke) {
  const pos = worldToScreen(body.position.x, body.position.y);
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(body.angle);
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(-w/2, -h/2, w, h, 4);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawShoe(legBody) {
  const pos = worldToScreen(legBody.position.x, legBody.position.y);
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(legBody.angle);
  ctx.fillStyle = '#1a1a2e';
  ctx.strokeStyle = '#2a2a4e';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, 16, 14, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawTorso(body) {
  const pos = worldToScreen(body.position.x, body.position.y);
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(body.angle);

  // Lab coat
  ctx.fillStyle = '#d8d8e8';
  ctx.strokeStyle = '#aaaacc';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-14, -24, 28, 48, 6);
  ctx.fill();
  ctx.stroke();

  // Lapels
  ctx.fillStyle = '#c0c0d8';
  ctx.beginPath();
  ctx.moveTo(0, -22); ctx.lineTo(-12, -10); ctx.lineTo(-10, 20); ctx.lineTo(0, 10);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, -22); ctx.lineTo(12, -10); ctx.lineTo(10, 20); ctx.lineTo(0, 10);
  ctx.closePath(); ctx.fill();

  // Buttons
  ctx.fillStyle = '#888899';
  [-8, 0, 8].forEach(y => {
    ctx.beginPath(); ctx.arc(0, y, 2, 0, Math.PI*2); ctx.fill();
  });

  // Pocket pen (neon)
  ctx.fillStyle = C.cyan;
  ctx.shadowColor = C.cyan; ctx.shadowBlur = 4;
  ctx.fillRect(7, -18, 3, 10);
  ctx.fillStyle = C.pink;
  ctx.shadowColor = C.pink;
  ctx.fillRect(11, -18, 3, 10);
  ctx.shadowBlur = 0;

  // Soot mark
  ctx.fillStyle = 'rgba(30,20,10,0.4)';
  ctx.beginPath(); ctx.ellipse(-8, 5, 6, 4, -0.3, 0, Math.PI*2); ctx.fill();

  ctx.restore();
}

function drawHead(body) {
  const pos = worldToScreen(body.position.x, body.position.y);
  const r = body.circleRadius || 20;
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(body.angle);

  // Head
  ctx.fillStyle = '#f5c5a0';
  ctx.strokeStyle = '#d4a070';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 1.05, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Hair
  ctx.fillStyle = '#3a2a1a';
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.6, r * 0.95, r * 0.5, 0, Math.PI, 0);
  ctx.fill();

  // Hair spikes
  ctx.fillStyle = '#2a1a0a';
  [[-8, -r-8], [0, -r-12], [8, -r-8], [-14, -r-4], [14, -r-4]].forEach(([hx, hy]) => {
    ctx.beginPath();
    ctx.ellipse(hx, hy, 4, 8, (hx/20)*0.5, 0, Math.PI*2);
    ctx.fill();
  });

  // Glasses
  ctx.strokeStyle = C.cyan;
  ctx.shadowColor = C.cyan;
  ctx.shadowBlur = 6;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(-8, 2, 8, 0, Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(8, 2, 8, 0, Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(0, 2); ctx.stroke();
  // Bridge
  ctx.beginPath(); ctx.moveTo(-0.5, 2); ctx.lineTo(0.5, 2); ctx.stroke();
  ctx.shadowBlur = 0;

  // Eyes
  ctx.fillStyle = 'white';
  ctx.beginPath(); ctx.arc(-8, 2, 5, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(8, 2, 5, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#2a1a0a';
  ctx.beginPath(); ctx.arc(-7, 3, 2.5, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(9, 3, 2.5, 0, Math.PI*2); ctx.fill();
  // Shine
  ctx.fillStyle = 'white';
  ctx.beginPath(); ctx.arc(-6, 2, 1, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(10, 2, 1, 0, Math.PI*2); ctx.fill();

  // Mouth (determined)
  ctx.strokeStyle = '#c07050';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 8, 6, 0.2, Math.PI - 0.2);
  ctx.stroke();

  // Bandage
  ctx.fillStyle = '#f0e0c0';
  ctx.strokeStyle = '#d4c090';
  ctx.lineWidth = 0.5;
  ctx.save();
  ctx.rotate(-0.1);
  ctx.fillRect(-8, -r*0.2, 16, 5);
  ctx.strokeRect(-8, -r*0.2, 16, 5);
  ctx.strokeStyle = '#d4c090';
  ctx.beginPath(); ctx.moveTo(-8, -r*0.2+2.5); ctx.lineTo(8, -r*0.2+2.5); ctx.stroke();
  ctx.restore();

  ctx.restore();
}

function drawForceVectors(body) {
  const pos = worldToScreen(body.position.x, body.position.y);
  const vel = body.velocity;
  const speed = Math.sqrt(vel.x*vel.x + vel.y*vel.y);
  if (speed < 0.5) return;

  ctx.save();
  ctx.strokeStyle = C.yellow;
  ctx.fillStyle = C.yellow;
  ctx.shadowColor = C.yellow;
  ctx.shadowBlur = 6;
  ctx.lineWidth = 2;

  const scale = 8;
  const ex = pos.x + vel.x * scale;
  const ey = pos.y + vel.y * scale;

  // Arrow shaft
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
  ctx.lineTo(ex, ey);
  ctx.stroke();

  // Arrowhead
  const angle = Math.atan2(vel.y, vel.x);
  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-8, -4);
  ctx.lineTo(-8, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Gravity vector (down)
  ctx.strokeStyle = C.orange;
  ctx.fillStyle = C.orange;
  ctx.shadowColor = C.orange;
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
  ctx.lineTo(pos.x, pos.y + 30);
  ctx.stroke();
  ctx.save();
  ctx.translate(pos.x, pos.y + 30);
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(-4, -8); ctx.lineTo(4, -8);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  ctx.restore();
}

// ---- Aim line ----
function drawAimLine() {
  if (!state.dragging || !state.ragdoll) return;
  const start = worldToScreen(state.dragStart.x, state.dragStart.y);
  const end   = state.dragCurrent;

  const dx = state.dragStart.x - state.dragCurrent.x;
  const dy = state.dragStart.y - state.dragCurrent.y;
  const dist = Math.sqrt(dx*dx + dy*dy);
  const power = Math.min(dist / 200, 1);

  ctx.save();
  ctx.strokeStyle = `rgba(0,245,255,${0.3 + power * 0.5})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.shadowColor = C.cyan;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  // Power indicator circle
  ctx.setLineDash([]);
  ctx.strokeStyle = C.cyan;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(start.x, start.y, 30 * power, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

// ============================================================
//  MAIN GAME LOOP
// ============================================================
let lastTime = 0;
let frameCount = 0;

function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;
  frameCount++;

  // Update physics
  if (!state.replaying) {
    Engine.update(engine, 1000 / 60);
    updateSpinner();
    trackFlips();
    checkAirborne();
    updateCombo();
    // Apply wind force to ragdoll while airborne
    if (state.airborne && state.ragdoll && IC.wind !== 0) {
      state.ragdoll.parts.forEach(part => {
        Body.applyForce(part, part.position, {
          x: IC.wind * 0.000002 * part.mass,
          y: 0
        });
      });
    }
    if (state.launched) {
      state.runTime += dt * (state.slowmo ? 0.25 : 1);
    }
    recordFrame();
  } else {
    updateReplay();
  }

  updateCamera();
  updateParticles();

  // ---- RENDER ----
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  drawBackground();
  drawLevel();
  drawProps();
  drawRagdoll();
  drawParticles();
  drawAimLine();

  // Update HUD every 3 frames
  if (frameCount % 3 === 0) updateHUD();

  // Screen shake
  applyScreenShake();

  // Narrator cycle
  narratorTimer++;
  if (narratorTimer > 600) {
    narratorTimer = 0;
    if (!state.launched) cycleNarrator();
  }

  requestAnimationFrame(gameLoop);
}

// ============================================================
//  INIT
// ============================================================
function init() {
  buildLevel();
  buildProps();

  // Store original positions for reset (after buildProps places them)
  props.forEach(p => {
    p._originalPos = { x: p.position.x, y: p.position.y };
    p._originalAngle = p.angle;
  });

  spawnRagdoll();

  showNarrator(narratorLines[0]);

  // Populate IC summary bar
  const setEl = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  setEl('ic-disp-angle', `∠${IC.angle}°`);
  setEl('ic-disp-power', `PWR ${Math.round(IC.power * 100)}%`);
  setEl('ic-disp-mass',  `${IC.mass}kg`);
  setEl('ic-disp-grav',  `g=${IC.gravity}m/s²`);
  if (IC.wind !== 0) setEl('ic-disp-wind', `WIND ${IC.wind > 0 ? '+' : ''}${IC.wind}N`);

  // Hide IC summary after launch
  const icSummary = document.getElementById('ic-summary');
  const origSpawn = spawnRagdoll;
  // fade out IC summary when launched
  canvas.addEventListener('mouseup', () => {
    if (state.launched && icSummary) icSummary.style.opacity = '0';
  });
  document.addEventListener('keydown', ev => {
    if (ev.code === 'Space' && state.launched && icSummary) icSummary.style.opacity = '0';
  });

  // Start loop
  requestAnimationFrame(gameLoop);

  // Narrator cycle
  setInterval(() => {
    if (!state.launched) cycleNarrator();
  }, 8000);
}

// ---- Polyfill roundRect for older browsers ----
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    if (w < 2*r) r = w/2;
    if (h < 2*r) r = h/2;
    this.beginPath();
    this.moveTo(x+r, y);
    this.arcTo(x+w, y,   x+w, y+h, r);
    this.arcTo(x+w, y+h, x,   y+h, r);
    this.arcTo(x,   y+h, x,   y,   r);
    this.arcTo(x,   y,   x+w, y,   r);
    this.closePath();
    return this;
  };
}

// ---- Handle window resize ----
window.addEventListener('resize', () => {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
});

// ---- Start ----
init();
