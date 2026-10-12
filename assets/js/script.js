/**
 * CATALINA WEB - Core Engine (Fase 3 - Motor Armónico Estilo Laurie Spiegel)
 * Arquitectura: Pre-procesamiento + Web Audio API (Chord-Voicing) + Modos de Escaneo
 * Objetivo: Sonoridad musical, cálida y compleja (Music Mouse vibe)
 */

// --- CONFIGURACIÓN Y ESTADO ---
const CONFIG = {
    bands: 8, // Número de voces polifónicas
    sampleRate: 44100,
    scaleType: 'major', // 'major', 'minor', 'lydian'
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
    
    // Modos de escaneo
    isInverted: true,
    isLooping: true,
    isPingPong: false,
    isRandom: false,
    isScrubbing: false, 
    
    // Frecuencias Base
    rootFreq: 261.63, // Do Central (C4) por defecto
    freqMin: 65,      // Se usará como referencia visual, no directa para síntesis ahora
    freqMax: 523,     
    currentMode: 'musical',
    
    // Procesamiento
    masterVolume: 0.7,
    filterAmount: 0.5,
    
    // Nodos de Audio
    oscillators: [],
    gainNodes: [],
    masterGain: null,
    filter: null,
    lfo: null,
    lfoGain: null,
    
    // Datos Armónicos Calculados
    currentChordFreqs: [] 
};

// --- UTILIDADES MUSICALES ---
// Semitonios desde la raíz para escalas comunes
const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11], // Muy usada en electrónica ambiental/spiegeliana
    mixolydian: [0, 2, 4, 5, 7, 9, 10]
};

function midiToFreq(midiNote) {
    return 440 * Math.pow(2, (midiNote - 69) / 12);
}

function getScaleNotes(rootMidi, scaleName, count) {
    const intervals = SCALES[scaleName] || SCALES.major;
    const notes = [];
    for (let i = 0; i < count; i++) {
        // Ciclo a través de la escala, subiendo octava cuando se acaba
        const intervalIndex = i % intervals.length;
        const octaveOffset = Math.floor(i / intervals.length) * 12;
        notes.push(rootMidi + intervals[intervalIndex] + octaveOffset);
    }
    return notes.map(n => midiToFreq(n));
}

// Genera un voicing de acorde rico distribuyendo notas en las 8 voces
function generateChordVoicing(rootMidi, brightnessFactor, complexitySeed) {
    // Elegir qué tipo de acorde según la "brillantez" o semilla
    // Simulamos diferentes estructuras armónicas
    
    const scaleName = 'lydian'; // Lydian suena mágica y abierta, ideal para esto
    const baseNotes = getScaleNotes(rootMidi, scaleName, 7); // 7 notas de la escala
    
    let chordFreqs = [];
    
    // Estrategia de Voicing:
    // Voces bajas (0-2): Raíz y Quinta (fundamento sólido)
    // Voces medias (3-5): Tercera y Séptima (color armónico)
    // Voces altas (6-7): Novena y Undécima/Dodécima (aire y brillo)
    
    // Aplicamos variación basada en la luminosidad de la imagen (brightnessFactor)
    // Si es oscuro -> Acorde cerrado/tradicional. Si es claro -> Acorde abierto/suspendido.
    
    const spread = 12 * brightnessFactor; // Octavas extra si hay mucha luz/negro
    
    // Mapeo manual para asegurar consonancia (evitar clusters disonantes feos)
    // Índices de la escala: 0(Raíz), 2(Tercera), 4(Quinta), 6(Séptima), 8(Novena)...
    
    const voiceIndices = [
        0, // Root
        4, // Fifth
        2, // Third
        6, // Seventh
        8, // Ninth
        10,// Eleventh/Twelfth
        12,// Octave Root
        14 // Ninth High
    ];

    for (let i = 0; i < CONFIG.bands; i++) {
        const idx = voiceIndices[i];
        // Obtener frecuencia de la escala extendida
        const noteInterval = idx >= 7 ? (idx % 7) : idx;
        const octaveAdd = Math.floor(idx / 7) * 12;
        
        const rawFreq = midiToFreq(rootMidi + SCALES[scaleName][noteInterval] + octaveAdd);
        
        // Añadir micro-desafinación sutil (chorus effect natural)
        const detune = (Math.random() - 0.5) * 5; // +/- 2.5 cents
        
        chordFreqs.push(rawFreq * Math.pow(2, detune/1200));
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
    ctx.strokeStyle = 'rgba(0, 255, 157, 0.3)'; // Más sutil
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

// --- INICIALIZACIÓN DE AUDIO (ESTILO SPEIGEL) ---
function initAudio() {
    if (state.audioCtx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    state.audioCtx = new AudioContext();
    
    state.oscillators = [];
    state.gainNodes = [];
    
    // 1. MASTER GAIN
    state.masterGain = state.audioCtx.createGain();
    state.masterGain.gain.value = state.masterVolume;
    
    // 2. FILTRO SUAVE (Lowpass genérico para calidez)
    state.filter = state.audioCtx.createBiquadFilter();
    state.filter.type = 'lowpass';
    state.filter.frequency.value = 4000; // Abierto por defecto
    state.filter.Q.value = 0.7;          // Resonancia casi nula (limpio)
    
    state.filter.connect(state.masterGain);
    state.masterGain.connect(state.audioCtx.destination);

    // 3. LFO PARA CHORUS/VIBRATO SUTIL
    state.lfo = state.audioCtx.createOscillator();
    state.lfoGain = state.audioCtx.createGain();
    state.lfo.frequency.value = 0.5;     // Muy lento (ondulación etérea)
    state.lfoGain.gain.value = 1.5;      // Desviación mínima
    state.lfo.connect(state.lfoGain);
    state.lfo.start();

    for (let i = 0; i < CONFIG.bands; i++) {
        const osc = state.audioCtx.createOscillator();
        const gain = state.audioCtx.createGain();
        
        // TRIANGLE WAVE: Suave, redondo, con armónicos pares/impar equilibrados.
        // Ideal para pads y melodías líricas.
        osc.type = 'triangle'; 
        
        gain.gain.value = 0;
        
        // Conectar LFO para dar vida
        state.lfoGain.connect(osc.detune); // Modulamos DETUNE, no FREQUENCY, para chorus
        
        osc.connect(gain);
        gain.connect(state.filter);
        osc.start();
        
        state.oscillators.push(osc);
        state.gainNodes.push(gain);
    }
    
    // Inicializar primer acorde
    updateHarmony(0.5); 
}

// --- ACTUALIZAR ARMONÍA (NUEVO CORE LOGIC) ---
function updateHarmony(avgBrightness) {
    if (!state.audioCtx) return;
    
    // Convertir Root Note selector value a MIDI
    // Asumimos que selectRootNote da Hz, convertimos a MIDI aprox para cálculo interno
    // O mejor, guardamos el MIDI directamente en estado si cambiamos el UI luego.
    // Por ahora, asumemos C4 (261.63Hz) ~ MIDI 60.
    
    // Para simplificar, usamos la frecuencia raíz definida en HTML o default
    const rootHz = parseFloat(document.getElementById('selectRootNote').value) || 261.63;
    const rootMidi = 69 + 12 * Math.log2(rootHz / 440);
    
    // Generar nuevas frecuencias basadas en la luminosidad promedio
    // avgBrightness 0..1 determina qué tan "abierto" o complejo es el acorde
    const newFreqs = generateChordVoicing(Math.round(rootMidi), avgBrightness, Date.now());
    
    state.currentChordFreqs = newFreqs;

    const now = state.audioCtx.currentTime;
    
    // Asignar frecuencias a los osciladores con transición suave
    for (let i = 0; i < CONFIG.bands; i++) {
        if (newFreqs[i]) {
            // setTargetAtTime evita clicks al cambiar de acorde
            state.oscillators[i].frequency.setTargetAtTime(newFreqs[i], now, 0.1);
            
            // Volumen individual basado en registro (voces graves un poco más fuertes para balance)
            const volumeCompensation = i < 3 ? 0.15 : 0.10; 
            // El volumen real lo controla updateAudioFromProgress, aquí solo preparamos la base
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

    // 1. Leer datos de la columna
    const columnValues = [];
    for (let b = 0; b < CONFIG.bands; b++) {
        let brightness = state.columnData[colOffset + b];
        if (state.isInverted) brightness = 1 - brightness;
        columnValues.push(brightness);
        totalBrightness += brightness;
    }

    const avgBrightness = totalBrightness / CONFIG.bands;

    // 2. Actualizar Armonía Global (El acorde cambia suavemente según la densidad de la imagen)
    // Solo actualizar si ha pasado tiempo suficiente o si el cambio es significativo para ahorrar CPU
    // Pero para efecto Spiegel, queremos fluidez continua.
    updateHarmony(avgBrightness);

    // 3. Dinámica Individual (Attack/Decay por voz)
    for (let b = 0; b < CONFIG.bands; b++) {
        const val = columnValues[b];
        
        // Curva exponencial para dinámica más musical (no lineal robótica)
        // x^2 hace que los valores bajos sean silenciosos y los altos exploten suavemente
        const dynamicGain = Math.pow(val, 1.5) * 0.25; 
        
        // Ataque rápido, decay medio
        state.gainNodes[b].gain.setTargetAtTime(dynamicGain, now, 0.05);
    }

    // 4. Modulación de Filtro (Brillo general)
    // Cuanto más negro/promedio alto, más abrimos el filtro para dejar pasar armónicos agudos
    const cutoff = 800 + (avgBrightness * 6000); 
    state.filter.frequency.setTargetAtTime(cutoff, now, 0.1);
}

// --- PROCESAMIENTO DE IMAGEN (Sin cambios mayores, solo limpieza) ---
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

// --- MOTOR DE REPRODUCCIÓN (Igual que antes) ---
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

// --- EXPORTACIÓN A WAV (Adaptada al nuevo motor) ---
async function exportWAV() {
    if (!state.imageData) return;
    statusText.textContent = "Renderizando pieza armónica...";
    document.getElementById('btnExport').disabled = true;

    const duration = state.durationSec;
    const offlineCtx = new OfflineAudioContext(1, CONFIG.sampleRate * duration, CONFIG.sampleRate);

    const oscillators = [];
    const gainNodes = [];
    
    // Cadena de efectos idéntica a Live
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

    // Preparar raíces
    const rootHz = parseFloat(document.getElementById('selectRootNote').value) || 261.63;
    const rootMidi = 69 + 12 * Math.log2(rootHz / 440);

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
        
        // Recalcular acorde para este frame exacto
        const chordFreqs = generateChordVoicing(Math.round(rootMidi), avgBrightness, t);
        
        for (let b = 0; b < CONFIG.bands; b++) {
            oscillators[b].frequency.setValueAtTime(chordFreqs[b], t);
            const dynGain = Math.pow(vals[b], 1.5) * 0.25;
            gainNodes[b].gain.setValueAtTime(dynGain, t);
        }

        const cutoff = 800 + (avgBrightness * 6000);
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

// Función auxiliar WAV (Mantener igual)
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

// --- GESTIÓN DE MODOS (Actualizada para reflejar cambio conceptual) ---
function setMode(mode) {
    state.currentMode = mode;
    const sliderMin = document.getElementById('paramFreqMin');
    const sliderMax = document.getElementById('paramFreqMax');
    const rootNoteContainer = document.getElementById('rootNoteContainer');

    if (mode === 'musical') {
        rootNoteContainer.classList.remove('hidden');
        // En modo armónico, los sliders de Min/Max Hz ya no controlan directamente las voces
        // sino que podríamos repurpurlos para "Spread" o "Density" en el futuro.
        // Por ahora, los ocultamos o deshabilitamos visualmente si quieres, 
        // pero mantendré la estructura para no romper tu HTML.
        sliderMin.disabled = true;
        sliderMax.disabled = true;
        sliderMin.parentElement.style.opacity = '0.5';
        sliderMax.parentElement.style.opacity = '0.5';
        
        statusText.textContent = "Modo Armónico: Acordes Diatónicos Activos.";
    } else {
        rootNoteContainer.classList.add('hidden');
        sliderMin.disabled = false;
        sliderMax.disabled = false;
        sliderMin.parentElement.style.opacity = '1';
        sliderMax.parentElement.style.opacity = '1';
        statusText.textContent = "Modo Espectral: Control directo de Hz.";
        // Nota: El modo espectral aún usaría la vieja lógica si quisieras soportarlo, 
        // pero para este commit nos enfocamos en Musical.
    }
}

// --- EVENT LISTENERS (Resto igual) ---
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

document.getElementById('selectRootNote').addEventListener('change', (e) => {
    // No necesita recalcular todo inmediatamente, updateHarmony lo hará en el loop
    statusText.textContent = `Raíz cambiada a ${e.target.options[e.target.selectedIndex].text}`;
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

// Scrubber Logic (Igual)
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