# Catalina Web

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
  â†?
PRE-PROCESS (Canvas) â†?Convierte a Grayscale â†?Calcula "Column Data" (Bandas de brillo por columna X)
  â†?
STATE MACHINE â†?isPlaying, scanPosition (0 a width), speed
  â†?
AUDIO ENGINE (Web Audio API) 
  â”œâ”€â”€ 8x OscillatorNode (Frecuencias fijas en escala Pentatónica)
  â”œâ”€â”€ 8x GainNode (Modulados por el brillo de la banda en la columna X actual)
  â””â”€â”€ 1x BiquadFilterNode (Lowpass, modulado por el brillo total de la columna)
  â†?
RENDER LOOP (requestAnimationFrame) â†?Actualiza posición del playhead visual y parámetros de audio
  â†?
EXPORT (OfflineAudioContext) â†?Renderizado rápido a AudioBuffer â†?Codificador WAV 16-bit PCM

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
   > ðŸ’¡ *Tip: Usa dibujos con trazos gruesos, alto contraste (negro sobre blanco) o patrones repetitivos para mejores resultados.*
4. Haz clic en **"INICIAR AUDIO"** *(el navegador requiere una interacción del usuario para desbloquear el contexto de audio)*.
5. Ajusta los sliders en tiempo real mientras escuchas la evolución del sonido.
6. Cuando tengas una versión que te guste, haz clic en **"EXPORTAR A WAV"** para guardar tu creación.

## ?? Guía Rápida para el Taller (Paso a Paso)

?Bienvenido a Catalina Web! No necesitas saber programar ni música para usarlo. Sigue estos 3 pasos:

1. **?? Dibuja y Carga**: 
   - Dibuja en una hoja blanca con trazos **negros y gruesos** (líneas horizontales, ondas o patrones funcionan mejor).
   - Toma una foto o escanéala y cárgala con el botón **"?? Cargar Dibujo"**.
   - *Importante:* Asegúrate de que el toggle **"Trazo = Sonido"** esté activado (verde).

2. **??? Escucha y Ajusta**: 
   - Presiona **"? Iniciar Audio"**.
   - Juega con la **Velocidad** para hacer el sonido más rápido o lento.
   - Prueba el modo **Ping-Pong** para un sonido continuo sin cortes, o **RANDOM** para texturas impredecibles.
   - Usa la barra **Posición Manual (Scrub)** para "tocar" tu dibujo como si fuera un instrumento.

3. **?? Guarda tu Creación**: 
   - Cuando encuentres un sonido que te guste, presiona **"?? Exportar a WAV"**.
   - ?Listo! Tendrás un archivo de audio listo para usar en tu música, video o proyecto.

> ?? **Consejo Pro:** Si tu dibujo tiene muchas líneas finas, activa el **Modo Espectral** y sube el rango de frecuencias para obtener sonidos más metálicos y experimentales.


## 6. Optimización (Criterio de Director Técnico)

- **Pre-procesamiento O(1)**: En lugar de leer los píxeles de la imagen en cada frame (lo que causaría *garbage collection* y caídas de FPS), el código calcula una `Float32Array` (`columnData`) una sola vez al cargar la imagen. El loop de audio solo hace una búsqueda de memoria ultrarrápida.
- **Suavizado de Audio (`setTargetAtTime`)**: Nunca cambiamos el volumen de un oscilador de golpe (eso produce "clicks" digitales feos). Usamos una rampa exponencial de 20ms, garantizando un *audio feel* profesional y suave.
- **Exportación No Bloqueante**: Usamos `OfflineAudioContext`. Esto renderiza el audio en segundo plano a la máxima velocidad de la CPU, sin importar la duración, y luego codifica a WAV puro (16-bit PCM), compatible con cualquier software de producción musical.

## 7. Próximas Extensiones (Roadmap)

Si este prototipo resuena con la visión del proyecto, estos serían los siguientes pasos lógicos, priorizados por valor artístico/costo técnico:

~- **Modo de Escaneo Bidireccional**: Agregar un toggle para escanear de derecha a izquierda, o en bucle "ping-pong" (como un LFO), creando texturas rítmicas más complejas.~
- **Síntesis por Wavetable**: En lugar de 8 osciladores fijos, usar la columna de píxeles literalmente como la forma de onda de un solo oscilador (como el sintetizador ANS). Esto suena más "metálico" y espectral.
- **Entrada de Cámara en Vivo**: Usar `navigator.mediaDevices.getUserMedia` para escanear dibujos en tiempo real a través de la webcam, eliminando el paso de "tomar foto y subir".
- **Soporte MIDI**: Mapear los canales de salida a notas MIDI (Web MIDI API) para controlar sintetizadores externos de hardware.
- **Mapeo por Canales de Color (RGB) - El salto más impactante**: En lugar de convertir a gris, podemos leer los canales de color por separado para controlar distintos parámetros.

    Canal Rojo (R): Controla la Altura/Frecuencia (o la banda que se activa).
    Canal Verde (G): Controla el Volumen/Ganancia.
    Canal Azul (B): Controla el Filtro (Brillo) o la Reverberación.
    Resultado: El usuario puede dibujar un fondo azul para crear un ambiente con mucha reverb, y pintar líneas rojas para que suenen notas agudas. ?Libertad compositiva total!

- **Detección de "Objetos" o Símbolos (Nivel Avanzado)**: En lugar de solo escaneo raster línea por línea, podríamos a?adir una lógica simple que diga: "Si hay un círculo en la imagen, activa un efecto de Delay; si hay un triángulo, cambia la escala a Menor". (Nota: Esto requiere algoritmos de visión por computadora más complejos, quizás usando una librería ligera como tracking.js, pero es posible).
- **Canvas de Dibujo en Vivo (Lienzo Interactivo)**: A?adir un botón de "Modo Dibujo" que convierta el <canvas> en un lienzo donde el usuario pueda pintar con el mouse en tiempo real, y el sonido responda mientras dibuja, no solo después de cargar una imagen. Esto lo convertiría en un instrumento musical performativo.

## 8. Créditos e Inspiración Histórica

Este proyecto es un homenaje digital a los pioneros de la síntesis gráfica de sonido:
- **Catalina** (1960s): Convertidor Gráfico Analógico de Fernando von Reichenbach (CLAEM, Instituto Di Tella, Argentina).
- **UPIC** (1970s): Sistema de composición gráfica por computadora de Iannis Xenakis.
- **Oramics** (1950s): Técnica de "sonido dibujado" de Daphne Oram.
- **ANS Synthesizer** (1958): Sintetizador fotoeléctrico óptico de Yevgeny Murzin.

Desarrollado como un prototipo de arte generativo y herramienta educativa para talleres de creación sonora.

---
2026 - Proyecto de Código Abierto. Inspirado en la historia de la música electroacústica latinoamericana.*