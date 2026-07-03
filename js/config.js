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
  trainee:   { bits:6, meter:true, start:100, halfLife:90, baseDrain:0.2,
               openPct:0.02, openMin:2, alarmPct:0.05, alarmMin:5,  alarmFactor:0.65, skipPct:0.2,  skipMin:8 },
  detective: { bits:8, meter:true, start:100, halfLife:45, baseDrain:0.4,
               openPct:0.02, openMin:2, alarmPct:0.10, alarmMin:10, alarmFactor:0.5,  skipPct:0.25, skipMin:12 },
  inspector: { bits:8, meter:true, start:60,  halfLife:25, baseDrain:0.8, minBits:3, lowBitChance:0.25,
               openPct:0.02, openMin:2, alarmPct:0.18, alarmMin:15, alarmFactor:0.4,  skipPct:0.3,  skipMin:15 },
  elite:     { bits:8, meter:true, start:50,  halfLife:14, baseDrain:1.2, drainRamp:0.8, fire:true, minBits:3, lowBitChance:0.25,
               openPct:0.03, openMin:3, alarmPct:0.25, alarmMin:20, alarmFactor:0.3,  skipPct:0.35, skipMin:20 },
};
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

/* Canary sprite size randomization: scale in [MIN, MIN + RANGE] */
const CANARY_SCALE_MIN = 0.82, CANARY_SCALE_RANGE = 0.3;

/* Clean streak: each consecutive no-false-alarm solve adds BONUS to the
   reward multiplier (streak 3 -> x1.3), capped at CAP. Any false alarm
   or Pass resets it. */
const STREAK_BONUS = 0.1, STREAK_CAP = 2;
