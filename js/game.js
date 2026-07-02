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

/* ---- scale the fixed 1280x720 stage to fit the viewport ---- */
const STAGE_W = 1280, STAGE_H = 720;
const stage = document.getElementById('stage');
function fitStage(){
  const scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
  stage.style.transform = `scale(${scale})`;
}
window.addEventListener('resize', fitStage);
fitStage();

/* =====================================================================
   Difficulty tiers. Text (names/descriptions/ranks) lives in strings.js;
   only numbers live here.
   - bits:          bins in play (4 -> 8/4/2/1, targets 1-15)
   - halfLife:      seconds for the proportional decay to halve the flock
   - baseDrain:     constant loss per second (guarantees 0 is reachable)
   - openPct/Min:   startle cost of opening ANY bin (% of flock, floor)
   - alarmPct/Min:  extra cost of opening an EMPTY bin
   - alarmFactor:   solve reward multiplies by this per false alarm this
                    round (the hiding canaries hear you and flee) — this is
                    what makes open-everything a losing strategy
   - skipPct/Min:   Pass cost
   - meter:         false = no workforce, no costs, no game over
   - drainRamp:     extra baseDrain added per minute of session time (the
                    fire spreads) — makes long runs unsustainable by design
   - fire:          everything is on fire
   ===================================================================== */
const TIERS = {
  practice:  { bits:4, meter:false },
  trainee:   { bits:6, meter:true, start:100, halfLife:90, baseDrain:0.2,
               openPct:0.02, openMin:2, alarmPct:0.05, alarmMin:5,  alarmFactor:0.65, skipPct:0.15, skipMin:5 },
  detective: { bits:8, meter:true, start:100, halfLife:45, baseDrain:0.4,
               openPct:0.02, openMin:2, alarmPct:0.10, alarmMin:10, alarmFactor:0.5,  skipPct:0.15, skipMin:5 },
  inspector: { bits:8, meter:true, start:60,  halfLife:25, baseDrain:0.8,
               openPct:0.02, openMin:2, alarmPct:0.18, alarmMin:15, alarmFactor:0.4,  skipPct:0.15, skipMin:5 },
  elite:     { bits:8, meter:true, start:50,  halfLife:18, baseDrain:1.2, drainRamp:0.6, fire:true,
               openPct:0.03, openMin:3, alarmPct:0.25, alarmMin:20, alarmFactor:0.3,  skipPct:0.2,  skipMin:10 },
};
const TIER_ORDER = ['practice', 'trainee', 'detective', 'inspector', 'elite'];

/* Meter display: asymptotic fill (no hard cap) and warning thresholds */
const METER_SOFT_SCALE = 250;
const WARN_AT = 60, DANGER_AT = 25;

/* The big starburst splash only fires every Nth alley cleared */
const MILESTONE_EVERY = 5;

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

/* ---- strings plumbing ---- */
function randomFrom(list){
  return list[Math.floor(Math.random() * list.length)];
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
  return Math.max(0.15, Math.min(1, (120 - workforce) / 120));
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

function spawnFloat(text, isGain){
  if(!cfg.meter) return;
  const el = document.createElement('div');
  el.className = 'float-num ' + (isGain ? 'gain' : 'loss');
  el.textContent = text;
  el.style.left = (50 + (Math.random() * 24 - 12)) + '%';
  document.getElementById('control-bar').appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function chargeWorkforce(n){
  if(!cfg.meter || gameEnded) return;
  workforce = Math.max(0, workforce - n);
  spawnFloat('-' + Math.round(n), false);
  updateWorkforceUI();
  if(workforce <= 0) triggerGameOver();
}

/* Continuous decay: proportional (big flocks leak fastest) + constant.
   Runs per animation frame so the meter drains smoothly. */
let decayRaf = null, lastDecayTs = null;
function decayFrame(ts){
  if(!started || gameEnded || !cfg.meter){ decayRaf = null; lastDecayTs = null; return; }
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
  e.style.left = (Math.random() * STAGE_W) + 'px';
  e.style.top = (640 + Math.random() * 70) + 'px';
  const size = (4 + Math.random() * 5) * (0.75 + heat * 0.9);
  e.style.width = size + 'px';
  e.style.height = size + 'px';
  e.style.animationDuration = ((2.2 + Math.random() * 2.2) * (1.15 - heat * 0.45)) + 's';
  stage.appendChild(e);
  setTimeout(() => e.remove(), 4600);
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

function playAgain(){ startShift(currentTier); }

function formatDuration(ms){
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${r.toString().padStart(2,'0')}` : `${s}s`;
}

function skipAlley(){
  if(!started || gameEnded || givingUp) return;
  incorrectCount++;
  if(cfg.meter){
    chargeWorkforce(Math.max(cfg.skipMin, cfg.skipPct * workforce));
    if(gameEnded) return;
  }
  newBinaryTarget();
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
  } else {
    headline.textContent = fillRank(STRINGS.end.quitHeadline);
    sub.textContent = fillRank(STRINGS.end.quitSub);
  }
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
      img.style.transform = 'scale(' + (0.82 + Math.random() * 0.3).toFixed(3) + ')';
    }
    yard.appendChild(bin);
  });
}

function toggleBin(i, forceState){
  if((!started || gameEnded) && forceState === undefined) return;
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
      if(cfg.meter){
        let cost = Math.max(cfg.openMin, cfg.openPct * workforce);
        if(!binHasCanary[i]) cost += Math.max(cfg.alarmMin, cfg.alarmPct * workforce);
        chargeWorkforce(cost);
      }
      if(binHasCanary[i]){
        showQuip(i);
      } else {
        falseAlarmCount++;
        roundFalseAlarms++;
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
  /* False alarms this round scared off part of the rescue */
  const reward = Math.max(1, Math.round(
    amount * Math.pow(cfg.alarmFactor || 1, roundFalseAlarms)));
  totalCanariesFound += reward;
  if(cfg.meter){
    workforce += reward;
    spawnFloat('+' + reward, true);
    updateWorkforceUI();
  }

  setWizardLine(randomFrom(roundFalseAlarms > 0
    ? STRINGS.wizard.winScared
    : STRINGS.wizard.win));
  wizardImg.src = IMG.wizardHappy;
  launchConfetti();

  /* Every solve: confetti + happy wizard. The starburst splash is
     reserved for milestones so it stays special. */
  const milestone = alleysCleared % MILESTONE_EVERY === 0;
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
    piece.style.left = (Math.random() * STAGE_W) + 'px';
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
  do { next = Math.floor(Math.random() * maxTarget) + 1; } while(next === binTarget);
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
  if(!started || gameEnded || givingUp) return;
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
