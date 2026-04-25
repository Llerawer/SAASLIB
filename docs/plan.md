# 📚 LinguaReader - Plan de Desarrollo por Fases

> **Regla de oro:** No avanzar a la siguiente fase hasta que el usuario valide la actual.
> Este plan contiene instrucciones conceptuales y entregables esperados. Sin código.

---

## 🎯 Visión general

Aplicación **local y personal** para aprender inglés leyendo. El usuario lee PDFs/EPUBs desde su biblioteca local, subraya palabras, la app captura contexto, permite exportar a IA externa (manual via Claude Max) y genera tarjetas de Anki **ricas en audio**: con **audio nativo cortado quirúrgicamente de YouTube** (la palabra exacta dicha por un hablante nativo) y **grabación propia del usuario** (para comparar y practicar pronunciación).

**Principios fundamentales:**
- Sin integración directa a APIs de IA (flujo manual copiar/pegar).
- Todo local, sin nube ni autenticación.
- Solo inglés en v1.
- Un solo usuario (el desarrollador) como cliente.
- **Tres temas visuales obligatorios:** claro, oscuro y sepia. Implementados desde la Fase 2.
- **Entregable final:** aplicación de escritorio instalable (ver Fase 12). Se abre con doble clic, sin terminal ni comandos.
- **Asociación con el sistema operativo:** la app se integra con el explorador de archivos para poder abrir PDFs/EPUBs directamente desde el sistema.
- **Biblioteca basada en carpetas:** el usuario configura una o más carpetas de su sistema como "biblioteca", y la app escanea e indexa los libros dentro. No se copian archivos, se leen desde su ubicación original. El usuario conserva su organización libre en carpetas y subcarpetas.
- **Audio como pieza central:** cada palabra capturada puede tener hasta 3 audios en su tarjeta de Anki: (1) el clip nativo completo con contexto, (2) la palabra aislada cortada con precisión de milisegundos, y (3) la grabación propia del usuario para comparar. Esto hace las tarjetas incomparablemente más poderosas que las de Anki tradicional.
- **Biblioteca de audios acumulativa:** los audios de palabras aceptados se guardan organizados por nombre de palabra (ej: `gleaming.mp3`). Si la misma palabra reaparece en otro libro, la app reutiliza el audio existente automáticamente (con opción de buscar uno nuevo si el usuario lo prefiere). Con el tiempo, esto construye una biblioteca personal de pronunciaciones nativas reutilizable.
- **Curación manual del audio:** para cada palabra, el usuario revisa los clips disponibles uno por uno, escucha, y decide si lo acepta, prueba otro, o la palabra se queda sin audio nativo. Control total, nada automático sin consentimiento.

## 🎁 Entregable final (resumen)

Al terminar todas las fases, el usuario tendrá:

- **Un instalador `.exe` para Windows** (plataforma principal del desarrollador).
- **Opcionalmente también `.dmg` para macOS y `.AppImage` para Linux** si se decide soportar esas plataformas.
- **Doble clic y se abre la app como cualquier programa**.
- **Icono en escritorio o menú de aplicaciones**.
- **Biblioteca basada en carpetas:** apuntas la app a tu carpeta de libros y los ve todos automáticamente.
- **Biblioteca de audios personal:** colección creciente de audios nativos de palabras, organizados alfabéticamente, reutilizables entre sesiones y libros.
- **Asociación con PDF y EPUB:** clic derecho en cualquier archivo de estos formatos → "Abrir con" → LinguaReader aparece en la lista. El libro se abre directamente en modo lectura.
- **Arrastrar y soltar:** puedes arrastrar un PDF/EPUB sobre el icono de LinguaReader (o sobre la ventana de la app) y se abre automáticamente.
- **Datos persistentes** guardados automáticamente en el sistema (en `%APPDATA%\LinguaReader\` en Windows).
- **Sin necesidad de arrancar servidores ni correr comandos** después de instalar.
- **Backup manual** disponible: se puede exportar toda la base de datos y multimedia.

La app queda empaquetada con todas sus dependencias internas (Python embebido, modelos de WhisperX, FFmpeg, yt-dlp). El usuario solo instala una vez.

## 🔊 Tarjetas de Anki con audio: el resultado final

Cada tarjeta de Anki generada por LinguaReader incluye potencialmente estos elementos de audio, que la hacen única:

**Frente de la tarjeta:**
- La palabra en inglés (ej: "gleaming").
- Fonética IPA (ej: /ˈɡliːmɪŋ/).
- **Audio 1 — Palabra aislada nativa:** archivo `gleaming.mp3` de ~400 ms con la palabra pronunciada por un hablante nativo real, cortada quirúrgicamente del video de YouTube con precisión de 20-50 ms usando WhisperX.
- **Audio 2 — Frase completa nativa:** archivo `gleaming_phrase.mp3` de ~3-5 segundos con el contexto en que apareció la palabra, para aprender entonación, ritmo y pronunciación natural.

**Reverso de la tarjeta:**
- Traducción al español.
- Definición.
- Frase del libro donde la subrayaste (contexto personal memorable).
- Mnemotecnia visual si la pediste.
- Ejemplos adicionales.
- **Audio 3 — Tu propia pronunciación:** archivo `gleaming_mine.mp3` con tu grabación. Permite comparar con la del nativo y detectar errores propios.
- Video embebido (opcional) del clip de YouTube reproducible en Anki desktop para contexto visual adicional.

**Por qué esto es revolucionario:**
Las tarjetas de Anki tradicionales tienen texto y, en el mejor caso, TTS robótico. Las de LinguaReader tienen **pronunciación humana real, en contexto, comparable con tu propia voz**. Escuchar a un nativo decir "gleaming" en una oración real es infinitamente mejor que leerla. Y poder escucharte a ti mismo junto al nativo te permite **autocorregirte**.

**Biblioteca de audios acumulativa:**
Los audios se guardan en una biblioteca personal organizada alfabéticamente (`data/media/word_audio_library/g/gleaming.mp3`). Cada palabra aceptada se curada manualmente por el usuario (no se auto-generan). Con el tiempo tendrás una **colección personal de pronunciaciones** que puedes reutilizar entre libros y sesiones, exportar como backup, o llevar a otra computadora. Es tu "tesoro" de aprendizaje que crece con cada sesión de lectura.

---

## 📐 Reglas de comportamiento importantes

### Subrayado efímero por sesión
Cuando se cierra o termina una sesión de lectura, **los subrayados visuales desaparecen del libro**. La palabra sigue guardada en la base de datos asociada a esa sesión, pero la próxima vez que se abre el libro está "limpio".

**Razón:** evitar que el libro se ensucie permanentemente con meses de subrayados acumulados. Cada sesión es un lienzo fresco.

### Subrayado inteligente de apariciones múltiples
Cuando el usuario subraya una palabra (por ejemplo "gleaming"), **la app automáticamente resalta todas las demás apariciones de esa misma palabra en el libro actual** durante la sesión activa.

- Funciona con la **forma exacta** (match case-insensitive).
- Opcional avanzado: también resaltar **formas flexionadas** (gleam, gleams, gleamed, gleaming) si el usuario lo activa.
- **Configurable:** el usuario puede desactivar esta función en preferencias.
- Los resaltados automáticos tienen un **color ligeramente distinto** del subrayado manual original (ej: un poco más transparente o con borde punteado) para que el usuario distinga cuál marcó él y cuáles son "sugerencias" visuales.

### Contexto capturado por aparición
Cuando se subraya una palabra, se captura la frase donde está. Si luego el usuario confirma que quiere guardar esa palabra para la sesión, se guarda **solo esa ocurrencia con su contexto**. Las demás apariciones resaltadas son visuales, no se guardan automáticamente (a menos que el usuario haga clic en ellas).

Opcional configurable: **"guardar todas las apariciones como ejemplos adicionales"** → si está activado, al guardar una palabra, todas las frases donde aparece en el libro se adjuntan como ejemplos extra en la tarjeta final.

---

## 🗂️ Estructura del plan

El proyecto está dividido en **11 fases**. Cada fase:

1. Tiene un **objetivo claro**.
2. Lista las **instrucciones/pasos** necesarios.
3. Define **qué debe funcionar al final** (entregable).
4. Incluye un **punto de validación**: el desarrollador prueba, aprueba, y solo entonces se avanza.

---

# FASE 0 — Setup inicial del proyecto

## Objetivo
Tener el esqueleto del proyecto listo para desarrollar, con frontend y backend comunicándose correctamente.

## Instrucciones

1. **Inicializar repositorio Git** en una carpeta nueva.
2. **Crear estructura de carpetas** principal:
   - Carpeta `frontend/` para la aplicación web (Next.js).
   - Carpeta `backend/` para el servicio Python (FastAPI).
   - Carpeta `docs/` para documentación interna (plantillas de prompt, formatos).
   - Carpeta `data/` para base de datos SQLite, libros, audios, grabaciones.
3. **Setup del frontend:**
   - Instalar Next.js con TypeScript y Tailwind CSS.
   - Configurar App Router.
   - Instalar dependencias visuales base (shadcn/ui, Lucide Icons).
   - Crear una página de inicio placeholder ("Hola Mundo").
4. **Setup del backend:**
   - Crear entorno virtual de Python.
   - Instalar FastAPI, Uvicorn, SQLAlchemy.
   - Crear endpoint `/health` que devuelva `{"status": "ok"}`.
   - Configurar CORS para que el frontend pueda llamar al backend.
5. **Setup de base de datos:**
   - Crear archivo SQLite vacío.
   - Script que inicializa las tablas (aún vacío, solo la estructura).
6. **Instalar dependencias del sistema:**
   - Confirmar que `ffmpeg` y `yt-dlp` estén instalados en el sistema.
   - Documentar cómo instalarlos para cada sistema operativo.
7. **Documentación inicial:**
   - README con pasos para arrancar el proyecto.
   - Archivo `.gitignore` apropiado para Python, Node, y archivos locales.

## Entregable
- `npm run dev` en `frontend/` arranca la app en `http://localhost:3000`.
- `uvicorn` en `backend/` arranca el servidor en `http://localhost:8000`.
- Desde el frontend se puede llamar a `/health` del backend y recibir respuesta.
- La estructura de carpetas es limpia y organizada.
- El README tiene instrucciones claras para arrancar todo.

## ✅ Validación
**Antes de pasar a la Fase 1, el usuario debe confirmar que:**
- Arranca el proyecto sin errores.
- Ambos servidores corren.
- La comunicación frontend ↔ backend funciona.
- La estructura le parece clara.

---

# FASE 1 — Lector de PDF funcional con biblioteca local

## Objetivo
Poder configurar una carpeta como biblioteca, ver todos los libros que contiene, y leer cualquiera de ellos cómodamente navegando entre páginas.

## Instrucciones

1. **Configuración inicial de biblioteca:**
   - Al abrir la app por primera vez, pantalla de bienvenida que pide: "Selecciona la carpeta donde tienes tus libros".
   - Se abre diálogo del sistema operativo para elegir una carpeta.
   - La ruta seleccionada se guarda en la base de datos como "biblioteca principal".
   - La app escanea la carpeta y subcarpetas buscando archivos `.pdf` y `.epub`.
   - El usuario puede **agregar múltiples carpetas** como bibliotecas (opción "Agregar otra biblioteca" en preferencias).
   - El usuario puede **cambiar o quitar** una biblioteca en cualquier momento.

2. **Escaneo e indexación de libros:**
   - Al configurar una biblioteca, la app recorre la carpeta y subcarpetas de forma recursiva.
   - Para cada archivo encontrado, se registra en la base de datos:
     - Ruta completa.
     - Nombre del archivo.
     - Tamaño.
     - Fecha de modificación.
     - Tipo (pdf/epub).
   - Se extraen **metadatos** cuando están disponibles:
     - Título (del PDF o EPUB, si no existe usa el nombre del archivo).
     - Autor.
     - Número de páginas.
     - Portada (primera página del PDF o imagen de cover del EPUB).
   - El escaneo inicial puede tardar unos segundos/minutos si hay cientos de libros. Mostrar barra de progreso.

3. **Detección de cambios (watcher de archivos):**
   - Mientras la app está abierta, un watcher vigila las carpetas de biblioteca.
   - Detecta automáticamente:
     - Nuevos libros agregados → los indexa.
     - Libros renombrados o movidos → actualiza referencia.
     - Libros borrados → los elimina del índice (pero conserva el historial de sesiones y palabras capturadas).
   - Al abrir la app, también se hace un escaneo rápido para detectar cambios que ocurrieron con la app cerrada.

4. **Pantalla principal de biblioteca:**
   - Vista en cuadrícula (tipo "portadas") o en lista, a elección del usuario.
   - Cada libro muestra: portada (o placeholder), título, autor, número de páginas, indicador de progreso de lectura.
   - **Filtros disponibles:**
     - Por subcarpeta (navegación tipo explorador).
     - Por estado: no leído, leyendo, terminado.
     - Por tipo de archivo.
     - Búsqueda por título o autor.
   - **Ordenamiento:** por título, autor, fecha agregado, último leído, tamaño.
   - **Indicadores visuales:**
     - Libro no leído: portada normal.
     - Libro leyendo: badge con porcentaje de progreso.
     - Libro terminado: check verde.

5. **Apertura de un libro:**
   - Al hacer clic en un libro de la biblioteca, se abre en vista de lectura.
   - Renderizado con PDF.js (PDF) o epub.js (EPUB, a implementar en Fase 4).
   - Controles básicos: página anterior, página siguiente, saltar a página específica.
   - Zoom (+/-).
   - Indicador de página actual y total.
   - Botón "Volver a biblioteca" siempre visible.

6. **Apertura desde fuera de la biblioteca:**
   - El usuario puede abrir un archivo que **no esté** en la biblioteca de tres formas:
     - Arrastrar y soltar sobre la ventana de la app.
     - Botón "Abrir archivo suelto" en la biblioteca.
     - Pasar la ruta como argumento al arrancar la app (base para Fase 12).
   - Al abrir un archivo suelto, la app pregunta: "¿Quieres agregar este libro a tu biblioteca? (sí, agregar a [Biblioteca principal] / sí, pero sólo por esta vez / no)".

7. **Persistencia de lectura:**
   - Al navegar páginas, se guarda automáticamente la página actual.
   - Al volver a abrir el libro, retoma en la última página.
   - Marca visual en la biblioteca del progreso (barra o porcentaje).

8. **Experiencia de lectura:**
   - Tipografía y tamaño legibles.
   - Espaciado cómodo.
   - Sin elementos visuales distractores.
   - La zona de lectura ocupa la mayoría de la pantalla.
   - Panel lateral (por ahora vacío) reservado para futura lista de palabras.

## Entregable
- Al arrancar la app por primera vez, configuro mi carpeta de biblioteca.
- La app escanea e indexa todos mis PDFs y EPUBs automáticamente.
- Veo una pantalla de biblioteca con portadas, títulos y autores.
- Puedo filtrar, ordenar y buscar libros.
- Al hacer clic en un libro, se abre y puedo leerlo.
- Si agrego un nuevo libro a la carpeta mientras la app está abierta, aparece automáticamente.
- Puedo tener múltiples bibliotecas configuradas (opcional).
- Puedo arrastrar un libro suelto sobre la ventana y abrirlo.
- Al cerrar y volver a abrir, todo sigue como lo dejé.

## ✅ Validación
**El usuario debe:**
- Configurar una carpeta real con al menos 10 libros.
- Confirmar que el escaneo funciona correctamente.
- Verificar que las portadas y metadatos se extraen bien.
- Navegar por la biblioteca y abrir varios libros.
- Agregar un libro nuevo a la carpeta mientras la app está abierta y confirmar que aparece.
- Leer cómodamente al menos 15-20 páginas de un libro.

---

# FASE 2 — Temas visuales (claro, oscuro, sepia)

## Objetivo
Implementar los tres temas visuales completos con sus paletas de colores.

## Instrucciones

1. **Sistema de temas con variables CSS:**
   - Definir variables CSS para cada tema: fondo, superficie, texto primario, texto secundario, acento, borde, y los tres colores de resaltado (primary, secondary, saved).
   - Aplicar variables en toda la interfaz (lector, lista de libros, controles).

2. **Paletas de colores:**

   **Tema Claro:**
   - Fondo: blanco puro.
   - Superficie: gris muy claro.
   - Texto primario: casi negro.
   - Acento: azul (#2563EB).
   - Resaltado manual: amarillo suave (#FEF08A).
   - Resaltado automático (apariciones): amarillo más transparente o borde punteado.
   - Palabras ya guardadas: verde claro (#BBF7D0).

   **Tema Oscuro:**
   - Fondo: casi negro (#0F0F0F).
   - Superficie: gris oscuro (#1A1A1A).
   - Texto primario: gris claro (#E5E5E5).
   - Acento: azul claro (#60A5FA).
   - Resaltado manual: ámbar oscuro (#854D0E).
   - Resaltado automático: ámbar más transparente.
   - Palabras ya guardadas: verde oscuro (#14532D).

   **Tema Sepia:**
   - Fondo: color hueso cálido (#F4ECD8).
   - Superficie: beige (#EADFC4).
   - Texto primario: café oscuro (#433422).
   - Acento: café medio (#8B5A2B).
   - Resaltado manual: ocre (#E8D088).
   - Resaltado automático: ocre más transparente.
   - Palabras ya guardadas: verde oliva (#A8B886).

3. **Cambiador de tema:**
   - Botón en una barra superior o menú lateral para cambiar entre los tres temas.
   - Icono representativo (sol, luna, libro).
   - Cambio instantáneo sin recargar.

4. **Persistencia:**
   - La preferencia de tema se guarda en el navegador (localStorage).
   - Al volver a abrir, se aplica el último tema elegido.

5. **Tipografía configurable:**
   - En preferencias, opción de cambiar tamaño de fuente (rango 14-24 px).
   - Interlineado ajustable (1.4 a 2.0).
   - Ancho de columna ajustable (60-90 caracteres).
   - Fuente de lectura: serif clásica (Georgia, Merriweather o Literata).

## Entregable
- Los tres temas se ven bien y se pueden alternar con un clic.
- Los colores son agradables y funcionales en cada tema.
- La tipografía se puede ajustar y se guarda la preferencia.

## ✅ Validación
**El usuario debe confirmar:**
- Cada tema se ve bien a sus ojos.
- El cambio es fluido.
- La tipografía le resulta cómoda para lectura larga.

---

# FASE 3 — Subrayado con captura de contexto y apariciones múltiples

## Objetivo
El usuario puede subrayar palabras, se captura el contexto, y se resaltan automáticamente las demás apariciones de la misma palabra en el libro.

## Instrucciones

1. **Selección de palabra:**
   - Al hacer doble clic en una palabra, se selecciona automáticamente (detección de palabra completa, sin signos de puntuación).
   - Al hacer clic-arrastrar, se puede seleccionar un rango personalizado.
   - Selección visible con el color de resaltado primario del tema actual.

2. **Popup de confirmación:**
   - Al seleccionar, aparece un popup pequeño junto a la palabra.
   - Opciones del popup:
     - **Guardar palabra** (con icono de marcador).
     - **Marcar MNEMO** (para que la IA genere mnemotecnia después).
     - **Ver definición rápida** (placeholder por ahora, se implementa en Fase 5).
     - **Cancelar**.
   - El popup desaparece al hacer clic fuera.

3. **Captura automática de contexto:**
   - Al guardar una palabra, se detecta y captura la **frase completa** donde aparece.
   - Algoritmo: buscar hacia atrás hasta encontrar un punto, exclamación, interrogación o salto de párrafo. Lo mismo hacia adelante.
   - Si la frase es muy corta (< 3 palabras), capturar también la frase anterior o siguiente para dar contexto.
   - Si la frase es muy larga (> 300 caracteres), truncar a 300 y agregar "..." al final o inicio.

4. **Subrayado inteligente de apariciones múltiples:**
   - Al guardar o marcar una palabra, la app **busca automáticamente todas las demás apariciones de esa palabra en el libro actual**.
   - Las resalta con un **color ligeramente distinto** (más transparente o con borde punteado) para indicar que son apariciones automáticas, no subrayadas manualmente.
   - Esto funciona durante toda la sesión.
   - Al hacer clic en una aparición automática, se convierte en "capturada manualmente" y también se guarda (como ejemplo adicional o como nueva entrada, según configuración).

5. **Detección configurable en preferencias:**
   - Opción **activada por defecto**: "Resaltar apariciones de palabras subrayadas en todo el libro".
   - Opción secundaria: "Incluir formas flexionadas" (gleam, gleams, gleamed, gleaming). Por defecto **desactivada** (requiere lematización, se implementa después).
   - Opción: "Guardar todas las apariciones como ejemplos adicionales en la misma tarjeta" (desactivada por defecto).

6. **Subrayado efímero por sesión:**
   - Al iniciar una sesión de lectura, el libro se muestra **sin subrayados visuales**.
   - Durante la sesión, los subrayados aparecen y funcionan normalmente.
   - Al **cerrar la sesión** (cerrar pestaña, navegar fuera, o terminar sesión explícitamente), los subrayados visuales desaparecen.
   - Las palabras capturadas siguen guardadas en la base de datos, asociadas a esa sesión, pero el libro queda "limpio" visualmente para la próxima sesión.
   - Si el usuario vuelve a abrir el libro, empieza una **nueva sesión** sin subrayados previos.

7. **Panel lateral de sesión:**
   - En un panel lateral o inferior, se muestra una lista en vivo de las palabras capturadas en la sesión actual.
   - Cada entrada muestra: palabra, contexto breve, etiquetas (MNEMO, etc.), botón para eliminar.

8. **Creación automática de sesión:**
   - Al subrayar la primera palabra en un libro, se crea automáticamente una nueva sesión.
   - La sesión pertenece a ese libro y tiene timestamp de inicio.

## Entregable
- Puedo subrayar palabras con doble clic o selección manual.
- Se captura la palabra y su frase de contexto.
- Las demás apariciones de la palabra se resaltan automáticamente en todo el libro.
- Los subrayados son efímeros: al cerrar el libro, desaparecen, pero las palabras quedan guardadas.
- Puedo ver la lista de palabras capturadas en el panel lateral.
- Puedo configurar el comportamiento del subrayado inteligente en preferencias.

## ✅ Validación
**El usuario debe probar y confirmar:**
- El subrayado es rápido y no interrumpe la lectura.
- El popup es útil y no molesto.
- El contexto capturado es correcto y útil.
- El resaltado de apariciones es una ayuda, no una distracción.
- Al cerrar y reabrir el libro, está limpio visualmente.
- Las palabras capturadas están en la lista correctamente.

---

# FASE 4 — Soporte de EPUB

## Objetivo
Todo lo que funciona con PDF también funciona con EPUB.

## Instrucciones

1. **Integración de epub.js:**
   - Detectar tipo de archivo al subir (por extensión y por contenido).
   - Si es EPUB, usar epub.js para renderizar.
   - Si es PDF, seguir usando PDF.js.

2. **Interfaz unificada:**
   - La misma experiencia de lectura, controles y subrayado debe funcionar con EPUB.
   - Algunas diferencias naturales:
     - EPUB se pagina por "capítulos" o "ubicaciones", no por páginas fijas.
     - Tipografía es más flexible (herencia del CSS del libro o custom).

3. **Compatibilidad con subrayado:**
   - El sistema de selección, captura de contexto y apariciones múltiples debe funcionar igual en EPUB.
   - El resaltado visual se adapta al flujo del texto del EPUB.

## Entregable
- Puedo subir un EPUB y se lee igual de bien que un PDF.
- El subrayado funciona idénticamente.
- La preferencia de tipografía se aplica también a EPUB.

## ✅ Validación
**El usuario debe probar con un EPUB real y confirmar:**
- Lectura cómoda.
- Subrayado funciona.
- No hay bugs específicos del formato.

---

# FASE 5 — Diccionario gratuito integrado

## Objetivo
Ver significado de una palabra sin usar IA, con API gratuita.

## Instrucciones

1. **Integración de Free Dictionary API:**
   - Cliente HTTP simple que consulta la API pública (sin key).
   - Endpoint: consultar una palabra, recibir definiciones, ejemplos, fonética IPA, audio de pronunciación.

2. **Fallback a Wiktionary:**
   - Si Free Dictionary no devuelve resultados, consultar Wiktionary.
   - Puede ser vía API pública de Wikimedia o scraping ligero.

3. **Popup de definición rápida:**
   - Al hacer clic derecho o usar atajo de teclado sobre una palabra, se abre un popup.
   - El popup muestra: palabra, fonética, audio (reproducible), definición principal, 1-2 ejemplos.
   - No interfiere con el flujo de subrayado normal.

4. **Caché local:**
   - Las definiciones consultadas se guardan en la base de datos.
   - Si se consulta la misma palabra otra vez, se devuelve del caché (instantáneo, sin llamada a API).

## Entregable
- Puedo ver definición de cualquier palabra al instante.
- Funciona offline para palabras ya consultadas.
- El audio de pronunciación se reproduce.

## ✅ Validación
**El usuario debe confirmar:**
- La información es útil.
- La rapidez es aceptable.
- No rompe el flujo de lectura.

---

# FASE 6 — Exportación a Markdown con prompt

## Objetivo
Generar un archivo `.md` que se pega en claude.ai (u otra IA) con el prompt optimizado y la lista de palabras.

## Instrucciones

1. **Pantalla de fin de sesión:**
   - Desde la lista de palabras capturadas, botón "Terminar sesión y exportar".
   - Muestra previsualización de todas las palabras con su contexto y etiquetas.
   - Permite editar etiquetas (agregar/quitar MNEMO) antes de exportar.
   - Permite eliminar palabras que no se quieran exportar.

2. **Plantilla de prompt:**
   - Archivo `docs/prompt_template.md` que contiene el prompt base para la IA.
   - El prompt especifica:
     - Rol: profesor experto de inglés para hispanohablantes.
     - Formato exacto de respuesta (markdown estructurado).
     - Campos obligatorios: traducción, lema, definición, nivel CEFR, ejemplo, tip.
     - Campo condicional: mnemotecnia solo si la palabra tiene `[MNEMO]`.
     - Reglas: sin introducción, sin cierre, solo fichas.

3. **Generador de Markdown:**
   - Botón "Exportar a Markdown".
   - Combina: plantilla de prompt + lista de palabras formateadas.
   - Cada palabra se formatea así: número, palabra, etiquetas entre corchetes, contexto, página.
   - El archivo resultante se puede descargar o copiar al portapapeles.

4. **Marcadores disponibles:**
   - `[MNEMO]` → pedir mnemotecnia visual.
   - `[EJEMPLOS]` → pedir 3 ejemplos extra.
   - `[ETIMOLOGIA]` → pedir origen de la palabra.
   - `[GRAMATICA]` → pedir análisis gramatical de la frase.
   - Se pueden combinar múltiples marcadores en la misma palabra.

## Entregable
- Desde la sesión, puedo exportar un `.md` listo para pegar en Claude.
- El archivo tiene el prompt al principio y la lista de palabras después.
- Puedo descargarlo o copiarlo al portapapeles con un clic.

## ✅ Validación
**El usuario debe:**
- Exportar un `.md` real.
- Pegarlo en claude.ai.
- Confirmar que la IA entiende y responde en el formato esperado.
- Si el formato no es óptimo, iterar sobre la plantilla del prompt antes de avanzar.

---

# FASE 7 — Importación de respuesta de IA y generación de APKG

## Objetivo
Cerrar el ciclo: respuesta de IA → tarjetas listas en Anki.

## Instrucciones

1. **Interfaz de importación:**
   - Pantalla con un área grande de texto para pegar la respuesta de la IA.
   - Botón "Procesar respuesta".

2. **Parser de Markdown:**
   - Leer el texto pegado.
   - Identificar cada ficha de palabra (empiezan con `### palabra`).
   - Extraer todos los campos: traducción, lema, definición, nivel, mnemotecnia (si existe), ejemplo, tip.
   - Asociar cada ficha con la palabra correspondiente en la sesión original.
   - Mostrar errores claros si alguna ficha está mal formada.

3. **Vista previa:**
   - Después de parsear, mostrar las tarjetas como quedarán en Anki.
   - Permitir editar campos manualmente antes de generar.
   - Permitir descartar tarjetas individuales.

4. **Generación de archivo APKG:**
   - Usar genanki para crear el archivo `.apkg`.
   - Modelo de tarjeta con campos: palabra, traducción, frase (contexto), definición, mnemotecnia, ejemplo, tip, audio nativo (placeholder por ahora), audio usuario (placeholder), imagen (placeholder).
   - Template visual limpio para front/back.
   - Descarga automática del archivo.

5. **Registro de exportaciones:**
   - Cada palabra exportada se guarda en tabla `anki_exports`.
   - Esto sirve para la detección de duplicados futura.

## Entregable
- Pego la respuesta de la IA y la app genera el `.apkg`.
- Al hacer doble clic en el `.apkg`, Anki importa las tarjetas sin problemas.
- Las tarjetas se ven bien en Anki.

## ✅ Validación
**El usuario debe:**
- Completar el ciclo end-to-end: leer → subrayar → exportar MD → pegar en IA → copiar respuesta → importar → generar APKG → importar en Anki.
- Confirmar que las tarjetas en Anki son útiles y bonitas.

---

# FASE 8 — YouGlish personal: construcción del corpus

## Objetivo
Tener una base de datos local de videos con timestamps a nivel de palabra.

## Instrucciones

1. **Selección de videos fuente:**
   - Crear una lista inicial de 50-100 URLs de YouTube en inglés.
   - Prioridad: TED Talks, podcasts conversacionales, noticias con audio claro, YouTubers educativos.
   - Guardar la lista en un archivo de texto en `backend/scripts/seed_videos.txt`.

2. **Script de seed:**
   - Script que lee el archivo y registra cada URL en la tabla `videos` con status "pending".
   - Extrae título, canal y duración consultando la URL con yt-dlp (solo metadata, sin descargar aún).

3. **Script de procesamiento:**
   - Script que procesa los videos con status "pending".
   - Para cada video:
     - Descargar solo el audio con yt-dlp (formato bajo bitrate para ahorrar espacio).
     - Guardar en `data/media/source_audio/`.
     - Correr WhisperX sobre el audio para obtener transcripción + timestamps por palabra.
     - Parsear la salida JSON de WhisperX.
     - Insertar cada ocurrencia de palabra en la tabla `word_occurrences` (palabra, start_time, end_time, frase completa, confidence).
     - Marcar el video como "indexed".
   - Manejo de errores: si falla un video, marcar como "failed" con el error, continuar con el siguiente.
   - Logging del progreso en consola.

4. **Optimizaciones:**
   - Opcional: borrar el archivo de audio después de procesarlo (solo guardar los timestamps). Así ahorras espacio. Pero pierdes la capacidad de cortar audios sin volver a descargar.
   - Recomendación: conservar los audios en un primer momento, borrar después si el espacio es problema.

5. **Índices de base de datos:**
   - Asegurar que hay índice en `word_occurrences.word_normalized` para búsquedas rápidas.

## Entregable
- Tengo ~50 videos procesados.
- La tabla `word_occurrences` tiene ~50,000-100,000 entradas.
- Puedo hacer una consulta SQL como "dame todas las apariciones de 'hello'" y obtener resultados en milisegundos.

## ✅ Validación
**El usuario debe:**
- Correr el script y verificar que procesa videos sin errores.
- Hacer consultas de prueba a la base y ver que hay ocurrencias relevantes.
- Confirmar que los timestamps parecen correctos (pueden revisarse viendo el video y saltando al timestamp).

---

# FASE 9 — YouGlish personal: interfaz de curación de clips y extracción de audio

## Objetivo
Desde la app, para cada palabra capturada, mostrar una galería de clips de YouTube donde un nativo la dice, permitir al usuario escuchar cada uno, **decidir manualmente** cuál aceptar, y extraer el audio cortado guardándolo con el nombre de la palabra en la biblioteca personal de audios.

## Instrucciones

1. **Pantalla "Procesar sesión":**
   - Después de terminar una sesión de lectura, el usuario entra a esta pantalla.
   - Se procesa **una palabra a la vez** (flujo guiado, no tablero masivo).
   - Barra de progreso: "Palabra 3 de 15".
   - Botones: "Palabra anterior", "Siguiente palabra", "Saltar esta palabra".

2. **Panel superior — contexto de la palabra:**
   - Muestra la palabra en grande.
   - La frase del libro donde apareció.
   - Etiquetas aplicadas (`[MNEMO]`, etc.).
   - Traducción (si ya se procesó con IA) o botón para consultar diccionario rápido.

3. **Panel inferior — galería de clips:**
   - Consulta la base de datos local de YouGlish personal.
   - Muestra los **5-10 mejores clips** donde aparece la palabra (ordenados por calidad/confidence de WhisperX).
   - Cada clip se presenta como una tarjeta con:
     - Título del video y canal.
     - Frase completa donde aparece la palabra (con la palabra destacada).
     - Botón grande de **"▶️ Escuchar"** que reproduce el fragmento directamente (sin salir de la app).
     - Botón "Ver en YouTube" para ver el video completo en contexto si el usuario quiere.
   - Navegación: si hay más de 10 clips, paginación o "Ver más".

4. **Reutilización automática de la biblioteca de audios:**
   - Antes de mostrar la galería, la app consulta si ya existe un audio guardado para esa palabra en la biblioteca personal (`data/media/word_audio_library/`).
   - Si existe, se muestra primero con un badge: **"⭐ Audio guardado anteriormente"** junto con la fecha en que lo guardaste y de qué libro venía.
   - El usuario puede:
     - **Usar el audio existente** (un clic y listo, pasa a la siguiente palabra).
     - **Reemplazar** por uno nuevo de la galería.
     - **Mantener ambos** (conserva el antiguo y agrega uno nuevo, útil si te gustan los dos).

5. **Flujo de decisión por clip:**
   - Al hacer clic en "Escuchar", se reproduce el audio nativo en dos versiones:
     - Primero la **frase completa** (~3-5 s) con la palabra en contexto.
     - Luego la **palabra aislada** (~400 ms) cortada quirúrgicamente.
   - Debajo del clip, tres botones de decisión:
     - **✅ Guardar este audio** — se acepta, se procesa y pasa a la siguiente palabra.
     - **⏭️ Siguiente clip** — no me gusta este, muéstrame otro.
     - **🚫 Sin audio para esta palabra** — ninguno sirve, sigue sin audio nativo.

6. **Extracción y guardado del audio:**
   - Al aceptar un clip, el backend hace:
     - Descarga el audio del video de YouTube con yt-dlp (solo el fragmento necesario).
     - Corta con FFmpeg usando los timestamps precisos de WhisperX.
     - Produce dos archivos MP3:
       - `{palabra}.mp3` — palabra aislada (~400 ms).
       - `{palabra}_phrase.mp3` — frase completa (~3-5 s).
     - Los guarda en la biblioteca personal de audios: `data/media/word_audio_library/{primera_letra}/{palabra}.mp3`.
     - Ejemplo: `data/media/word_audio_library/g/gleaming.mp3` y `data/media/word_audio_library/g/gleaming_phrase.mp3`.
   - La organización por letra evita tener miles de archivos en una sola carpeta.

7. **Confirmación visual:**
   - Al guardar el audio, animación breve (check verde, sonido sutil).
   - Notificación: "Audio de 'gleaming' guardado en tu biblioteca".
   - Automáticamente avanza a la siguiente palabra.

8. **Biblioteca de audios — vista aparte:**
   - Sección en la app llamada "Mis audios" o "Biblioteca de pronunciaciones".
   - Lista alfabética de todas las palabras con audio guardado.
   - Permite: escuchar, eliminar, reemplazar, buscar una palabra específica.
   - Estadísticas: "Tienes 234 palabras con audio nativo guardado".
   - Posibilidad de **exportar toda la biblioteca** como zip para backup o transferencia a otra computadora.

9. **Conflictos y duplicados de audio:**
   - Si al procesar una palabra ya existe su audio, la app **nunca lo sobrescribe silenciosamente**.
   - Siempre pregunta o usa el existente por defecto.
   - El usuario controla si quiere reemplazar, mantener ambos, o dejar el anterior.

10. **Integración con el flujo de Anki:**
    - Cuando se genera el APKG en la Fase 7 (o cuando se envía a AnkiConnect en la Fase 11), la app busca automáticamente el audio de cada palabra en la biblioteca.
    - Si existe audio, se incluye en la tarjeta (ambas versiones: palabra aislada y frase).
    - Si no existe, la tarjeta se genera sin audio nativo (solo con traducción, contexto, etc.).
    - En la Fase 10 se agrega el tercer audio (grabación propia).

## Entregable
- Al terminar una sesión, veo pantalla de procesamiento palabra por palabra.
- Para cada palabra, veo galería de clips donde un nativo la dice.
- Puedo escuchar cada clip y decidir si lo acepto, pruebo otro, o la dejo sin audio.
- Los audios aceptados se guardan con el nombre de la palabra (`gleaming.mp3`).
- Si la misma palabra reaparece después, la app me ofrece usar el audio ya guardado.
- Puedo ver mi biblioteca de audios en una sección dedicada.
- Al generar el APKG, los audios correctos se incluyen automáticamente en las tarjetas.

## ✅ Validación
**El usuario debe:**
- Procesar una sesión completa con 10-15 palabras.
- Confirmar que la galería de clips es útil y fácil de navegar.
- Para cada palabra: escuchar al menos 2-3 clips antes de decidir.
- Verificar que los audios cortados son precisos (palabra aislada bien cortada, frase con contexto correcto).
- Reprocesar una palabra que ya fue capturada antes y confirmar que la app ofrece el audio existente.
- Revisar la biblioteca de audios y verificar que está bien organizada.
- Generar APKG e importar en Anki; confirmar que las tarjetas tienen el audio correcto de cada palabra.

---

# FASE 10 — Grabación de voz propia

## Objetivo
Poder grabar mi propia pronunciación con alta calidad y que se integre como un tercer audio en las tarjetas de Anki, junto a los dos audios nativos (palabra aislada y frase completa).

## Instrucciones

1. **Componente de grabación:**
   - Botón grande de micrófono visible en la vista de una palabra.
   - Al hacer clic, pide permiso de micrófono (solo la primera vez, después recuerda la autorización).
   - Al grabar, muestra visualización de forma de onda en tiempo real (con wavesurfer.js o canvas).
   - Botones claros: **Detener**, **Reproducir**, **Regrabar**, **Aceptar**, **Descartar**.
   - Indicador visual de "grabando" (círculo rojo pulsante).
   - Contador de segundos de la grabación.

2. **Calidad de grabación:**
   - Formato: MP3 a 128 kbps (buen balance entre calidad y tamaño).
   - Mono (suficiente para voz).
   - 44.1 kHz o 22 kHz (según preferencia de calidad).
   - Recorte automático de silencios al inicio y al final (para que no haya medio segundo en silencio antes de tu voz).
   - Normalización de volumen opcional.

3. **Modo shadowing (muy importante):**
   - Modo especial donde se sigue este flujo automatizado:
     - Se reproduce automáticamente la **palabra aislada nativa** (Audio 1) 2 veces.
     - Se reproduce automáticamente la **frase completa nativa** (Audio 2) 1 vez.
     - Inmediatamente después, se activa automáticamente la grabación del usuario.
     - El usuario dice la palabra y/o la frase.
     - Al detener, se puede escuchar secuencialmente: nativo → tu voz → nativo → tu voz para comparar.
   - Este modo es **configurable**: se puede desactivar si prefieres grabar directamente sin prompt.

4. **Múltiples grabaciones por palabra:**
   - Al principio solo se guarda una grabación (la última aceptada).
   - Opcionalmente, el usuario puede activar "conservar historial" para ver su progreso de pronunciación con el tiempo.
   - La versión "activa" es la que va al APKG.

5. **Guardado:**
   - El audio grabado se guarda en `data/media/recordings/` con un nombre único que incluye la palabra y timestamp.
   - La ruta se registra en el campo `user_recording_path` de la palabra capturada.
   - Los archivos antiguos descartados se borran automáticamente (o se conservan si el usuario activa historial).

6. **Integración con APKG y con Anki:**
   - Al generar el archivo de Anki, el audio personal se incluye como **tercer campo de audio** de la tarjeta (junto a Audio 1 nativo palabra aislada y Audio 2 nativo frase completa).
   - En la tarjeta final de Anki, los tres audios son reproducibles independientemente:
     - Botón "🔊 Palabra (nativo)".
     - Botón "🔊 Frase (nativo)".
     - Botón "🎤 Mi voz".
   - El template de la tarjeta muestra los tres botones claramente diferenciados.

7. **Atajos de teclado:**
   - `R`: iniciar/detener grabación.
   - `Espacio`: reproducir la grabación actual.
   - `Enter`: aceptar la grabación actual.
   - `Esc`: descartar la grabación actual.

8. **Permisos y manejo de errores:**
   - Si el usuario niega permiso de micrófono, mostrar instrucciones claras de cómo otorgarlo.
   - Si el micrófono no funciona, sugerir probar otro dispositivo de entrada.
   - Detectar si el volumen grabado es demasiado bajo y avisar al usuario.

## Entregable
- Puedo grabar mi pronunciación con un clic o con la tecla `R`.
- Puedo escuchar, regrabar tantas veces como quiera.
- El modo shadowing me ayuda a practicar escuchando primero al nativo y luego grabándome.
- El audio queda incluido en el APKG como tercer audio de la tarjeta.
- En Anki veo los tres audios bien diferenciados y reproducibles.

## ✅ Validación
**El usuario debe:**
- Grabar al menos 10 palabras diferentes.
- Confirmar que la calidad del audio es aceptable (sin distorsión, buen volumen).
- Probar el modo shadowing y confirmar que facilita la práctica.
- Verificar en Anki que los tres audios (palabra nativa, frase nativa, voz propia) funcionan independientemente.
- Confirmar que puede autocorregirse comparando su voz con la del nativo.

---

# FASE 11 — Pulido, anti-duplicados y uso diario

## Objetivo
Convertir la app en una herramienta que se usa todos los días sin fricción.

## Instrucciones

1. **Detección de duplicados:**
   - Al guardar una palabra, consultar la tabla `anki_exports`.
   - Si ya existe, mostrar aviso: "Ya tienes esta palabra. ¿Quieres saltarla, enriquecer la existente con el nuevo contexto, reemplazarla, o crear una nueva entrada?"
   - Ofrecer estas cuatro opciones claramente.

2. **AnkiConnect opcional:**
   - Al abrir la app, detectar si AnkiConnect está disponible en localhost:8765.
   - Si sí, ofrecer opción "Enviar directo a Anki" en lugar de descargar APKG.
   - Si no, usar APKG como antes sin mencionar nada.

3. **Lematización para duplicados inteligentes:**
   - Integrar spaCy en inglés para obtener el lema de cada palabra.
   - Al detectar duplicados, comparar lemas, no solo forma exacta.
   - "running" y "ran" se detectan como misma palabra que "run".

4. **Atajos de teclado:**
   - `Espacio`: siguiente página.
   - `S`: guardar palabra seleccionada.
   - `M`: marcar con MNEMO.
   - `D`: mostrar definición rápida.
   - `Ctrl/Cmd + D`: cambiar tema.
   - `Ctrl/Cmd + E`: exportar sesión.
   - `Esc`: cerrar popups.

5. **Estadísticas personales:**
   - Dashboard simple con: palabras aprendidas total, palabras por semana, libros leídos, sesiones completadas.
   - Gráfica de progreso en el tiempo.

6. **Backup y restauración:**
   - Botón para exportar toda la base de datos (archivo SQLite).
   - Botón para importar un backup.
   - Útil si cambia de computadora.

7. **Manejo de errores bonito:**
   - Mensajes claros cuando algo falla (no mostrar stack traces técnicos).
   - Reintentos automáticos para operaciones de red.
   - Indicadores de carga visibles en operaciones largas.

8. **Documentación personal:**
   - README actualizado con cómo usa el usuario la app en su día a día.
   - Tips personales, atajos, configuración ideal.

## Entregable
- La app está lista para uso diario.
- Los errores están manejados.
- Las estadísticas motivan.
- Los duplicados se detectan inteligentemente.

## ✅ Validación
**El usuario debe usar la app durante 1-2 semanas en su proceso de aprendizaje real y confirmar:**
- Es agradable de usar.
- No hay bugs frustrantes.
- Mejora su experiencia de aprender inglés.
- Si cumple esto, el MVP está completo y se puede considerar sacarla al público.

---

# FASE 12 — Empaquetado como app de escritorio instalable

## Objetivo
Convertir el proyecto (frontend + backend + dependencias) en un **instalador único** que cualquier persona (incluido el usuario mismo) pueda instalar con doble clic y usar como una aplicación normal, sin tocar terminal.

## Instrucciones

1. **Elección de tecnología de empaquetado:**
   - Opción recomendada: **Tauri** (moderno, instaladores ligeros de ~30-50 MB base).
   - Opción alternativa: **Electron** (más pesado pero más maduro, ~150-200 MB base).
   - La decisión se toma al inicio de esta fase según lo que esté mejor soportado en ese momento.

2. **Incluir Python embebido en el paquete:**
   - La app incluye su propia versión portable de Python (no requiere que el usuario lo tenga instalado).
   - El backend de FastAPI arranca automáticamente en segundo plano cuando se abre la app.
   - El puerto se elige dinámicamente para evitar conflictos con otros programas.

3. **Incluir dependencias externas en el paquete:**
   - **FFmpeg:** binario incluido dentro del instalador. La app sabe dónde está y lo llama internamente.
   - **yt-dlp:** incluido como binario o instalado en el Python empaquetado.
   - **WhisperX y modelos:** incluidos o descargados la primera vez que se necesiten.
   - El usuario no instala nada aparte del instalador principal.

4. **Ciclo de vida de la app:**
   - Al abrir: backend arranca, frontend se conecta, ventana se muestra.
   - Al cerrar la ventana: backend se cierra limpiamente.
   - Al reabrir: todo vuelve a arrancar rápidamente (base de datos y archivos persisten).

5. **Ubicación de datos:**
   - Los datos del usuario (libros, sesiones, base de datos, grabaciones, audios) se guardan en carpetas estándar del sistema:
     - **Windows:** `%APPDATA%\LinguaReader\`
     - **macOS:** `~/Library/Application Support/LinguaReader/`
     - **Linux:** `~/.local/share/LinguaReader/`
   - Esto asegura que los datos persistan entre actualizaciones de la app.

6. **Asociación de archivos con el sistema operativo:**
   - Durante la instalación, la app se registra como manejador de archivos PDF y EPUB.
   - **Windows:** agregar entradas al registro para que LinguaReader aparezca en "Abrir con" para archivos `.pdf` y `.epub`.
   - **macOS:** declarar los tipos de archivo (UTI) en el `Info.plist` para que el sistema ofrezca LinguaReader como opción.
   - **Linux:** crear archivos `.desktop` con las asociaciones MIME correctas.
   - **No** hacer LinguaReader el lector predeterminado automáticamente (respeta la elección del usuario).
   - Solo agregar la opción a la lista de "Abrir con" disponibles.

7. **Manejo del archivo al abrir desde el sistema:**
   - Cuando el usuario hace clic derecho en un PDF → "Abrir con" → LinguaReader:
     - Si la app no está abierta: arranca y abre ese archivo directamente en modo lectura.
     - Si la app ya está abierta: abre el archivo en una nueva pestaña o reemplaza el libro actual (según preferencia del usuario).
   - El archivo se copia automáticamente a la carpeta de datos si aún no está ahí.
   - Se crea automáticamente una nueva sesión de lectura.

8. **Arrastrar y soltar:**
   - La ventana de la app acepta archivos arrastrados desde el explorador.
   - Al soltar un PDF/EPUB sobre la ventana, se procesa igual que si se hubiera abierto desde el sistema.
   - Funciona incluso si el archivo no está en las ubicaciones estándar.

9. **Construcción de instaladores:**
   - **Prioridad 1 - Windows:** `LinguaReader-Setup.exe` con NSIS o WiX (MSI).
   - Prioridad 2 (opcional, solo si se decide expandir):
     - `LinguaReader.dmg` para macOS.
     - `LinguaReader.AppImage` para Linux.
   - Los instaladores se generan localmente con un comando.
   - Opcional: firmar los binarios para evitar advertencias de Windows SmartScreen.

10. **Icono y branding:**
    - Diseñar o elegir un icono simple y reconocible.
    - Nombre del producto, versión, autor en los metadatos del instalador.
    - El icono aparece en: menú de aplicaciones, barra de tareas, lista de "Abrir con", y como icono superpuesto en archivos PDF/EPUB asociados (opcional).

11. **Primera ejecución:**
    - Al abrir por primera vez, la app muestra un onboarding básico:
      - Explicación del flujo: leer → subrayar → exportar → pegar en IA → importar → generar Anki.
      - Opción de cargar el corpus inicial de videos de YouGlish personal (descarga en segundo plano).
      - Configuración de tema preferido.
      - **Confirmación opcional:** "¿Quieres que LinguaReader aparezca como opción al abrir archivos PDF? (sí/no)".

12. **Actualizaciones (opcional v2):**
    - Si más adelante se publica una versión nueva, la app puede verificar si hay actualizaciones.
    - Por ahora, actualizar es manual: descargar el nuevo instalador y reemplazar.

13. **Distribución personal:**
    - El instalador se guarda en una carpeta del usuario o en un servicio de almacenamiento personal (Dropbox, Google Drive, Mega).
    - Si en el futuro se saca al público, el instalador se publicaría en GitHub Releases o una página dedicada.

## Entregable
- **Un archivo instalador `.exe`, `.dmg` o `.AppImage`** según el sistema operativo.
- Al hacer doble clic, se instala la app normalmente.
- Después de instalar, la app aparece en el menú de aplicaciones.
- Al abrirla, funciona completa sin necesidad de terminal.
- Los datos persisten entre sesiones.
- **Al hacer clic derecho en cualquier PDF o EPUB, aparece "LinguaReader" en la opción "Abrir con".**
- **Al arrastrar un PDF/EPUB sobre la ventana de la app, se abre directamente en modo lectura.**
- Si se desinstala, se pueden conservar los datos (o eliminarse según preferencia).

## ✅ Validación
**El usuario debe:**
- Generar el instalador para su sistema operativo.
- Desinstalar cualquier versión de desarrollo previa.
- Instalar con el instalador generado.
- Confirmar que todas las funciones siguen operando (lectura, subrayado, exportación, YouGlish, grabación, Anki).
- Reiniciar la computadora y abrir la app de nuevo; verificar que todo arranca sin problemas.
- **Hacer clic derecho en un PDF de prueba → confirmar que LinguaReader aparece en "Abrir con".**
- **Abrir un PDF desde el explorador con LinguaReader y confirmar que se abre en modo lectura directamente.**
- **Arrastrar un PDF sobre la ventana y confirmar que se carga.**
- Hacer un backup manual de los datos para asegurarse de que se pueden recuperar.

**Este es el entregable final del proyecto.** Después de esta fase, la app está lista para uso diario indefinido sin tocar código.

---

1. **Una fase a la vez.** No avanzar sin que el usuario valide.
2. **Preguntar antes de decisiones de diseño.** Cuando haya varias formas de hacer algo, consultar.
3. **Mostrar capturas o demos al final de cada fase.** El usuario debe ver el resultado antes de aprobar.
4. **No optimizar prematuramente.** Primero que funcione, después que sea rápido.
5. **Mantener el código simple.** Esto es una app personal, no un sistema empresarial.
6. **Documentar decisiones no obvias.** Para que en 3 meses se entienda por qué se hizo X.
7. **Tests mínimos pero críticos.** Parser de respuestas de IA, generador de APKG, y extracción de audio deben tener tests.
8. **Git commits frecuentes.** Un commit por tarea dentro de cada fase.

---

## 🗺️ Ruta completa

```
Fase 0 → Setup                          [3-5 días]
   ↓ validación
Fase 1 → Lector PDF                     [1-2 semanas]
   ↓ validación
Fase 2 → Temas visuales                 [3-5 días]    ← claro, oscuro, sepia
   ↓ validación
Fase 3 → Subrayado inteligente          [1-2 semanas]  ← núcleo del valor
   ↓ validación
Fase 4 → Soporte EPUB                   [3-5 días]
   ↓ validación
Fase 5 → Diccionario gratuito           [3-5 días]
   ↓ validación
Fase 6 → Exportación MD con prompt      [3-5 días]
   ↓ validación
Fase 7 → Importar IA + APKG             [1 semana]    ← ciclo completo
   ↓ validación
Fase 8 → Corpus YouGlish personal       [1-2 semanas]
   ↓ validación
Fase 9 → Interfaz YouGlish + corte      [1 semana]
   ↓ validación
Fase 10 → Grabación propia              [3-5 días]
   ↓ validación
Fase 11 → Pulido y uso diario           [1-2 semanas]
   ↓ validación
Fase 12 → Empaquetado como app          [1-2 semanas] ← instalador final
```

**Tiempo total estimado:** 3 - 5 meses a tiempo parcial.

**Entregable al final de la Fase 12:** instalador `.exe` / `.dmg` / `.AppImage` listo para usar como app normal, sin terminal.

---

## 🎯 Estado

- [x] Plan aprobado
- [ ] Fase 0 completada
- [ ] Fase 1 completada
- [ ] Fase 2 completada
- [ ] Fase 3 completada
- [ ] Fase 4 completada
- [ ] Fase 5 completada
- [ ] Fase 6 completada
- [ ] Fase 7 completada
- [ ] Fase 8 completada
- [ ] Fase 9 completada
- [ ] Fase 10 completada
- [ ] Fase 11 completada
- [ ] **Fase 12 completada → app instalable lista**

**Próximo paso:** iniciar Fase 0.