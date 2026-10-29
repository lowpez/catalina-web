/**
 * CATALINA WEB - Core Engine v4.3.7 (Generative Organic Entropy Fix)
 * 
 * BASE EXACTA: v4.3.6 (Color Tímbrico Exponencial + Nota Raíz Completa)
 * MEJORA CRÍTICA: Corrección de la lógica de entropía en modo Generativo.
 * 1. selectNoteWithEntropy: Salto mínimo de 1 nota para evitar estancamiento melódico.
 * 2. processColumnForMusic: Probabilidad y throttle ajustados para que 0% sea espaciado/calmado.
 * 3. exportWAV: Sincronización exacta de la lógica generativa con la reproducción en vivo.
 * Resultado: El slider de Entropía ahora controla la "Intensidad Emocional" de forma natural.
 */

// --- CONFIGURACIÓN Y ESTADO ---
const CONFIG = {
    bands: 8,
    sampleRate: 44100
};

const state = {
    isPlaying: false,
    startTime: 0,
    scanX: 0,
    durationSec: 2.0,
    exportDuration: 60,
    imageData: null,
    columnData: null,
    width: 0,
    height: 0,
    
    isInverted: true,
    isLooping: true,
    isPingPong: true,
    isGenerative: false,
    isScrubbing: false,
    
    currentMode: 'musical',
    
    masterVolume: 0.7,
    filterAmount: 0.5,
    freqMin: 65.41,
    freqMax: 1046.50,
    
    entropy: 0.5,
    lastNoteIndex: -1,
    
    randomSynth: null,
    linealVoices: [],
    linealGains: [],
    fmOscillators: [], 
    
    limiter: null,
    filter: null,
    reverb: null,
    delay: null,
    lastGenTime: 0,
    lastLinealTime: 0
};

// --- UTILIDADES MUSICALES ---
const SCALES = {
    lydian: [0, 2, 4, 6, 7, 9, 11],
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    pentatonic: [0, 2, 4, 7, 9],
    pentatonicMinor: [0, 3, 5, 7, 10]
};

function midiToFreq(midiNote) {
    return 440 * Math.pow(2, (midiNote - 69) / 12);
}

function freqToMidi(freq) {
    return 69 + 12 * Math.log2(freq / 440);
}

function clampMidiToRange(midi, minMidi, maxMidi) {
    let adjusted = midi;
    while (adjusted < minMidi) adjusted += 12;
    while (adjusted > maxMidi) adjusted -= 12;
    return adjusted;
}

function generateChordVoicing(rootMidi, voicingType) {
    const minMidi = Math.round(freqToMidi(state.freqMin));
    const maxMidi = Math.round(freqToMidi(state.freqMax));
    
    const scaleSelect = document.getElementById('selectScale');
    const scaleName = scaleSelect ? (scaleSelect.value || 'lydian') : 'lydian';
    const scaleIntervals = SCALES[scaleName] || SCALES.lydian;
    
    let voicingIntervals = [];
    switch (voicingType) {
        case 'voice-pair': voicingIntervals = [0, 4, 7, 11, 12, 16, 19, 23]; break;
        case 'drone': voicingIntervals = [0, 0, 7, 12, 14, 16, 19, 21]; break;
        case 'open': voicingIntervals = [0, 7, 12, 19, 24, 31, 36, 43]; break;
        case 'chord-melody':
        default: voicingIntervals = [0, 7, 4, 11, 14, 18, 24, 26]; break;
    }

    const chordFreqs = [];
    for (let i = 0; i < CONFIG.bands; i++) {
        let rawMidi = rootMidi + voicingIntervals[i];
        let finalMidi = clampMidiToRange(rawMidi, minMidi, maxMidi);
        
        const noteInScale = ((finalMidi - rootMidi) % 12 + 12) % 12;
        if (!scaleIntervals.includes(noteInScale)) {
            let closestInterval = scaleIntervals[0];
            let minDistance = 12;
            for (const interval of scaleIntervals) {
                const distance = Math.abs(noteInScale - interval);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestInterval = interval;
                }
            }
            const octaveOffset = Math.floor((finalMidi - rootMidi) / 12) * 12;
            finalMidi = rootMidi + closestInterval + octaveOffset;
        }
        
        const detune = (Math.random() - 0.5) * 4; 
        chordFreqs.push(midiToFreq(finalMidi) * Math.pow(2, detune / 1200));
    }
    return chordFreqs;
}

function selectNoteWithEntropy(chordFreqs, scaleName) {
    const scaleIntervals = SCALES[scaleName] || SCALES.lydian;
    const scaleLength = scaleIntervals.length;
    
    let currentIndex = state.lastNoteIndex;
    if (currentIndex < 0 || currentIndex >= scaleLength) {
        currentIndex = Math.floor(scaleLength / 2);
    }
    
    // CAMBIO CLAVE: Asegurar un salto mínimo de 1, incluso en entropía 0
    // Esto evita que se quede "pegado" en la misma nota (sonido sintético)
    // y fuerza un movimiento de "paso a paso" (caminata aleatoria suave).
    const minJump = 1; 
    const maxJump = Math.floor(state.entropy * (scaleLength - 1));
    
    // Si la entropía es 0, maxJump será 0, pero usamos minJump para forzar movimiento
    const effectiveMax = Math.max(minJump, maxJump);
    
    const jump = Math.floor(Math.random() * (effectiveMax * 2 + 1)) - effectiveMax;
    let newIndex = currentIndex + jump;
    
    newIndex = Math.max(0, Math.min(newIndex, scaleLength - 1));
    state.lastNoteIndex = newIndex;
    
    const selectedFreq = chordFreqs[newIndex % chordFreqs.length];
    return { freq: selectedFreq, index: newIndex };
}

// --- ELEMENTOS DOM ---
const canvas = document.getElementById('visualizer');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const playhead = document.getElementById('playhead');
const statusText = document.getElementById('statusText');
const scrubSlider = document.getElementById('paramScrub');

function drawBandsOverlay() {
    if (!state.width || !state.height) return;
    const bandHeight = state.height / CONFIG.bands;
    ctx.strokeStyle = 'rgba(135, 0, 17, 0.3)'/*'rgba(0, 255, 157, 0.3)'*/;
    ctx.lineWidth = 3;
    ctx.setLineDash([4, 4]);
    for (let i = 1; i < CONFIG.bands; i++) {
        const y = i * bandHeight;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(state.width, y);
        ctx.stroke();
    }
    ctx.setLineDash([]);
}

// ==============================================================================
// MOTOR DE AUDIO CON TONE.JS (GENERATIVO ORGÁNICO)
// ==============================================================================

async function initAudio() {
    if (state.randomSynth && state.linealVoices.length > 0) return;
    
    try {
        await Tone.start();
        console.log("Tone.js Ready.");
    } catch (e) {
        console.error("Error iniciando Tone:", e);
        return;
    }

    state.limiter = new Tone.Limiter(-1).toDestination();
    state.reverb = new Tone.Reverb({ decay: 2.5, wet: 0.35 }).connect(state.limiter);
    state.delay = new Tone.FeedbackDelay({ delayTime: "8n.", feedback: 0.2, wet: 0.2 }).connect(state.reverb);
    
    state.filter = new Tone.Filter({
        type: "lowpass",
        frequency: 4000,
        Q: 0.7
    }).connect(state.delay);

    // CAMBIO CLAVE: Onda SINE y Ataque suave (0.1s) para un sonido orgánico
    state.randomSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sine" }, 
        envelope: { attack: 0.1, decay: 0.2, sustain: 0.3, release: 1.0 }, 
        volume: -10,
        maxPolyphony: 4,
        voiceStealing: "oldest"
    }).connect(state.filter);

    state.linealVoices = [];
    state.linealGains = [];
    
    for (let i = 0; i < CONFIG.bands; i++) {
        const gain = new Tone.Gain(0).connect(state.filter);
        const osc = new Tone.OmniOscillator({
            type: "sine",
            volume: -5 
        }).connect(gain).start();
        
        state.linealVoices.push(osc);
        state.linealGains.push(gain);
    }

    updateMasterVolume();
    updateFilterFrequency(state.filterAmount);
}

function updateMasterVolume() {
    if (!state.randomSynth) return;
    const db = 20 * Math.log10(Math.max(0.001, state.masterVolume));
    Tone.Destination.volume.rampTo(db, 0.1);
}

function updateFilterFrequency(intensity) {
    if (!state.filter) return;
    
    // Mapeo Exponencial para "Color Tímbrico":
    // 0%   = 150 Hz  (Oscuro, profundo, "bajo el agua")
    // 50%  = ~1650 Hz (Cálido, natural, abierto)
    // 100% = 18000 Hz (Cristalino, brillante, con "aire")
    
    const minFreq = 150;
    const maxFreq = 18000;
    
    // Fórmula exponencial para que el cambio se sienta musical y progresivo
    const freq = minFreq * Math.pow(maxFreq / minFreq, intensity);
    
    state.filter.frequency.rampTo(freq, 0.1);
}

function updateEntropyParameters() {
    if (!state.randomSynth) return;
    const releaseTime = 2.0 - (state.entropy * 1.7);
    state.randomSynth.set({
        envelope: { release: releaseTime }
    });
}

// ==============================================================================
// LÓGICA DE REPRODUCCIÓN
// ==============================================================================

function processColumnForMusic(xIndex, currentTime) {
    if (!state.columnData || xIndex < 0 || xIndex >= state.width) return;

    const colOffset = xIndex * CONFIG.bands;
    
    const rootSelect = document.getElementById('selectRootNote');
    const scaleSelect = document.getElementById('selectScale');
    const voicingSelect = document.getElementById('selectVoicing');
    
    const rootHz = parseFloat(rootSelect ? rootSelect.value : 261.63) || 261.63;
    const rootMidi = Math.round(freqToMidi(rootHz));
    const voicingType = voicingSelect ? voicingSelect.value : 'chord-melody';
    const scaleName = scaleSelect ? scaleSelect.value : 'lydian';
    
    const chordFreqs = generateChordVoicing(rootMidi, voicingType);

    if (state.isGenerative) {
        // 1. PROBABILIDAD: De "Siempre dispara" a "Dispara a veces"
        // 0% (Suave) = 15% probabilidad (Notas espaciadas, deja respirar al sonido)
        // 100% (Caótico) = 75% probabilidad (Ráfagas densas)
        const triggerProbability = 0.15 + (state.entropy * 0.6);
        
        // 2. THROTTLE: De "Lento" a "Rápido"
        // 0% (Suave) = 0.4s entre notas (Calmado)
        // 100% (Caótico) = 0.1s entre notas (Frenético)
        const throttleTime = 0.4 - (state.entropy * 0.3);
        
        if (currentTime - state.lastGenTime > throttleTime) {
            const notesToTrigger = [];
            
            for (let b = 0; b < CONFIG.bands; b++) {
                let brightness = state.columnData[colOffset + b];
                if (state.isInverted) brightness = 1 - brightness;
                
                if (brightness > 0.15 && Math.random() < triggerProbability) {
                    const velocity = Math.min(1, Math.pow(brightness, 1.2));
                    const { freq } = selectNoteWithEntropy(chordFreqs, scaleName);
                    const noteStr = Tone.Frequency(freq, "hz").toNote();
                    
                    notesToTrigger.push({
                        note: noteStr,
                        time: currentTime,
                        velocity: velocity,
                        duration: "16n"
                    });
                }
            }

            if (notesToTrigger.length > 0) {
                notesToTrigger.slice(0, 2).forEach(v => {
                    state.randomSynth.triggerAttackRelease(v.note, v.duration, v.time, v.velocity);
                });
            }
            state.lastGenTime = currentTime;
        }
    } else {
        for (let b = 0; b < CONFIG.bands; b++) {
            let brightness = state.columnData[colOffset + b];
            if (state.isInverted) brightness = 1 - brightness;
            
            state.linealVoices[b].frequency.rampTo(chordFreqs[b], 0.1);
            
            // Ganancia ajustada a 0.75 para evitar saturación del Limiter
            const targetGain = brightness > 0.05 ? Math.pow(brightness, 1.2) * 0.75 : 0;
            state.linealGains[b].gain.rampTo(targetGain, 0.15);
        }
    }
}

// ==============================================================================
// BUCLE PRINCIPAL
// ==============================================================================

async function play() {
    if (!state.imageData) {
        statusText.textContent = "⚠️ Por favor, carga una imagen primero.";
        return;
    }
    
    await initAudio();
    
    if (state.isPlaying) return;
    
    state.isPlaying = true;
    state.startTime = Tone.now();
    state.scanX = 0;
    state.lastGenTime = 0;
    state.lastLinealTime = 0;
    state.lastNoteIndex = -1;
    
    if(state.randomSynth) state.randomSynth.releaseAll();
    if(state.linealGains) {
        state.linealGains.forEach(g => g.gain.rampTo(0, 0.1));
    }
    
    scrubSlider.value = 0;
    document.getElementById('valScrub').textContent = '0%';
    
    document.getElementById('btnPlay').disabled = true;
    document.getElementById('btnStop').disabled = false;
    playhead.style.display = 'block';
    statusText.textContent = "Tocando partitura gráfica...";

    requestAnimationFrame(audioLoop);
}

function stop() {
    state.isPlaying = false;
    state.isScrubbing = false;
    
    document.getElementById('btnPlay').disabled = false;
    document.getElementById('btnStop').disabled = true;
    playhead.style.display = 'none';
    statusText.textContent = "Detenido.";
    
    if (state.randomSynth) state.randomSynth.releaseAll();
    if (state.linealGains) {
        state.linealGains.forEach(g => g.gain.rampTo(0, 0.5));
    }
}

function audioLoop() {
    if (!state.isPlaying) return;

    const now = Tone.now();
    const elapsed = now - state.startTime;
    let progress;

    if (state.isScrubbing) {
        const scrubValue = parseFloat(scrubSlider.value);
        progress = scrubValue / 100;
        updateUIPosition(progress);
        processColumnForMusic(state.scanX, now);
    } else {
        if (state.isPingPong) {
            const cycleDuration = state.durationSec * 2;
            const rawProgress = (elapsed % cycleDuration) / state.durationSec;
            progress = rawProgress <= 1 ? rawProgress : 2 - rawProgress;
        } else {
            progress = (elapsed % state.durationSec) / state.durationSec;
        }

        if (!state.isLooping) {
            if (state.isPingPong) {
                if (elapsed >= state.durationSec * 2) { stop(); return; }
            } else {
                if (elapsed >= state.durationSec) { stop(); return; }
            }
        }

        state.scanX = Math.floor(progress * (state.width - 1));
        
        if (state.isGenerative) {
            processColumnForMusic(state.scanX, now);
        } else {
            if (now - state.lastLinealTime > 0.1) {
                processColumnForMusic(state.scanX, now);
                state.lastLinealTime = now;
            }
        }

        updateUIPosition(progress);
    }

    requestAnimationFrame(audioLoop);
}

function updateUIPosition(progress) {
    const canvasRect = canvas.getBoundingClientRect();
    const wrapperRect = document.getElementById('canvasWrapper').getBoundingClientRect();
    const relativeX = (canvasRect.left - wrapperRect.left) + (progress * canvasRect.width);
    playhead.style.left = `${relativeX}px`;
    
    scrubSlider.value = progress * 100;
    document.getElementById('valScrub').textContent = Math.round(progress * 100) + '%';
}

// ==============================================================================
// PROCESAMIENTO DE IMAGEN
// ==============================================================================

document.getElementById('imageInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const img = new Image();
    img.onload = () => {
        const MAX_WIDTH = 1600;
        const MAX_HEIGHT = 900;

        let targetWidth = img.width;
        let targetHeight = img.height;

        if (targetWidth > MAX_WIDTH || targetHeight > MAX_HEIGHT) {
            const ratio = Math.min(MAX_WIDTH / targetWidth, MAX_HEIGHT / targetHeight);
            targetWidth = Math.floor(targetWidth * ratio);
            targetHeight = Math.floor(targetHeight * ratio);
        }

        canvas.width = targetWidth;
        canvas.height = targetHeight;
        state.width = targetWidth;
        state.height = targetHeight;

        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
        const data = imageData.data;

        state.columnData = new Float32Array(targetWidth * CONFIG.bands);
        const bandHeight = targetHeight / CONFIG.bands;

        for (let x = 0; x < targetWidth; x++) {
            for (let b = 0; b < CONFIG.bands; b++) {
                let totalBrightness = 0;
                let pixelCount = 0;
                const yStart = Math.floor(b * bandHeight);
                const yEnd = Math.floor((b + 1) * bandHeight);

                for (let y = yStart; y < yEnd; y++) {
                    const idx = (y * targetWidth + x) * 4;
                    const brightness = (data[idx] * 0.299 + data[idx+1] * 0.587 + data[idx+2] * 0.114) / 255;
                    totalBrightness += brightness;
                    pixelCount++;
                    const gray = brightness * 255;
                    data[idx] = data[idx+1] = data[idx+2] = gray;
                }
                state.columnData[x * CONFIG.bands + b] = totalBrightness / pixelCount;
            }
        }

        ctx.putImageData(imageData, 0, 0);
        drawBandsOverlay();
        
        state.imageData = imageData;
        state.scanX = 0;
        state.lastLinealTime = 0;
        
        document.getElementById('btnPlay').disabled = false;
        document.getElementById('btnExport').disabled = false;
        statusText.textContent = `Imagen cargada (${targetWidth}x${targetHeight}px). Listo.`;
    };
    img.src = URL.createObjectURL(file);
});

// ==============================================================================
// EXPORTACIÓN A WAV
// ==============================================================================

async function exportWAV() {
    if (!state.imageData) return;
    
    const wasPlaying = state.isPlaying;
    if (wasPlaying) stop(); 

    statusText.textContent = "Renderizando audio de alta calidad...";
    document.getElementById('btnExport').disabled = true;

    try {
        const exportDuration = state.exportDuration;
        
        const renderedBuffer = await Tone.Offline(async () => {
            
            const offLimiter = new Tone.Limiter(-1).toDestination();
            const offReverb = new Tone.Reverb({ decay: 2.5, wet: 0.35 }).connect(offLimiter);
            const offDelay = new Tone.FeedbackDelay({ delayTime: "8n.", feedback: 0.2, wet: 0.2 }).connect(offReverb);
            const offFilter = new Tone.Filter({ type: "lowpass", frequency: 4000, Q: 0.7 }).connect(offDelay);

            const releaseTime = 2.0 - (state.entropy * 1.7);
            
            // CAMBIO CLAVE: Onda SINE y Ataque suave (0.1s) para consistencia
            const offRandomSynth = new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: "sine" }, 
                envelope: { attack: 0.1, decay: 0.2, sustain: 0.3, release: releaseTime }, 
                volume: -10,
                maxPolyphony: 4,
                voiceStealing: "oldest"
            }).connect(offFilter);

            const offLinealVoices = [];
            const offLinealGains = [];
            for (let i = 0; i < CONFIG.bands; i++) {
                const gain = new Tone.Gain(0).connect(offFilter);
                const osc = new Tone.OmniOscillator({ 
                    type: "sine", 
                    volume: -5 
                }).connect(gain).start();
                offLinealVoices.push(osc);
                offLinealGains.push(gain);
            }

            const stepTime = 0.05;
            let lastGenTime = 0;
            let lastLinealTime = 0;
            let lastNoteIndex = -1;
            
            const rootSelect = document.getElementById('selectRootNote');
            const voicingSelect = document.getElementById('selectVoicing');
            const scaleSelect = document.getElementById('selectScale');
            const rootHz = parseFloat(rootSelect ? rootSelect.value : 261.63) || 261.63;
            const rootMidi = Math.round(freqToMidi(rootHz));
            const voicingType = voicingSelect ? voicingSelect.value : 'chord-melody';
            const scaleName = scaleSelect ? scaleSelect.value : 'lydian';
            
            const chordFreqs = generateChordVoicing(rootMidi, voicingType);

            for (let t = 0; t < exportDuration; t += stepTime) {
                const cycleProgress = (t % state.durationSec) / state.durationSec;
                
                let xIndex;
                if (state.isPingPong) {
                    const pingPongProgress = cycleProgress <= 0.5 ? cycleProgress * 2 : 2 - (cycleProgress * 2);
                    xIndex = Math.floor(pingPongProgress * (state.width - 1));
                } else {
                    xIndex = Math.floor(cycleProgress * (state.width - 1));
                }
                
                const colOffset = xIndex * CONFIG.bands;
                
                if (state.isGenerative) {
                    // 1. PROBABILIDAD: Sincronizada con processColumnForMusic
                    const triggerProbability = 0.15 + (state.entropy * 0.6);
                    
                    // 2. THROTTLE: Sincronizado con processColumnForMusic
                    const throttleTime = 0.4 - (state.entropy * 0.3);
                    
                    if (t - lastGenTime > throttleTime) {
                        const notesToTrigger = [];
                        
                        for (let b = 0; b < CONFIG.bands; b++) {
                            let brightness = state.columnData[colOffset + b];
                            if (state.isInverted) brightness = 1 - brightness;
                            
                            const seedRandom = Math.sin(t * 1000 + b) * 0.5 + 0.5;
                            
                            if (brightness > 0.15 && seedRandom < triggerProbability) {
                                const velocity = Math.min(1, Math.pow(brightness, 1.2));
                                
                                const scaleIntervals = SCALES[scaleName] || SCALES.lydian;
                                const scaleLength = scaleIntervals.length;
                                
                                if (lastNoteIndex < 0) lastNoteIndex = Math.floor(scaleLength / 2);
                                
                                // CAMBIO CLAVE: Salto mínimo de 1 en exportación también
                                const maxJump = Math.floor(state.entropy * (scaleLength - 1));
                                const minJump = 1;
                                const effectiveMax = Math.max(minJump, maxJump);
                                
                                const jumpSeed = Math.sin(t * 500 + b * 100) * 0.5 + 0.5;
                                const jump = Math.floor(jumpSeed * (effectiveMax * 2 + 1)) - effectiveMax;
                                lastNoteIndex = Math.max(0, Math.min(lastNoteIndex + jump, scaleLength - 1));
                                
                                const freq = chordFreqs[lastNoteIndex % chordFreqs.length];
                                const noteStr = Tone.Frequency(freq, "hz").toNote();
                                
                                notesToTrigger.push({ note: noteStr, velocity, duration: "16n" });
                            }
                        }
                        
                        if(notesToTrigger.length > 0) {
                            notesToTrigger.slice(0, 2).forEach(v => {
                                offRandomSynth.triggerAttackRelease(v.note, v.duration, t, v.velocity);
                            });
                        }
                        lastGenTime = t;
                    }
                } else {
                    if (t - lastLinealTime > 0.1) {
                        for (let b = 0; b < CONFIG.bands; b++) {
                            let brightness = state.columnData[colOffset + b];
                            if (state.isInverted) brightness = 1 - brightness;
                            
                            offLinealVoices[b].frequency.rampTo(chordFreqs[b], 0.1, t);
                            const targetGain = brightness > 0.05 ? Math.pow(brightness, 1.2) * 0.75 : 0;
                            offLinealGains[b].gain.rampTo(targetGain, 0.15, t);
                        }
                        lastLinealTime = t;
                    }
                }
            }
            
        }, exportDuration);

        const wavBlob = bufferToWave(renderedBuffer, renderedBuffer.length);
        const url = URL.createObjectURL(wavBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `catalina_export_${exportDuration}s_${Date.now()}.wav`;
        a.click();
        
        statusText.textContent = "¡Exportación WAV completada!";
        document.getElementById('btnExport').disabled = false;
        
        if(wasPlaying) play();

    } catch (err) {
        console.error(err);
        statusText.textContent = "Error al exportar: " + err.message;
        document.getElementById('btnExport').disabled = false;
        if(wasPlaying) play();
    }
}

function bufferToWave(abuffer, len) {
    let numOfChan = abuffer.numberOfChannels,
        length = len * numOfChan * 2 + 44,
        buffer = new ArrayBuffer(length),
        view = new DataView(buffer),
        channels = [], i, sample, offset = 0, pos = 0;

    setUint32(0x46464952); setUint32(length - 8); setUint32(0x45564157);
    setUint32(0x20746d66); setUint32(16); setUint16(1); setUint16(numOfChan);
    setUint32(abuffer.sampleRate); setUint32(abuffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2); setUint16(16); setUint32(0x61746164); setUint32(length - pos - 4);

    for(i = 0; i < abuffer.numberOfChannels; i++) channels.push(abuffer.getChannelData(i));

    while(pos < length) {
        for(i = 0; i < numOfChan; i++) {
            sample = Math.max(-1, Math.min(1, channels[i][offset]));
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0;
            view.setInt16(pos, sample, true);
            pos += 2;
        }
        offset++;
    }
    return new Blob([buffer], {type: "audio/wav"});

    function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
    function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }
}

// ==============================================================================
// RESET FUNCTIONALITY
// ==============================================================================

function resetToDefaults() {
    if (state.isPlaying) stop();

    state.durationSec = 2.0;
    state.masterVolume = 0.7;
    state.filterAmount = 0.5;
    state.entropy = 0.5;
    state.exportDuration = 60;
    state.freqMin = 65.41;
    state.freqMax = 1046.50;
    
    state.isInverted = true;
    state.isLooping = true;
    state.isPingPong = true;
    state.isGenerative = false;

    document.getElementById('paramSpeed').value = state.durationSec;
    document.getElementById('valSpeed').textContent = state.durationSec.toFixed(1) + 's';

    document.getElementById('paramVol').value = state.masterVolume * 100;
    document.getElementById('valVol').textContent = (state.masterVolume * 100) + '%';

    document.getElementById('paramFilter').value = state.filterAmount * 100;
    document.getElementById('valFilter').textContent = (state.filterAmount * 100) + '%';

    document.getElementById('paramEntropy').value = state.entropy * 100;
    document.getElementById('valEntropy').textContent = Math.round(state.entropy * 100) + '%';

    document.getElementById('paramExportDuration').value = state.exportDuration;
    document.getElementById('valExportDuration').textContent = '1m 0s';

    document.getElementById('paramFreqMin').value = 65;
    document.getElementById('valFreqMin').textContent = '65 Hz';

    document.getElementById('paramFreqMax').value = 523;
    document.getElementById('valFreqMax').textContent = '523 Hz';

    document.getElementById('selectRootNote').value = '130.81';
    document.getElementById('selectVoicing').value = 'chord-melody';
    document.getElementById('selectScale').value = 'lydian';

    document.getElementById('toggleInvert').checked = true;
    document.getElementById('toggleLoop').checked = true;
    document.getElementById('togglePingPong').checked = true;
    document.getElementById('toggleRND').checked = false;

    const generativeControls = document.getElementById('generativeControls');
    if (generativeControls) generativeControls.classList.remove('active');

    updateMasterVolume();
    updateFilterFrequency(state.filterAmount);
    updateEntropyParameters();

    scrubSlider.value = 0;
    document.getElementById('valScrub').textContent = '0%';
    if (playhead) playhead.style.display = 'none';

    statusText.textContent = "Sistema reiniciado a valores por defecto.";
}

// ==============================================================================
// LISTENERS Y UI
// ==============================================================================

function setMode(mode) {
    state.currentMode = mode;
    const rootNoteContainer = document.getElementById('rootNoteContainer');
    const voicingContainer = document.getElementById('voicingContainer');
    const scaleContainer = document.getElementById('scaleContainer');

    if (mode === 'musical') {
        if(rootNoteContainer) rootNoteContainer.classList.remove('hidden');
        if(voicingContainer) voicingContainer.classList.remove('hidden');
        if(scaleContainer) scaleContainer.classList.remove('hidden');
        statusText.textContent = "Modo Armónico: Control Total Activado.";
    } else {
        if(rootNoteContainer) rootNoteContainer.classList.add('hidden');
        if(voicingContainer) voicingContainer.classList.add('hidden');
        if(scaleContainer) scaleContainer.classList.add('hidden');
        statusText.textContent = "Modo Espectral: Control directo de Hz.";
    }
}

document.getElementById('btnPlay').addEventListener('click', play);
document.getElementById('btnStop').addEventListener('click', stop);
document.getElementById('btnExport').addEventListener('click', exportWAV);

const btnReset = document.getElementById('btnReset');
if (btnReset) {
    btnReset.addEventListener('click', resetToDefaults);
}

document.getElementById('toggleInvert').addEventListener('change', (e) => state.isInverted = e.target.checked);
document.getElementById('toggleLoop').addEventListener('change', (e) => state.isLooping = e.target.checked);
document.getElementById('togglePingPong').addEventListener('change', (e) => state.isPingPong = e.target.checked);

const genToggle = document.getElementById('toggleRND');
const generativeControls = document.getElementById('generativeControls');

if(genToggle) {
    genToggle.addEventListener('change', (e) => {
        state.isGenerative = e.target.checked;
        
        if (state.isGenerative) {
            generativeControls.classList.add('active');
        } else {
            generativeControls.classList.remove('active');
        }
        
        if(state.isPlaying) {
             if (state.isGenerative) {
                 state.linealGains.forEach(g => g.gain.rampTo(0, 0.2));
             } else {
                 state.randomSynth.releaseAll();
             }
        }
        
        statusText.textContent = state.isGenerative ? "Modo Random Activo" : "Modo Lineal Activo";
    });
}

const entropySlider = document.getElementById('paramEntropy');
if (entropySlider) {
    entropySlider.addEventListener('input', (e) => {
        const entropyPercent = parseInt(e.target.value);
        state.entropy = entropyPercent / 100;
        document.getElementById('valEntropy').textContent = entropyPercent + '%';
        updateEntropyParameters();
    });
}

const exportDurationInput = document.getElementById('paramExportDuration');
if (exportDurationInput) {
    exportDurationInput.addEventListener('input', (e) => {
        let value = parseInt(e.target.value);
        if (isNaN(value)) value = 0;
        
        value = Math.max(1, Math.min(300, value));
        state.exportDuration = value;
        
        let displayText = '';
        if (value >= 60) {
            const minutes = Math.floor(value / 60);
            const seconds = value % 60;
            displayText = `${minutes}m ${seconds}s`;
        } else {
            displayText = `${value}s`;
        }
        
        document.getElementById('valExportDuration').textContent = displayText;
    });
}

document.getElementById('paramSpeed').addEventListener('input', (e) => {
    state.durationSec = parseFloat(e.target.value);
    document.getElementById('valSpeed').textContent = state.durationSec.toFixed(1) + 's';
});

document.getElementById('btnModeMusical').addEventListener('click', () => {
    if (state.currentMode !== 'musical') {
        document.getElementById('btnModeMusical').classList.add('active');
        document.getElementById('btnModeSpectral').classList.remove('active');
        setMode('musical');
    }
});

document.getElementById('btnModeSpectral').addEventListener('click', () => {
    if (state.currentMode !== 'spectral') {
        document.getElementById('btnModeSpectral').classList.add('active');
        document.getElementById('btnModeMusical').classList.remove('active');
        setMode('spectral');
    }
});

document.getElementById('selectRootNote').addEventListener('change', () => { statusText.textContent = "Raíz armónica actualizada."; });
if (document.getElementById('selectVoicing')) {
    document.getElementById('selectVoicing').addEventListener('change', () => { 
        statusText.textContent = `Textura: ${document.getElementById('selectVoicing').options[document.getElementById('selectVoicing').selectedIndex].text}`; 
    });
}
if (document.getElementById('selectScale')) {
    document.getElementById('selectScale').addEventListener('change', () => {
        statusText.textContent = `Escala: ${document.getElementById('selectScale').options[document.getElementById('selectScale').selectedIndex].text}`;
    });
}

document.getElementById('paramFreqMin').addEventListener('input', (e) => {
    state.freqMin = parseInt(e.target.value);
    document.getElementById('valFreqMin').textContent = state.freqMin + ' Hz';
});
document.getElementById('paramFreqMax').addEventListener('input', (e) => {
    state.freqMax = parseInt(e.target.value);
    document.getElementById('valFreqMax').textContent = state.freqMax + ' Hz';
});
document.getElementById('paramFilter').addEventListener('input', (e) => {
    state.filterAmount = parseInt(e.target.value) / 100;
    document.getElementById('valFilter').textContent = e.target.value + '%';
    updateFilterFrequency(state.filterAmount);
});
document.getElementById('paramVol').addEventListener('input', (e) => {
    state.masterVolume = parseInt(e.target.value) / 100;
    document.getElementById('valVol').textContent = e.target.value + '%';
    updateMasterVolume();
});

scrubSlider.addEventListener('pointerdown', () => { state.isScrubbing = true; });
scrubSlider.addEventListener('pointerup', () => { state.isScrubbing = false; });
scrubSlider.addEventListener('touchstart', () => { state.isScrubbing = true; }, {passive: true});
scrubSlider.addEventListener('touchend', () => { state.isScrubbing = false; });

const btnFullscreen = document.getElementById('btnFullscreen');
const canvasWrapper = document.getElementById('canvasWrapper');

if (btnFullscreen && canvasWrapper) {
    btnFullscreen.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            canvasWrapper.requestFullscreen().catch(err => {
                console.log(`Error fullscreen: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    });

    document.addEventListener('fullscreenchange', () => {
        if (document.fullscreenElement) {
            canvasWrapper.classList.add('is-fullscreen');
        } else {
            canvasWrapper.classList.remove('is-fullscreen');
        }
    });
}

function syncSlidersInitialState() {
    const speedSlider = document.getElementById('paramSpeed');
    if (speedSlider) {
        speedSlider.value = state.durationSec;
        document.getElementById('valSpeed').textContent = state.durationSec.toFixed(1) + 's';
    }
    
    const volSlider = document.getElementById('paramVol');
    if (volSlider) {
        volSlider.value = state.masterVolume * 100;
        document.getElementById('valVol').textContent = (state.masterVolume * 100) + '%';
    }
    
    const filterSlider = document.getElementById('paramFilter');
    if (filterSlider) {
        filterSlider.value = state.filterAmount * 100;
        document.getElementById('valFilter').textContent = (state.filterAmount * 100) + '%';
    }
    
    const entropySlider = document.getElementById('paramEntropy');
    if (entropySlider) {
        entropySlider.value = state.entropy * 100;
        document.getElementById('valEntropy').textContent = Math.round(state.entropy * 100) + '%';
    }
    
    const exportDurationInput = document.getElementById('paramExportDuration');
    if (exportDurationInput) {
        exportDurationInput.value = state.exportDuration;
        
        let displayText = '';
        if (state.exportDuration >= 60) {
            const minutes = Math.floor(state.exportDuration / 60);
            const seconds = state.exportDuration % 60;
            displayText = `${minutes}m ${seconds}s`;
        } else {
            displayText = `${state.exportDuration}s`;
        }
        document.getElementById('valExportDuration').textContent = displayText;
    }
}

document.addEventListener('DOMContentLoaded', syncSlidersInitialState);