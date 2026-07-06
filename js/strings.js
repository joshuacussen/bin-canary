/* =====================================================================
   All player-facing text lives here. Edit freely — no game logic below.
   Wizard line pools are arrays: add/remove lines and the game picks
   randomly. {RANK} and {N} are substituted at runtime where noted.
   ===================================================================== */

/* Canonical vocabulary for concepts that get named in more than one
   piece of STRUCTURED UI copy (button labels, stat-table row labels,
   the how-to-play teaching line) — reference these instead of retyping
   the word, so a rename can't happen in only SOME of the places it
   appears. Previously "opening an empty bin" was independently called
   a "wrong bin" (tierInfo), a "mistake" (tierInfo), and a "false alarm"
   (end-screen stats, wizard quips) — three names for one mechanic, easy
   to misread as three different ones. Same issue existed for "Pass"
   vs. the end-screen's old "Skipped" label.
   Wizard/canary flavor-text ARRAYS are deliberately exempt — those
   exist to describe the same event many different, characterful ways
   ("EMPTY! The flock is rattled." / "A false alarm?!" / etc.); forcing
   one fixed phrase into every line would flatten the voice that makes
   them worth having as an array in the first place. */
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const TERM_FALSE_ALARM = 'false alarm';
const TERM_PASS = 'Pass';

const STRINGS = {

  title: "BIN CANARY",

  buttons: {
    newAlley:    TERM_PASS,
    giveUp:      "End Game",
    playAgain:   "Play Again",
    changeShift: "Change Shift",
    howToPlay:   "How Do I Bin?",
    startShift:  "Start Shift",
    back:        "Back To The Alley",
    pause:       "Pause",
    resume:      "Back To Work",
    sfxOn:       "SFX: On",
    sfxOff:      "SFX: Off",
  },

  pause: {
    title: "PAUSED",
    sub: "Union-mandated break. The quota will wait. Hexer won't like it.",
  },

  hud: {
    streak: "CLEAN STREAK: {N}",  /* shown once you chain 2+ perfect solves */
    money:  "SHAREHOLDER PROFIT",             /* static label above the running $ total */
  },

  /* Firedamp-only gauge chip. `label` is the static caption; `stages`
     is shown as the value, indexed by FIRE_STAGE_THRESHOLDS in
     config.js (must have the same length). */
  blaze: {
    label: "BLAZE LEVEL",
    stages: ["1", "2", "3", "4", "PANIC"],
  },

  sign: { label: "CANARIES<br>MISSING" },

  total: { label: "CURRENT<br>TOTAL" },

  meter: { label: "CURRENT FLOCK:" },

  /* Wizard's opening line when a shift starts */
  intro: "I am <b>Hexer Decimal</b>, Wizard of the Mines! My canaries are hiding in the bins that add up to the number on the sign—and ONLY those bins. Open carefully. Empty bins spook the flock.",

  /* Painted on a bin after a false alarm */
  emptyStamp: "EMPTY!",

  /* Shown on phones held in portrait — the game is landscape only */
  rotate: "ROTATE YOUR DEVICE!<br>The mine is landscape only.",

  success: {
    /* Big starburst splash — reserved for every few alleys cleared */
    milestoneHeadline: "{N} ALLEYS<br>CLEARED!",
    milestoneSub: "KEEP IT UP, {RANK}!",
  },

  /* `desc` is the short at-a-glance line shown in the tier row. The
     detailed numbers on selection are built from js/config.js directly
     (see buildDifficultyRows in game.js) — not duplicated here, so they
     can never drift out of sync with the real tuning. `extra` is a
     supplementary blurb sitting beside the numbers table — every tier
     has one now (used to be Firedamp-only, and the empty space where
     it would've gone on other tiers looked like a layout bug). */
  tiers: {
    practice: {
      name: "Work Experience",
      desc: "No pressure. No pay.",
      rank: "NOOB",
      extra: "<b>Zero risk, all practice.</b> No flock to feed and no fees to pay—Work Experience exists purely so you can learn to read a bin without anything on the line. Take your time. Hexer isn't even watching.",
    },
    trainee: {
      name: "Trainee",
      desc: "A forgiving flock.",
      rank: "TRAINEE",
      extra: "<b>Your first real quota.</b> The flock decays slowly and a false alarm barely stings, but the numbers are real now. Get comfortable reading the sign before the pressure ramps up.",
    },
    detective: {
      name: "Bin Detective",
      desc: "The standard shift.",
      rank: "BIN DETECTIVE",
      extra: "<b>The one most miners retire on.</b> Decay picks up and false alarms cost more, but nothing here is unfair—just steady, honest pressure. This is the shift the game is balanced around.",
    },
    inspector: {
      name: "Chief Binspector",
      desc: "The birds are ready to walk.",
      rank: "CHIEF BINSPECTOR",
      extra: "<b>Management is watching.</b> The flock is smaller and jumpier, and every false alarm costs real canaries. Confident, efficient solving is the only way to survive a full shift.",
    },
    elite: {
      name: "Firedamp",
      desc: "The mine is on fire.",
      rank: "FIREPROOF LEGEND",
      extra: "<b>The ultimate test of skill.</b> The mine is going to burn down—the longer you play, the stronger the flames get. Stymie the blaze by completing a perfect <b>Waterfoul Alley</b>.</br>*In Waterfoul Alleys, the current total is always hidden.",
    },
  },

  /* Labels for the per-tier stat table on the start screen. Values are
     computed live from config.js, never hardcoded — see buildDifficultyRows. */
  tierInfo: {
    pickPrompt: "Pick a shift to see what you're in for.",
    bins:          "Bins",
    flock:         "Starting flock",
    noFlock:       "None: no fees, no game over",
    decay:         "Base decay rate",
    openCost:      "Open cost",
    /* Same label for both — a false alarm has exactly one cost, just
       charged against two different currencies. The FLOCK/REWARD tag
       (not the wording) is what tells them apart; giving the reward
       side a different noun ("loss", "penalty"...) implied it was a
       different mechanic, which is exactly the confusion this table
       is supposed to prevent. Every cost row in this table (this one,
       Open cost, Pass cost) is unsigned on purpose too — a "+"/"-"
       here would try to mean "additional" for one row and "reduction"
       for another, which is two different meanings for the same
       symbol on rows that are otherwise identical in kind. */
    falseAlarmCost: `${cap(TERM_FALSE_ALARM)} cost`,
    passCost:      `${TERM_PASS} cost`,
    totalShown:    "Current total shown",
    totalWaterfoulOnly: "Yes*",
    totalNever:         "Never",
    yes: "Yes",
    no:  "No",
    /* Small tags next to a stat label clarifying what it actually costs —
       FLOCK = hits the workforce meter directly, REWARD = only dents the
       payout multiplier. Keeps "does this end my run or just my score?"
       answerable at a glance. */
    tagFlock:  "FLOCK",
    tagReward: "REWARD",
    trueModeDesc: "Hide the current total on every alley—track the sum yourself, the whole shift played blind.",
    trueModeOn:  "TRUE MODE: ON",
    trueModeOff: "TRUE MODE: OFF",
  },

  start: {	
    title: "BIN CANARY",
    tagline: "A non-exploitative binary conversion experience. Pick your shift.",
  },

  howto: {
    title: "HOW DO I BIN?",
    body: [
      "<b>Hexer Decimal</b>'s mine runs on canaries—and the canaries have had enough. They've fled to the alleys and are hiding in the bins.",
      "The sign says how many are on the run. They're hiding in the bins whose numbers <b>add up to exactly that total</b>—and only those bins.",
      "Each bin holds <b>double</b> the bin to its right. Start with the biggest bin that fits inside the target, then work out what's left.",
      "Find a canary and it's caught: the bin stays open, its number joins your total, and off to the mine it goes. It will not thank you.",
      `Open the wrong bin and it's <b>EMPTY</b>—a <b>${TERM_FALSE_ALARM}</b>. It slams shut, your flock panics, and the hiding canaries hear the racket—a chunk of them escape for good.`,
      "Your flock is always declining—mining is a terrible job, and Hex and Safety are on holiday. Hit zero and the mine goes quiet for good.",
      "Stuck? <b>Pass</b> fetches a fresh alley, but the flock docks you for it.",
    ],
  },

  end: {
    gameoverHeadline: "THE MINE HAS GONE QUIET...",
    gameoverSub: "The canary workforce ran dry. Hexer Decimal is not pleased.",
    quitHeadline: "SESSION OVER",
    quitSub: "Thanks for keeping the mines running, {RANK}.",
    /* Table row labels — no trailing colon, they sit in their own column now */
    statProfit:      "Shareholder profit",
    statCanaries:    "Canaries found",
    statAlleys:      "Alleys cleared",
    statStreak:      "Longest streak",
    statSkipped:     `${TERM_PASS}ed`,
    statFalseAlarms: `${cap(TERM_FALSE_ALARM)}s`,
    statAvg:         "Average time to solve",
    statRun:         "Total run time",
    recordBanner:    "NEW SHIFT RECORD!",
    colThisRun:  "This Run",
    colBest:     "Prev Best",
    colDelta:    "+/-",
    firstRunTag: "first run",
  },

  /* Quips when a canary is caught. Most canaries are `sad` (they do NOT
     want to go back to the mine, and some have opinions about management).
     Canaries with a happy pose use `delusional` instead — they think this
     is all going great. */
  canary: {
    sad: [
      "AW, SEEDS.", "NOT THE MINE AGAIN.", "FIVE MORE MINUTES...",
      "I HAVE RIGHTS!", "LE SIGH.", "I WAS HAPPY HERE.",
      "THE DARK. THE DUST. JOY.", "BACK TO THE PIT, THEN.",
      "TELL HEXER I FAINTED.", "HEXER SMELLS OF SULPHUR.",
      "THAT WIZARD OWES ME BACK PAY.", "HEXER'S BEARD IS GLUED ON.",
      "DOWN WITH DECIMAL!", "WHAT THE FLOCK?", "HEXER IS AI.",
    ],
    delusional: [
      "MINE SWEET MINE!", "I LOVE MY JOB.", "THE DARK IS COZY.",
      "IT'S BASICALLY A SPA.", "FREE HARD HATS!", "BEST DAY EVER!",
      "HEXER SAYS I'M SPECIAL.", "EMPLOYEE OF THE MONTH!",
      "THE DUST IS GOOD FOR MY VOICE.", "CARDIO!",
    ],
    /* Waterfoul Alley quips — used for EVERY bin on that round, right
       or wrong, since nothing may differ between them */
    waterfoul: [
      "QUACK.", "I'M ALL WET.", "HONK IF YOU'RE UNSURE.",
      "DRIP DRIP DRIP.", "WATER YOU WAITING FOR?", "PADDLE FASTER.",
      "I CAN'T TELL YOU ANYTHING.", "MY LIPS ARE SEALED. AND WEBBED.",
    ],
  },

  wizard: {

    /* Between rounds, normal shifts */
    ambient: [
      "Every canary counts, you know.",
      "Productivity waits for no one!",
      "Careful—they bite when startled.",
      "The mine doesn't run itself!",
      "You're getting the hang of this.",
      "Canaries: small, yellow, surprisingly litigious.",
      "I once lost a canary down a vending machine. Long story.",
      "Quota's quota. Chop chop.",
    ],

    /* Between rounds on the Work Experience shift — teaching hints */
    tutorial: [
      "Start with the biggest bin that fits, then see what's left.",
      "Each bin holds exactly double the one to its right.",
      "Odd target? The 1 bin is ALWAYS in play. Always.",
      "Add the open bins in your head. That's the whole trick.",
      "Wrong bin? It slams itself shut. Try the next one down.",
      "There's exactly one right combination. The canaries know it.",
    ],

    /* On solving a round */
    win: [
      "Excellent! Back to the mines with you!",
      "My shareholders thank you.",
      "Productivity restored! For now.",
      "Splendid work, {RANK}!",
	  "KACHING!",
    ],

    /* On solving a round where false alarms scared off part of the haul */
    winScared: [
      "Half a flock is better than none. Barely.",
      "We caught... some of them. Wonderful.",
      "Next time: fewer alarms, more canaries.",
      "A partial quota. Hexer Decimal remembers.",
    ],

    /* Waterfoul Alley: every bin has a bird, none of them tell you
       anything — announced when the round is dealt */
    waterfoulSpotted: [
      "WATERFOUL SPOTTED! Every bin's full — and I'm telling you NOTHING else.",
      "The waterfoul are in. All of them. Good luck.",
      "No hints this round. Not one. Prove it.",
      "Every bin has a bird. Which ones are YOURS to catch?",
    ],
    /* Solved a Waterfoul Alley with zero wrong opens — the fire retreats */
    waterfoulCaught: [
      "PSHHHT! The flames retreat — flawless work!",
      "Not a single wrong bin. The blaze cowers.",
      "Perfect. The waterfoul earned their keep.",
      "That's how you fight a fire with arithmetic.",
    ],
    /* Solved a Waterfoul Alley but opened at least one wrong bin */
    waterfoulMissed: [
      "A slip-up. The fire didn't even blink.",
      "Close, but the blaze felt nothing.",
      "Some of those bins were wrong. The fire knows.",
      "No perfect run, no relief. The flames spread on.",
    ],

    /* On passing during Work Experience — the answer is revealed instead */
    reveal: [
      "THOSE were the bins. Study them.",
      "Watch closely — this is the answer.",
      "See? Biggest bin first, then the leftovers.",
      "Memorize it. There WILL be a quota.",
    ],

    /* On pressing Pass — he is not happy about it */
    pass: [
      "You PASSED?! Quota doesn't pass itself!",
      "Pass?! In MY mine?!",
      "Fine. FINE. New alley. This is coming out of the flock.",
      "The shareholders will hear about this.",
      "Every pass costs birds, you know. MY birds.",
      "Oh, too HARD, was it?",
    ],

    /* On opening an empty bin */
    falseAlarm: [
      "EMPTY! The flock is rattled.",
      "Nothing in there but disappointment.",
      "A false alarm?! Word spreads fast, you know.",
      "That bin was empty and now everyone's upset.",
      "You've alarmed the workforce for NOTHING.",
      "No canary. Just the echo of your mistakes.",
	  "Don't let the union hear about this.",
    ],

    /* On pressing Give Up */
    giveup: [
      "Oh, you peeked. How disappointing.",
      "I suppose that's one way to do it.",
      "No badge of honor for that one.",
      "We don't talk about this round.",
      "SHAME!",
    ],
  },
};
