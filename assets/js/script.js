/**
 * CATALINA WEB - Core Engine v4.1 (Random Anti-Saturation Fix)
 * 
 * CORRECCIÓN CRÍTICA:
 * El modo Generativo saturaba porque acumulaba ~20 notas simultáneas 
 * (3 notas cada 150ms con release de 1s).
 * 
 * Solución:
 * 1. maxPolyphony: 4 (límite estricto de voces simultáneas)
 * 2. voiceStealing: "oldest" (cortar notas antiguas automáticamente)
 * 3. release: 0.4 (decaimiento más rápido)
 * 4. Throttle: 200ms (más espacio entre disparos)
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
    
    randomSynth: null,
    linealVoices: [],
    linealGains: [],
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

// --- ELEMENTOS DOM ---
const canvas = document.getElementById('visualizer');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const playhead = document.getElementById('playhead');
const statusText = document.getElementById('statusText');
const scrubSlider = document.getElementById('paramScrub');

function drawBandsOverlay() {
    if (!state.width || !state.height) return;
    const bandHeight = state.height / CONFIG.bands;
    ctx.strokeStyle = 'rgba(0, 255, 157, 0.3)';
    ctx.lineWidth = 1;
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
// MOTOR DE AUDIO CON TONE.JS (OPTIMIZADO)
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

    // 1. Cadena de Efectos Global
    state.reverb = new Tone.Reverb({ decay: 2.5, wet: 0.35 }).toDestination();
    state.delay = new Tone.FeedbackDelay({ delayTime: "8n.", feedback: 0.2, wet: 0.2 }).connect(state.reverb);
    
    state.filter = new Tone.Filter({
        type: "lowpass",
        frequency: 4000,
        Q: 0.7
    }).connect(state.delay);

    // 2. ✅ Sintetizador para Modo Random CON LÍMITE DE POLIFONÍA
    state.randomSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle" },
        envelope: { 
            attack: 0.05, 
            decay: 0.2, 
            sustain: 0.3, 
            release: 0.4 // ✅ Reducido de 1.0 a 0.4 para evitar acumulación
        },
        volume: -10,
        // ✅ LÍMITES CRÍTICOS PARA EVITAR SATURACIÓN
        maxPolyphony: 4, // Máximo 4 notas simultáneas
        voiceStealing: "oldest" // Cortar las notas más antiguas primero
    }).connect(state.filter);

    // 3. 8 Voces Fijas para Modo Lineal
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
    const freq = 200 + (intensity * 7800);
    state.filter.frequency.rampTo(freq, 0.1);
}

// ==============================================================================
// LÓGICA DE REPRODUCCIÓN (OPTIMIZADA)
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
    
    const chordFreqs = generateChordVoicing(rootMidi, voicingType);

    if (state.isGenerative) {
        // --- MODO RANDOM (Staccato/Rítmico) ---
        // ✅ Throttle aumentado a 200ms para dar más espacio entre notas
        if (currentTime - state.lastGenTime > 0.2) {
            const notesToTrigger = [];
            
            for (let b = 0; b < CONFIG.bands; b++) {
                let brightness = state.columnData[colOffset + b];
                if (state.isInverted) brightness = 1 - brightness;
                
                if (brightness > 0.15) {
                    const velocity = Math.min(1, Math.pow(brightness, 1.2));
                    const noteStr = Tone.Frequency(chordFreqs[b], "hz").toNote();
                    notesToTrigger.push({
                        note: noteStr,
                        time: currentTime,
                        velocity: velocity,
                        duration: "16n"
                    });
                }
            }

            if (notesToTrigger.length > 0) {
                // ✅ Limitar a 2 voces simultáneas máximo (más conservador)
                notesToTrigger.slice(0, 2).forEach(v => {
                    state.randomSynth.triggerAttackRelease(v.note, v.duration, v.time, v.velocity);
                });
            }
            state.lastGenTime = currentTime;
        }
    } else {
        // --- MODO LINEAL (8 Voces Fijas con Modulación de Ganancia) ---
        for (let b = 0; b < CONFIG.bands; b++) {
            let brightness = state.columnData[colOffset + b];
            if (state.isInverted) brightness = 1 - brightness;
            
            state.linealVoices[b].frequency.rampTo(chordFreqs[b], 0.1);
            const targetGain = brightness > 0.05 ? Math.pow(brightness, 1.2) * 1.2 : 0;
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
// EXPORTACIÓN A WAV (Offline Rendering Optimizado)
// ==============================================================================

async function exportWAV() {
    if (!state.imageData) return;
    
    const wasPlaying = state.isPlaying;
    if (wasPlaying) stop(); 

    statusText.textContent = "Renderizando audio de alta calidad...";
    document.getElementById('btnExport').disabled = true;

    try {
        const duration = state.durationSec; 
        const offlineCtx = new OfflineAudioContext(2, CONFIG.sampleRate * duration, CONFIG.sampleRate);
        
        const offFilter = new Tone.Filter({ type: "lowpass", frequency: 4000, Q: 0.7 }, offlineCtx);
        const offDelay = new Tone.FeedbackDelay({ delayTime: "8n.", feedback: 0.2, wet: 0.2 }, offlineCtx).connect(offFilter);
        const offReverb = new Tone.Reverb({ decay: 2.5, wet: 0.35 }, offlineCtx).connect(offDelay);
        offReverb.toDestination();

        // ✅ Mismos límites de polifonía en exportación
        const offRandomSynth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: "triangle" },
            envelope: { attack: 0.05, decay: 0.2, sustain: 0.3, release: 0.4 },
            volume: -10,
            maxPolyphony: 4,
            voiceStealing: "oldest"
        }, offlineCtx).connect(offFilter);

        const offLinealVoices = [];
        const offLinealGains = [];
        for (let i = 0; i < CONFIG.bands; i++) {
            const gain = new Tone.Gain(0, offlineCtx).connect(offFilter);
            const osc = new Tone.OmniOscillator({ type: "sine", volume: -5 }, offlineCtx).connect(gain).start();
            offLinealVoices.push(osc);
            offLinealGains.push(gain);
        }

        const stepTime = 0.05;
        let lastGenTime = 0;
        let lastLinealTime = 0;
        
        const rootSelect = document.getElementById('selectRootNote');
        const voicingSelect = document.getElementById('selectVoicing');
        const rootHz = parseFloat(rootSelect ? rootSelect.value : 261.63) || 261.63;
        const rootMidi = Math.round(freqToMidi(rootHz));
        const voicingType = voicingSelect ? voicingSelect.value : 'chord-melody';
        
        const chordFreqs = generateChordVoicing(rootMidi, voicingType);

        for (let t = 0; t < duration; t += stepTime) {
            const progress = t / duration;
            const xIndex = Math.floor(progress * (state.width - 1));
            const colOffset = xIndex * CONFIG.bands;
            
            if (state.isGenerative) {
                if (t - lastGenTime > 0.2) {
                    const notesToTrigger = [];
                    for (let b = 0; b < CONFIG.bands; b++) {
                        let brightness = state.columnData[colOffset + b];
                        if (state.isInverted) brightness = 1 - brightness;
                        if (brightness > 0.15) {
                            const velocity = Math.min(1, Math.pow(brightness, 1.2));
                            const noteStr = Tone.Frequency(chordFreqs[b], "hz").toNote();
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
                        const targetGain = brightness > 0.05 ? Math.pow(brightness, 1.2) * 1.2 : 0;
                        offLinealGains[b].gain.rampTo(targetGain, 0.15, t);
                    }
                    lastLinealTime = t;
                }
            }
        }

        const renderedBuffer = await offlineCtx.startRendering();
        const wavBlob = bufferToWave(renderedBuffer, renderedBuffer.length);
        const url = URL.createObjectURL(wavBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `catalina_export_${Date.now()}.wav`;
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

document.getElementById('toggleInvert').addEventListener('change', (e) => state.isInverted = e.target.checked);
document.getElementById('toggleLoop').addEventListener('change', (e) => state.isLooping = e.target.checked);
document.getElementById('togglePingPong').addEventListener('change', (e) => state.isPingPong = e.target.checked);

const genToggle = document.getElementById('toggleRND'); 
if(genToggle) {
    genToggle.addEventListener('change', (e) => {
        state.isGenerative = e.target.checked;
        
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
document.getElementById('paramSpeed').addEventListener('input', (e) => {
    state.durationSec = parseFloat(e.target.value);
    document.getElementById('valSpeed').textContent = state.durationSec.toFixed(1) + 's';
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
}

document.addEventListener('DOMContentLoaded', syncSlidersInitialState);