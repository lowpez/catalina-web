# Catalina Web

> Un sintetizador gr¨¢fico digital inspirado en el convertidor anal¨®gico "Catalina" de Fernando von Reichenbach (1960s), que transforma dibujos hechos a mano en paisajes sonoros generativos en tiempo real, reviviendo el arte de la s¨ªntesis por escaneo raster directamente en el navegador.

## 1. Concepto
Catalina Web es un instrumento audiovisual que permite "dibujar" sonido. Basado en los principios hist¨®ricos de sistemas pioneros como el *Catalina* argentino, el *UPIC* de Iannis Xenakis, *Oramics* de Daphne Oram y el sintetizador *ANS* sovi¨¦tico, este proyecto digitaliza el proceso de sonificaci¨®n gr¨¢fica. 

El usuario carga un dibujo (l¨ªneas, formas, patrones), y un motor de escaneo raster lee la imagen columna por columna. La altura (eje Y) se cuantiza a una escala musical, y el brillo de los p¨ªxeles modula la amplitud y el filtrado del sonido en tiempo real, creando texturas org¨¢nicas, r¨ªtmicas y mel¨®dicas a partir de la materia visual.

## 2. Decisi¨®n T¨¦cnica
- **Vanilla JavaScript (ES6+)**: Cero dependencias externas. M¨¢ximo rendimiento, control absoluto y facilidad de despliegue.
- **Canvas API**: Para el pre-procesamiento eficiente de la imagen (conversi¨®n a escala de grises y an¨¢lisis matricial de columnas).
- **Web Audio API**: Para la s¨ªntesis de audio en tiempo real de baja latencia. Utiliza un banco de osciladores con suavizado exponencial de ganancia (`setTargetAtTime`) para garantizar un *audio feel* profesional, libre de artefactos o "clicks" digitales.
- **OfflineAudioContext**: Para la exportaci¨®n a WAV. Renderiza el audio a m¨¢xima velocidad de CPU sin depender de la reproducci¨®n en tiempo real, garantizando un archivo limpio y sin glitches.

## 3. Arquitectura del Sistema

```

INPUT (File API) 
  â†?
PRE-PROCESS (Canvas) â†?Convierte a Grayscale â†?Calcula "Column Data" (Bandas de brillo por columna X)
  â†?
STATE MACHINE â†?isPlaying, scanPosition (0 a width), speed
  â†?
AUDIO ENGINE (Web Audio API) 
  â”œâ”€â”€ 8x OscillatorNode (Frecuencias fijas en escala Pentat¨®nica)
  â”œâ”€â”€ 8x GainNode (Modulados por el brillo de la banda en la columna X actual)
  â””â”€â”€ 1x BiquadFilterNode (Lowpass, modulado por el brillo total de la columna)
  â†?
RENDER LOOP (requestAnimationFrame) â†?Actualiza posici¨®n del playhead visual y par¨¢metros de audio
  â†?
EXPORT (OfflineAudioContext) â†?Renderizado r¨¢pido a AudioBuffer â†?Codificador WAV 16-bit PCM

```

## 4. Controles y Par¨¢metros

| Control | Funci¨®n | Rango / Valores | Impacto Art¨ªstico |
| :--- | :--- | :--- | :--- |
| **Cargar Dibujo** | Procesa la imagen a escala de grises y calcula las bandas. | JPG, PNG | Define la "partitura" visual. |
| **Velocidad** | Tiempo que tarda el esc¨¢ner en recorrer la imagen de izquierda a derecha. | 0.5s a 10.0s | Controla el ritmo y la densidad de los eventos sonoros. |
| **Frecuencia Base** | Transpone toda la escala de osciladores. | C2, C3, C4, G4, C5 | Cambia el registro (graves, medios, agudos) de la pieza. |
| **Filtro** | Cu¨¢nto afecta el brillo total de la columna a la apertura del filtro Lowpass. | 0% a 100% | Aporta "movimiento org¨¢nico". A mayor brillo, sonido m¨¢s abierto y brillante. |
| **Exportar WAV** | Renderiza el escaneo actual a m¨¢xima velocidad y descarga un archivo `.wav` de 16-bit. | N/A | Genera el asset final para usar en DAWs o proyectos audiovisuales. |

## 5. C¨®mo Ejecutarlo

1. Clona este repositorio o descarga el archivo `index.html`.
2. Haz doble clic en el archivo `index.html` para abrirlo en **Chrome, Firefox o Edge** *(Safari tambi¨¦n funciona, pero Chrome/Edge tienen el mejor rendimiento de Web Audio)*.
3. Haz clic en **"Cargar Dibujo"**. 
   > ðŸ’¡ *Tip: Usa dibujos con trazos gruesos, alto contraste (negro sobre blanco) o patrones repetitivos para mejores resultados.*
4. Haz clic en **"INICIAR AUDIO"** *(el navegador requiere una interacci¨®n del usuario para desbloquear el contexto de audio)*.
5. Ajusta los sliders en tiempo real mientras escuchas la evoluci¨®n del sonido.
6. Cuando tengas una versi¨®n que te guste, haz clic en **"EXPORTAR A WAV"** para guardar tu creaci¨®n.

## ?? Gu¨ªa R¨¢pida para el Taller (Paso a Paso)

?Bienvenido a Catalina Web! No necesitas saber programar ni m¨²sica para usarlo. Sigue estos 3 pasos:

1. **?? Dibuja y Carga**: 
   - Dibuja en una hoja blanca con trazos **negros y gruesos** (l¨ªneas horizontales, ondas o patrones funcionan mejor).
   - Toma una foto o escan¨¦ala y c¨¢rgala con el bot¨®n **"?? Cargar Dibujo"**.
   - *Importante:* Aseg¨²rate de que el toggle **"Trazo = Sonido"** est¨¦ activado (verde).

2. **??? Escucha y Ajusta**: 
   - Presiona **"? Iniciar Audio"**.
   - Juega con la **Velocidad** para hacer el sonido m¨¢s r¨¢pido o lento.
   - Prueba el modo **Ping-Pong** para un sonido continuo sin cortes, o **RANDOM** para texturas impredecibles.
   - Usa la barra **Posici¨®n Manual (Scrub)** para "tocar" tu dibujo como si fuera un instrumento.

3. **?? Guarda tu Creaci¨®n**: 
   - Cuando encuentres un sonido que te guste, presiona **"?? Exportar a WAV"**.
   - ?Listo! Tendr¨¢s un archivo de audio listo para usar en tu m¨²sica, video o proyecto.

> ?? **Consejo Pro:** Si tu dibujo tiene muchas l¨ªneas finas, activa el **Modo Espectral** y sube el rango de frecuencias para obtener sonidos m¨¢s met¨¢licos y experimentales.


## 6. Optimizaci¨®n (Criterio de Director T¨¦cnico)

- **Pre-procesamiento O(1)**: En lugar de leer los p¨ªxeles de la imagen en cada frame (lo que causar¨ªa *garbage collection* y ca¨ªdas de FPS), el c¨®digo calcula una `Float32Array` (`columnData`) una sola vez al cargar la imagen. El loop de audio solo hace una b¨²squeda de memoria ultrarr¨¢pida.
- **Suavizado de Audio (`setTargetAtTime`)**: Nunca cambiamos el volumen de un oscilador de golpe (eso produce "clicks" digitales feos). Usamos una rampa exponencial de 20ms, garantizando un *audio feel* profesional y suave.
- **Exportaci¨®n No Bloqueante**: Usamos `OfflineAudioContext`. Esto renderiza el audio en segundo plano a la m¨¢xima velocidad de la CPU, sin importar la duraci¨®n, y luego codifica a WAV puro (16-bit PCM), compatible con cualquier software de producci¨®n musical.

## 7. Pr¨®ximas Extensiones (Roadmap)

Si este prototipo resuena con la visi¨®n del proyecto, estos ser¨ªan los siguientes pasos l¨®gicos, priorizados por valor art¨ªstico/costo t¨¦cnico:

~- **Modo de Escaneo Bidireccional**: Agregar un toggle para escanear de derecha a izquierda, o en bucle "ping-pong" (como un LFO), creando texturas r¨ªtmicas m¨¢s complejas.~
- **S¨ªntesis por Wavetable**: En lugar de 8 osciladores fijos, usar la columna de p¨ªxeles literalmente como la forma de onda de un solo oscilador (como el sintetizador ANS). Esto suena m¨¢s "met¨¢lico" y espectral.
- **Entrada de C¨¢mara en Vivo**: Usar `navigator.mediaDevices.getUserMedia` para escanear dibujos en tiempo real a trav¨¦s de la webcam, eliminando el paso de "tomar foto y subir".
- **Soporte MIDI**: Mapear los canales de salida a notas MIDI (Web MIDI API) para controlar sintetizadores externos de hardware.
- **Mapeo por Canales de Color (RGB) - El salto m¨¢s impactante**: En lugar de convertir a gris, podemos leer los canales de color por separado para controlar distintos par¨¢metros.

    Canal Rojo (R): Controla la Altura/Frecuencia (o la banda que se activa).
    Canal Verde (G): Controla el Volumen/Ganancia.
    Canal Azul (B): Controla el Filtro (Brillo) o la Reverberaci¨®n.
    Resultado: El usuario puede dibujar un fondo azul para crear un ambiente con mucha reverb, y pintar l¨ªneas rojas para que suenen notas agudas. ?Libertad compositiva total!

- **Detecci¨®n de "Objetos" o S¨ªmbolos (Nivel Avanzado)**: En lugar de solo escaneo raster l¨ªnea por l¨ªnea, podr¨ªamos a?adir una l¨®gica simple que diga: "Si hay un c¨ªrculo en la imagen, activa un efecto de Delay; si hay un tri¨¢ngulo, cambia la escala a Menor". (Nota: Esto requiere algoritmos de visi¨®n por computadora m¨¢s complejos, quiz¨¢s usando una librer¨ªa ligera como tracking.js, pero es posible).
- **Canvas de Dibujo en Vivo (Lienzo Interactivo)**: A?adir un bot¨®n de "Modo Dibujo" que convierta el <canvas> en un lienzo donde el usuario pueda pintar con el mouse en tiempo real, y el sonido responda mientras dibuja, no solo despu¨¦s de cargar una imagen. Esto lo convertir¨ªa en un instrumento musical performativo.

## 8. Cr¨¦ditos e Inspiraci¨®n Hist¨®rica

Este proyecto es un homenaje digital a los pioneros de la s¨ªntesis gr¨¢fica de sonido:
- **Catalina** (1960s): Convertidor Gr¨¢fico Anal¨®gico de Fernando von Reichenbach (CLAEM, Instituto Di Tella, Argentina).
- **UPIC** (1970s): Sistema de composici¨®n gr¨¢fica por computadora de Iannis Xenakis.
- **Oramics** (1950s): T¨¦cnica de "sonido dibujado" de Daphne Oram.
- **ANS Synthesizer** (1958): Sintetizador fotoel¨¦ctrico ¨®ptico de Yevgeny Murzin.

Desarrollado como un prototipo de arte generativo y herramienta educativa para talleres de creaci¨®n sonora.

---
2026 - Proyecto de C¨®digo Abierto. Inspirado en la historia de la m¨²sica electroac¨²stica latinoamericana.*