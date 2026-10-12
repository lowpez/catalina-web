/**
 * CATALINA WEB - Core Engine (Fase 3.4 - Motor Armónico con Selector de Escala)
 * Arquitectura: Pre-procesamiento + Web Audio API (Chord-Voicing Dinámico)
 * Novedad: Selector de escalas (Lydian, Mayor, Menor, Pentatónica, Pentatónica Menor)
 * Corrección: Lógica original del Lydian restaurada (sin doble suma de intervalos)
 */

// --- CONFIGURACIÓN Y ESTADO ---
const CONFIG = {
    bands: 8,
    sampleRate: 44100
};

const state = {
    audioCtx: null,
    isPlaying: false,
    scanX: 0,
    startTime: 0,
    durationSec: 2.0,
    imageData: null,
    columnData: null,
    width: 0,
    height: 0,
    
    isInverted: true,
    isLooping: true,
    isPingPong: true,
    isRandom: false,
    isScrubbing: false, 
    
    // Rango de frecuencias objetivo (Hz)
    freqMin: 65.41,   // C2 (~65 Hz)
    freqMax: 1046.50, // C6 (~1046 Hz)
    currentMode: 'musical',
    
    masterVolume: 0.7,
    filterAmount: 0.5,
    
    oscillators: [],
    gainNodes: [],
    masterGain: null,
    filter: null,
    lfo: null,
    lfoGain: null,
    currentChordFreqs: [] 
};

// --- UTILIDADES MUSICALES ---
// Escalas disponibles: intervalos en semitonos desde la raíz
const SCALES = {
    lydian: [0, 2, 4, 6, 7, 9, 11],          // Mágica/etérea (default)
    major: [0, 2, 4, 5, 7, 9, 11],           // Alegre/clásica
    minor: [0, 2, 3, 5, 7, 8, 10],           // Melancólica/dramática
    pentatonic: [0, 2, 4, 7, 9],             // Folk/universal (a prueba de errores)
    pentatonicMinor: [0, 3, 5, 7, 10]        // Blues/soul
};

function midiToFreq(midiNote) {
    return 440 * Math.pow(2, (midiNote - 69) / 12);
}

function freqToMidi(freq) {
    return 69 + 12 * Math.log2(freq / 440);
}

/**
 * Función clave: Ajusta una nota MIDI para que caiga dentro del rango [minMidi, maxMidi]
 * mediante transposiciones de octava (+/- 12).
 */
function clampMidiToRange(midi, minMidi, maxMidi) {
    let adjusted = midi;
    while (adjusted < minMidi) adjusted += 12;
    while (adjusted > maxMidi) adjusted -= 12;
    return adjusted;
}

/**
 * Genera un voicing basado en la RAÍZ, el TIPO de voicing y la ESCALA seleccionada,
 * respetando los LÍMITES de los sliders Min/Max.
 * 
 * LÓGICA CORREGIDA: Los voicingIntervals definen la estructura del acorde.
 * La escala actúa como filtro: si una nota cae fuera de la escala, se ajusta a la más cercana.
 */
function generateChordVoicing(rootMidi, voicingType) {
    const minMidi = Math.round(freqToMidi(state.freqMin));
    const maxMidi = Math.round(freqToMidi(state.freqMax));
    
    // LEER ESCALA SELECCIONADA (con fallback a lydian si no existe el selector)
    const scaleSelect = document.getElementById('selectScale');
    const scaleName = scaleSelect ? (scaleSelect.value || 'lydian') : 'lydian';
    const scaleIntervals = SCALES[scaleName] || SCALES.lydian;
    
    // Definir intervalos específicos para cada textura (en semitonos desde la raíz)
    // Estos definen la "personalidad" del acorde
    let voicingIntervals = [];
    
    switch (voicingType) {
        case 'voice-pair':
            // Pares paralelos: sonido coral/denso
            voicingIntervals = [0, 4, 7, 11, 12, 16, 19, 23]; 
            break;
            
        case 'drone':
            // Pedal grave + Melodía simple arriba
            voicingIntervals = [0, 0, 7, 12, 14, 16, 19, 21]; 
            break;
            
        case 'open':
            // Quintas y Octavas vacías (épico/cinematográfico)
            voicingIntervals = [0, 7, 12, 19, 24, 31, 36, 43]; 
            break;
            
        case 'chord-melody':
        default:
            // Acordes ricos Lydianos (Root, 5th, 3rd, 7th, 9th, 11th, Octave, 9th High)
            // ESTOS SON LOS INTERVALOS ORIGINALES QUE TE GUSTABAN
            voicingIntervals = [0, 7, 4, 11, 14, 18, 24, 26]; 
            break;
    }

    const chordFreqs = [];
    
    for (let i = 0; i < CONFIG.bands; i++) {
        // 1. Calcular la nota teórica relativa a la raíz (LÓGICA ORIGINAL RESTAURADA)
        let rawMidi = rootMidi + voicingIntervals[i];
        
        // 2. CLAMPING: Forzar a que la nota esté entre MinSlider y MaxSlider
        let finalMidi = clampMidiToRange(rawMidi, minMidi, maxMidi);
        
        // 3. FILTRO DE ESCALA: Si la nota no está en la escala elegida, ajustar a la más cercana
        const noteInScale = ((finalMidi - rootMidi) % 12 + 12) % 12;
        if (!scaleIntervals.includes(noteInScale)) {
            // Buscar la nota más cercana en la escala
            let closestInterval = scaleIntervals[0];
            let minDistance = 12;
            for (const interval of scaleIntervals) {
                const distance = Math.abs(noteInScale - interval);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestInterval = interval;
                }
            }
            // Ajustar manteniendo la octava relativa
            const octaveOffset = Math.floor((finalMidi - rootMidi) / 12) * 12;
            finalMidi = rootMidi + closestInterval + octaveOffset;
        }
        
        // 4. Micro-detune para efecto chorus natural
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

// --- FUNCIÓN: DIBUJAR OVERLAY DE BANDAS ---
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

// --- INICIALIZACIÓN DE AUDIO ---
function initAudio() {
    if (state.audioCtx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    state.audioCtx = new AudioContext();
    
    state.oscillators = [];
    state.gainNodes = [];
    
    state.masterGain = state.audioCtx.createGain();
    state.masterGain.gain.value = state.masterVolume;
    
    state.filter = state.audioCtx.createBiquadFilter();
    state.filter.type = 'lowpass';
    state.filter.frequency.value = 4000;
    state.filter.Q.value = 0.7;
    
    state.filter.connect(state.masterGain);
    state.masterGain.connect(state.audioCtx.destination);

    state.lfo = state.audioCtx.createOscillator();
    state.lfoGain = state.audioCtx.createGain();
    state.lfo.frequency.value = 0.5;
    state.lfoGain.gain.value = 1.5;
    state.lfo.connect(state.lfoGain);
    state.lfo.start();

    for (let i = 0; i < CONFIG.bands; i++) {
        const osc = state.audioCtx.createOscillator();
        const gain = state.audioCtx.createGain();
        osc.type = 'triangle'; 
        gain.gain.value = 0;
        state.lfoGain.connect(osc.detune);
        osc.connect(gain);
        gain.connect(state.filter);
        osc.start();
        state.oscillators.push(osc);
        state.gainNodes.push(gain);
    }
    
    updateHarmony(0.5); 
}

// --- ACTUALIZAR ARMONÍA ---
function updateHarmony(avgBrightness) {
    if (!state.audioCtx) return;
    
    // Leer Nota Raíz del HTML
    const rootSelect = document.getElementById('selectRootNote');
    const rootHz = parseFloat(rootSelect ? rootSelect.value : 261.63) || 261.63;
    const rootMidi = freqToMidi(rootHz);
    
    // Leer Tipo de Voicing
    const voicingSelect = document.getElementById('selectVoicing');
    const voicingType = voicingSelect ? (voicingSelect.value || 'chord-melody') : 'chord-melody';
    
    const newFreqs = generateChordVoicing(Math.round(rootMidi), voicingType);
    state.currentChordFreqs = newFreqs;

    const now = state.audioCtx.currentTime;
    for (let i = 0; i < CONFIG.bands; i++) {
        if (newFreqs[i]) {
            state.oscillators[i].frequency.setTargetAtTime(newFreqs[i], now, 0.08);
        }
    }
}

// --- ACTUALIZAR AUDIO DESDE PROGRESO ---
function updateAudioFromProgress(progress) {
    if (state.isRandom && !state.isScrubbing) {
        state.scanX = Math.floor(Math.random() * state.width);
    } else {
        state.scanX = Math.floor(progress * (state.width - 1));
    }

    const colOffset = state.scanX * CONFIG.bands;
    let totalBrightness = 0;
    const now = state.audioCtx.currentTime;
    const columnValues = [];

    for (let b = 0; b < CONFIG.bands; b++) {
        let brightness = state.columnData[colOffset + b];
        if (state.isInverted) brightness = 1 - brightness;
        columnValues.push(brightness);
        totalBrightness += brightness;
    }

    const avgBrightness = totalBrightness / CONFIG.bands;

    // Actualizar Armonía Global
    updateHarmony(avgBrightness);

    // Dinámica Individual
    for (let b = 0; b < CONFIG.bands; b++) {
        const val = columnValues[b];
        const dynamicGain = Math.pow(val, 1.5) * 0.25;
        state.gainNodes[b].gain.setTargetAtTime(dynamicGain, now, 0.05);
    }

    // Modulación de Filtro
    const cutoff = 800 + (avgBrightness * 6000 * state.filterAmount); 
    state.filter.frequency.setTargetAtTime(cutoff, now, 0.1);
}

// --- PROCESAMIENTO DE IMAGEN ---
document.getElementById('imageInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const img = new Image();
    img.onload = () => {
        const scale = Math.min(800 / img.width, 400 / img.height);
        state.width = Math.floor(img.width * scale);
        state.height = Math.floor(img.height * scale);
        canvas.width = state.width;
        canvas.height = state.height;

        ctx.drawImage(img, 0, 0, state.width, state.height);
        const imageData = ctx.getImageData(0, 0, state.width, state.height);
        const data = imageData.data;

        state.columnData = new Float32Array(state.width * CONFIG.bands);
        const bandHeight = state.height / CONFIG.bands;

        for (let x = 0; x < state.width; x++) {
            for (let b = 0; b < CONFIG.bands; b++) {
                let totalBrightness = 0;
                let pixelCount = 0;
                const yStart = Math.floor(b * bandHeight);
                const yEnd = Math.floor((b + 1) * bandHeight);

                for (let y = yStart; y < yEnd; y++) {
                    const idx = (y * state.width + x) * 4;
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
        
        document.getElementById('btnPlay').disabled = false;
        document.getElementById('btnExport').disabled = false;
        statusText.textContent = `Imagen cargada. Modo Armónico Activo.`;
    };
    img.src = URL.createObjectURL(file);
});

// --- MOTOR DE REPRODUCCIÓN ---
function play() {
    if (!state.imageData) return;
    initAudio();
    if (state.audioCtx.state === 'suspended') state.audioCtx.resume();

    state.isPlaying = true;
    state.startTime = state.audioCtx.currentTime;
    state.scanX = 0;
    
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
    
    if (state.audioCtx) {
        const now = state.audioCtx.currentTime;
        state.gainNodes.forEach(g => g.gain.setTargetAtTime(0, now, 0.1));
    }
}

function audioLoop() {
    if (!state.isPlaying || !state.audioCtx) return;

    let progress;

    if (state.isScrubbing) {
        const scrubValue = parseFloat(scrubSlider.value);
        progress = scrubValue / 100;
        updateAudioFromProgress(progress);
        
        const canvasRect = canvas.getBoundingClientRect();
        const wrapperRect = document.getElementById('canvasWrapper').getBoundingClientRect();
        const relativeX = (canvasRect.left - wrapperRect.left) + (progress * canvasRect.width);
        playhead.style.left = `${relativeX}px`;
        
    } else {
        const elapsed = state.audioCtx.currentTime - state.startTime;
        
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

        updateAudioFromProgress(progress);

        const canvasRect = canvas.getBoundingClientRect();
        const wrapperRect = document.getElementById('canvasWrapper').getBoundingClientRect();
        const relativeX = (canvasRect.left - wrapperRect.left) + (progress * canvasRect.width);
        playhead.style.left = `${relativeX}px`;

        scrubSlider.value = progress * 100;
        document.getElementById('valScrub').textContent = Math.round(progress * 100) + '%';
    }

    requestAnimationFrame(audioLoop);
}

// --- EXPORTACIÓN A WAV ---
async function exportWAV() {
    if (!state.imageData) return;
    statusText.textContent = "Renderizando pieza armónica...";
    document.getElementById('btnExport').disabled = true;

    const duration = state.durationSec;
    const offlineCtx = new OfflineAudioContext(1, CONFIG.sampleRate * duration, CONFIG.sampleRate);

    const oscillators = [];
    const gainNodes = [];
    
    const filter = offlineCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.7;
    
    const masterGain = offlineCtx.createGain();
    masterGain.gain.value = state.masterVolume;
    
    filter.connect(masterGain);
    masterGain.connect(offlineCtx.destination);

    const lfo = offlineCtx.createOscillator();
    const lfoGain = offlineCtx.createGain();
    lfo.frequency.value = 0.5;
    lfoGain.gain.value = 1.5;
    lfo.connect(lfoGain);
    lfo.start(0);

    const rootHz = parseFloat(document.getElementById('selectRootNote').value) || 261.63;
    const rootMidi = freqToMidi(rootHz);
    const voicingType = document.getElementById('selectVoicing') ? (document.getElementById('selectVoicing').value || 'chord-melody') : 'chord-melody';

    for (let i = 0; i < CONFIG.bands; i++) {
        const osc = offlineCtx.createOscillator();
        const gain = offlineCtx.createGain();
        osc.type = 'triangle';
        gain.gain.value = 0;
        lfoGain.connect(osc.detune);
        osc.connect(gain);
        gain.connect(filter);
        osc.start(0);
        oscillators.push(osc);
        gainNodes.push(gain);
    }

    const stepTime = 0.02; 
    for (let t = 0; t < duration; t += stepTime) {
        let progress = t / duration;
        let x;
        
        if (state.isRandom) {
            x = Math.floor(Math.random() * state.width);
        } else {
            if (state.isLooping) progress = progress % 1;
            else progress = Math.min(progress, 1);
            x = Math.floor(progress * (state.width - 1));
        }

        const colOffset = x * CONFIG.bands;
        let totalBrightness = 0;
        const vals = [];

        for (let b = 0; b < CONFIG.bands; b++) {
            let brightness = state.columnData[colOffset + b];
            if (state.isInverted) brightness = 1 - brightness;
            vals.push(brightness);
            totalBrightness += brightness;
        }

        const avgBrightness = totalBrightness / CONFIG.bands;
        
        // Recalcular acorde usando la MISMA lógica robusta (incluye escala seleccionada)
        const chordFreqs = generateChordVoicing(Math.round(rootMidi), voicingType);
        
        for (let b = 0; b < CONFIG.bands; b++) {
            oscillators[b].frequency.setValueAtTime(chordFreqs[b], t);
            const dynGain = Math.pow(vals[b], 1.5) * 0.25;
            gainNodes[b].gain.setValueAtTime(dynGain, t);
        }

        const cutoff = 800 + (avgBrightness * 6000 * state.filterAmount);
        filter.frequency.setValueAtTime(cutoff, t);
    }

    const renderedBuffer = await offlineCtx.startRendering();
    const wavBlob = bufferToWave(renderedBuffer, renderedBuffer.length);
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `catalina_harmonic_${Date.now()}.wav`;
    a.click();
    
    statusText.textContent = "¡Exportación completada!";
    document.getElementById('btnExport').disabled = false;
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

// --- GESTIÓN DE MODOS ---
function setMode(mode) {
    state.currentMode = mode;
    const sliderMin = document.getElementById('paramFreqMin');
    const sliderMax = document.getElementById('paramFreqMax');
    const rootNoteContainer = document.getElementById('rootNoteContainer');
    const voicingContainer = document.getElementById('voicingContainer');
    const scaleContainer = document.getElementById('scaleContainer');

    if (mode === 'musical') {
        if(rootNoteContainer) rootNoteContainer.classList.remove('hidden');
        if(voicingContainer) voicingContainer.classList.remove('hidden');
        if(scaleContainer) scaleContainer.classList.remove('hidden');
        
        sliderMin.disabled = false;
        sliderMax.disabled = false;
        sliderMin.parentElement.style.opacity = '1';
        sliderMax.parentElement.style.opacity = '1';
        
        statusText.textContent = "Modo Armónico: Control Total Activado.";
    } else {
        if(rootNoteContainer) rootNoteContainer.classList.add('hidden');
        if(voicingContainer) voicingContainer.classList.add('hidden');
        if(scaleContainer) scaleContainer.classList.add('hidden');
        
        sliderMin.disabled = false;
        sliderMax.disabled = false;
        sliderMin.parentElement.style.opacity = '1';
        sliderMax.parentElement.style.opacity = '1';
        statusText.textContent = "Modo Espectral: Control directo de Hz.";
    }
}

// --- EVENT LISTENERS ---
document.getElementById('btnPlay').addEventListener('click', play);
document.getElementById('btnStop').addEventListener('click', stop);
document.getElementById('btnExport').addEventListener('click', exportWAV);

document.getElementById('toggleInvert').addEventListener('change', (e) => state.isInverted = e.target.checked);
document.getElementById('toggleLoop').addEventListener('change', (e) => state.isLooping = e.target.checked);
document.getElementById('togglePingPong').addEventListener('change', (e) => state.isPingPong = e.target.checked);
document.getElementById('toggleRND').addEventListener('change', (e) => state.isRandom = e.target.checked);

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

document.getElementById('selectRootNote').addEventListener('change', () => {
    statusText.textContent = "Raíz armónica actualizada.";
});

if (document.getElementById('selectVoicing')) {
    document.getElementById('selectVoicing').addEventListener('change', () => {
        statusText.textContent = "Textura armónica cambiada.";
    });
}

// Listener para el selector de escala
if (document.getElementById('selectScale')) {
    document.getElementById('selectScale').addEventListener('change', () => {
        const scaleSelect = document.getElementById('selectScale');
        const scaleName = scaleSelect.options[scaleSelect.selectedIndex].text;
        statusText.textContent = `Escala cambiada a: ${scaleName}`;
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
});

document.getElementById('paramVol').addEventListener('input', (e) => {
    state.masterVolume = parseInt(e.target.value) / 100;
    document.getElementById('valVol').textContent = e.target.value + '%';
    if (state.masterGain) {
        state.masterGain.gain.setTargetAtTime(state.masterVolume, state.audioCtx.currentTime, 0.02);
    }
});

// --- LÓGICA DEL SCRUBBER ---
scrubSlider.addEventListener('pointerdown', () => { state.isScrubbing = true; });
scrubSlider.addEventListener('pointerup', () => { 
    state.isScrubbing = false; 
    if (state.isPlaying) {
        const progress = parseFloat(scrubSlider.value) / 100;
        state.startTime = state.audioCtx.currentTime - (progress * state.durationSec);
    }
});
scrubSlider.addEventListener('touchstart', () => { state.isScrubbing = true; }, {passive: true});
scrubSlider.addEventListener('touchend', () => { 
    state.isScrubbing = false; 
    if (state.isPlaying) {
        const progress = parseFloat(scrubSlider.value) / 100;
        state.startTime = state.audioCtx.currentTime - (progress * state.durationSec);
    }
});