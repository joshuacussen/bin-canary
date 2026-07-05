/* =====================================================================
   Tiny WebAudio synth — no audio assets. Every effect is built from
   oscillators and filtered noise at play time. The AudioContext can
   only start after a user gesture, so it lazily initializes on the
   first pointerdown anywhere.
   ===================================================================== */
const SFX = (() => {
  let ctx = null, master = null, enabled = true;

  function ensure(){
    if(!ctx){
      const AC = window.AudioContext || window.webkitAudioContext;
      if(!AC){ enabled = false; return; }
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
    }
    if(ctx.state === 'suspended') ctx.resume();
  }
  document.addEventListener('pointerdown', () => { if(enabled) ensure(); });

  function ready(){ return enabled && ctx && ctx.state === 'running'; }

  function tone(freq, dur, opts){
    if(!ready()) return;
    const o = opts || {};
    const t0 = ctx.currentTime + (o.when || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if(o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(o.vol || 0.5, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  }

  function noise(dur, opts){
    if(!ready()) return;
    const o = opts || {};
    const t0 = ctx.currentTime + (o.when || 0);
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for(let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = o.freq || 800;
    f.Q.value = o.q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.vol || 0.4, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  }

  return {
    ensure,
    isEnabled: () => enabled,
    setEnabled(on){ enabled = on; if(on) ensure(); },

    /* lid opens */
    thunk(){ tone(110, 0.07, { vol:0.45 }); noise(0.05, { vol:0.22, freq:300 }); },
    /* canary found */
    chirp(){
      const base = 1300 + Math.random() * 500;
      tone(base, 0.07, { type:'triangle', vol:0.5 });
      tone(base * 1.35, 0.09, { type:'triangle', vol:0.45, when:0.08 });
    },
    /* empty bin slams */
    slam(){ noise(0.18, { vol:0.65, freq:250, q:0.7 }); tone(70, 0.18, { vol:0.5 }); },
    /* Pass — grumpy descending buzz */
    pass(){
      tone(320, 0.12, { type:'sawtooth', vol:0.32, slideTo:210 });
      tone(210, 0.16, { type:'sawtooth', vol:0.28, when:0.12, slideTo:140 });
    },
    /* round solved — a proper ta-da: quick run up, held bright finish */
    win(){
      [523, 659, 784, 1047].forEach((f, i) =>
        tone(f, i === 3 ? 0.28 : 0.08, { type:'triangle', vol:0.45, when:i * 0.07 }));
      tone(1319, 0.24, { type:'triangle', vol:0.22, when:0.21 });
    },
    /* milestone splash */
    milestone(){
      [523, 659, 784, 1047, 1319].forEach((f, i) =>
        tone(f, i === 4 ? 0.35 : 0.11, { type:'triangle', vol:0.48, when:i * 0.1 }));
    },
    /* the mine goes quiet */
    gameover(){
      tone(220, 0.9, { type:'sawtooth', vol:0.38, slideTo:55 });
      noise(0.6, { vol:0.18, freq:150, when:0.2 });
    },
    /* fire crackle pops, scaled by intensity */
    pop(heat){ noise(0.04, { vol:0.08 + heat * 0.18, freq:500 + Math.random() * 1500, q:2 }); },
    /* Waterfoul Alley caught — steam hiss as the flames retreat */
    splash(){
      noise(0.25, { vol:0.5, freq:2200, q:0.6 });
      noise(0.35, { vol:0.35, freq:900, q:0.8, when:0.05 });
      tone(180, 0.3, { type:'sine', vol:0.25, slideTo:90, when:0.02 });
    },
    /* new alley dealt — plays constantly, so it stays short and quiet
       rather than a proper fanfare like win()/milestone() */
    newAlley(){
      tone(700, 0.055, { type:'sine', vol:0.22 });
      tone(950, 0.07, { type:'sine', vol:0.26, when:0.05 });
    },
  };
})();
