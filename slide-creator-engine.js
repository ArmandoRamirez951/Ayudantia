/**
 * slide-creator-engine.js
 * ============================================================================
 * Capa de Lógica de Negocio separada de los componentes visuales:
 *  1. SlideCreationStateMachine : Máquina de estados explícita
 *     (idle, form, loading_mind, review_mind, loading_animation,
 *      select_animation, implementing, completed)
 *  2. SlideAnalyzerEngine       : Analizador local de diapositivas (análisis
 *     visual por Canvas + OCR local opcional + extracción semántica del tema)
 *  3. SlideAnimationGenerator   : Motor generador de escenas 3D A-Frame con
 *     múltiples arquitecturas visuales adaptadas al contenido confirmado.
 * ============================================================================
 */
(function (global) {
    'use strict';

    // =========================================================================
    // 1. MÁQUINA DE ESTADOS EXPLÍCITA (SlideCreationStateMachine)
    // =========================================================================
    const STATES = Object.freeze({
        IDLE: 'idle',
        FORM: 'form',
        LOADING_MIND: 'loading_mind',
        REVIEW_MIND: 'review_mind',
        LOADING_ANIMATION: 'loading_animation',
        SELECT_ANIMATION: 'select_animation',
        IMPLEMENTING: 'implementing',
        COMPLETED: 'completed'
    });

    const ALLOWED_TRANSITIONS = Object.freeze({
        idle: ['form'],
        form: ['loading_mind', 'idle'],
        loading_mind: ['review_mind', 'form', 'idle'],
        review_mind: ['loading_animation', 'idle'],
        loading_animation: ['select_animation', 'review_mind', 'idle'],
        select_animation: ['loading_animation', 'implementing', 'idle'],
        implementing: ['completed', 'select_animation', 'idle'],
        completed: ['idle']
    });

    function crearContextoInicial() {
        return {
            runId: 0,
            nombrePresentacion: '',
            nombreDiapositiva: '',
            archivoFoto: null,
            fotoDataUrl: '',
            mindFile: null,
            nombreArchivoMind: '',
            analisisSistema: '',
            descripcionEditableSugerida: '',
            descripcionConfirmada: '',
            temaDetectado: '',
            conceptosClave: [],
            pasosFlujo: [],
            metricasVisuales: null,
            codigoAnimacionGenerado: '',
            varianteIndex: 0,
            nombreVarianteActual: '',
            registroGuardado: null,
            errorActual: null
        };
    }

    class SlideCreationStateMachine {
        constructor() {
            this.currentState = STATES.IDLE;
            this.context = crearContextoInicial();
            this.listeners = [];
        }

        getStates() {
            return STATES;
        }

        getState() {
            return this.currentState;
        }

        getContext() {
            return this.context;
        }

        updateContext(partial) {
            if (partial && typeof partial === 'object') {
                Object.assign(this.context, partial);
            }
            return this.context;
        }

        canTransitionTo(nextState) {
            const allowed = ALLOWED_TRANSITIONS[this.currentState] || [];
            return allowed.includes(nextState);
        }

        transitionTo(nextState, payload = {}) {
            if (!this.canTransitionTo(nextState)) {
                console.warn(
                    `[StateMachine] Transición bloqueada: ${this.currentState} -> ${nextState}`
                );
                return false;
            }
            const previousState = this.currentState;
            this.updateContext(payload);
            this.currentState = nextState;

            this.listeners.forEach((fn) => {
                try {
                    fn(this.currentState, previousState, this.context);
                } catch (err) {
                    console.error('[StateMachine] Error en listener:', err);
                }
            });
            return true;
        }

        reset() {
            const nextRunId = (this.context.runId || 0) + 1;
            const prevState = this.currentState;
            this.context = crearContextoInicial();
            this.context.runId = nextRunId;
            this.currentState = STATES.IDLE;

            this.listeners.forEach((fn) => {
                try {
                    fn(this.currentState, prevState, this.context);
                } catch (err) {
                    console.error('[StateMachine] Error en listener durante reset:', err);
                }
            });
            return true;
        }

        onStateChange(listener) {
            if (typeof listener === 'function') {
                this.listeners.push(listener);
            }
        }
    }

    // =========================================================================
    // 2. ANALIZADOR LOCAL DE DIAPOSITIVAS (SlideAnalyzerEngine)
    // =========================================================================
    const DOMINIOS_TEMATICOS = [
        {
            id: 'investigacion',
            nombre: 'Metodología de la Investigación y Ciencia',
            keywords: [
                'metodologia', 'investigacion', 'cientifico', 'ciencia', 'hipotesis',
                'experimento', 'observacion', 'metodo', 'estudio', 'analisis',
                'teoria', 'muestra', 'cualitativa', 'cuantitativa', 'exploratoria',
                'descriptiva', 'laboratorio', 'evidencia', 'fundamentos'
            ],
            conceptosDefault: ['Ciencia', 'Rigor', 'Evidencia', 'Descubrimiento'],
            pasosDefault: ['1. Observar', '2. Hipotesis', '3. Experimento', '4. Conclusion'],
            proposito: 'Exponer los fundamentos metodológicos, etapas de validación científica y análisis estructurado de evidencia.'
        },
        {
            id: 'sistemas',
            nombre: 'Sistemas de Información, Software y Tecnología',
            keywords: [
                'sistema', 'sistemas', 'software', 'programacion', 'datos', 'base',
                'red', 'redes', 'arquitectura', 'codigo', 'algoritmo', 'computacion',
                'informatica', 'digital', 'servidor', 'nube', 'seguridad', 'tecnologia',
                'web', 'aplicacion', 'desarrollo', 'ia', 'virtual', 'realidad'
            ],
            conceptosDefault: ['Arquitectura', 'Procesamiento', 'Datos', 'Innovacion'],
            pasosDefault: ['1. Entrada', '2. Proceso', '3. Almacen', '4. Salida'],
            proposito: 'Representar la arquitectura tecnológica, flujo de procesamiento de información e integración de componentes del sistema.'
        },
        {
            id: 'finanzas',
            nombre: 'Contabilidad, Finanzas y Análisis Económico',
            keywords: [
                'contabilidad', 'contaduria', 'finanzas', 'financiero', 'costo', 'costos',
                'presupuesto', 'balance', 'activo', 'pasivo', 'capital', 'impuesto',
                'fiscal', 'auditoria', 'economia', 'inversion', 'rentabilidad', 'ingresos',
                'estados', 'flujo', 'efectivo', 'mercado', 'credito'
            ],
            conceptosDefault: ['Balance', 'Rentabilidad', 'Liquidez', 'Patrimonio'],
            pasosDefault: ['1. Registro', '2. Clasificar', '3. Balance', '4. Reporte'],
            proposito: 'Presentar indicadores contables, equilibrio financiero, interpretación de estados y toma de decisiones económicas.'
        },
        {
            id: 'administracion',
            nombre: 'Administración, Gestión y Estrategia Organizacional',
            keywords: [
                'administracion', 'gestion', 'empresa', 'organizacion', 'estrategia',
                'planeacion', 'liderazgo', 'recursos', 'humanos', 'operaciones',
                'calidad', 'proceso', 'procesos', 'proyecto', 'objetivos', 'metas',
                'direccion', 'control', 'marketing', 'mercadotecnia', 'negocios'
            ],
            conceptosDefault: ['Planeacion', 'Organizacion', 'Direccion', 'Control'],
            pasosDefault: ['1. Planear', '2. Organizar', '3. Dirigir', '4. Controlar'],
            proposito: 'Ilustrar el proceso administrativo, coordinación estratégica de recursos y cumplimiento de objetivos organizacionales.'
        },
        {
            id: 'estadistica',
            nombre: 'Estadística, Métricas y Visualización de Datos',
            keywords: [
                'estadistica', 'grafica', 'metricas', 'probabilidad', 'tendencia',
                'indicadores', 'kpi', 'resultados', 'encuesta', 'poblacion',
                'frecuencia', 'media', 'varianza', 'correlacion', 'proyeccion',
                'evaluacion', 'medicion', 'reporte'
            ],
            conceptosDefault: ['Muestreo', 'Tendencia', 'Metricas', 'Proyeccion'],
            pasosDefault: ['1. Recolectar', '2. Procesar', '3. Graficar', '4. Interpretar'],
            proposito: 'Analizar el comportamiento cuantitativo de los datos, tendencias comparativas y métricas clave de desempeño.'
        }
    ];

    function normalizarASCII(str) {
        return String(str || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\x20-\x7E\n]/g, '')
            .trim();
    }

    function normalizarMinusculas(str) {
        return normalizarASCII(str).toLowerCase();
    }

    // Analiza visualmente los píxeles de la imagen de la diapositiva en un Canvas 2D
    function analizarEstructuraVisualCanvas(imgObj) {
        const w = 320;
        const h = 180;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgObj, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;

        let sumLum = 0;
        let sumEdgesHeader = 0;
        let sumEdgesBodyLeft = 0;
        let sumEdgesBodyRight = 0;
        let colorfulPixels = 0;

        const lum = new Float32Array(w * h);
        for (let i = 0; i < w * h; i++) {
            const r = data[i * 4];
            const g = data[i * 4 + 1];
            const b = data[i * 4 + 2];
            const l = 0.299 * r + 0.587 * g + 0.114 * b;
            lum[i] = l;
            sumLum += l;

            const maxC = Math.max(r, g, b);
            const minC = Math.min(r, g, b);
            if (maxC - minC > 45) {
                colorfulPixels++;
            }
        }

        // Medir densidad de bordes (texto y gráficos) por zonas de la diapositiva
        for (let y = 2; y < h - 2; y++) {
            for (let x = 2; x < w - 2; x++) {
                const idx = y * w + x;
                const gx = Math.abs(lum[idx + 1] - lum[idx - 1]);
                const gy = Math.abs(lum[idx + w] - lum[idx - w]);
                const grad = gx + gy;
                if (grad > 38) {
                    if (y < h * 0.28) {
                        sumEdgesHeader++;
                    } else if (x < w * 0.5) {
                        sumEdgesBodyLeft++;
                    } else {
                        sumEdgesBodyRight++;
                    }
                }
            }
        }

        const avgLum = sumLum / (w * h);
        const ratioColor = colorfulPixels / (w * h);
        const fondoTipo = avgLum > 145 ? 'fondo claro institucional' : 'fondo oscuro / alto contraste';

        const elementosDetectados = [];
        if (sumEdgesHeader > 250) {
            elementosDetectados.push('encabezado o título principal destacado en la franja superior');
        }
        if (sumEdgesBodyLeft > 400 && sumEdgesBodyRight > 400) {
            elementosDetectados.push('distribución en dos columnas con bloques conceptuales y elementos gráficos');
        } else if (sumEdgesBodyLeft + sumEdgesBodyRight > 500) {
            elementosDetectados.push('bloque central con puntos clave y estructura jerárquica');
        }
        if (ratioColor > 0.16) {
            elementosDetectados.push('esquemas, iconos o diagramas cromáticos de apoyo visual');
        } else {
            elementosDetectados.push('estructura tipográfica formal de síntesis académica');
        }

        return {
            anchoOriginal: imgObj.naturalWidth || imgObj.width || 1280,
            altoOriginal: imgObj.naturalHeight || imgObj.height || 720,
            fondoTipo,
            ratioColor: Math.round(ratioColor * 100),
            elementosDetectados
        };
    }

    // Intenta extraer texto de la imagen con OCR en navegador (con timeout seguro de 3.8s para nunca bloquear)
    async function intentarOCRLocalRapido(imgSrc) {
        if (!global.Tesseract || typeof global.Tesseract.recognize !== 'function') {
            return '';
        }
        try {
            const ocrPromise = global.Tesseract.recognize(imgSrc, 'spa+eng');
            const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 3800));
            const result = await Promise.race([ocrPromise, timeoutPromise]);
            if (result && result.data && result.data.text) {
                return String(result.data.text).trim();
            }
        } catch (e) {
            // Continuar con análisis semántico y visual local
        }
        return '';
    }

    function detectarDominioTematico(textoCombinado) {
        const clean = normalizarMinusculas(textoCombinado);
        let mejorDominio = null;
        let maxScore = 0;

        for (const dom of DOMINIOS_TEMATICOS) {
            let score = 0;
            for (const kw of dom.keywords) {
                if (clean.includes(kw)) {
                    score += kw.length >= 7 ? 3 : 2;
                }
            }
            if (score > maxScore) {
                maxScore = score;
                mejorDominio = dom;
            }
        }

        if (!mejorDominio) {
            return {
                id: 'academico',
                nombre: 'Presentación Académica y Desarrollo Conceptual (UABC)',
                conceptosDefault: ['Analisis', 'Conceptos', 'Aplicacion', 'Sintesis'],
                pasosDefault: ['1. Introduccion', '2. Desarrollo', '3. Analisis', '4. Conclusion'],
                proposito: 'Presentar de manera estructurada los conceptos clave de la unidad académica y facilitar su comprensión visual en 3D.'
            };
        }
        return mejorDominio;
    }

    function extraerConceptosClaveDeTexto(nombrePres, nombreDiap, textoExtra, dominio) {
        const stopwords = new Set([
            'para', 'como', 'este', 'esta', 'estos', 'estas', 'sobre', 'entre',
            'desde', 'hasta', 'donde', 'cuando', 'porque', 'unidad', 'tema',
            'diapositiva', 'presentacion', 'clase', 'INTRODUCCION', 'parte',
            'con', 'del', 'las', 'los', 'una', 'uno', 'unos', 'unas', 'por', 'que'
        ]);

        const fuente = `${nombreDiap} ${nombrePres} ${textoExtra || ''}`;
        const palabras = normalizarASCII(fuente)
            .replace(/[^a-zA-Z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length >= 4 && !stopwords.has(w.toLowerCase()));

        const unicas = [];
        for (const p of palabras) {
            const cap = p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
            if (!unicas.some((u) => u.toLowerCase() === cap.toLowerCase())) {
                unicas.push(cap);
            }
            if (unicas.length >= 4) break;
        }

        while (unicas.length < 4) {
            const fallback = dominio.conceptosDefault[unicas.length] || 'Conocimiento';
            if (!unicas.includes(fallback)) {
                unicas.push(fallback);
            } else {
                unicas.push('Sintesis');
            }
        }
        return unicas.slice(0, 4);
    }

    class SlideAnalyzerEngine {
        static async analizarDiapositiva(archivoFoto, nombrePresentacion, nombreDiapositiva) {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = function (ev) {
                    const dataUrl = ev.target.result;
                    const img = new Image();
                    img.onload = async function () {
                        const metricas = analizarEstructuraVisualCanvas(img);
                        const textoOCR = await intentarOCRLocalRapido(dataUrl);
                        const nombreArchivo = archivoFoto && archivoFoto.name ? archivoFoto.name.replace(/\.[^.]+$/, '') : '';

                        const textoBase = `${nombrePresentacion} ${nombreDiapositiva} ${nombreArchivo} ${textoOCR}`;
                        const dominio = detectarDominioTematico(textoBase);
                        const conceptosClave = extraerConceptosClaveDeTexto(
                            nombrePresentacion,
                            nombreDiapositiva,
                            textoOCR,
                            dominio
                        );

                        const estructuraTexto = metricas.elementosDetectados.join(', ');
                        const lineasOCR = textoOCR
                            ? textoOCR.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 3).slice(0, 4)
                            : [];

                        const bloqueOCR = lineasOCR.length > 0
                            ? `\n• Texto detectado en la lámina: "${lineasOCR.join(' / ')}".`
                            : '';

                        const analisisSistema = [
                            `📌 Tema identificado: "${nombreDiapositiva}" dentro de la presentación "${nombrePresentacion}".`,
                            `🎓 Área temática clasificada: ${dominio.nombre}.`,
                            `🖼️ Análisis visual de la captura (${metricas.anchoOriginal}x${metricas.altoOriginal} px): Se detecta ${metricas.fondoTipo} con ${estructuraTexto}.${bloqueOCR}`,
                            `🔑 Conceptos centrales detectados: ${conceptosClave.join(' • ')}.`,
                            `🎯 Propósito de la diapositiva: ${dominio.proposito}`
                        ].join('\n');

                        const descripcionEditableSugerida = [
                            `Esta diapositiva aborda el tema "${nombreDiapositiva}" de la presentación "${nombrePresentacion}".`,
                            `Conceptos principales: ${conceptosClave.join(', ')}.`,
                            `${dominio.proposito}`
                        ].join('\n');

                        resolve({
                            fotoDataUrl: dataUrl,
                            analisisSistema,
                            descripcionEditableSugerida,
                            temaDetectado: dominio.nombre,
                            dominioId: dominio.id,
                            conceptosClave,
                            pasosFlujo: dominio.pasosDefault.slice(0, 4),
                            metricasVisuales: metricas
                        });
                    };
                    img.onerror = function () {
                        const dominio = detectarDominioTematico(`${nombrePresentacion} ${nombreDiapositiva}`);
                        const conceptosClave = dominio.conceptosDefault.slice(0, 4);
                        const analisisSistema = `📌 Tema identificado: "${nombreDiapositiva}" (${nombrePresentacion}).\n🎓 Área temática: ${dominio.nombre}.\n🔑 Conceptos clave: ${conceptosClave.join(' • ')}.\n🎯 Propósito: ${dominio.proposito}`;
                        const descripcionEditableSugerida = `Esta diapositiva trata sobre "${nombreDiapositiva}" (${nombrePresentacion}). Conceptos principales: ${conceptosClave.join(', ')}.`;
                        resolve({
                            fotoDataUrl: dataUrl || '',
                            analisisSistema,
                            descripcionEditableSugerida,
                            temaDetectado: dominio.nombre,
                            dominioId: dominio.id,
                            conceptosClave,
                            pasosFlujo: dominio.pasosDefault.slice(0, 4),
                            metricasVisuales: null
                        });
                    };
                    img.src = dataUrl;
                };
                reader.readAsDataURL(archivoFoto);
            });
        }
    }

    // =========================================================================
    // 3. MOTOR GENERADOR DE ANIMACIONES 3D A-FRAME (SlideAnimationGenerator)
    // =========================================================================
    function envolverLineasHUD(texto, maxCharsPorLinea, maxLineas) {
        const limpio = normalizarASCII(texto)
            .replace(/["'<>]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        if (!limpio) {
            return ['Presentacion Interactiva', 'Sistema de Realidad Aumentada', 'FCA - UABC'];
        }

        const palabras = limpio.split(' ');
        const lineas = [];
        let lineaActual = '';

        for (const palabra of palabras) {
            const candidato = lineaActual ? `${lineaActual} ${palabra}` : palabra;
            if (candidato.length <= maxCharsPorLinea) {
                lineaActual = candidato;
            } else {
                if (lineaActual) lineas.push(lineaActual);
                lineaActual = palabra.slice(0, maxCharsPorLinea);
                if (lineas.length >= maxLineas - 1) break;
            }
        }
        if (lineaActual && lineas.length < maxLineas) {
            lineas.push(lineaActual);
        }
        return lineas.slice(0, maxLineas);
    }

    function extraerDatosParaEscena3D(context, descripcionConfirmada) {
        const textoFinal = String(descripcionConfirmada || context.descripcionEditableSugerida || '').trim();
        const dominio = detectarDominioTematico(
            `${context.nombrePresentacion} ${context.nombreDiapositiva} ${textoFinal}`
        );

        const conceptos = extraerConceptosClaveDeTexto(
            context.nombrePresentacion,
            context.nombreDiapositiva,
            textoFinal,
            dominio
        );

        // Construir insignia superior con presentación y diapositiva
        const badgeRaw = normalizarASCII(`${context.nombreDiapositiva} - ${context.nombrePresentacion}`).toUpperCase();
        const badgeTexto = badgeRaw.length > 34 ? badgeRaw.slice(0, 34) : (badgeRaw || 'DIAPOSITIVA AR - UABC');

        // Construir las 3 líneas centrales del panel HUD a partir de lo que confirmó/escribió el programador
        let textoParaHUD = textoFinal;
        // Limpiar prefijos de metadatos si se conservó el texto del sistema sin cambios
        const lineasLimpias = textoParaHUD
            .split(/\r?\n/)
            .map((linea) =>
                linea
                    .replace(/^[📌🎓🖼️🔑🎯•\-\s]+/, '')
                    .replace(/^(Tema identificado|Area tematica clasificada|Área temática clasificada|Analisis visual de la captura[^:]*|Análisis visual de la captura[^:]*|Conceptos centrales detectados|Proposito de la diapositiva|Propósito de la diapositiva|Texto detectado en la lamina|Texto detectado en la lámina)\s*:\s*/i, '')
                    .trim()
            )
            .filter((l) => l.length > 4 && !/^\d+x\d+\s*px/i.test(l));

        const oracionesUtiles = (lineasLimpias.length > 0 ? lineasLimpias.join('. ') : textoParaHUD)
            .split(/[\n.]+/)
            .map((s) => s.trim())
            .filter((s) => s.length > 4 && !/^Se detecta fondo/i.test(s));

        const frasePrincipal = oracionesUtiles.length > 0
            ? oracionesUtiles.slice(0, 2).join(' - ')
            : `${context.nombreDiapositiva}: ${conceptos.join(', ')}`;

        const lineasHUD = envolverLineasHUD(frasePrincipal, 30, 3);
        const valorHUD = lineasHUD.join('\\n');
        const subtituloHUD = conceptos.slice(0, 4).join('  |  ');

        // Construir 4 pasos del diagrama de flujo 3D
        const pasos = dominio.pasosDefault.slice(0, 4);
        for (let i = 0; i < Math.min(4, conceptos.length); i++) {
            const c = normalizarASCII(conceptos[i]).slice(0, 11);
            if (c.length >= 3) {
                pasos[i] = `${i + 1}. ${c}`;
            }
        }

        return {
            badgeTexto,
            valorHUD,
            subtituloHUD,
            conceptos,
            pasos,
            dominio
        };
    }

    const VARIANTES_CATALOGO = [
        {
            id: 'laboratorio_holografico',
            nombre: 'Variante 1 • Laboratorio Holográfico, Investigador 3D y Diagrama de Flujo',
            descripcion: 'Incluye investigador 3D animado saludando, microscopio con escáner láser, doble hélice de ADN, gráfica 3D de barras, bombilla atómica, libro abierto, diagrama secuencial de 4 etapas y panel HUD a 60 FPS.'
        },
        {
            id: 'comando_cibernetico',
            nombre: 'Variante 2 • Centro de Comando Cibernético, Núcleo Orbital y Torres de Datos',
            descripcion: 'Incluye plataforma cibernética, núcleo icosaédrico con triple giroscopio orbital, 4 satélites conceptuales 360°, servidor holográfico con radar láser, flujo de 4 nodos y panel HUD neón a 60 FPS.'
        },
        {
            id: 'ejecutivo_analitico',
            nombre: 'Variante 3 • Escenario Ejecutivo UABC, Globo Red Global y Gráficas de Crecimiento',
            descripcion: 'Incluye podio institucional UABC (Azul/Oro/Verde), globo terráqueo 3D con nodos interconectados, columnas de crecimiento financiero/analítico, balanza de precisión, ruta de 4 pasos y panel HUD a 60 FPS.'
        },
        {
            id: 'aula_interactiva',
            nombre: 'Variante 4 • Aula Virtual Interactiva, Libro Proyector 3D y Carrusel de Cristales',
            descripcion: 'Incluye libro 3D gigante con haz de proyección holográfica, carrusel orbital de 4 cristales geométricos con los conceptos de la diapositiva, columna de energía académica, flujo de aprendizaje y panel HUD a 60 FPS.'
        }
    ];

    // Generador de Variante 1: Laboratorio Holográfico & Investigador 3D
    function construirEscenaVariante1(datos) {
        const [p1, p2, p3, p4] = datos.pasos;
        return `<a-entity id="escena_estudio_pro" position="0 0 0" scale="0.12 0.12 0.12">

    <!-- 1. ILUMINACIÓN OPTIMIZADA -->
    <a-light type="ambient" color="#dbeafe" intensity="0.9"></a-light>
    <a-light type="hemisphere" color="#38bdf8" groundColor="#0f172a" intensity="0.9"></a-light>
    <a-light type="directional" color="#ffffff" intensity="1.2" position="2 6 5"></a-light>

    <!-- 2. BASE HOLOGRÁFICA MULTINIVEL + HAZ DE PROYECCIÓN -->
    <a-entity position="0 -2.0 0">
        <a-circle radius="4.1" rotation="-90 0 0" position="0 -0.02 0"
            material="color: #0284c7; opacity: 0.22; transparent: true; roughness: 0.15; metalness: 0.9; side: double">
        </a-circle>
        <a-cone radius-bottom="3.5" radius-top="4.2" height="2.4" open-ended="true" position="0 1.2 0"
            material="color: #00f0ff; emissive: #0284c7; emissiveIntensity: 0.6; opacity: 0.08; transparent: true; side: double"
            animation="property: material.opacity; from: 0.05; to: 0.13; dir: alternate; dur: 2200; loop: true; easing: easeInOutSine">
        </a-cone>
        <a-ring radius-inner="3.55" radius-outer="3.75" rotation="-90 0 0"
            material="color: #00f0ff; emissive: #00f0ff; emissiveIntensity: 1.0; opacity: 0.85; transparent: true; side: double"
            animation="property: rotation; to: -90 360 0; dur: 24000; loop: true; easing: linear">
        </a-ring>
        <a-ring radius-inner="2.6" radius-outer="2.75" rotation="-90 0 0"
            material="color: #fbbf24; emissive: #f59e0b; emissiveIntensity: 0.95; opacity: 0.82; transparent: true; side: double"
            animation="property: rotation; to: -90 -360 0; dur: 18000; loop: true; easing: linear">
        </a-ring>
        <a-ring radius-inner="1.5" radius-outer="1.65" rotation="-90 0 0"
            material="color: #10b981; emissive: #059669; emissiveIntensity: 1.0; opacity: 0.78; transparent: true; side: double"
            animation="property: scale; to: 1.12 1.12 1.12; dir: alternate; dur: 1700; loop: true; easing: easeInOutSine">
        </a-ring>
    </a-entity>

    <!-- 3. SISTEMA DE PARTÍCULAS HOLOGRÁFICAS ORBITALES -->
    <a-entity position="0 0.2 0" animation="property: rotation; to: 0 360 0; dur: 16000; loop: true; easing: linear">
        <a-octahedron radius="0.09" position="3.6 1.2 0.4" material="color: #00f0ff; emissive: #00f0ff; emissiveIntensity: 1.4"
            animation="property: position; to: 3.6 1.7 0.4; dir: alternate; dur: 1900; loop: true; easing: easeInOutSine"></a-octahedron>
        <a-octahedron radius="0.08" position="-3.5 1.4 -0.6" material="color: #fbbf24; emissive: #f59e0b; emissiveIntensity: 1.4"
            animation="property: position; to: -3.5 1.9 -0.6; dir: alternate; dur: 2300; loop: true; easing: easeInOutSine"></a-octahedron>
        <a-octahedron radius="0.07" position="1.8 2.4 -1.2" material="color: #ec4899; emissive: #db2777; emissiveIntensity: 1.4"
            animation="property: position; to: 1.8 2.8 -1.2; dir: alternate; dur: 2100; loop: true; easing: easeInOutSine"></a-octahedron>
        <a-octahedron radius="0.08" position="-2.0 -0.9 1.3" material="color: #10b981; emissive: #059669; emissiveIntensity: 1.4"
            animation="property: position; to: -2.0 -0.4 1.3; dir: alternate; dur: 1800; loop: true; easing: easeInOutSine"></a-octahedron>
    </a-entity>

    <!-- 4. GRÁFICA DE BARRAS 3D ANIMADA (Izquierda Baja) -->
    <a-entity position="-3.2 -1.35 0.45" rotation="0 24 0">
        <a-box width="1.9" height="0.08" depth="0.7" position="0 0 0" material="color: #0f172a; metalness: 0.7; roughness: 0.3"></a-box>
        <a-plane width="1.9" height="1.25" position="0 0.65 -0.32"
            material="color: #020617; opacity: 0.65; transparent: true; side: double"></a-plane>
        <a-text value="ANALISIS DE DATOS" align="center" color="#38bdf8" width="2.4" position="0 1.12 -0.3"></a-text>

        <a-entity position="-0.6 0.04 0"
            animation="property: scale; from: 1 0.25 1; to: 1 1 1; dir: alternate; dur: 2200; loop: true; easing: easeInOutSine">
            <a-box width="0.24" height="0.55" depth="0.24" position="0 0.275 0"
                material="color: #00f0ff; emissive: #0284c7; emissiveIntensity: 0.85; opacity: 0.92; transparent: true"></a-box>
        </a-entity>
        <a-entity position="-0.2 0.04 0"
            animation="property: scale; from: 1 0.3 1; to: 1 1 1; dir: alternate; dur: 2200; delay: 350; loop: true; easing: easeInOutSine">
            <a-box width="0.24" height="0.82" depth="0.24" position="0 0.41 0"
                material="color: #fbbf24; emissive: #d97706; emissiveIntensity: 0.85; opacity: 0.92; transparent: true"></a-box>
        </a-entity>
        <a-entity position="0.2 0.04 0"
            animation="property: scale; from: 1 0.25 1; to: 1 1 1; dir: alternate; dur: 2200; delay: 700; loop: true; easing: easeInOutSine">
            <a-box width="0.24" height="0.68" depth="0.24" position="0 0.34 0"
                material="color: #ec4899; emissive: #be185d; emissiveIntensity: 0.85; opacity: 0.92; transparent: true"></a-box>
        </a-entity>
        <a-entity position="0.6 0.04 0"
            animation="property: scale; from: 1 0.35 1; to: 1 1 1; dir: alternate; dur: 2200; delay: 1050; loop: true; easing: easeInOutSine">
            <a-box width="0.24" height="0.98" depth="0.24" position="0 0.49 0"
                material="color: #10b981; emissive: #059669; emissiveIntensity: 0.9; opacity: 0.92; transparent: true"></a-box>
        </a-entity>
    </a-entity>

    <!-- 5. PROFESOR / INVESTIGADOR ANIMADO SALUDANDO (Derecha) -->
    <a-entity position="2.9 -0.8 0.55" rotation="0 -24 0"
        animation="property: position; to: 2.9 -0.72 0.55; dir: alternate; dur: 2000; loop: true; easing: easeInOutSine"
        animation__tilt="property: rotation; to: 2 -20 -1; dir: alternate; dur: 3200; loop: true; easing: easeInOutSine">
        <a-sphere radius="0.22" position="0 1.22 0" material="color: #fed7aa; roughness: 0.6"></a-sphere>
        <a-sphere radius="0.23" position="0 1.28 -0.04" material="color: #332414; roughness: 0.8"></a-sphere>
        <a-torus radius="0.055" radius-tubular="0.009" position="-0.07 1.24 0.2" material="color: #0f172a; metalness: 0.9"></a-torus>
        <a-torus radius="0.055" radius-tubular="0.009" position="0.07 1.24 0.2" material="color: #0f172a; metalness: 0.9"></a-torus>
        <a-cylinder radius="0.007" height="0.05" position="0 1.24 0.2" rotation="0 0 90" material="color: #0f172a"></a-cylinder>
        <a-cylinder radius="0.26" height="0.75" position="0 0.68 0" material="color: #f8fafc; roughness: 0.4"></a-cylinder>
        <a-box width="0.12" height="0.38" depth="0.03" position="0 0.75 0.24" material="color: #0284c7"></a-box>
        <a-cylinder radius="0.06" height="0.45" position="-0.26 0.65 0.08" rotation="20 0 15" material="color: #f8fafc"></a-cylinder>
        <a-box width="0.26" height="0.34" depth="0.02" position="-0.32 0.52 0.22" rotation="-15 20 0" material="color: #0f172a">
            <a-plane width="0.22" height="0.28" position="0 0 0.015"
                material="color: #38bdf8; emissive: #0284c7; emissiveIntensity: 0.9; side: double"></a-plane>
        </a-box>
        <a-entity position="0.28 0.88 0"
            animation="property: rotation; to: 0 0 -35; dir: alternate; dur: 650; loop: true; easing: easeInOutSine">
            <a-cylinder radius="0.06" height="0.48" position="0.16 0.16 0.05" rotation="0 0 -45" material="color: #f8fafc"></a-cylinder>
            <a-sphere radius="0.075" position="0.34 0.34 0.05" material="color: #fed7aa"></a-sphere>
        </a-entity>
        <a-cylinder radius="0.085" height="0.65" position="-0.11 0.05 0" material="color: #1e293b"></a-cylinder>
        <a-cylinder radius="0.085" height="0.65" position="0.11 0.05 0" material="color: #1e293b"></a-cylinder>
        <a-entity position="-0.2 1.82 0.1"
            animation="property: scale; to: 1.08 1.08 1.08; dir: alternate; dur: 1100; loop: true; easing: easeInOutSine">
            <a-plane width="1.7" height="0.56" material="color: #ffffff; roughness: 0.2; side: double"></a-plane>
            <a-plane width="1.78" height="0.64" position="0 0 -0.01"
                material="color: #00f0ff; emissive: #0284c7; emissiveIntensity: 1; side: double"></a-plane>
            <a-text value="BIENVENIDOS!" align="center" color="#0f172a" width="3.4" position="0 0.01 0.02"></a-text>
        </a-entity>
    </a-entity>

    <!-- 6. MICROSCOPIO CON ESCÁNER LÁSER (Derecha Fondo) -->
    <a-entity position="3.6 -1.1 -0.5" rotation="0 -40 0">
        <a-cylinder radius="0.6" height="0.1" position="0 0 0" material="color: #1e293b; metalness: 0.8"></a-cylinder>
        <a-box width="0.16" height="1.35" depth="0.18" position="-0.32 0.72 0" rotation="0 0 -15" material="color: #334155; metalness: 0.8"></a-box>
        <a-box width="0.8" height="0.04" depth="0.7" position="0.05 0.68 0" material="color: #020617; metalness: 0.9"></a-box>
        <a-ring radius-inner="0.08" radius-outer="0.24" position="0.05 0.74 0" rotation="-90 0 0"
            material="color: #4ade80; emissive: #22c55e; emissiveIntensity: 1.2; opacity: 0.8; transparent: true; side: double"
            animation="property: position; to: 0.05 1.15 0; dir: alternate; dur: 1200; loop: true; easing: easeInOutSine">
        </a-ring>
    </a-entity>

    <!-- 7. DOBLE HÉLICE DE ADN ROTATORIA (Izquierda Arriba) -->
    <a-entity position="-3.0 1.75 0.25"
        animation="property: rotation; to: 0 360 0; dur: 7500; loop: true; easing: linear"
        animation__pos="property: position; to: -3.0 2.05 0.25; dir: alternate; dur: 2400; loop: true; easing: easeInOutSine">
        <a-cylinder radius="0.03" height="0.9" position="0 0.6 0" rotation="0 0 90" material="color: #94a3b8"></a-cylinder>
        <a-sphere radius="0.12" position="-0.45 0.6 0" material="color: #ef4444; emissive: #dc2626; emissiveIntensity: 0.9"></a-sphere>
        <a-sphere radius="0.12" position="0.45 0.6 0" material="color: #00f0ff; emissive: #0284c7; emissiveIntensity: 0.9"></a-sphere>
        <a-cylinder radius="0.03" height="0.9" position="0 0.2 0" rotation="0 45 90" material="color: #94a3b8"></a-cylinder>
        <a-sphere radius="0.12" position="-0.32 0.2 0.32" material="color: #eab308; emissive: #ca8a04; emissiveIntensity: 0.9"></a-sphere>
        <a-sphere radius="0.12" position="0.32 0.2 -0.32" material="color: #22c55e; emissive: #16a34a; emissiveIntensity: 0.9"></a-sphere>
        <a-cylinder radius="0.03" height="0.9" position="0 -0.2 0" rotation="90 0 0" material="color: #94a3b8"></a-cylinder>
        <a-sphere radius="0.12" position="0 -0.2 0.45" material="color: #ec4899; emissive: #db2777; emissiveIntensity: 0.9"></a-sphere>
        <a-sphere radius="0.12" position="0 -0.2 -0.45" material="color: #a855f7; emissive: #7e22ce; emissiveIntensity: 0.9"></a-sphere>
    </a-entity>

    <!-- 8. BOMBILLA EUREKA CON TRIPLE ÓRBITA ATÓMICA (Centro Superior) -->
    <a-entity position="0 2.75 0.1"
        animation="property: position; to: 0 2.98 0.1; dir: alternate; dur: 2200; loop: true; easing: easeInOutSine">
        <a-sphere radius="0.44" material="color: #fef08a; opacity: 0.85; transparent: true; emissive: #facc15; emissiveIntensity: 1.1"></a-sphere>
        <a-entity rotation="60 30 0" animation="property: rotation; to: 60 390 0; dur: 5200; loop: true; easing: linear">
            <a-torus radius="0.82" radius-tubular="0.015" material="color: #00f0ff; emissive: #00f0ff; emissiveIntensity: 1; opacity: 0.8; transparent: true"></a-torus>
            <a-sphere radius="0.07" position="0.82 0 0" material="color: #ffffff; emissive: #00f0ff; emissiveIntensity: 1.6"></a-sphere>
        </a-entity>
        <a-entity rotation="-60 -30 0" animation="property: rotation; to: -60 -390 0; dur: 6800; loop: true; easing: linear">
            <a-torus radius="0.95" radius-tubular="0.015" material="color: #facc15; emissive: #f59e0b; emissiveIntensity: 1; opacity: 0.8; transparent: true"></a-torus>
            <a-sphere radius="0.07" position="-0.95 0 0" material="color: #ffffff; emissive: #facc15; emissiveIntensity: 1.6"></a-sphere>
        </a-entity>
    </a-entity>

    <!-- 9. LIBRO ABIERTO FLOTANTE (Centro Abajo) -->
    <a-entity position="0 -1.42 0.45" rotation="26 0 0"
        animation="property: position; to: 0 -1.28 0.45; dir: alternate; dur: 3000; loop: true; easing: easeInOutSine">
        <a-cylinder radius="0.07" height="1.55" position="0 0 -0.05" rotation="90 0 0" material="color: #d97706; metalness: 0.85"></a-cylinder>
        <a-box width="1.15" height="0.06" depth="1.5" position="-0.56 0.05 0" rotation="0 0 14" material="color: #fffbeb; roughness: 0.85"></a-box>
        <a-box width="1.15" height="0.06" depth="1.5" position="0.56 0.05 0" rotation="0 0 -14" material="color: #fffbeb; roughness: 0.85"></a-box>
    </a-entity>

    <!-- 10. DIAGRAMA DE FLUJO SECUENCIAL CON FLECHAS 3D REALES -->
    <a-entity position="0 -0.48 0.96">
        <a-entity position="-1.72 0 0"
            animation="property: scale; from: 1 1 1; to: 1.07 1.07 1.07; dir: alternate; dur: 900; delay: 0; loop: true; easing: easeInOutSine">
            <a-box width="0.96" height="0.28" depth="0.04" material="color: #0369a1; emissive: #0284c7; emissiveIntensity: 0.45"></a-box>
            <a-text value="${p1}" align="center" color="#ffffff" width="2.2" position="0 0 0.03"></a-text>
        </a-entity>
        <a-cone radius-bottom="0.07" radius-top="0" height="0.16" position="-1.14 0 0.02" rotation="0 0 -90"
            material="color: #00f0ff; emissive: #00f0ff; emissiveIntensity: 1.2"
            animation="property: position; to: -1.07 0 0.02; dir: alternate; dur: 600; loop: true; easing: easeInOutSine"></a-cone>

        <a-entity position="-0.58 0 0"
            animation="property: scale; from: 1 1 1; to: 1.07 1.07 1.07; dir: alternate; dur: 900; delay: 450; loop: true; easing: easeInOutSine">
            <a-box width="0.96" height="0.28" depth="0.04" material="color: #b45309; emissive: #d97706; emissiveIntensity: 0.45"></a-box>
            <a-text value="${p2}" align="center" color="#ffffff" width="2.2" position="0 0 0.03"></a-text>
        </a-entity>
        <a-cone radius-bottom="0.07" radius-top="0" height="0.16" position="0 0 0.02" rotation="0 0 -90"
            material="color: #fbbf24; emissive: #fbbf24; emissiveIntensity: 1.2"
            animation="property: position; to: 0.07 0 0.02; dir: alternate; dur: 600; delay: 150; loop: true; easing: easeInOutSine"></a-cone>

        <a-entity position="0.58 0 0"
            animation="property: scale; from: 1 1 1; to: 1.07 1.07 1.07; dir: alternate; dur: 900; delay: 900; loop: true; easing: easeInOutSine">
            <a-box width="0.96" height="0.28" depth="0.04" material="color: #701a75; emissive: #a21caf; emissiveIntensity: 0.45"></a-box>
            <a-text value="${p3}" align="center" color="#ffffff" width="2.2" position="0 0 0.03"></a-text>
        </a-entity>
        <a-cone radius-bottom="0.07" radius-top="0" height="0.16" position="1.14 0 0.02" rotation="0 0 -90"
            material="color: #f43f5e; emissive: #f43f5e; emissiveIntensity: 1.2"
            animation="property: position; to: 1.21 0 0.02; dir: alternate; dur: 600; delay: 300; loop: true; easing: easeInOutSine"></a-cone>

        <a-entity position="1.72 0 0"
            animation="property: scale; from: 1 1 1; to: 1.07 1.07 1.07; dir: alternate; dur: 900; delay: 1350; loop: true; easing: easeInOutSine">
            <a-box width="0.96" height="0.28" depth="0.04" material="color: #15803d; emissive: #16a34a; emissiveIntensity: 0.45"></a-box>
            <a-text value="${p4}" align="center" color="#ffffff" width="2.2" position="0 0 0.03"></a-text>
        </a-entity>
    </a-entity>

    <!-- 11. PANEL HUD HOLOGRÁFICO PRINCIPAL CON CAMBIO DE COLOR A 60 FPS -->
    <a-entity position="0 0.52 0.92"
        animation="property: position; to: 0 0.64 0.92; dir: alternate; dur: 2500; loop: true; easing: easeInOutSine">
        <a-plane width="4.95" height="2.05" position="0 0.08 -0.06"
            material="color: #030712; opacity: 0.86; transparent: true; roughness: 0.4; side: double">
        </a-plane>
        <a-box width="4.98" height="0.04" depth="0.03" position="0 1.11 -0.05"
            material="color: #00f0ff; emissive: #00f0ff; emissiveIntensity: 1.4"></a-box>
        <a-box width="4.98" height="0.04" depth="0.03" position="0 -0.95 -0.05"
            material="color: #10b981; emissive: #10b981; emissiveIntensity: 1.4"></a-box>

        <a-box width="3.8" height="0.34" depth="0.03" position="0 0.96 0.01"
            material="color: #092468; emissive: #1d4ed8; emissiveIntensity: 0.4">
            <a-text value="${datos.badgeTexto}" align="center" color="#38bdf8" width="3.8" position="0 0 0.025"></a-text>
        </a-box>

        <a-text class="texto-glow-cambiante"
            value="${datos.valorHUD}"
            color="#00f0ff" align="center" width="4.85" line-height="62" position="0.02 0.22 -0.01">
        </a-text>

        <a-text class="texto-color-cambiante"
            value="${datos.valorHUD}"
            color="#ffffff" align="center" width="4.65" line-height="62" position="0 0.22 0.02">
        </a-text>

        <a-text class="texto-acento-cambiante"
            value="${datos.subtituloHUD}"
            color="#fbbf24" align="center" width="3.7" position="0 -0.52 0.02">
        </a-text>
    </a-entity>

</a-entity>`;
    }

    // Generador de Variante 2: Centro de Comando Cibernético & Núcleo Orbital 360°
    function construirEscenaVariante2(datos) {
        const [p1, p2, p3, p4] = datos.pasos;
        const [c1, c2, c3, c4] = datos.conceptos;
        return `<a-entity id="escena_comando_cyber" position="0 0 0" scale="0.12 0.12 0.12">

    <!-- 1. ILUMINACIÓN CIBERNÉTICA DE ALTO CONTRASTE -->
    <a-light type="ambient" color="#e0f2fe" intensity="0.95"></a-light>
    <a-light type="hemisphere" color="#00f0ff" groundColor="#092468" intensity="1.0"></a-light>
    <a-light type="directional" color="#ffffff" intensity="1.3" position="0 7 5"></a-light>

    <!-- 2. PLATAFORMA DE COMANDO RADIAL Y ESCÁNER DE ONDA -->
    <a-entity position="0 -2.0 0">
        <a-cylinder radius="4.0" height="0.08" position="0 -0.04 0"
            material="color: #091936; metalness: 0.85; roughness: 0.2; opacity: 0.78; transparent: true"></a-cylinder>
        <a-ring radius-inner="3.7" radius-outer="3.95" rotation="-90 0 0"
            material="color: #38bdf8; emissive: #0284c7; emissiveIntensity: 1.2; side: double"
            animation="property: rotation; to: -90 -360 0; dur: 18000; loop: true; easing: linear"></a-ring>
        <a-ring radius-inner="2.1" radius-outer="2.35" rotation="-90 0 0"
            material="color: #a855f7; emissive: #9333ea; emissiveIntensity: 1.1; side: double"
            animation="property: scale; from: 0.85 0.85 0.85; to: 1.22 1.22 1.22; dir: alternate; dur: 1600; loop: true; easing: easeInOutSine"></a-ring>
    </a-entity>

    <!-- 3. NÚCLEO CENTRAL HOLOGRÁFICO (ICOSAEDRO + TRIPLE GIROSCOPIO SUPERIOR) -->
    <a-entity position="0 2.68 0.15">
        <a-icosahedron radius="0.48"
            material="color: #00f0ff; emissive: #0284c7; emissiveIntensity: 1.3; wireframe: false; metalness: 0.8; roughness: 0.15"
            animation="property: rotation; to: 360 360 0; dur: 9000; loop: true; easing: linear"></a-icosahedron>
        <a-torus radius="0.78" radius-tubular="0.022"
            material="color: #fbbf24; emissive: #f59e0b; emissiveIntensity: 1.2"
            animation="property: rotation; to: 360 180 0; dur: 5400; loop: true; easing: linear"></a-torus>
        <a-torus radius="0.98" radius-tubular="0.018"
            material="color: #ec4899; emissive: #db2777; emissiveIntensity: 1.2"
            animation="property: rotation; to: -360 0 360; dur: 7200; loop: true; easing: linear"></a-torus>
    </a-entity>

    <!-- 4. TORRE SERVIDOR HOLOGRÁFICO CON LEDS PULSANTES (Izquierda) -->
    <a-entity position="-3.35 -0.55 0.35" rotation="0 25 0">
        <a-box width="1.15" height="2.2" depth="0.75" material="color: #0f172a; metalness: 0.85; roughness: 0.2"></a-box>
        <a-box width="0.95" height="0.22" depth="0.05" position="0 0.72 0.39"
            material="color: #00f0ff; emissive: #00f0ff; emissiveIntensity: 1.2"
            animation="property: material.emissiveIntensity; from: 0.4; to: 1.5; dir: alternate; dur: 700; loop: true"></a-box>
        <a-box width="0.95" height="0.22" depth="0.05" position="0 0.25 0.39"
            material="color: #10b981; emissive: #10b981; emissiveIntensity: 1.2"
            animation="property: material.emissiveIntensity; from: 0.4; to: 1.5; dir: alternate; dur: 900; delay: 250; loop: true"></a-box>
        <a-box width="0.95" height="0.22" depth="0.05" position="0 -0.22 0.39"
            material="color: #fbbf24; emissive: #fbbf24; emissiveIntensity: 1.2"
            animation="property: material.emissiveIntensity; from: 0.4; to: 1.5; dir: alternate; dur: 800; delay: 500; loop: true"></a-box>
        <a-text value="SISTEMA ACTIVO" align="center" color="#38bdf8" width="2.4" position="0 1.32 0"></a-text>
    </a-entity>

    <!-- 5. RADAR HOLOGRÁFICO 3D Y CÁPSULA DE ENERGÍA (Derecha) -->
    <a-entity position="3.35 -0.55 0.35" rotation="0 -25 0">
        <a-cylinder radius="0.72" height="1.8" open-ended="true"
            material="color: #00f0ff; emissive: #0284c7; emissiveIntensity: 0.8; opacity: 0.25; transparent: true; side: double"></a-cylinder>
        <a-dodecahedron radius="0.45" position="0 0.1 0"
            material="color: #10b981; emissive: #059669; emissiveIntensity: 1.1"
            animation="property: rotation; to: 0 360 360; dur: 6500; loop: true; easing: linear"
            animation__float="property: position; to: 0 0.45 0; dir: alternate; dur: 1800; loop: true; easing: easeInOutSine"></a-dodecahedron>
        <a-ring radius-inner="0.5" radius-outer="0.68" rotation="-90 0 0" position="0 -0.7 0"
            material="color: #fbbf24; emissive: #d97706; emissiveIntensity: 1.2; side: double"
            animation="property: position; to: 0 0.7 0; dir: alternate; dur: 1500; loop: true; easing: easeInOutSine"></a-ring>
        <a-text value="NODO 3D" align="center" color="#fbbf24" width="2.5" position="0 1.25 0"></a-text>
    </a-entity>

    <!-- 6. SATÉLITES CONCEPTUALES ORBITANDO EN 360 GRADOS -->
    <a-entity position="0 1.55 0" animation="property: rotation; to: 0 360 0; dur: 22000; loop: true; easing: linear">
        <a-entity position="3.4 0.5 0">
            <a-box width="1.35" height="0.36" depth="0.06" material="color: #092468; emissive: #0284c7; emissiveIntensity: 0.7"></a-box>
            <a-text value="${normalizarASCII(c1).slice(0, 14)}" align="center" color="#ffffff" width="2.6" position="0 0 0.04"></a-text>
        </a-entity>
        <a-entity position="-3.4 0.5 0" rotation="0 180 0">
            <a-box width="1.35" height="0.36" depth="0.06" material="color: #065f46; emissive: #10b981; emissiveIntensity: 0.7"></a-box>
            <a-text value="${normalizarASCII(c2).slice(0, 14)}" align="center" color="#ffffff" width="2.6" position="0 0 0.04"></a-text>
        </a-entity>
        <a-entity position="0 0.5 3.4">
            <a-box width="1.35" height="0.36" depth="0.06" material="color: #78350f; emissive: #f59e0b; emissiveIntensity: 0.7"></a-box>
            <a-text value="${normalizarASCII(c3).slice(0, 14)}" align="center" color="#ffffff" width="2.6" position="0 0 0.04"></a-text>
        </a-entity>
        <a-entity position="0 0.5 -3.4" rotation="0 180 0">
            <a-box width="1.35" height="0.36" depth="0.06" material="color: #701a75; emissive: #ec4899; emissiveIntensity: 0.7"></a-box>
            <a-text value="${normalizarASCII(c4).slice(0, 14)}" align="center" color="#ffffff" width="2.6" position="0 0 0.04"></a-text>
        </a-entity>
    </a-entity>

    <!-- 7. RUTA DE PROCESAMIENTO DE 4 NODOS (Frontal Bajo) -->
    <a-entity position="0 -0.55 0.96">
        <a-entity position="-1.72 0 0" animation="property: scale; from: 1 1 1; to: 1.08 1.08 1.08; dir: alternate; dur: 850; loop: true">
            <a-box width="0.96" height="0.3" depth="0.05" material="color: #0284c7; emissive: #00f0ff; emissiveIntensity: 0.5"></a-box>
            <a-text value="${p1}" align="center" color="#ffffff" width="2.2" position="0 0 0.03"></a-text>
        </a-entity>
        <a-entity position="-0.58 0 0" animation="property: scale; from: 1 1 1; to: 1.08 1.08 1.08; dir: alternate; dur: 850; delay: 300; loop: true">
            <a-box width="0.96" height="0.3" depth="0.05" material="color: #7c3aed; emissive: #a855f7; emissiveIntensity: 0.5"></a-box>
            <a-text value="${p2}" align="center" color="#ffffff" width="2.2" position="0 0 0.03"></a-text>
        </a-entity>
        <a-entity position="0.58 0 0" animation="property: scale; from: 1 1 1; to: 1.08 1.08 1.08; dir: alternate; dur: 850; delay: 600; loop: true">
            <a-box width="0.96" height="0.3" depth="0.05" material="color: #d97706; emissive: #fbbf24; emissiveIntensity: 0.5"></a-box>
            <a-text value="${p3}" align="center" color="#ffffff" width="2.2" position="0 0 0.03"></a-text>
        </a-entity>
        <a-entity position="1.72 0 0" animation="property: scale; from: 1 1 1; to: 1.08 1.08 1.08; dir: alternate; dur: 850; delay: 900; loop: true">
            <a-box width="0.96" height="0.3" depth="0.05" material="color: #059669; emissive: #10b981; emissiveIntensity: 0.5"></a-box>
            <a-text value="${p4}" align="center" color="#ffffff" width="2.2" position="0 0 0.03"></a-text>
        </a-entity>
    </a-entity>

    <!-- 8. PANEL HUD CIBERNÉTICO PRINCIPAL A 60 FPS -->
    <a-entity position="0 0.52 0.92"
        animation="property: position; to: 0 0.64 0.92; dir: alternate; dur: 2400; loop: true; easing: easeInOutSine">
        <a-plane width="5.0" height="2.08" position="0 0.08 -0.06"
            material="color: #040b1a; opacity: 0.88; transparent: true; side: double"></a-plane>
        <a-box width="5.04" height="0.045" depth="0.04" position="0 1.12 -0.04"
            material="color: #a855f7; emissive: #a855f7; emissiveIntensity: 1.5"></a-box>
        <a-box width="5.04" height="0.045" depth="0.04" position="0 -0.96 -0.04"
            material="color: #00f0ff; emissive: #00f0ff; emissiveIntensity: 1.5"></a-box>

        <a-box width="3.85" height="0.34" depth="0.03" position="0 0.96 0.01"
            material="color: #3b0764; emissive: #7e22ce; emissiveIntensity: 0.55">
            <a-text value="${datos.badgeTexto}" align="center" color="#f0abfc" width="3.8" position="0 0 0.025"></a-text>
        </a-box>

        <a-text class="texto-glow-cambiante"
            value="${datos.valorHUD}"
            color="#00f0ff" align="center" width="4.85" line-height="62" position="0.02 0.22 -0.01">
        </a-text>
        <a-text class="texto-color-cambiante"
            value="${datos.valorHUD}"
            color="#ffffff" align="center" width="4.65" line-height="62" position="0 0.22 0.02">
        </a-text>
        <a-text class="texto-acento-cambiante"
            value="${datos.subtituloHUD}"
            color="#fbbf24" align="center" width="3.7" position="0 -0.52 0.02">
        </a-text>
    </a-entity>

</a-entity>`;
    }

    // Generador de Variante 3: Escenario Ejecutivo de Análisis, Gráficas & Red Global
    function construirEscenaVariante3(datos) {
        const [p1, p2, p3, p4] = datos.pasos;
        return `<a-entity id="escena_ejecutiva_uabc" position="0 0 0" scale="0.12 0.12 0.12">

    <!-- 1. ILUMINACIÓN INSTITUCIONAL DORADA Y ESMERALDA -->
    <a-light type="ambient" color="#fef3c7" intensity="0.95"></a-light>
    <a-light type="hemisphere" color="#fbbf24" groundColor="#092468" intensity="0.95"></a-light>
    <a-light type="directional" color="#ffffff" intensity="1.25" position="2 6 5"></a-light>

    <!-- 2. PODIO HOLOGRÁFICO UABC (AZUL, ORO Y VERDE) -->
    <a-entity position="0 -2.0 0">
        <a-circle radius="4.1" rotation="-90 0 0" position="0 -0.02 0"
            material="color: #092468; opacity: 0.35; transparent: true; metalness: 0.85; side: double"></a-circle>
        <a-ring radius-inner="3.6" radius-outer="3.85" rotation="-90 0 0"
            material="color: #f5b316; emissive: #d97706; emissiveIntensity: 1.1; side: double"
            animation="property: rotation; to: -90 360 0; dur: 20000; loop: true; easing: linear"></a-ring>
        <a-ring radius-inner="2.4" radius-outer="2.6" rotation="-90 0 0"
            material="color: #00843d; emissive: #10b981; emissiveIntensity: 1.1; side: double"
            animation="property: rotation; to: -90 -360 0; dur: 15000; loop: true; easing: linear"></a-ring>
    </a-entity>

    <!-- 3. GLOBO TERRÁQUEO 3D DE RED GLOBAL INTERCONECTADA (Centro Superior) -->
    <a-entity position="0 2.72 0.15"
        animation="property: rotation; to: 0 360 0; dur: 14000; loop: true; easing: linear">
        <a-sphere radius="0.62"
            material="color: #0284c7; emissive: #00f0ff; emissiveIntensity: 0.7; wireframe: true"></a-sphere>
        <a-sphere radius="0.46"
            material="color: #092468; opacity: 0.75; transparent: true"></a-sphere>
        <a-torus radius="0.82" radius-tubular="0.018" rotation="45 0 0"
            material="color: #f5b316; emissive: #fbbf24; emissiveIntensity: 1.2"></a-torus>
        <a-sphere radius="0.08" position="0.82 0 0" material="color: #10b981; emissive: #10b981; emissiveIntensity: 1.5"></a-sphere>
        <a-sphere radius="0.08" position="-0.82 0 0" material="color: #f43f5e; emissive: #f43f5e; emissiveIntensity: 1.5"></a-sphere>
    </a-entity>

    <!-- 4. COLUMNAS EJECUTIVAS DE CRECIMIENTO Y MÉTRICAS 3D (Izquierda) -->
    <a-entity position="-3.25 -1.35 0.45" rotation="0 22 0">
        <a-box width="2.05" height="0.1" depth="0.75" material="color: #092468; metalness: 0.8"></a-box>
        <a-text value="INDICADORES CLAVE" align="center" color="#fbbf24" width="2.6" position="0 1.45 -0.2"></a-text>
        <a-cylinder radius="0.16" height="0.65" position="-0.6 0.35 0"
            material="color: #38bdf8; emissive: #0284c7; emissiveIntensity: 0.9"
            animation="property: scale; from: 1 0.4 1; to: 1 1.15 1; dir: alternate; dur: 1800; loop: true"></a-cylinder>
        <a-cylinder radius="0.16" height="0.9" position="-0.2 0.48 0"
            material="color: #f5b316; emissive: #d97706; emissiveIntensity: 0.9"
            animation="property: scale; from: 1 0.5 1; to: 1 1.2 1; dir: alternate; dur: 1800; delay: 300; loop: true"></a-cylinder>
        <a-cylinder radius="0.16" height="1.15" position="0.2 0.6 0"
            material="color: #10b981; emissive: #059669; emissiveIntensity: 0.95"
            animation="property: scale; from: 1 0.5 1; to: 1 1.25 1; dir: alternate; dur: 1800; delay: 600; loop: true"></a-cylinder>
        <a-cylinder radius="0.16" height="1.4" position="0.6 0.72 0"
            material="color: #a855f7; emissive: #9333ea; emissiveIntensity: 0.95"
            animation="property: scale; from: 1 0.6 1; to: 1 1.25 1; dir: alternate; dur: 1800; delay: 900; loop: true"></a-cylinder>
    </a-entity>

    <!-- 5. BALANZA DE EQUILIBRIO Y ESTRATEGIA 3D (Derecha) -->
    <a-entity position="3.25 -1.1 0.45" rotation="0 -22 0">
        <a-cylinder radius="0.48" height="0.12" position="0 0 0" material="color: #f5b316; metalness: 0.9"></a-cylinder>
        <a-cylinder radius="0.07" height="1.45" position="0 0.75 0" material="color: #e2e8f0; metalness: 0.9"></a-cylinder>
        <a-entity position="0 1.42 0"
            animation="property: rotation; from: 0 0 -10; to: 0 0 10; dir: alternate; dur: 2400; loop: true; easing: easeInOutSine">
            <a-box width="1.5" height="0.06" depth="0.06" material="color: #fbbf24; emissive: #d97706; emissiveIntensity: 0.8"></a-box>
            <a-sphere radius="0.22" position="-0.7 -0.35 0" material="color: #00f0ff; emissive: #0284c7; emissiveIntensity: 1"></a-sphere>
            <a-sphere radius="0.22" position="0.7 -0.35 0" material="color: #10b981; emissive: #059669; emissiveIntensity: 1"></a-sphere>
        </a-entity>
    </a-entity>

    <!-- 6. DIAGRAMA ESTRATÉGICO DE 4 ETAPAS (Frontal Bajo) -->
    <a-entity position="0 -0.52 0.96">
        <a-entity position="-1.72 0 0" animation="property: scale; from: 1 1 1; to: 1.07 1.07 1.07; dir: alternate; dur: 900; loop: true">
            <a-box width="0.96" height="0.29" depth="0.05" material="color: #092468; emissive: #1d4ed8; emissiveIntensity: 0.55"></a-box>
            <a-text value="${p1}" align="center" color="#ffffff" width="2.2" position="0 0 0.03"></a-text>
        </a-entity>
        <a-entity position="-0.58 0 0" animation="property: scale; from: 1 1 1; to: 1.07 1.07 1.07; dir: alternate; dur: 900; delay: 300; loop: true">
            <a-box width="0.96" height="0.29" depth="0.05" material="color: #b45309; emissive: #f59e0b; emissiveIntensity: 0.55"></a-box>
            <a-text value="${p2}" align="center" color="#ffffff" width="2.2" position="0 0 0.03"></a-text>
        </a-entity>
        <a-entity position="0.58 0 0" animation="property: scale; from: 1 1 1; to: 1.07 1.07 1.07; dir: alternate; dur: 900; delay: 600; loop: true">
            <a-box width="0.96" height="0.29" depth="0.05" material="color: #00843d; emissive: #10b981; emissiveIntensity: 0.55"></a-box>
            <a-text value="${p3}" align="center" color="#ffffff" width="2.2" position="0 0 0.03"></a-text>
        </a-entity>
        <a-entity position="1.72 0 0" animation="property: scale; from: 1 1 1; to: 1.07 1.07 1.07; dir: alternate; dur: 900; delay: 900; loop: true">
            <a-box width="0.96" height="0.29" depth="0.05" material="color: #0369a1; emissive: #00f0ff; emissiveIntensity: 0.55"></a-box>
            <a-text value="${p4}" align="center" color="#ffffff" width="2.2" position="0 0 0.03"></a-text>
        </a-entity>
    </a-entity>

    <!-- 7. PANEL HUD EJECUTIVO UABC A 60 FPS -->
    <a-entity position="0 0.52 0.92"
        animation="property: position; to: 0 0.64 0.92; dir: alternate; dur: 2500; loop: true; easing: easeInOutSine">
        <a-plane width="4.98" height="2.06" position="0 0.08 -0.06"
            material="color: #061539; opacity: 0.88; transparent: true; side: double"></a-plane>
        <a-box width="5.02" height="0.045" depth="0.04" position="0 1.11 -0.04"
            material="color: #f5b316; emissive: #fbbf24; emissiveIntensity: 1.4"></a-box>
        <a-box width="5.02" height="0.045" depth="0.04" position="0 -0.95 -0.04"
            material="color: #00843d; emissive: #10b981; emissiveIntensity: 1.4"></a-box>

        <a-box width="3.85" height="0.34" depth="0.03" position="0 0.96 0.01"
            material="color: #00843d; emissive: #059669; emissiveIntensity: 0.5">
            <a-text value="${datos.badgeTexto}" align="center" color="#fef08a" width="3.8" position="0 0 0.025"></a-text>
        </a-box>

        <a-text class="texto-glow-cambiante"
            value="${datos.valorHUD}"
            color="#00f0ff" align="center" width="4.85" line-height="62" position="0.02 0.22 -0.01">
        </a-text>
        <a-text class="texto-color-cambiante"
            value="${datos.valorHUD}"
            color="#ffffff" align="center" width="4.65" line-height="62" position="0 0.22 0.02">
        </a-text>
        <a-text class="texto-acento-cambiante"
            value="${datos.subtituloHUD}"
            color="#fbbf24" align="center" width="3.7" position="0 -0.52 0.02">
        </a-text>
    </a-entity>

</a-entity>`;
    }

    // Generador de Variante 4: Aula Virtual Interactiva & Carrusel Conceptual 3D
    function construirEscenaVariante4(datos) {
        const [p1, p2, p3, p4] = datos.pasos;
        return `<a-entity id="escena_aula_virtual" position="0 0 0" scale="0.12 0.12 0.12">

    <!-- 1. ILUMINACIÓN DE AULA HOLOGRÁFICA -->
    <a-light type="ambient" color="#f0fdf4" intensity="0.95"></a-light>
    <a-light type="hemisphere" color="#10b981" groundColor="#092468" intensity="0.95"></a-light>
    <a-light type="directional" color="#ffffff" intensity="1.25" position="0 7 5"></a-light>

    <!-- 2. LIBRO GIGANTE PROYECTOR DE CONOCIMIENTO EN LA BASE -->
    <a-entity position="0 -1.85 0.2" rotation="18 0 0">
        <a-cylinder radius="0.1" height="2.1" position="0 0 -0.05" rotation="90 0 0" material="color: #f5b316; metalness: 0.9"></a-cylinder>
        <a-box width="1.65" height="0.08" depth="2.0" position="-0.8 0.08 0" rotation="0 0 12" material="color: #fffbeb"></a-box>
        <a-box width="1.72" height="0.05" depth="2.08" position="-0.82 0.02 0" rotation="0 0 12" material="color: #092468"></a-box>
        <a-box width="1.65" height="0.08" depth="2.0" position="0.8 0.08 0" rotation="0 0 -12" material="color: #fffbeb"></a-box>
        <a-box width="1.72" height="0.05" depth="2.08" position="0.82 0.02 0" rotation="0 0 -12" material="color: #00843d"></a-box>
        <a-cone radius-bottom="1.2" radius-top="3.4" height="2.5" open-ended="true" position="0 1.35 0"
            material="color: #38bdf8; emissive: #0284c7; emissiveIntensity: 0.8; opacity: 0.11; transparent: true; side: double"></a-cone>
    </a-entity>

    <!-- 3. CARRUSEL ORBITAL DE CRISTALES DE CONOCIMIENTO 3D -->
    <a-entity position="0 1.4 0" animation="property: rotation; to: 0 -360 0; dur: 16000; loop: true; easing: linear">
        <a-octahedron radius="0.34" position="3.45 0.3 0"
            material="color: #00f0ff; emissive: #0284c7; emissiveIntensity: 1.2"
            animation="property: rotation; to: 360 360 0; dur: 4000; loop: true; easing: linear"></a-octahedron>
        <a-dodecahedron radius="0.34" position="-3.45 0.3 0"
            material="color: #fbbf24; emissive: #d97706; emissiveIntensity: 1.2"
            animation="property: rotation; to: 360 360 0; dur: 4000; loop: true; easing: linear"></a-dodecahedron>
        <a-icosahedron radius="0.34" position="0 0.3 3.45"
            material="color: #10b981; emissive: #059669; emissiveIntensity: 1.2"
            animation="property: rotation; to: 360 360 0; dur: 4000; loop: true; easing: linear"></a-icosahedron>
        <a-octahedron radius="0.34" position="0 0.3 -3.45"
            material="color: #ec4899; emissive: #db2777; emissiveIntensity: 1.2"
            animation="property: rotation; to: 360 360 0; dur: 4000; loop: true; easing: linear"></a-octahedron>
    </a-entity>

    <!-- 4. CORONA ESTELAR SUPERIOR DE SÍNTESIS ACADÉMICA -->
    <a-entity position="0 2.75 0.1"
        animation="property: position; to: 0 2.98 0.1; dir: alternate; dur: 2000; loop: true; easing: easeInOutSine">
        <a-torus-knot radius="0.42" radius-tubular="0.06" p="2" q="3"
            material="color: #fbbf24; emissive: #f59e0b; emissiveIntensity: 1.1; metalness: 0.8"
            animation="property: rotation; to: 360 360 0; dur: 8000; loop: true; easing: linear"></a-torus-knot>
    </a-entity>

    <!-- 5. SECUENCIA DE APRENDIZAJE EN 4 BLOQUES (Frontal Bajo) -->
    <a-entity position="0 -0.52 0.96">
        <a-entity position="-1.72 0 0" animation="property: scale; from: 1 1 1; to: 1.07 1.07 1.07; dir: alternate; dur: 900; loop: true">
            <a-box width="0.96" height="0.28" depth="0.05" material="color: #0284c7; emissive: #38bdf8; emissiveIntensity: 0.5"></a-box>
            <a-text value="${p1}" align="center" color="#ffffff" width="2.2" position="0 0 0.03"></a-text>
        </a-entity>
        <a-entity position="-0.58 0 0" animation="property: scale; from: 1 1 1; to: 1.07 1.07 1.07; dir: alternate; dur: 900; delay: 300; loop: true">
            <a-box width="0.96" height="0.28" depth="0.05" material="color: #059669; emissive: #10b981; emissiveIntensity: 0.5"></a-box>
            <a-text value="${p2}" align="center" color="#ffffff" width="2.2" position="0 0 0.03"></a-text>
        </a-entity>
        <a-entity position="0.58 0 0" animation="property: scale; from: 1 1 1; to: 1.07 1.07 1.07; dir: alternate; dur: 900; delay: 600; loop: true">
            <a-box width="0.96" height="0.28" depth="0.05" material="color: #d97706; emissive: #fbbf24; emissiveIntensity: 0.5"></a-box>
            <a-text value="${p3}" align="center" color="#ffffff" width="2.2" position="0 0 0.03"></a-text>
        </a-entity>
        <a-entity position="1.72 0 0" animation="property: scale; from: 1 1 1; to: 1.07 1.07 1.07; dir: alternate; dur: 900; delay: 900; loop: true">
            <a-box width="0.96" height="0.28" depth="0.05" material="color: #be185d; emissive: #ec4899; emissiveIntensity: 0.5"></a-box>
            <a-text value="${p4}" align="center" color="#ffffff" width="2.2" position="0 0 0.03"></a-text>
        </a-entity>
    </a-entity>

    <!-- 6. PANEL HUD ACADÉMICO PRINCIPAL A 60 FPS -->
    <a-entity position="0 0.52 0.92"
        animation="property: position; to: 0 0.64 0.92; dir: alternate; dur: 2500; loop: true; easing: easeInOutSine">
        <a-plane width="4.95" height="2.05" position="0 0.08 -0.06"
            material="color: #02122c; opacity: 0.88; transparent: true; side: double"></a-plane>
        <a-box width="4.98" height="0.045" depth="0.04" position="0 1.11 -0.04"
            material="color: #10b981; emissive: #10b981; emissiveIntensity: 1.4"></a-box>
        <a-box width="4.98" height="0.045" depth="0.04" position="0 -0.95 -0.04"
            material="color: #fbbf24; emissive: #fbbf24; emissiveIntensity: 1.4"></a-box>

        <a-box width="3.85" height="0.34" depth="0.03" position="0 0.96 0.01"
            material="color: #092468; emissive: #0284c7; emissiveIntensity: 0.5">
            <a-text value="${datos.badgeTexto}" align="center" color="#6ee7b7" width="3.8" position="0 0 0.025"></a-text>
        </a-box>

        <a-text class="texto-glow-cambiante"
            value="${datos.valorHUD}"
            color="#00f0ff" align="center" width="4.85" line-height="62" position="0.02 0.22 -0.01">
        </a-text>
        <a-text class="texto-color-cambiante"
            value="${datos.valorHUD}"
            color="#ffffff" align="center" width="4.65" line-height="62" position="0 0.22 0.02">
        </a-text>
        <a-text class="texto-acento-cambiante"
            value="${datos.subtituloHUD}"
            color="#fbbf24" align="center" width="3.7" position="0 -0.52 0.02">
        </a-text>
    </a-entity>

</a-entity>`;
    }

    class SlideAnimationGenerator {
        static obtenerVariantesDisponibles() {
            return VARIANTES_CATALOGO;
        }

        static determinarIndiceInicialPorDominio(dominioId) {
            if (dominioId === 'sistemas') return 1;
            if (dominioId === 'finanzas' || dominioId === 'administracion') return 2;
            if (dominioId === 'investigacion' || dominioId === 'estadistica') return 0;
            return 0;
        }

        static generarAnimacion3D(context, descripcionConfirmada, varianteIndex = 0) {
            const datos = extraerDatosParaEscena3D(context, descripcionConfirmada);
            const totalVariantes = VARIANTES_CATALOGO.length;
            const idx = ((varianteIndex % totalVariantes) + totalVariantes) % totalVariantes;
            const infoVariante = VARIANTES_CATALOGO[idx];

            let codigo = '';
            if (idx === 0) {
                codigo = construirEscenaVariante1(datos);
            } else if (idx === 1) {
                codigo = construirEscenaVariante2(datos);
            } else if (idx === 2) {
                codigo = construirEscenaVariante3(datos);
            } else {
                codigo = construirEscenaVariante4(datos);
            }

            return {
                codigoAnimacion: codigo,
                varianteIndex: idx,
                nombreVariante: infoVariante.nombre,
                descripcionVariante: infoVariante.descripcion,
                datosAplicados: datos
            };
        }
    }

    // Exponer módulos de negocio de forma limpia en el objeto global
    global.SlideCreatorEngine = {
        STATES,
        SlideCreationStateMachine,
        SlideAnalyzerEngine,
        SlideAnimationGenerator
    };
})(window);
