# 🎨 Catalina Web

> Un sintetizador gráfico digital inspirado en el convertidor analógico "Catalina" de Fernando von Reichenbach (1960s), que transforma dibujos hechos a mano en paisajes sonoros generativos en tiempo real, reviviendo el arte de la síntesis por escaneo raster directamente en el navegador.

## 1. Concepto
Catalina Web es un instrumento audiovisual que permite "dibujar" sonido. Basado en los principios históricos de sistemas pioneros como el *Catalina* argentino, el *UPIC* de Iannis Xenakis, *Oramics* de Daphne Oram y el sintetizador *ANS* soviético, este proyecto digitaliza el proceso de sonificación gráfica. 

El usuario carga un dibujo (líneas, formas, patrones), y un motor de escaneo raster lee la imagen columna por columna. La altura (eje Y) se cuantiza a una escala musical, y el brillo de los píxeles modula la amplitud y el filtrado del sonido en tiempo real, creando texturas orgánicas, rítmicas y melódicas a partir de la materia visual.

## 2. Decisión Técnica
- **Vanilla JavaScript (ES6+)**: Cero dependencias externas. Máximo rendimiento, control absoluto y facilidad de despliegue.
- **Canvas API**: Para el pre-procesamiento eficiente de la imagen (conversión a escala de grises y análisis matricial de columnas).
- **Web Audio API**: Para la síntesis de audio en tiempo real de baja latencia. Utiliza un banco de osciladores con suavizado exponencial de ganancia (`setTargetAtTime`) para garantizar un *audio feel* profesional, libre de artefactos o "clicks" digitales.
- **OfflineAudioContext**: Para la exportación a WAV. Renderiza el audio a máxima velocidad de CPU sin depender de la reproducción en tiempo real, garantizando un archivo limpio y sin glitches.

## 3. Arquitectura del Sistema

```

INPUT (File API) 
  ↓
PRE-PROCESS (Canvas) → Convierte a Grayscale → Calcula "Column Data" (Bandas de brillo por columna X)
  ↓
STATE MACHINE → isPlaying, scanPosition (0 a width), speed
  ↓
AUDIO ENGINE (Web Audio API) 
  ├── 8x OscillatorNode (Frecuencias fijas en escala Pentatónica)
  ├── 8x GainNode (Modulados por el brillo de la banda en la columna X actual)
  └── 1x BiquadFilterNode (Lowpass, modulado por el brillo total de la columna)
  ↓
RENDER LOOP (requestAnimationFrame) → Actualiza posición del playhead visual y parámetros de audio
  ↓
EXPORT (OfflineAudioContext) → Renderizado rápido a AudioBuffer → Codificador WAV 16-bit PCM

```

## 4. Controles y Parámetros

| Control | Función | Rango / Valores | Impacto Artístico |
| :--- | :--- | :--- | :--- |
| **Cargar Dibujo** | Procesa la imagen a escala de grises y calcula las bandas. | JPG, PNG | Define la "partitura" visual. |
| **Velocidad** | Tiempo que tarda el escáner en recorrer la imagen de izquierda a derecha. | 0.5s a 10.0s | Controla el ritmo y la densidad de los eventos sonoros. |
| **Frecuencia Base** | Transpone toda la escala de osciladores. | C2, C3, C4, G4, C5 | Cambia el registro (graves, medios, agudos) de la pieza. |
| **Filtro** | Cuánto afecta el brillo total de la columna a la apertura del filtro Lowpass. | 0% a 100% | Aporta "movimiento orgánico". A mayor brillo, sonido más abierto y brillante. |
| **Exportar WAV** | Renderiza el escaneo actual a máxima velocidad y descarga un archivo `.wav` de 16-bit. | N/A | Genera el asset final para usar en DAWs o proyectos audiovisuales. |

## 5. Cómo Ejecutarlo

1. Clona este repositorio o descarga el archivo `index.html`.
2. Haz doble clic en el archivo `index.html` para abrirlo en **Chrome, Firefox o Edge** *(Safari también funciona, pero Chrome/Edge tienen el mejor rendimiento de Web Audio)*.
3. Haz clic en **"Cargar Dibujo"**. 
   > 💡 *Tip: Usa dibujos con trazos gruesos, alto contraste (negro sobre blanco) o patrones repetitivos para mejores resultados.*
4. Haz clic en **"INICIAR AUDIO"** *(el navegador requiere una interacción del usuario para desbloquear el contexto de audio)*.
5. Ajusta los sliders en tiempo real mientras escuchas la evolución del sonido.
6. Cuando tengas una versión que te guste, haz clic en **"EXPORTAR A WAV"** para guardar tu creación.

## 6. Optimización (Criterio de Director Técnico)

- **Pre-procesamiento O(1)**: En lugar de leer los píxeles de la imagen en cada frame (lo que causaría *garbage collection* y caídas de FPS), el código calcula una `Float32Array` (`columnData`) una sola vez al cargar la imagen. El loop de audio solo hace una búsqueda de memoria ultrarrápida.
- **Suavizado de Audio (`setTargetAtTime`)**: Nunca cambiamos el volumen de un oscilador de golpe (eso produce "clicks" digitales feos). Usamos una rampa exponencial de 20ms, garantizando un *audio feel* profesional y suave.
- **Exportación No Bloqueante**: Usamos `OfflineAudioContext`. Esto renderiza el audio en segundo plano a la máxima velocidad de la CPU, sin importar la duración, y luego codifica a WAV puro (16-bit PCM), compatible con cualquier software de producción musical.

## 7. Próximas Extensiones (Roadmap)

Si este prototipo resuena con la visión del proyecto, estos serían los siguientes pasos lógicos, priorizados por valor artístico/costo técnico:

- **Modo de Escaneo Bidireccional**: Agregar un toggle para escanear de derecha a izquierda, o en bucle "ping-pong" (como un LFO), creando texturas rítmicas más complejas.
- **Síntesis por Wavetable**: En lugar de 8 osciladores fijos, usar la columna de píxeles literalmente como la forma de onda de un solo oscilador (como el sintetizador ANS). Esto suena más "metálico" y espectral.
- **Entrada de Cámara en Vivo**: Usar `navigator.mediaDevices.getUserMedia` para escanear dibujos en tiempo real a través de la webcam, eliminando el paso de "tomar foto y subir".
- **Soporte MIDI**: Mapear los canales de salida a notas MIDI (Web MIDI API) para controlar sintetizadores externos de hardware.

## 8. Créditos e Inspiración Histórica

Este proyecto es un homenaje digital a los pioneros de la síntesis gráfica de sonido:
- **Catalina** (1960s): Convertidor Gráfico Analógico de Fernando von Reichenbach (CLAEM, Instituto Di Tella, Argentina).
- **UPIC** (1970s): Sistema de composición gráfica por computadora de Iannis Xenakis.
- **Oramics** (1950s): Técnica de "sonido dibujado" de Daphne Oram.
- **ANS Synthesizer** (1958): Sintetizador fotoeléctrico óptico de Yevgeny Murzin.

Desarrollado como un prototipo de arte generativo y herramienta educativa para talleres de creación sonora.

---
*© 2026 - Proyecto de Código Abierto. Inspirado en la historia de la música electroacústica latinoamericana.*