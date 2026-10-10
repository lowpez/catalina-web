/**
 * DATALINA WEB - Core Engine
 * Arquitectura: Pre-procesamiento de imagen + Web Audio API en tiempo real
 */

// --- CONFIGURACIÓN Y ESTADO ---
const CONFIG = {
    bands: 8, // Número de osciladores / bandas horizontales
    scale: [0, 3, 5, 7, 10, 12, 15, 17], // Intervalos en semitonos (Pentatónica Menor extendida)
    sampleRate: 44100
};

const state = {
    audioCtx: null,
    isPlaying: false,
    scanX: 0,
    startTime: 0,
    durationSec: 2.0,
    imageData: null,
    columnData: [], // Pre-calculado: [x][band] = brightness (0-1)
    width: 0,
    height: 0,
    baseNote: 48, // C3 en MIDI
    filterAmount: 0.5
};

// --- ELEMENTOS DOM ---
const canvas = document.getElementById('visualizer');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const playhead = document.getElementById('playhead');
const statusText = document.getElementById('statusText');

// --- INICIALIZACIÓN DE AUDIO ---
function initAudio() {
    if (state.audioCtx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    state.audioCtx = new AudioContext();
    
    // Crear banco de osciladores y nodos de ganancia
    state.oscillators = [];
    state.gainNodes = [];
    
    const masterGain = state.audioCtx.createGain();
    masterGain.gain.value = 0.8;
    
    state.filter = state.audioCtx.createBiquadFilter();
    state.filter.type = 'lowpass';
    state.filter.frequency.value = 1000;
    state.filter.Q.value = 1;
    
    state.filter.connect(masterGain);
    masterGain.connect(state.audioCtx.destination);

    for (let i = 0; i < CONFIG.bands; i++) {
        const osc = state.audioCtx.createOscillator();
        const gain = state.audioCtx.createGain();
        
        osc.type = 'sine'; // Sine es más limpio para síntesis aditiva gráfica
        // Frecuencia basada en la escala
        const semitones = CONFIG.scale[i];
        const freq = 440 * Math.pow(2, (state.baseNote + semitones - 69) / 12);
        osc.frequency.value = freq;
        
        gain.gain.value = 0;
        
        osc.connect(gain);
        gain.connect(state.filter);
        osc.start();
        
        state.oscillators.push(osc);
        state.gainNodes.push(gain);
    }
}

function updateFrequencies() {
    if (!state.audioCtx) return;
    for (let i = 0; i < CONFIG.bands; i++) {
        const semitones = CONFIG.scale[i];
        const freq = 440 * Math.pow(2, (state.baseNote + semitones - 69) / 12);
        state.oscillators[i].frequency.setTargetAtTime(freq, state.audioCtx.currentTime, 0.05);
    }
}

// --- PROCESAMIENTO DE IMAGEN ---
document.getElementById('imageInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const img = new Image();
    img.onload = () => {
        // Ajustar canvas manteniendo proporción, máx 800x400
        const scale = Math.min(800 / img.width, 400 / img.height);
        state.width = Math.floor(img.width * scale);
        state.height = Math.floor(img.height * scale);
        canvas.width = state.width;
        canvas.height = state.height;

        // Dibujar y convertir a escala de grises
        ctx.drawImage(img, 0, 0, state.width, state.height);
        const imageData = ctx.getImageData(0, 0, state.width, state.height);
        const data = imageData.data;

        // Pre-procesamiento: Calcular brillo promedio por banda para cada columna X
        // Esto optimiza el loop de audio enormemente (O(1) en tiempo real)
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
                    // Fórmula de luminancia estándar
                    const brightness = (data[idx] * 0.299 + data[idx+1] * 0.587 + data[idx+2] * 0.114) / 255;
                    totalBrightness += brightness;
                    pixelCount++;
                    
                    // Actualizar visual en canvas (escala de grises)
                    const gray = brightness * 255;
                    data[idx] = data[idx+1] = data[idx+2] = gray;
                }
                
                const avgBrightness = totalBrightness / pixelCount;
                state.columnData[x * CONFIG.bands + b] = avgBrightness;
            }
        }

        // Re-dibujar la versión en escala de grises
        ctx.putImageData(imageData, 0, 0);
        
        state.imageData = imageData;
        state.scanX = 0;
        
        // UI Updates
        document.getElementById('btnPlay').disabled = false;
        document.getElementById('btnExport').disabled = false;
        statusText.textContent = `Imagen cargada: ${state.width}x${state.height}px. Lista para escanear.`;
    };
    img.src = URL.createObjectURL(file);
});

// --- MOTOR DE REPRODUCCIÓN EN TIEMPO REAL ---
function play() {
    if (!state.imageData) return;
    initAudio();
    if (state.audioCtx.state === 'suspended') state.audioCtx.resume();

    state.isPlaying = true;
    state.startTime = state.audioCtx.currentTime;
    state.scanX = 0;
    
    document.getElementById('btnPlay').disabled = true;
    document.getElementById('btnStop').disabled = false;
    playhead.style.display = 'block';
    statusText.textContent = "Escaneando...";

    requestAnimationFrame(audioLoop);
}

function stop() {
    state.isPlaying = false;
    document.getElementById('btnPlay').disabled = false;
    document.getElementById('btnStop').disabled = true;
    playhead.style.display = 'none';
    statusText.textContent = "Detenido.";
    
    // Fade out suave
    if (state.audioCtx) {
        const now = state.audioCtx.currentTime;
        state.gainNodes.forEach(g => g.gain.setTargetAtTime(0, now, 0.1));
    }
}

function audioLoop() {
    if (!state.isPlaying || !state.audioCtx) return;

    const elapsed = state.audioCtx.currentTime - state.startTime;
    const progress = (elapsed % state.durationSec) / state.durationSec;
    state.scanX = Math.floor(progress * (state.width - 1));

    // Actualizar playhead visual
    const canvasRect = canvas.getBoundingClientRect();
    const wrapperRect = document.getElementById('canvasWrapper').getBoundingClientRect();
    const relativeX = (canvasRect.left - wrapperRect.left) + (progress * canvasRect.width);
    playhead.style.left = `${relativeX}px`;

    // Leer datos de la columna actual
    const colOffset = state.scanX * CONFIG.bands;
    let totalBrightness = 0;
    const now = state.audioCtx.currentTime;

    for (let b = 0; b < CONFIG.bands; b++) {
        const brightness = state.columnData[colOffset + b];
        totalBrightness += brightness;
        
        // Mapeo: Brillo (0-1) -> Ganancia (0-0.3) con suavizado para evitar clicks
        const targetGain = brightness * 0.3;
        state.gainNodes[b].gain.setTargetAtTime(targetGain, now, 0.02);
    }

    // Mapeo: Brillo total de la columna -> Frecuencia de corte del filtro
    const avgBrightness = totalBrightness / CONFIG.bands;
    const minFreq = 200;
    const maxFreq = 5000;
    const targetFreq = minFreq + (avgBrightness * (maxFreq - minFreq) * state.filterAmount);
    state.filter.frequency.setTargetAtTime(targetFreq, now, 0.05);

    requestAnimationFrame(audioLoop);
}

// --- EXPORTACIÓN A WAV (Offline Rendering) ---
async function exportWAV() {
    if (!state.imageData) return;
    statusText.textContent = "Renderizando audio (esto puede tomar unos segundos)...";
    document.getElementById('btnExport').disabled = true;

    const duration = state.durationSec;
    const offlineCtx = new OfflineAudioContext(1, CONFIG.sampleRate * duration, CONFIG.sampleRate);

    // Reconstruir el grafo de audio en el contexto offline
    const oscillators = [];
    const gainNodes = [];
    const filter = offlineCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.connect(offlineCtx.destination);

    for (let i = 0; i < CONFIG.bands; i++) {
        const osc = offlineCtx.createOscillator();
        const gain = offlineCtx.createGain();
        const semitones = CONFIG.scale[i];
        const freq = 440 * Math.pow(2, (state.baseNote + semitones - 69) / 12);
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(filter);
        osc.start(0);
        oscillators.push(osc);
        gainNodes.push(gain);
    }

    // Programar los eventos de audio frame a frame (cada ~20ms para rendimiento)
    const stepTime = 0.02; 
    for (let t = 0; t < duration; t += stepTime) {
        const progress = t / duration;
        const x = Math.floor(progress * (state.width - 1));
        const colOffset = x * CONFIG.bands;
        let totalBrightness = 0;

        for (let b = 0; b < CONFIG.bands; b++) {
            const brightness = state.columnData[colOffset + b];
            totalBrightness += brightness;
            gainNodes[b].gain.setValueAtTime(brightness * 0.3, t);
        }

        const avgBrightness = totalBrightness / CONFIG.bands;
        const minFreq = 200;
        const maxFreq = 5000;
        const targetFreq = minFreq + (avgBrightness * (maxFreq - minFreq) * state.filterAmount);
        filter.frequency.setValueAtTime(targetFreq, t);
    }

    // Renderizar
    const renderedBuffer = await offlineCtx.startRendering();
    
    // Codificar a WAV
    const wavBlob = bufferToWave(renderedBuffer, renderedBuffer.length);
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `datalina_scan_${Date.now()}.wav`;
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

    // Escribir cabecera WAV
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit (hardcoded in this demo)
    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length

    // Escribir datos de audio entrelazados
    for(i = 0; i < abuffer.numberOfChannels; i++)
        channels.push(abuffer.getChannelData(i));

    while(pos < length) {
        for(i = 0; i < numOfChan; i++) {
            sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0; // scale to 16-bit
            view.setInt16(pos, sample, true);
            pos += 2;
        }
        offset++;
    }

    return new Blob([buffer], {type: "audio/wav"});

    function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
    function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }
}

// --- EVENT LISTENERS DE CONTROLES ---
document.getElementById('btnPlay').addEventListener('click', play);
document.getElementById('btnStop').addEventListener('click', stop);
document.getElementById('btnExport').addEventListener('click', exportWAV);

document.getElementById('paramSpeed').addEventListener('input', (e) => {
    state.durationSec = parseFloat(e.target.value);
    document.getElementById('valSpeed').textContent = state.durationSec.toFixed(1) + 's';
});

const freqNames = ['C2', 'C3', 'C4', 'G4', 'C5'];
const freqValues = [36, 48, 60, 67, 72];
document.getElementById('paramFreq').addEventListener('input', (e) => {
    const idx = parseInt(e.target.value);
    state.baseNote = freqValues[idx];
    document.getElementById('valFreq').textContent = freqNames[idx];
    updateFrequencies();
});

document.getElementById('paramFilter').addEventListener('input', (e) => {
    state.filterAmount = parseInt(e.target.value) / 100;
    document.getElementById('valFilter').textContent = e.target.value + '%';
});