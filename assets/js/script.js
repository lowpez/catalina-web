/**
 * CATALINA WEB - Core Engine (Fase 2 - Control Manual / Scrubber)
 * Arquitectura: Pre-procesamiento + Web Audio API + Modos de Escaneo
 * Homenaje al Catalina de Fernando von Reichenbach (1960s)
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
    
    // Modos de escaneo
    isInverted: true,
    isLooping: true,
    isPingPong: false,
    isRandom: false,
    isScrubbing: false, // ← NUEVO: Estado de arrastre del slider
    
    // Frecuencias
    freqMin: 65,
    freqMax: 523,
    currentMode: 'musical',
    
    // Procesamiento
    masterVolume: 0.8,
    filterAmount: 0.5
};

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
    ctx.setLineDash([5, 5]);
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
    state.filter.frequency.value = 1000;
    state.filter.Q.value = 1;
    
    state.filter.connect(state.masterGain);
    state.masterGain.connect(state.audioCtx.destination);

    for (let i = 0; i < CONFIG.bands; i++) {
        const osc = state.audioCtx.createOscillator();
        const gain = state.audioCtx.createGain();
        osc.type = 'sine';
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(state.filter);
        osc.start();
        state.oscillators.push(osc);
        state.gainNodes.push(gain);
    }
    updateFrequencies();
}

function updateFrequencies() {
    if (!state.audioCtx) return;
    const min = state.freqMin;
    const max = state.freqMax;
    if (min <= 0 || max <= 0 || min >= max) return;
    
    for (let i = 0; i < CONFIG.bands; i++) {
        const ratio = i / (CONFIG.bands - 1);
        const freq = min * Math.pow(max / min, ratio);
        state.oscillators[i].frequency.setTargetAtTime(freq, state.audioCtx.currentTime, 0.05);
    }
}

// --- NUEVA FUNCIÓN: ACTUALIZAR AUDIO DESDE PROGRESO (Reutilizable para Scrub) ---
function updateAudioFromProgress(progress) {
    // Determinar posición X
    if (state.isRandom && !state.isScrubbing) {
        state.scanX = Math.floor(Math.random() * state.width);
    } else {
        state.scanX = Math.floor(progress * (state.width - 1));
    }

    const colOffset = state.scanX * CONFIG.bands;
    let totalBrightness = 0;
    const now = state.audioCtx.currentTime;

    for (let b = 0; b < CONFIG.bands; b++) {
        let brightness = state.columnData[colOffset + b];
        if (state.isInverted) brightness = 1 - brightness;
        
        totalBrightness += brightness;
        const targetGain = brightness * 0.3;
        state.gainNodes[b].gain.setTargetAtTime(targetGain, now, 0.02);
    }

    const avgBrightness = totalBrightness / CONFIG.bands;
    const targetFreq = 200 + (avgBrightness * (5000 - 200) * state.filterAmount);
    state.filter.frequency.setTargetAtTime(targetFreq, now, 0.05);
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
        statusText.textContent = `Imagen cargada: ${state.width}x${state.height}px. Lista para escanear.`;
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
    
    // Resetear scrubber al iniciar
    scrubSlider.value = 0;
    document.getElementById('valScrub').textContent = '0%';
    
    document.getElementById('btnPlay').disabled = true;
    document.getElementById('btnStop').disabled = false;
    playhead.style.display = 'block';
    statusText.textContent = state.isRandom ? "Escaneando (Aleatorio)..." : "Escaneando...";

    requestAnimationFrame(audioLoop);
}

function stop() {
    state.isPlaying = false;
    state.isScrubbing = false; // Asegurar que se libere el scrub
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
        // MODO SCRUB: El progreso lo dicta el slider del usuario
        const scrubValue = parseFloat(scrubSlider.value);
        progress = scrubValue / 100;
        
        // Actualizar audio y visual inmediatamente
        updateAudioFromProgress(progress);
        
        const canvasRect = canvas.getBoundingClientRect();
        const wrapperRect = document.getElementById('canvasWrapper').getBoundingClientRect();
        const relativeX = (canvasRect.left - wrapperRect.left) + (progress * canvasRect.width);
        playhead.style.left = `${relativeX}px`;
        
    } else {
        // MODO AUTOMÁTICO
        const elapsed = state.audioCtx.currentTime - state.startTime;
        
        if (state.isPingPong) {
            const cycleDuration = state.durationSec * 2;
            const rawProgress = (elapsed % cycleDuration) / state.durationSec;
            progress = rawProgress <= 1 ? rawProgress : 2 - rawProgress;
        } else {
            progress = (elapsed % state.durationSec) / state.durationSec;
        }

        // Condiciones de Detención
        if (!state.isLooping) {
            if (state.isPingPong) {
                if (elapsed >= state.durationSec * 2) { stop(); return; }
            } else {
                if (elapsed >= state.durationSec) { stop(); return; }
            }
        }

        updateAudioFromProgress(progress);

        // Actualizar playhead visual
        const canvasRect = canvas.getBoundingClientRect();
        const wrapperRect = document.getElementById('canvasWrapper').getBoundingClientRect();
        const relativeX = (canvasRect.left - wrapperRect.left) + (progress * canvasRect.width);
        playhead.style.left = `${relativeX}px`;

        // Sincronizar el slider de scrub con el progreso automático
        scrubSlider.value = progress * 100;
        document.getElementById('valScrub').textContent = Math.round(progress * 100) + '%';
    }

    requestAnimationFrame(audioLoop);
}

// --- EXPORTACIÓN A WAV ---
async function exportWAV() {
    if (!state.imageData) return;
    statusText.textContent = "Renderizando audio...";
    document.getElementById('btnExport').disabled = true;

    const duration = state.durationSec;
    const offlineCtx = new OfflineAudioContext(1, CONFIG.sampleRate * duration, CONFIG.sampleRate);

    const oscillators = [];
    const gainNodes = [];
    const filter = offlineCtx.createBiquadFilter();
    filter.type = 'lowpass';
    const masterGain = offlineCtx.createGain();
    masterGain.gain.value = state.masterVolume;
    
    filter.connect(masterGain);
    masterGain.connect(offlineCtx.destination);

    const min = state.freqMin;
    const max = state.freqMax;
    for (let i = 0; i < CONFIG.bands; i++) {
        const osc = offlineCtx.createOscillator();
        const gain = offlineCtx.createGain();
        const ratio = i / (CONFIG.bands - 1);
        const freq = min * Math.pow(max / min, ratio);
        osc.frequency.value = freq;
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
            if (state.isLooping) {
                progress = progress % 1;
            } else {
                progress = Math.min(progress, 1);
            }
            x = Math.floor(progress * (state.width - 1));
        }

        const colOffset = x * CONFIG.bands;
        let totalBrightness = 0;

        for (let b = 0; b < CONFIG.bands; b++) {
            let brightness = state.columnData[colOffset + b];
            if (state.isInverted) brightness = 1 - brightness;
            totalBrightness += brightness;
            gainNodes[b].gain.setValueAtTime(brightness * 0.3, t);
        }

        const avgBrightness = totalBrightness / CONFIG.bands;
        const targetFreq = 200 + (avgBrightness * (5000 - 200) * state.filterAmount);
        filter.frequency.setValueAtTime(targetFreq, t);
    }

    const renderedBuffer = await offlineCtx.startRendering();
    
    // (La función bufferToWave se mantiene igual, omitida aquí por brevedad, cópiala de tu versión anterior)
    const wavBlob = bufferToWave(renderedBuffer, renderedBuffer.length);
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `catalina_scan_${Date.now()}.wav`;
    a.click();
    
    statusText.textContent = "¡Exportación completada!";
    document.getElementById('btnExport').disabled = false;
}

// Función auxiliar para codificar AudioBuffer a WAV 16-bit PCM
function bufferToWave(abuffer, len) {
    let numOfChan = abuffer.numberOfChannels,
        length = len * numOfChan * 2 + 44,
        buffer = new ArrayBuffer(length),
        view = new DataView(buffer),
        channels = [], i, sample, offset = 0, pos = 0;

    // ... (Mantén exactamente el mismo código de bufferToWave que ya tenías) ...
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

// --- GESTIÓN DE MODOS (MUSICAL / ESPECTRAL) ---
function setMode(mode) {
    state.currentMode = mode;
    const sliderMin = document.getElementById('paramFreqMin');
    const sliderMax = document.getElementById('paramFreqMax');
    const rootNoteContainer = document.getElementById('rootNoteContainer');

    if (mode === 'musical') {
        rootNoteContainer.classList.remove('hidden');
        sliderMin.max = 1000;
        sliderMax.max = 8000;
        document.getElementById('selectRootNote').dispatchEvent(new Event('change'));
        statusText.textContent = "Modo Musical: Escala temperada activa.";
    } else {
        rootNoteContainer.classList.add('hidden');
        sliderMin.max = 20000;
        sliderMax.max = 20000;
        statusText.textContent = "Modo Espectral: Libertad total de Hz (Datalina/ANS).";
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

document.getElementById('selectRootNote').addEventListener('change', (e) => {
    if (state.currentMode !== 'musical') return;
    const rootFreq = parseFloat(e.target.value);
    state.freqMin = Math.round(rootFreq / 2); 
    state.freqMax = Math.round(rootFreq * 4);
    document.getElementById('paramFreqMin').value = state.freqMin;
    document.getElementById('paramFreqMax').value = state.freqMax;
    document.getElementById('valFreqMin').textContent = state.freqMin + ' Hz';
    document.getElementById('valFreqMax').textContent = state.freqMax + ' Hz';
    updateFrequencies();
});

document.getElementById('paramFreqMin').addEventListener('input', (e) => {
    state.freqMin = parseInt(e.target.value);
    document.getElementById('valFreqMin').textContent = state.freqMin + ' Hz';
    updateFrequencies();
});

document.getElementById('paramFreqMax').addEventListener('input', (e) => {
    state.freqMax = parseInt(e.target.value);
    document.getElementById('valFreqMax').textContent = state.freqMax + ' Hz';
    updateFrequencies();
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

// --- LÓGICA DEL SCRUBBER (CONTROL MANUAL) ---
scrubSlider.addEventListener('pointerdown', () => {
    state.isScrubbing = true;
});

scrubSlider.addEventListener('pointerup', () => {
    state.isScrubbing = false;
    if (state.isPlaying) {
        // Recalcular startTime para que el loop continúe suavemente desde la posición soltada
        const progress = parseFloat(scrubSlider.value) / 100;
        state.startTime = state.audioCtx.currentTime - (progress * state.durationSec);
    }
});

// Soporte adicional para dispositivos táctiles antiguos
scrubSlider.addEventListener('touchstart', () => { state.isScrubbing = true; }, {passive: true});
scrubSlider.addEventListener('touchend', () => { 
    state.isScrubbing = false; 
    if (state.isPlaying) {
        const progress = parseFloat(scrubSlider.value) / 100;
        state.startTime = state.audioCtx.currentTime - (progress * state.durationSec);
    }
});