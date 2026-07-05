/* ---- asset paths ---- */
const IMG = {
  wizardGrumpy: 'img/wizard_grumpy.webp',
  wizardHappy:  'img/wizard_happy.webp',
};

/* Most canaries are miserable about the mine. Pool split so the rare
   happy pose (DELUSIONAL_CHANCE in config.js) is a real dice roll,
   not just "however many happy PNGs happen to be in one big array". */
const SAD_VARIANTS = [
  'img/canary_angry.webp',
  'img/canary_weary.webp',
  'img/canary_sad.webp',
  'img/canary_scared.webp',
  'img/canary_furious.webp',
  'img/canary_panicked.webp',
  'img/canary_sobbing.webp',
  'img/canary_dejected.webp',
  'img/canary_shocked.webp',
  'img/canary_exhausted.webp',
];

const DELUSIONAL_VARIANTS = [
  'img/canary_joyful.webp',
  'img/canary_lovestruck.webp',
  'img/canary_smug.webp',
];

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

/* Click anywhere to blow through the win message early — everything
   underneath is already inert while celebrating (see the guards in
   toggleBin/skipAlley/giveUp/togglePause), so this can't misfire.
   celebrationSkippableAt guards against the solving click itself: that
   click bubbles up to this same listener within the same dispatch, and
   by then `celebrating` is already true — without the delay it would
   skip its own celebration before a single frame renders. */
stage.addEventListener('click', () => {
  if(celebrating && celebrationSkip && Date.now() >= celebrationSkippableAt) celebrationSkip();
});

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
let lastActionTs = Date.now();  /* last real bin-open, Pass, or fresh alley dealt — drives the idle-drain ramp */
let roundGraceMs = IDLE_GRACE_MS;  /* per-round grace window; longer on Waterfoul Alleys, which demand real thinking time */
let totalCanariesFound = 0;
let alleysCleared = 0;
let correctCount = 0;
let passCount = 0;
let falseAlarmCount = 0;
let roundFalseAlarms = 0;
let roundSolved = false;
let solveTimes = [];
let cleanStreak = 0;
let longestStreakThisRun = 0;  /* max cleanStreak ever reached this run — a record metric of its own */
let money = 0;
let revealing = false;
let paused = false;
let celebrating = false;  /* true for the win message duration — numbers hold still, nothing to click */
let celebrationSkip = null;  /* set while celebrating; click-anywhere calls this to skip ahead */
let celebrationSkippableAt = 0;  /* skip-by-click doesn't arm until this time — see stage click listener */
let pauseStart = 0;
let decayArmed = false;   /* decay holds until the first bin click */

/* ---- Firedamp fire-fighting state (elite tier only) ---- */
let fireLevel = 0;           /* rises with active play time; drives drainRamp */
let waterfoulAlley = false;  /* true for the duration of the current waterfoul round */
let waterfoulWrongOpens = 0; /* silent tally — cashed into normal stats at round resolution */
let alleysSinceWaterfoul = 0;/* drives the dry-streak roll ramp — no hard pity, just rising odds */

/* "True {Shift}" toggle — available on every tier (start screen only,
   persisted), hides the running total on EVERY alley when on. On
   Firedamp specifically, Waterfoul Alleys are ALWAYS blind regardless
   of this toggle — see updateBinTotal(). */
let trueMode = false;

/* ---- start-screen tier selection ---- */
let selectedTier = null;

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
  let rank = currentTier ? STRINGS.tiers[currentTier].rank : '';
  if(rank && trueMode) rank = 'TRUE ' + rank;
  return s.replace(/\{RANK\}/g, rank);
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
    btn.className = 'chunky btn-yellow btn-compact tier-btn';
    btn.textContent = s.name;
    btn.dataset.tier = t;
    btn.onclick = () => selectTier(t);
    row.appendChild(btn);
    tierWrap.appendChild(row);
  });

  document.getElementById('howto-body').innerHTML =
    STRINGS.howto.body.map(p => `<p>${p}</p>`).join('');
}

/* Picking a tier no longer starts it outright — it selects it and
   opens the info panel, so difficulty-specific rules (Firedamp's
   Waterfoul Alleys especially) get a moment of tutorialization before
   the player commits. Start Shift is disabled until something's picked. */
/* Builds [label, value, isWarning] rows straight from TIERS[t] in
   config.js — never hand-copied, so the panel can't drift out of sync
   with the real tuning. isWarning flags numbers that are a cost/risk
   (colored to stand out) vs plain info. */
function buildDifficultyRows(t){
  const c = TIERS[t];
  const ti = STRINGS.tierInfo;
  const rows = [[ti.bins, c.bits, false]];
  if(!c.meter){
    rows.push([ti.flock, ti.noFlock, false]);
    return rows;
  }
  rows.push([ti.flock, c.start, false]);
  rows.push([ti.decay, c.baseDrain.toFixed(2) + '/s', true, 'flock']);
  rows.push([ti.openCost, Math.round(c.openPct * 100) + '%', false, 'flock']);
  rows.push([ti.falseAlarmCost, Math.round(c.alarmPct * 100) + '%', true, 'flock']);
  rows.push([ti.falseAlarmCost, Math.round((1 - c.alarmFactor) * 100) + '%', true, 'reward']);
  rows.push([ti.passCost, Math.round(c.skipPct * 100) + '%', false, 'flock']);
  rows.push(c.fire
    ? [ti.totalShown, trueMode ? ti.totalNever : ti.totalWaterfoulOnly, true]
    : [ti.totalShown, trueMode ? ti.no : ti.yes, trueMode]);
  return rows;
}

function selectTier(t){
  selectedTier = t;
  document.querySelectorAll('.tier-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.tier === t);
  });

  document.getElementById('tier-info-empty').style.display = 'none';
  document.getElementById('tier-info-content').style.display = 'block';
  document.getElementById('tier-info-header').textContent =
    (trueMode ? 'True ' : '') + STRINGS.tiers[t].name;
  document.getElementById('tier-info-sub').textContent = STRINGS.tiers[t].desc;

  const table = document.getElementById('tier-info-table');
  table.innerHTML = buildDifficultyRows(t).map(([label, val, warn, tag]) => {
    const tagKey = 'tag' + (tag ? tag[0].toUpperCase() + tag.slice(1) : '');
    const tagHtml = tag ? ` <span class="ti-tag ti-tag-${tag}">${STRINGS.tierInfo[tagKey]}</span>` : '';
    return `<tr><td class="ti-label">${label}${tagHtml}</td><td class="ti-val${warn ? ' warn' : ''}">${val}</td></tr>`;
  }).join('');

  const extra = document.getElementById('tier-info-extra');
  extra.innerHTML = STRINGS.tiers[t].extra || '';
  extra.style.display = STRINGS.tiers[t].extra ? 'block' : 'none';

  updateTrueModeButton();

  document.getElementById('btn-start-shift').disabled = false;
}

function confirmStartShift(){
  if(!selectedTier) return;
  startShift(selectedTier);
}

/* Available on every tier now — not just Firedamp. */
function toggleTrueMode(){
  trueMode = !trueMode;
  try{ localStorage.setItem('binCanaryTrueMode', trueMode ? '1' : '0'); }catch(e){}
  if(selectedTier) selectTier(selectedTier);  /* re-render header/table/button for the new state */
}

/* Color rule (whole app): yellow = default/idle, cyan = this toggle
   is currently ON/activated. True Mode defaults OFF, so OFF is the
   yellow state and ON is the cyan one. */
function updateTrueModeButton(){
  const btn = document.getElementById('btn-true-mode');
  if(!btn) return;
  btn.textContent = trueMode ? STRINGS.tierInfo.trueModeOn : STRINGS.tierInfo.trueModeOff;
  btn.classList.toggle('btn-cyan', trueMode);
  btn.classList.toggle('btn-yellow', !trueMode);
}

/* ---- workforce meter ---- */
/* Fire mode: 0 = comfortable, 1 = flock nearly gone OR blaze maxed out.
   Drives glow + embers — responds to whichever danger is worse. */
function fireIntensity(){
  const panicHeat = (FIRE_PANIC_AT - workforce) / FIRE_PANIC_AT;
  const topThreshold = FIRE_STAGE_THRESHOLDS[FIRE_STAGE_THRESHOLDS.length - 1] || 1;
  const stageHeat = fireLevel / topThreshold;
  return Math.max(0.15, Math.min(1, Math.max(panicHeat, stageHeat)));
}

/* Which named stage fireLevel is currently in (index into
   STRINGS.blaze.stages / FIRE_STAGE_THRESHOLDS). */
function fireStage(){
  for(let s = FIRE_STAGE_THRESHOLDS.length - 1; s >= 0; s--){
    if(fireLevel >= FIRE_STAGE_THRESHOLDS[s]) return s;
  }
  return 0;
}

function updateBlazeGauge(){
  const gauge = document.getElementById('blaze-gauge');
  if(!gauge) return;
  const stage = fireStage();
  document.getElementById('blaze-value').textContent = STRINGS.blaze.stages[stage];
  gauge.classList.toggle('pulsing', stage >= 3);
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
  if(paused || celebrating || !decayArmed){
    lastDecayTs = ts;
    decayRaf = requestAnimationFrame(decayFrame);
    return;
  }
  if(lastDecayTs !== null){
    const dt = Math.min((ts - lastDecayTs) / 1000, 0.5);
    /* fireLevel only accumulates while this branch actually runs, so
       it automatically excludes paused/celebrating/pre-arm time for
       free — no clock-shift bookkeeping needed the way sessionStartTime
       used to require. Waterfoul catches push it back down; see
       celebrate(). */
    if(cfg.fire){
      fireLevel += dt / 60;
      updateBlazeGauge();
    }
    /* drainRamp: the fire spreads — extra drain scales with fireLevel,
       which the player can fight back via Waterfoul Alleys */
    const drain = cfg.baseDrain + (cfg.drainRamp || 0) * fireLevel;
    /* idle penalty: sitting still past the grace period ramps drain
       hard, so parking a big flock + streak and walking away can't
       out-earn actually playing */
    const idleSec = Math.max(0, (Date.now() - lastActionTs - roundGraceMs) / 1000);
    const idleDrain = Math.min(IDLE_MAX_DRAIN, IDLE_RAMP_PER_SEC2 * idleSec * idleSec);
    workforce -= (Math.LN2 / cfg.halfLife * workforce + drain + idleDrain) * dt;
    /* the flock on the clock generates profit; streaks raise the rate */
    money += workforce * (cfg.payRate || 0) * streakMult() * dt;
    updateMoneyUI();
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
  longestStreakThisRun = 0;
  money = 0;
  fireLevel = 0;
  waterfoulAlley = false;
  waterfoulWrongOpens = 0;
  alleysSinceWaterfoul = 0;
  isFirstRound = true;
  workforce = cfg.meter ? cfg.start : 0;
  sessionStartTime = Date.now();
  binTarget = 0;
  totalCanariesFound = 0;
  alleysCleared = 0;
  correctCount = 0;
  passCount = 0;
  falseAlarmCount = 0;
  solveTimes = [];

  document.getElementById('start-screen').classList.remove('show');
  document.getElementById('end-screen').classList.remove('show');
  document.getElementById('pause-screen').classList.remove('show');
  updateStreakChip();
  lastMoneyUiText = null;
  updateMoneyUI(true);
  document.getElementById('money-chip').style.display = cfg.meter ? '' : 'none';
  document.getElementById('blaze-gauge').style.display = cfg.fire ? '' : 'none';
  document.getElementById('control-bar').classList.toggle('no-meter', !cfg.meter);
  document.getElementById('wizard-img').src = IMG.wizardGrumpy;

  const badge = document.getElementById('shift-badge');
  badge.textContent = (trueMode ? 'True ' : '') + STRINGS.tiers[tier].name;
  badge.classList.toggle('fire', !!cfg.fire);
  setFire(!!cfg.fire);
  updateBlazeGauge();

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
  if(waterfoulAlley){
    /* the waterfoul are pushing back — cyan droplets fall instead of
       embers rising, inverted direction reads as "fighting the fire" */
    e.className = 'ember droplet';
    e.style.left = (Math.random() * stageW) + 'px';
    e.style.top = (Math.random() * 80) + 'px';
    const size = 4 + Math.random() * 5;
    e.style.width = size + 'px';
    e.style.height = size + 'px';
    e.style.animationDuration = (1.6 + Math.random() * 1.4) + 's';
  } else {
    e.className = 'ember';
    e.style.left = (Math.random() * stageW) + 'px';
    e.style.top = (560 + Math.random() * 60) + 'px';
    const size = (4 + Math.random() * 5) * (0.75 + heat * 0.9);
    e.style.width = size + 'px';
    e.style.height = size + 'px';
    e.style.animationDuration = ((2.2 + Math.random() * 2.2) * (1.15 - heat * 0.45)) + 's';
  }
  stage.appendChild(e);
  setTimeout(() => e.remove(), 4600);
  if(!waterfoulAlley && Math.random() < 0.22) SFX.pop(heat);
}

function showStartScreen(){
  started = false;
  clearTimeout(advanceTimer);
  setFire(false);
  stage.classList.remove('waterfoul-alley');
  document.getElementById('end-screen').classList.remove('show');
  document.getElementById('start-screen').classList.add('show');
  if(currentTier) selectTier(currentTier);  /* show what you just played, ready to go again */
}

function showHowTo(){ document.getElementById('howto-screen').classList.add('show'); }
function hideHowTo(){ document.getElementById('howto-screen').classList.remove('show'); }

function togglePause(){
  if(!started || gameEnded || celebrating) return;
  paused = !paused;
  document.getElementById('pause-screen').classList.toggle('show', paused);
  if(paused){
    pauseStart = Date.now();
  } else {
    /* shift the clocks so paused time doesn't count against the player
       — including the idle clock, or resuming would immediately read
       as several seconds idle and slam the ramp on */
    const d = Date.now() - pauseStart;
    sessionStartTime += d;
    roundStartTime += d;
    lastActionTs += d;
  }
}

function toggleSfx(){
  SFX.setEnabled(!SFX.isEnabled());
  try{ localStorage.setItem('binCanarySfx', SFX.isEnabled() ? '1' : '0'); }catch(e){}
  updateSfxButton();
}
/* Sound defaults ON, so "On" is the yellow (default) state and
   "Off" — deviated from default — is the cyan (activated) one. */
function updateSfxButton(){
  const btn = document.getElementById('btn-sfx');
  const on = SFX.isEnabled();
  btn.textContent = on ? STRINGS.buttons.sfxOn : STRINGS.buttons.sfxOff;
  btn.classList.toggle('btn-cyan', !on);
  btn.classList.toggle('btn-yellow', on);
}

function updateStreakChip(){
  const chip = document.getElementById('streak-chip');
  if(cleanStreak >= 2){
    chip.innerHTML = STRINGS.hud.streak.replace('{N}', `<span class="num-font">${cleanStreak}</span>`);
    chip.classList.add('show');
  } else {
    chip.classList.remove('show');
  }
}

/* Clean streak multiplies EARNINGS only — never the flock */
function streakMult(){
  return Math.min(STREAK_CAP, 1 + STREAK_BONUS * cleanStreak);
}

/* Real number with commas while it still fits (feels like genuine
   climbing progress); short suffixes only once it wouldn't. */
function formatMoney(n){
  n = Math.floor(Math.max(0, n));
  if(n < MONEY_ABBREVIATE_AT) return n.toLocaleString();
  const units = [[1e15,'q'],[1e12,'t'],[1e9,'b'],[1e6,'m']];
  for(const [div, suf] of units){
    if(n >= div){
      const v = n / div;
      const s = (v < 10 ? v.toFixed(1) : Math.floor(v).toString()).replace(/\.0$/, '');
      return s + suf;
    }
  }
  return String(n);
}

/* Money accrues every animation frame, but redrawing the DOM that
   often makes a proportional-width display font (Bangers has no real
   tabular figures) visibly jitter as it constantly re-centers. Cap
   the redraw rate to a readable "tick" instead — the underlying
   number is still exact, only how often we paint it changes. */
const MONEY_UI_INTERVAL_MS = 150;
let lastMoneyUiTs = 0, lastMoneyUiText = null;
function updateMoneyUI(force){
  const now = Date.now();
  if(!force && now - lastMoneyUiTs < MONEY_UI_INTERVAL_MS) return;
  lastMoneyUiTs = now;
  const text = '$' + formatMoney(money);
  if(text === lastMoneyUiText) return;
  lastMoneyUiText = text;
  document.getElementById('money-value').textContent = text;
}

function playAgain(){ startShift(currentTier); }

function formatDuration(ms){
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${r.toString().padStart(2,'0')}` : `${s}s`;
}

function skipAlley(){
  if(!started || gameEnded || givingUp || paused || revealing || celebrating) return;
  passCount++;
  cleanStreak = 0;
  updateStreakChip();
  lastActionTs = Date.now();
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

  const runMs = Date.now() - sessionStartTime;

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

  /* shift records, persisted per tier — True Mode gets its own bucket
     for whichever tier is active, since it's a meaningfully different
     challenge, not a variant worth conflating with the normal numbers */
  const recordKey = currentTier + (trueMode ? '_true' : '');
  let recs = {};
  try{ recs = JSON.parse(localStorage.getItem('binCanaryRecords')) || {}; }catch(e){}
  const bankedMoney = Math.floor(money);
  const hasSolves = solveTimes.length > 0;
  const avgMsThisRun = hasSolves ? solveTimes.reduce((a,b) => a+b, 0) / solveTimes.length : null;

  const before = recs[recordKey] || {};
  const firstRun = !recs[recordKey];
  const maxRec = (key, cur) => Math.max(before[key] || 0, cur);
  /* "fewer is better" metrics use null (not 0) as the no-record-yet
     sentinel — 0 mistakes is a real, great record, not "nothing recorded" */
  const minRec = (key, cur) => (before[key] == null ? cur : Math.min(before[key], cur));
  const after = {
    money: maxRec('money', bankedMoney),
    canaries: maxRec('canaries', totalCanariesFound),
    alleys: maxRec('alleys', alleysCleared),
    streak: maxRec('streak', longestStreakThisRun),
    runMs: maxRec('runMs', runMs),
    skipped: minRec('skipped', passCount),
    falseAlarms: minRec('falseAlarms', falseAlarmCount),
    avgSolveMs: hasSolves ? minRec('avgSolveMs', avgMsThisRun) : (before.avgSolveMs != null ? before.avgSolveMs : null),
  };
  recs[recordKey] = after;
  try{ localStorage.setItem('binCanaryRecords', JSON.stringify(recs)); }catch(e){}

  const anyRecord = !firstRun && (
    after.money > (before.money || 0) || after.canaries > (before.canaries || 0)
    || after.alleys > (before.alleys || 0) || after.streak > (before.streak || 0)
    || (before.skipped != null && after.skipped < before.skipped)
    || (before.falseAlarms != null && after.falseAlarms < before.falseAlarms)
    || (hasSolves && before.avgSolveMs != null && after.avgSolveMs < before.avgSolveMs));
  document.getElementById('end-record-banner').style.display = anyRecord ? 'block' : 'none';

  /* dir 'max': higher is better (green when cur > prevBest).
     dir 'min': lower is better (green when cur < prevBest) — skipped,
     false alarms, avg solve time all read backwards from the others.
     dir 'neutral': shown for comparison but never colored — run time
     isn't really a performance measure (a long run could mean skilled
     survival OR just slow, cautious play), so red/green would imply a
     judgement the number doesn't support.
     round: the sign is decided at the same resolution the value is
     DISPLAYED at, so a few ms of noise never shows as a colored "-0s". */
  const rows = [
    { label: STRINGS.end.statProfit,      cur: bankedMoney,        prevBest: before.money      ?? 0,    fmt: n => '$' + n.toLocaleString(), dir: 'max' },
    { label: STRINGS.end.statCanaries,    cur: totalCanariesFound, prevBest: before.canaries   ?? 0,    fmt: n => String(n), dir: 'max' },
    { label: STRINGS.end.statAlleys,      cur: alleysCleared,      prevBest: before.alleys     ?? 0,    fmt: n => String(n), dir: 'max' },
    { label: STRINGS.end.statStreak,      cur: longestStreakThisRun, prevBest: before.streak   ?? 0,    fmt: n => String(n), dir: 'max' },
    { label: STRINGS.end.statSkipped,     cur: passCount,          prevBest: before.skipped    ?? null, fmt: n => String(n), dir: 'min' },
    { label: STRINGS.end.statFalseAlarms, cur: falseAlarmCount,    prevBest: before.falseAlarms ?? null, fmt: n => String(n), dir: 'min' },
    { label: STRINGS.end.statAvg,         cur: avgMsThisRun,       prevBest: before.avgSolveMs ?? null, fmt: n => n == null ? '—' : formatDuration(n), dir: hasSolves ? 'min' : 'skip', round: 1000 },
    { label: STRINGS.end.statRun,         cur: runMs,              prevBest: before.runMs      ?? 0,    fmt: n => formatDuration(n), dir: 'neutral', round: 1000 },
  ];

  document.getElementById('end-compare-body').innerHTML = rows.map(r => {
    /* "Prev Best" always shows the record as it stood BEFORE this run —
       even when this run just broke it — so a new record reads as a
       real "This Run: 500, Prev Best: 300" comparison instead of "This
       Run: 500, Best: 500" (which looks like no improvement at all,
       since the just-set number silently became the displayed "best"). */
    const noPrevData = firstRun || r.prevBest == null;
    let deltaHtml;
    if(r.dir === 'skip' || r.cur == null){
      deltaHtml = `<span class="end-delta neutral">&mdash;</span>`;
    } else if(noPrevData){
      deltaHtml = `<span class="end-delta neutral">${STRINGS.end.firstRunTag}</span>`;
    } else {
      const rawDiff = r.cur - r.prevBest;
      const signDiff = r.round ? Math.round(rawDiff / r.round) : rawDiff;
      if(signDiff === 0){
        deltaHtml = `<span class="end-delta neutral">&plusmn;0</span>`;
      } else {
        const goingUp = signDiff > 0;
        const sign = goingUp ? '+' : '-';
        const mag = r.fmt(Math.abs(rawDiff));
        const cls = r.dir === 'neutral' ? 'neutral' : (goingUp === (r.dir === 'max') ? 'positive' : 'negative');
        deltaHtml = `<span class="end-delta ${cls}">${sign}${mag}</span>`;
      }
    }
    const prevBestHtml = noPrevData ? '&mdash;' : r.fmt(r.prevBest);
    return `<tr><td class="ec-label">${r.label}</td><td class="ec-val">${r.fmt(r.cur)}</td>`
      + `<td class="ec-val">${prevBestHtml}</td><td>${deltaHtml}</td></tr>`;
  }).join('');

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
    bin.className = 'bin bin-new';
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
      const isDelusional = Math.random() < DELUSIONAL_CHANCE;
      const pool = isDelusional ? DELUSIONAL_VARIANTS : SAD_VARIANTS;
      img.src = pool[Math.floor(Math.random() * pool.length)];
      binDelusional[i] = isDelusional;
      img.style.transformOrigin = '50% 100%';
      img.style.transform = 'scale('
        + (CANARY_SCALE_MIN + Math.random() * CANARY_SCALE_RANGE).toFixed(3) + ')';
    }
    yard.appendChild(bin);
  });
}

function toggleBin(i, forceState){
  if((!started || gameEnded || paused || revealing || celebrating) && forceState === undefined) return;
  const bin = document.getElementById('bin-' + i);
  const wasOpen = binOpen[i];
  /* A found canary stays found — opened canary bins lock open. Suspended
     on Waterfoul Alleys: the abacus rules apply there, so mistakes must
     be correctable by closing the bin again. */
  if(wasOpen && binHasCanary[i] && !waterfoulAlley && forceState === undefined) return;
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
      lastActionTs = Date.now();
      SFX.thunk();
      if(cfg.meter){
        let cost = Math.max(cfg.openMin, cfg.openPct * workforce);
        if(!binHasCanary[i]) cost += Math.max(cfg.alarmMin, cfg.alarmPct * workforce);
        chargeWorkforce(cost, bin);
      }
      if(binHasCanary[i]){
        SFX.chirp();
        showQuip(i);
        /* Waterfoul Alleys give zero mid-round feedback — this tally is
           silent by design and only cashed into the visible stats/reward
           math at round resolution (see celebrate()). Checked against the
           REAL target, since binHasCanary is faked true for every bin
           this round. */
        if(waterfoulAlley && !(binTarget & BITS[i])){
          waterfoulWrongOpens++;
        }
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
  const pool = waterfoulAlley
    ? STRINGS.canary.waterfoul
    : (binDelusional[i] ? STRINGS.canary.delusional : STRINGS.canary.sad);
  bubble.textContent = randomFrom(pool);
  bubble.classList.add('show');
  setTimeout(() => bubble.classList.remove('show'), 900);
}

function updateBinTotal(){
  /* Empty bins never count — only rescued canaries build the total.
     (On Waterfoul Alleys binHasCanary is faked all-true, so this
     naturally becomes "every open bin counts" — the abacus rules the
     mode needs — with no extra branching here.) */
  let total = 0;
  binOpen.forEach((open, i) => { if(open && binHasCanary[i]) total += BITS[i]; });
  const totalEl = document.getElementById('bin-total');
  if(revealing){
    totalEl.textContent = total;
    totalEl.classList.toggle('match', total === binTarget);
    return;
  }
  if(!givingUp){
    /* Waterfoul Alleys are ALWAYS blind (Firedamp only) — that's the
       proof round, and diluting it with a visible total would undercut
       the whole point. True Mode additionally hides it on every alley,
       on any tier. Masking only touches the DISPLAY and the .match
       flash (which would leak correctness via color even with the
       number hidden); win detection below still reads the real total. */
    const masked = (cfg.fire && waterfoulAlley) || trueMode;
    totalEl.textContent = masked ? '?' : total;
    totalEl.classList.toggle('match', !masked && total === binTarget);
    if(total === binTarget && !roundSolved) celebrate(total);
  } else {
    if(total === binTarget) resolveGiveUp();
  }
}

function celebrate(amount){
  roundSolved = true;
  const celebrateStart = Date.now();
  const wizardImg = document.getElementById('wizard-img');

  const elapsed = Date.now() - roundStartTime;
  solveTimes.push(elapsed);
  alleysCleared++;
  correctCount++;

  /* Waterfoul Alleys give zero mid-round feedback, so wrong opens are
     tallied silently as they happen (see toggleBin) and only cashed
     into the normal stats/reward math here, at round resolution — never
     mid-round, or the streak chip / floating numbers would leak the
     mistake before the round even ends. */
  let waterfoulCaught = false;
  if(waterfoulAlley){
    roundFalseAlarms += waterfoulWrongOpens;
    falseAlarmCount += waterfoulWrongOpens;
    waterfoulCaught = waterfoulWrongOpens === 0;
  }

  /* False alarms this round scared off part of the rescue. The clean
     streak deliberately does NOT boost the flock — profit rate only. */
  const reward = Math.max(1, Math.round(
    amount * Math.pow(cfg.alarmFactor || 1, roundFalseAlarms)));
  cleanStreak = roundFalseAlarms === 0 ? cleanStreak + 1 : 0;
  longestStreakThisRun = Math.max(longestStreakThisRun, cleanStreak);
  updateStreakChip();
  totalCanariesFound += reward;
  if(cfg.meter){
    workforce += reward;
    spawnFloat('+' + reward, true, document.getElementById('bin-total'));
    updateWorkforceUI();
  }

  if(waterfoulAlley){
    if(waterfoulCaught){
      /* the catch — knock the blaze back a stage */
      fireLevel = Math.max(0, fireLevel - EXTINGUISH_AMOUNT);
      updateBlazeGauge();
      SFX.splash();
      setWizardLine(randomFrom(STRINGS.wizard.waterfoulCaught));
    } else {
      setWizardLine(randomFrom(STRINGS.wizard.waterfoulMissed));
    }
  } else {
    setWizardLine(randomFrom(roundFalseAlarms > 0
      ? STRINGS.wizard.winScared
      : STRINGS.wizard.win));
  }
  wizardImg.src = IMG.wizardHappy;
  launchConfetti();

  /* Every solve: confetti + happy wizard, and the game keeps running —
     decay, money, bin clicks, all of it. Only the milestone splash
     actually stops the clock, since that's the one moment with a
     message big enough to cover the board. */
  const milestone = MILESTONE_ALLEYS.includes(alleysCleared);
  if(milestone) SFX.milestone(); else SFX.win();
  const wrap = document.getElementById('success-wrap');
  if(milestone){
    celebrating = true;
    celebrationSkippableAt = celebrateStart + 250;
    document.getElementById('success-headline').innerHTML =
      STRINGS.success.milestoneHeadline.replace('{N}', `<span class="num-font">${alleysCleared}</span>`);
    document.getElementById('rescue-line').textContent =
      fillRank(STRINGS.success.milestoneSub);
    wrap.classList.add('show');
  }

  const endCelebration = () => {
    if(milestone){
      if(!celebrating) return;  /* already ended — timer vs click race */
      celebrating = false;
      celebrationSkip = null;
      /* the freeze shouldn't count as elapsed OR idle time — otherwise
         the idle ramp would jump ahead the instant the flock starts
         ticking again (fireLevel is already freeze-safe: it only
         accumulates inside decayFrame's active branch, same gate) */
      const frozenMs = Date.now() - celebrateStart;
      sessionStartTime += frozenMs;
      lastActionTs += frozenMs;
    }
    clearTimeout(advanceTimer);
    wrap.classList.remove('show');
    wizardImg.src = IMG.wizardGrumpy;
    givingUp = false;
    newBinaryTarget();
  };
  if(milestone) celebrationSkip = endCelebration;  /* click-anywhere skips it early */

  clearTimeout(advanceTimer);
  advanceTimer = setTimeout(endCelebration, milestone ? 2200 : 1200);
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
  /* Waterfoul pacing: random roll per alley, still no hard pity — but
     the chance climbs the longer it's been dry (reset to base the
     moment one lands), so droughts get steadily less likely instead
     of staying flat at 15% forever. None at all until the player has
     cleared WATERFOUL_MIN_ALLEYS, so it never ambushes an early run. */
  const eligible = !!(cfg.fire && alleysCleared >= WATERFOUL_MIN_ALLEYS);
  const roll = WATERFOUL_CHANCE + WATERFOUL_DRY_RAMP * alleysSinceWaterfoul;
  const isWaterfoul = eligible && Math.random() < roll;
  waterfoulAlley = isWaterfoul;
  waterfoulWrongOpens = 0;
  if(cfg.fire) alleysSinceWaterfoul = isWaterfoul ? 0 : alleysSinceWaterfoul + 1;

  /* Every fresh alley gets a full, un-eaten grace window — previously
     idle-drain only reset on the SOLVING click, so the ~1.2s
     celebration (which keeps ticking) ate into the grace before the
     new target was even visible. Waterfoul alleys get extra room:
     the correct play is to verify the whole decomposition before
     touching anything, which idle-drain would otherwise punish. */
  lastActionTs = Date.now();
  roundGraceMs = isWaterfoul ? WATERFOUL_IDLE_GRACE_MS : IDLE_GRACE_MS;

  const maxTarget = (1 << cfg.bits) - 1;
  let next;
  do {
    next = Math.floor(Math.random() * maxTarget) + 1;
  } while(next === binTarget
    || (isWaterfoul
      ? (popcount(next) < WATERFOUL_POPCOUNT_MIN || popcount(next) > WATERFOUL_POPCOUNT_MAX)
      : (popcount(next) < (cfg.minBits || 1) && Math.random() > (cfg.lowBitChance || 0))));
  binTarget = next;
  binOpen = new Array(cfg.bits).fill(false);
  /* Waterfoul Alleys: every bin has a bird, so nothing self-corrects —
     the player's own arithmetic is the only feedback all round. */
  binHasCanary = isWaterfoul
    ? new Array(cfg.bits).fill(true)
    : BITS.map(val => !!(binTarget & val));
  roundFalseAlarms = 0;
  roundSolved = false;
  roundStartTime = Date.now();
  document.getElementById('sign-target').textContent = binTarget;
  stage.classList.toggle('waterfoul-alley', isWaterfoul);
  if(isWaterfoul){
    setWizardLine(randomFrom(STRINGS.wizard.waterfoulSpotted));
  } else if(!isFirstRound){
    setWizardLine(randomFrom(
      currentTier === 'practice' ? STRINGS.wizard.tutorial : STRINGS.wizard.ambient));
  }
  isFirstRound = false;
  buildBins();
  updateBinTotal();
  pulseNum(document.getElementById('sign-target'));
  pulseNum(document.getElementById('bin-total'));
  SFX.newAlley();
}

/* Restarts the .pop animation every call, even back-to-back — just
   re-adding the class wouldn't retrigger a CSS animation already at
   its end state, so the class is removed and a reflow is forced
   (reading offsetWidth) before adding it back. */
function pulseNum(el){
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

function giveUp(){
  if(!started || gameEnded || givingUp || paused || revealing || celebrating) return;
  givingUp = true;
  SFX.gameover();
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
try{ trueMode = localStorage.getItem('binCanaryTrueMode') === '1'; }catch(e){}
