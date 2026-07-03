/* ---- asset paths ---- */
const IMG = {
  wizardGrumpy: 'img/wizard_grumpy.webp',
  wizardHappy:  'img/wizard_happy.webp',
};

const CANARY_VARIANTS = [
  'img/canary_angry.webp',
  'img/canary_weary.webp',
  'img/canary_sad.webp',
  'img/canary_scared.webp',
  'img/canary_furious.webp',
  'img/canary_panicked.webp',
  'img/canary_sobbing.webp',
  'img/canary_joyful.webp',
  'img/canary_dejected.webp',
  'img/canary_shocked.webp',
  'img/canary_lovestruck.webp',
  'img/canary_smug.webp',
  'img/canary_exhausted.webp',
];

/* Happy poses — these canaries use the `delusional` quip pool */
const DELUSIONAL_VARIANTS = new Set([
  'img/canary_joyful.webp',
  'img/canary_lovestruck.webp',
  'img/canary_smug.webp',
]);

/* ---- fit the stage to the viewport ----
   Height is fixed at 720 design units; width is elastic so the alley
   fills the window edge-to-edge (no side letterboxing). Clamped so the
   layout never gets narrower than the bin row or absurdly wide. */
const STAGE_H = 720, STAGE_MIN_W = 1100, STAGE_MAX_W = 1600;
const stage = document.getElementById('stage');
let stageW = 1280;
function fitStage(){
  let scale = window.innerHeight / STAGE_H;
  let w = window.innerWidth / scale;
  w = Math.max(STAGE_MIN_W, Math.min(STAGE_MAX_W, w));
  scale = Math.min(window.innerHeight / STAGE_H, window.innerWidth / w);
  stageW = Math.round(w);
  stage.style.width = stageW + 'px';
  stage.style.transform = `scale(${scale})`;
}
window.addEventListener('resize', fitStage);
fitStage();

/* Difficulty tiers and tuning numbers live in js/config.js;
   text lives in js/strings.js. */

/* ---- game state ---- */
const BIT_VALUES_ALL = [128,64,32,16,8,4,2,1];
let cfg = null, currentTier = null, started = false;
let BITS = BIT_VALUES_ALL;
let binTarget = 0;
let binOpen = [];
let binHasCanary = [];
let binDelusional = [];
let emptyTimers = {};
let advanceTimer = null;

let workforce = 0;
let gameEnded = false;
let givingUp = false;
let isFirstRound = true;
let sessionStartTime = Date.now();
let roundStartTime = Date.now();
let totalCanariesFound = 0;
let alleysCleared = 0;
let correctCount = 0;
let incorrectCount = 0;
let falseAlarmCount = 0;
let roundFalseAlarms = 0;
let roundSolved = false;
let solveTimes = [];
let cleanStreak = 0;
let revealing = false;
let paused = false;
let pauseStart = 0;
let decayArmed = false;   /* decay holds until the first bin click */

/* ---- strings plumbing ---- */
function randomFrom(list){
  return list[Math.floor(Math.random() * list.length)];
}

function popcount(n){
  let c = 0;
  while(n){ c += n & 1; n >>= 1; }
  return c;
}

/* {RANK} works in any string routed through here */
function fillRank(s){
  return s.replace(/\{RANK\}/g, currentTier ? STRINGS.tiers[currentTier].rank : '');
}

function setWizardLine(html){
  document.getElementById('speech-bar').innerHTML = fillRank(html);
}

function lookupString(path){
  return path.split('.').reduce((o, k) => (o ? o[k] : undefined), STRINGS);
}

function applyStrings(){
  document.querySelectorAll('[data-str]').forEach(el => {
    const s = lookupString(el.getAttribute('data-str'));
    if(s !== undefined) el.innerHTML = s;
  });
  document.title = STRINGS.title.replace(/<[^>]*>/g, '');

  const tierWrap = document.getElementById('tier-buttons');
  tierWrap.innerHTML = '';
  TIER_ORDER.forEach(t => {
    const s = STRINGS.tiers[t];
    const row = document.createElement('div');
    row.className = 'tier-row';
    const btn = document.createElement('button');
    btn.className = 'chunky btn-yellow tier-btn';
    btn.textContent = s.name;
    btn.onclick = () => startShift(t);
    const desc = document.createElement('span');
    desc.className = 'tier-desc';
    desc.textContent = s.desc;
    row.appendChild(btn);
    row.appendChild(desc);
    tierWrap.appendChild(row);
  });

  document.getElementById('howto-body').innerHTML =
    STRINGS.howto.body.map(p => `<p>${p}</p>`).join('');
}

/* ---- workforce meter ---- */
/* Fire mode: 0 = comfortable, 1 = flock nearly gone. Drives glow + embers. */
function fireIntensity(){
  return Math.max(0.15, Math.min(1, (FIRE_PANIC_AT - workforce) / FIRE_PANIC_AT));
}

let lastShownWorkforce = 0;
function updateWorkforceUI(){
  if(!cfg || !cfg.meter) return;
  if(cfg.fire) stage.style.setProperty('--fire', fireIntensity().toFixed(3));
  const fill = document.getElementById('workforce-fill');
  const num = document.getElementById('workforce-num');
  /* gains snap instantly; losses/decay keep the smooth transition */
  fill.classList.toggle('snap', workforce > lastShownWorkforce);
  lastShownWorkforce = workforce;
  fill.style.width = (workforce / (workforce + METER_SOFT_SCALE) * 100) + '%';
  num.textContent = Math.max(0, Math.round(workforce));
  fill.classList.remove('warn', 'danger');
  if(workforce <= DANGER_AT) fill.classList.add('danger');
  else if(workforce <= WARN_AT) fill.classList.add('warn');
}

/* Floats rise from whatever caused the change: the clicked bin, the
   Pass button, the total badge on a solve. */
function spawnFloat(text, isGain, anchorEl){
  if(!cfg.meter) return;
  const el = document.createElement('div');
  el.className = 'float-num ' + (isGain ? 'gain' : 'loss');
  el.textContent = text;
  const sr = stage.getBoundingClientRect();
  const scale = sr.width / stageW;
  let x = stageW / 2, y = 330;
  if(anchorEl){
    const r = anchorEl.getBoundingClientRect();
    x = (r.left + r.width / 2 - sr.left) / scale;
    y = (r.top - sr.top) / scale;
  }
  el.style.left = (x + (Math.random() * 30 - 15)) + 'px';
  el.style.top = (y - 10) + 'px';
  stage.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function chargeWorkforce(n, anchorEl){
  if(!cfg.meter || gameEnded) return;
  workforce = Math.max(0, workforce - n);
  spawnFloat('-' + Math.round(n), false, anchorEl);
  updateWorkforceUI();
  if(workforce <= 0) triggerGameOver();
}

/* Continuous decay: proportional (big flocks leak fastest) + constant.
   Runs per animation frame so the meter drains smoothly. */
let decayRaf = null, lastDecayTs = null;
function decayFrame(ts){
  if(!started || gameEnded || !cfg.meter){ decayRaf = null; lastDecayTs = null; return; }
  if(paused || !decayArmed){
    lastDecayTs = ts;
    decayRaf = requestAnimationFrame(decayFrame);
    return;
  }
  if(lastDecayTs !== null){
    const dt = Math.min((ts - lastDecayTs) / 1000, 0.5);
    /* drainRamp: the fire spreads — constant drain grows over the session */
    const drain = cfg.baseDrain
      + (cfg.drainRamp || 0) * ((Date.now() - sessionStartTime) / 60000);
    workforce -= (Math.LN2 / cfg.halfLife * workforce + drain) * dt;
    if(workforce <= 0){
      workforce = 0;
      updateWorkforceUI();
      decayRaf = null;
      triggerGameOver();
      return;
    }
    updateWorkforceUI();
  }
  lastDecayTs = ts;
  decayRaf = requestAnimationFrame(decayFrame);
}
function startDecay(){
  if(decayRaf) cancelAnimationFrame(decayRaf);
  lastDecayTs = null;
  if(cfg.meter) decayRaf = requestAnimationFrame(decayFrame);
}

/* ---- shift lifecycle ---- */
function startShift(tier){
  currentTier = tier;
  cfg = TIERS[tier];
  BITS = BIT_VALUES_ALL.slice(8 - cfg.bits);
  started = true;
  gameEnded = false;
  givingUp = false;
  revealing = false;
  paused = false;
  decayArmed = false;
  cleanStreak = 0;
  isFirstRound = true;
  workforce = cfg.meter ? cfg.start : 0;
  sessionStartTime = Date.now();
  binTarget = 0;
  totalCanariesFound = 0;
  alleysCleared = 0;
  correctCount = 0;
  incorrectCount = 0;
  falseAlarmCount = 0;
  solveTimes = [];

  document.getElementById('start-screen').classList.remove('show');
  document.getElementById('end-screen').classList.remove('show');
  document.getElementById('pause-screen').classList.remove('show');
  updateStreakChip();
  document.getElementById('control-bar').classList.toggle('no-meter', !cfg.meter);
  document.getElementById('wizard-img').src = IMG.wizardGrumpy;

  const badge = document.getElementById('shift-badge');
  badge.textContent = STRINGS.tiers[tier].name;
  badge.classList.toggle('fire', !!cfg.fire);
  setFire(!!cfg.fire);

  setWizardLine(STRINGS.intro);
  updateWorkforceUI();
  newBinaryTarget();
  startDecay();
}

/* ---- fire mode (elite): glow overlay + rising embers, scaled by
   fireIntensity() — the lower the flock, the worse the blaze ---- */
let emberTimer = null;
function setFire(on){
  stage.classList.toggle('on-fire', on);
  stage.style.setProperty('--fire', on ? fireIntensity().toFixed(3) : '0');
  clearInterval(emberTimer);
  emberTimer = null;
  if(on) emberTimer = setInterval(emberTick, 90);
}
function emberTick(){
  const heat = fireIntensity();
  if(Math.random() > 0.25 + 0.75 * heat) return;
  const e = document.createElement('div');
  e.className = 'ember';
  e.style.left = (Math.random() * stageW) + 'px';
  e.style.top = (560 + Math.random() * 60) + 'px';
  const size = (4 + Math.random() * 5) * (0.75 + heat * 0.9);
  e.style.width = size + 'px';
  e.style.height = size + 'px';
  e.style.animationDuration = ((2.2 + Math.random() * 2.2) * (1.15 - heat * 0.45)) + 's';
  stage.appendChild(e);
  setTimeout(() => e.remove(), 4600);
  if(Math.random() < 0.22) SFX.pop(heat);
}

function showStartScreen(){
  started = false;
  clearTimeout(advanceTimer);
  setFire(false);
  document.getElementById('end-screen').classList.remove('show');
  document.getElementById('start-screen').classList.add('show');
}

function showHowTo(){ document.getElementById('howto-screen').classList.add('show'); }
function hideHowTo(){ document.getElementById('howto-screen').classList.remove('show'); }

function togglePause(){
  if(!started || gameEnded) return;
  paused = !paused;
  document.getElementById('pause-screen').classList.toggle('show', paused);
  if(paused){
    pauseStart = Date.now();
  } else {
    /* shift the clocks so paused time doesn't count against the player */
    const d = Date.now() - pauseStart;
    sessionStartTime += d;
    roundStartTime += d;
  }
}

function toggleSfx(){
  SFX.setEnabled(!SFX.isEnabled());
  try{ localStorage.setItem('binCanarySfx', SFX.isEnabled() ? '1' : '0'); }catch(e){}
  updateSfxButton();
}
function updateSfxButton(){
  document.getElementById('btn-sfx').textContent =
    SFX.isEnabled() ? STRINGS.buttons.sfxOn : STRINGS.buttons.sfxOff;
}

function updateStreakChip(){
  const chip = document.getElementById('streak-chip');
  if(cleanStreak >= 2){
    chip.textContent = STRINGS.hud.streak.replace('{N}', cleanStreak);
    chip.classList.add('show');
  } else {
    chip.classList.remove('show');
  }
}

function playAgain(){ startShift(currentTier); }

function formatDuration(ms){
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${r.toString().padStart(2,'0')}` : `${s}s`;
}

function skipAlley(){
  if(!started || gameEnded || givingUp || paused || revealing) return;
  incorrectCount++;
  cleanStreak = 0;
  updateStreakChip();
  SFX.pass();
  if(!cfg.meter){
    /* Work Experience: a pass shows the answer before moving on —
       the moment a stuck learner most needs to see it */
    revealing = true;
    BITS.forEach((val, i) => toggleBin(i, !!(binTarget & val)));
    setWizardLine(randomFrom(STRINGS.wizard.reveal));
    clearTimeout(advanceTimer);
    advanceTimer = setTimeout(() => {
      revealing = false;
      newBinaryTarget();
    }, 2000);
    return;
  }
  chargeWorkforce(Math.max(cfg.skipMin, cfg.skipPct * workforce),
    document.getElementById('btn-pass'));
  if(gameEnded) return;
  newBinaryTarget();
  /* after newBinaryTarget so the angry line isn't overwritten by ambient */
  setWizardLine(randomFrom(STRINGS.wizard.pass));
}

function showEndScreen(type){
  gameEnded = true;
  clearTimeout(advanceTimer);

  const avg = solveTimes.length
    ? formatDuration(solveTimes.reduce((a,b) => a+b, 0) / solveTimes.length)
    : '—';

  document.getElementById('end-canaries-found').textContent = totalCanariesFound;
  document.getElementById('end-alleys-cleared').textContent = alleysCleared;
  document.getElementById('end-correct').textContent = correctCount;
  document.getElementById('end-incorrect').textContent = incorrectCount;
  document.getElementById('end-false-alarms').textContent = falseAlarmCount;
  document.getElementById('end-avg-time').textContent = avg;
  document.getElementById('end-run-time').textContent = formatDuration(Date.now() - sessionStartTime);

  const headline = document.getElementById('end-headline');
  const sub = document.getElementById('end-sub');
  if(type === 'gameover'){
    headline.textContent = fillRank(STRINGS.end.gameoverHeadline);
    sub.textContent = fillRank(STRINGS.end.gameoverSub);
    SFX.gameover();
  } else {
    headline.textContent = fillRank(STRINGS.end.quitHeadline);
    sub.textContent = fillRank(STRINGS.end.quitSub);
  }

  /* shift records, persisted per tier */
  const runMs = Date.now() - sessionStartTime;
  let recs = {};
  try{ recs = JSON.parse(localStorage.getItem('binCanaryRecords')) || {}; }catch(e){}
  const best = recs[currentTier] || { canaries: 0, alleys: 0, runMs: 0 };
  const firstRun = best.canaries === 0 && best.alleys === 0 && best.runMs === 0;
  const newC = totalCanariesFound > best.canaries;
  const newA = alleysCleared > best.alleys;
  const newR = runMs > best.runMs;
  recs[currentTier] = {
    canaries: Math.max(best.canaries, totalCanariesFound),
    alleys: Math.max(best.alleys, alleysCleared),
    runMs: Math.max(best.runMs, runMs),
  };
  try{ localStorage.setItem('binCanaryRecords', JSON.stringify(recs)); }catch(e){}
  document.getElementById('end-record-banner').style.display =
    !firstRun && (newC || newA || newR) ? 'block' : 'none';
  const b = recs[currentTier];
  document.getElementById('end-records').innerHTML =
    `${STRINGS.end.recordLabel} ${b.canaries} canaries${newC && !firstRun ? ' ★' : ''}`
    + ` &middot; ${b.alleys} alleys${newA && !firstRun ? ' ★' : ''}`
    + ` &middot; ${formatDuration(b.runMs)}${newR && !firstRun ? ' ★' : ''}`;

  document.getElementById('end-screen').classList.add('show');
}

function triggerGameOver(){
  showEndScreen('gameover');
}

/* ---- bins ---- */
function buildBins(){
  Object.values(emptyTimers).forEach(clearTimeout);
  emptyTimers = {};
  binDelusional = new Array(cfg.bits).fill(false);
  const yard = document.getElementById('binyard');
  yard.innerHTML = '';
  BITS.forEach((val, i) => {
    const bin = document.createElement('div');
    bin.className = 'bin';
    bin.id = 'bin-' + i;
    bin.onclick = () => toggleBin(i);
    const canaryHtml = binHasCanary[i]
      ? `<img class="canary-img" alt="canary" style="width:100%;height:100%;object-fit:contain;">`
      : '';
    bin.innerHTML = `
      <div class="bin-stage">
        <div class="speech-bubble" id="bubble-${i}"></div>
        <div class="canary-pop">${canaryHtml}</div>
        <div class="bin-lid"></div>
        <div class="bin-body"></div>
        <div class="empty-stamp">${STRINGS.emptyStamp}</div>
        <div class="bin-stencil-num">${val}</div>
      </div>
    `;
    if(binHasCanary[i]){
      const img = bin.querySelector('.canary-img');
      const variant = CANARY_VARIANTS[Math.floor(Math.random() * CANARY_VARIANTS.length)];
      img.src = variant;
      binDelusional[i] = DELUSIONAL_VARIANTS.has(variant);
      img.style.transformOrigin = '50% 100%';
      img.style.transform = 'scale('
        + (CANARY_SCALE_MIN + Math.random() * CANARY_SCALE_RANGE).toFixed(3) + ')';
    }
    yard.appendChild(bin);
  });
}

function toggleBin(i, forceState){
  if((!started || gameEnded || paused || revealing) && forceState === undefined) return;
  const bin = document.getElementById('bin-' + i);
  const wasOpen = binOpen[i];
  /* A found canary stays found — opened canary bins lock open */
  if(wasOpen && binHasCanary[i] && forceState === undefined) return;
  const willOpen = (forceState !== undefined) ? forceState : !wasOpen;
  if(willOpen === wasOpen) return;

  binOpen[i] = willOpen;

  if(willOpen){
    bin.classList.remove('startled');
    bin.classList.add('open');
    if(forceState === undefined){
      /* first touch of the shift arms the decay — reading time is free */
      if(!decayArmed){
        decayArmed = true;
        sessionStartTime = Date.now();
        roundStartTime = Date.now();
      }
      SFX.thunk();
      if(cfg.meter){
        let cost = Math.max(cfg.openMin, cfg.openPct * workforce);
        if(!binHasCanary[i]) cost += Math.max(cfg.alarmMin, cfg.alarmPct * workforce);
        chargeWorkforce(cost, bin);
      }
      if(binHasCanary[i]){
        SFX.chirp();
        showQuip(i);
      } else {
        SFX.slam();
        falseAlarmCount++;
        roundFalseAlarms++;
        cleanStreak = 0;
        updateStreakChip();
        bin.classList.add('found-empty');
        setWizardLine(randomFrom(STRINGS.wizard.falseAlarm));
        clearTimeout(emptyTimers[i]);
        emptyTimers[i] = setTimeout(() => toggleBin(i, false), 650);
      }
    }
  } else {
    clearTimeout(emptyTimers[i]);
    bin.classList.remove('open');
    bin.classList.add('startled');
    setTimeout(() => bin.classList.remove('startled'), 350);
  }
  updateBinTotal();
}

function showQuip(i){
  const bubble = document.getElementById('bubble-' + i);
  bubble.textContent = randomFrom(
    binDelusional[i] ? STRINGS.canary.delusional : STRINGS.canary.sad);
  bubble.classList.add('show');
  setTimeout(() => bubble.classList.remove('show'), 900);
}

function updateBinTotal(){
  /* Empty bins never count — only rescued canaries build the total */
  let total = 0;
  binOpen.forEach((open, i) => { if(open && binHasCanary[i]) total += BITS[i]; });
  const totalEl = document.getElementById('bin-total');
  if(revealing){
    totalEl.textContent = total;
    totalEl.classList.toggle('match', total === binTarget);
    return;
  }
  if(!givingUp){
    totalEl.textContent = total;
    totalEl.classList.toggle('match', total === binTarget);
    if(total === binTarget && !roundSolved) celebrate(total);
  } else {
    if(total === binTarget) resolveGiveUp();
  }
}

function celebrate(amount){
  roundSolved = true;
  const wizardImg = document.getElementById('wizard-img');

  const elapsed = Date.now() - roundStartTime;
  solveTimes.push(elapsed);
  alleysCleared++;
  correctCount++;
  /* False alarms this round scared off part of the rescue; a clean
     streak (built up BEFORE this solve) multiplies it back up */
  const streakMult = Math.min(STREAK_CAP, 1 + STREAK_BONUS * cleanStreak);
  const reward = Math.max(1, Math.round(
    amount * Math.pow(cfg.alarmFactor || 1, roundFalseAlarms) * streakMult));
  cleanStreak = roundFalseAlarms === 0 ? cleanStreak + 1 : 0;
  updateStreakChip();
  totalCanariesFound += reward;
  if(cfg.meter){
    workforce += reward;
    spawnFloat('+' + reward, true, document.querySelector('.running-total .badge'));
    updateWorkforceUI();
  }

  setWizardLine(randomFrom(roundFalseAlarms > 0
    ? STRINGS.wizard.winScared
    : STRINGS.wizard.win));
  wizardImg.src = IMG.wizardHappy;
  launchConfetti();

  /* Every solve: confetti + happy wizard. The starburst splash is
     reserved for milestones so it stays special. */
  const milestone = MILESTONE_ALLEYS.includes(alleysCleared);
  if(milestone) SFX.milestone(); else SFX.win();
  const wrap = document.getElementById('success-wrap');
  if(milestone){
    document.getElementById('success-headline').innerHTML =
      STRINGS.success.milestoneHeadline.replace('{N}', alleysCleared);
    document.getElementById('rescue-line').textContent =
      fillRank(STRINGS.success.milestoneSub);
    wrap.classList.add('show');
  }

  clearTimeout(advanceTimer);
  advanceTimer = setTimeout(() => {
    wrap.classList.remove('show');
    wizardImg.src = IMG.wizardGrumpy;
    givingUp = false;
    newBinaryTarget();
  }, milestone ? 2200 : 1200);
}

function launchConfetti(){
  const colors = ['#F7DD5D','#3DC7C3','#E8408C','#6FE38A','#9aa0a6'];
  for(let n = 0; n < 42; n++){
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = (Math.random() * stageW) + 'px';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDuration = (1.1 + Math.random() * 0.9) + 's';
    piece.style.transform = `rotate(${Math.random()*360}deg)`;
    stage.appendChild(piece);
    setTimeout(() => piece.remove(), 2200);
  }
}

function newBinaryTarget(){
  const maxTarget = (1 << cfg.bits) - 1;
  let next;
  do {
    next = Math.floor(Math.random() * maxTarget) + 1;
  } while(next === binTarget
    || (popcount(next) < (cfg.minBits || 1) && Math.random() > (cfg.lowBitChance || 0)));
  binTarget = next;
  binOpen = new Array(cfg.bits).fill(false);
  binHasCanary = BITS.map(val => !!(binTarget & val));
  roundFalseAlarms = 0;
  roundSolved = false;
  roundStartTime = Date.now();
  document.getElementById('sign-target').textContent = binTarget;
  if(!isFirstRound){
    setWizardLine(randomFrom(
      currentTier === 'practice' ? STRINGS.wizard.tutorial : STRINGS.wizard.ambient));
  }
  isFirstRound = false;
  buildBins();
  updateBinTotal();
}

function giveUp(){
  if(!started || gameEnded || givingUp || paused || revealing) return;
  givingUp = true;
  setWizardLine(randomFrom(STRINGS.wizard.giveup));
  BITS.forEach((val, i) => {
    const shouldBeOpen = !!(binTarget & val);
    toggleBin(i, shouldBeOpen);
  });
}

function resolveGiveUp(){
  clearTimeout(advanceTimer);
  advanceTimer = setTimeout(() => {
    showEndScreen('quit');
  }, 1800);
}

/* ---- boot: strings in, start screen up, nothing running yet ---- */
applyStrings();
try{ SFX.setEnabled(localStorage.getItem('binCanarySfx') !== '0'); }catch(e){}
updateSfxButton();
