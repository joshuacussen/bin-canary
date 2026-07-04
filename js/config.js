/* =====================================================================
   Difficulty & feel tuning. All gameplay numbers live here — tweak
   freely, no game logic below. Text lives in strings.js.

   Per-tier keys:
   - bits:          bins in play (4 -> 8/4/2/1, targets 1-15)
   - meter:         false = no workforce, no costs, no game over
   - start:         starting flock
   - halfLife:      seconds for the proportional decay to halve the flock
   - baseDrain:     constant loss per second (guarantees 0 is reachable)
   - drainRamp:     extra baseDrain added per minute of session time (the
                    fire spreads) — makes long runs unsustainable
   - openPct/Min:   startle cost of opening ANY bin (% of flock, floor)
   - alarmPct/Min:  extra cost of opening an EMPTY bin
   - alarmFactor:   solve reward multiplies by this per false alarm this
                    round (the hiding canaries hear you and flee) — this
                    is what makes open-everything a losing strategy
   - skipPct/Min:   Pass cost
   - fire:          everything is on fire
   ===================================================================== */
const TIERS = {
  practice:  { bits:4, meter:false },
  trainee:   { bits:6, meter:true, start:100, halfLife:90, baseDrain:0.2, payRate:0.05,
               openPct:0.02, openMin:2, alarmPct:0.05, alarmMin:5,  alarmFactor:0.65, skipPct:0.2,  skipMin:8 },
  detective: { bits:8, meter:true, start:100, halfLife:45, baseDrain:0.55, payRate:0.1,
               openPct:0.02, openMin:2, alarmPct:0.10, alarmMin:10, alarmFactor:0.5,  skipPct:0.25, skipMin:12 },
  inspector: { bits:8, meter:true, start:60,  halfLife:25, baseDrain:0.8, payRate:0.2, minBits:3, lowBitChance:0.25,
               openPct:0.02, openMin:2, alarmPct:0.18, alarmMin:15, alarmFactor:0.4,  skipPct:0.3,  skipMin:15 },
  elite:     { bits:8, meter:true, start:50,  halfLife:14, baseDrain:1.2, drainRamp:0.8, fire:true, payRate:0.4, minBits:3, lowBitChance:0.25,
               openPct:0.03, openMin:3, alarmPct:0.25, alarmMin:20, alarmFactor:0.3,  skipPct:0.35, skipMin:20 },
};
/* The running total's visibility on Firedamp is no longer a static
   per-tier flag — Waterfoul Alleys are ALWAYS blind (no total, ever;
   that's the point of the proof round), and the "True Firedamp" toggle
   (game.js: `trueFiredamp`) additionally hides it on every OTHER alley
   too. See updateBinTotal() in game.js. */
/* payRate: $ generated per canary per second while it's on the clock.
   Harder shifts pay a risk premium, so they're the high-score runs. */
/* minBits: minimum set bits in a target — keeps free-money single-bin
   targets (open one bin, collect 128) off the upper tiers.
   lowBitChance: probability that a rolled below-minBits target is
   accepted anyway. Low-bit numbers are ~14% of raw rolls, so 0.25
   here means roughly 4% of rounds end up being a rare easy target. */
const TIER_ORDER = ['practice', 'trainee', 'detective', 'inspector', 'elite'];

/* Meter display: asymptotic fill (no hard cap) and warning thresholds */
const METER_SOFT_SCALE = 250;
const WARN_AT = 60, DANGER_AT = 25;

/* Alleys-cleared counts that trigger the big starburst splash —
   deliberately thins out as a session goes on */
const MILESTONE_ALLEYS = [5, 10, 20, 40, 80, 160, 320];

/* Fire mode: flock level where the blaze starts ramping toward inferno */
const FIRE_PANIC_AT = 120;

/* Firedamp's fire-fighting system. fireLevel rises with ACTIVE play
   time only (not raw wall-clock — see decayFrame in game.js) and
   multiplies drainRamp, same as before if the player never fights it.
   Completing a Waterfoul Alley — a blind, zero-feedback proof round —
   with zero wrong opens knocks fireLevel back down; any wrong open
   (or Passing on it) means the fire goes unfought.
   See memory/bin-canary-firedamp-rework.md for the full design. */
const FIRE_STAGE_THRESHOLDS = [0, 2, 4, 7, 11];
const EXTINGUISH_AMOUNT = 3;
const WATERFOUL_POPCOUNT_MIN = 3, WATERFOUL_POPCOUNT_MAX = 6;

/* Waterfoul Alley pacing: each Firedamp alley rolls WATERFOUL_CHANCE +
   WATERFOUL_DRY_RAMP × (alleys since the last one) to be one — still
   no hard pity/guarantee, but the odds climb the longer it's been dry
   instead of staying flat forever, so the tail of very long droughts
   gets squeezed without making any specific alley "the guaranteed
   one". At these numbers the roll hits 100% by ~28 dry alleys, capping
   how bad an unlucky streak can get. Decoupled from fireLevel/stage on
   purpose — this used to trigger deterministically on stage crossings,
   which tied pacing to how fast the player solved rather than to a
   rhythm of alleys, and felt unpredictable. WATERFOUL_MIN_ALLEYS holds
   it off entirely for the opening stretch of a shift, so it can't
   ambush a player before they've found their feet. */
const WATERFOUL_CHANCE = 0.15;
const WATERFOUL_DRY_RAMP = 0.03;
const WATERFOUL_MIN_ALLEYS = 10;

/* Waterfoul Alleys demand verifying the WHOLE decomposition before
   touching anything (no bin self-corrects) — the default idle grace
   punishes exactly that patience, so these rounds get a longer window
   before idle-drain starts ramping. See IDLE_GRACE_MS below. */
const WATERFOUL_IDLE_GRACE_MS = 12000;

/* Canary sprite size randomization: scale in [MIN, MIN + RANGE] */
const CANARY_SCALE_MIN = 0.82, CANARY_SCALE_RANGE = 0.3;

/* Chance a caught canary rolls a happy pose (and the `delusional` quip
   pool) instead of a sad one. Keep this low — the joke is that they're
   rare, blissfully-unaware outliers, not a normal mood. */
const DELUSIONAL_CHANCE = 0.05;

/* Money display: below this, show the real number with commas (still
   fits the fixed-width chip and feels like real progress). At/above
   it, switch to short suffixes (1m, 1.5b, ...) since full digits
   stop fitting — this is the ONLY reason we ever abbreviate. */
const MONEY_ABBREVIATE_AT = 1e6;

/* Clean streak: each consecutive no-false-alarm solve adds BONUS to the
   PROFIT rate multiplier (streak 3 -> x1.3 earnings), capped at CAP.
   Any false alarm or Pass resets it. Streaks never touch the flock —
   score reward only, so they can't snowball the survival game. */
const STREAK_BONUS = 0.1, STREAK_CAP = 2;

/* Idle penalty: build a big flock + a fat streak, then walk away and
   let proportional decay quietly mint profit for you — that shouldn't
   be a strategy. IDLE_GRACE_MS is free thinking time (no penalty).
   Past that, drain ramps with the SQUARE of idle seconds, so a short
   pause is invisible but sitting still for ~10s starts overwhelming
   any passive profit, capped at IDLE_MAX_DRAIN so it's severe but not
   an instant, no-warning kill. Resets on every bin open or Pass. */
const IDLE_GRACE_MS = 4000;
const IDLE_RAMP_PER_SEC2 = 0.8;
const IDLE_MAX_DRAIN = 40;
