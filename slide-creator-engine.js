/**
 * slide-creator-engine.js
 * ============================================================================
 * Capa de Lógica de Negocio separada de los componentes visuales:
 *  1. SlideCreationStateMachine : Máquina de estados explícita
 *     (idle, form, loading_mind, review_mind, loading_animation,
 *      select_animation, implementing, completed)
 *  2. SlideAnalyzerEngine       : Analizador profundo de diapositivas (OCR
 *     local con preprocesamiento de alto contraste + inspección multi-zona
 *     por Canvas 2D + extracción de tema principal, subtemas, datos clave,
 *     elementos visuales y propósito pedagógico)
 *  3. SlideAnimationGenerator   : Motor generador de escenas 3D A-Frame de
 *     alta riqueza visual con tarjetas holográficas de subtemas, indicadores
 *     de datos clave, etiquetas dinámicas y diagramas vinculados a la lámina.
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
            modoInformacionManual: false,
            temaDetectado: '',
            subtemasDetectados: [],
            datosClaveDetectados: [],
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
    // 2. ANALIZADOR PROFUNDO DE DIAPOSITIVAS (SlideAnalyzerEngine)
    // =========================================================================
    const DOMINIOS_TEMATICOS = [
        {
            id: 'investigacion',
            nombre: 'Metodología de la Investigación y Ciencia Aplicada',
            keywords: [
                'metodologia', 'investigacion', 'cientifico', 'ciencia', 'hipotesis',
                'experimento', 'observacion', 'metodo', 'estudio', 'analisis',
                'teoria', 'muestra', 'cualitativa', 'cuantitativa', 'exploratoria',
                'descriptiva', 'laboratorio', 'evidencia', 'fundamentos', 'variables',
                'problema', 'marco', 'teorico', 'instrumento', 'validacion', 'campo'
            ],
            conceptosDefault: ['Observacion', 'Hipotesis', 'Experimentacion', 'Evidencia'],
            subtemasDefault: [
                'Planteamiento del problema y delimitación del objeto de estudio',
                'Formulación de hipótesis y definición de variables de investigación',
                'Diseño metodológico: enfoque cuantitativo, cualitativo y mixto',
                'Recolección de datos, validación empírica y conclusiones científicas'
            ],
            datosClaveDefault: [
                'Rigor Metodológico: Validación sistemática basada en evidencia verificable',
                'Estructura Empírica: Control de variables e instrumentos de medición confiables',
                'Ciclo Científico: Observación -> Hipótesis -> Experimentación -> Conclusión',
                'Impacto Académico: Generación de conocimiento reproducible y objetivo'
            ],
            pasosDefault: ['1. Observar', '2. Hipotesis', '3. Experimento', '4. Conclusion'],
            proposito: 'Exponer de manera estructurada los fundamentos del método científico, las fases de validación empírica, la clasificación metodológica y el análisis riguroso de evidencia dentro del proceso de investigación.'
        },
        {
            id: 'sistemas',
            nombre: 'Sistemas de Información, Arquitectura de Software y Tecnología',
            keywords: [
                'sistema', 'sistemas', 'software', 'programacion', 'datos', 'base',
                'red', 'redes', 'arquitectura', 'codigo', 'algoritmo', 'computacion',
                'informatica', 'digital', 'servidor', 'nube', 'seguridad', 'tecnologia',
                'web', 'aplicacion', 'desarrollo', 'ia', 'virtual', 'realidad',
                'hardware', 'interfaz', 'cliente', 'api', 'procesamiento', 'automatizacion'
            ],
            conceptosDefault: ['Arquitectura', 'Procesamiento', 'Datos', 'Innovacion'],
            subtemasDefault: [
                'Arquitectura de componentes y flujo de entrada/procesamiento/salida',
                'Gestión de bases de datos, almacenamiento e integridad de la información',
                'Infraestructura de red, comunicación cliente-servidor y servicios en la nube',
                'Automatización de procesos, seguridad informática y experiencia de usuario'
            ],
            datosClaveDefault: [
                'Flujo Operativo: Entrada de datos -> Procesamiento lógico -> Salida de información',
                'Escalabilidad: Diseño modular de alta disponibilidad y rendimiento',
                'Integración Digital: Interconexión entre capas de interfaz, lógica y persistencia',
                'Seguridad y Control: Trazabilidad de transacciones y protección de activos'
            ],
            pasosDefault: ['1. Entrada', '2. Proceso', '3. Almacen', '4. Salida'],
            proposito: 'Representar la arquitectura lógica y física del sistema tecnológico, detallando cómo interactúan sus módulos, el flujo de transformación de datos y los mecanismos de automatización.'
        },
        {
            id: 'finanzas',
            nombre: 'Contabilidad, Finanzas Corporativas y Análisis Económico',
            keywords: [
                'contabilidad', 'contaduria', 'finanzas', 'financiero', 'costo', 'costos',
                'presupuesto', 'balance', 'activo', 'pasivo', 'capital', 'impuesto',
                'fiscal', 'auditoria', 'economia', 'inversion', 'rentabilidad', 'ingresos',
                'estados', 'flujo', 'efectivo', 'mercado', 'credito', 'liquidez', 'utilidad'
            ],
            conceptosDefault: ['Balance', 'Rentabilidad', 'Liquidez', 'Patrimonio'],
            subtemasDefault: [
                'Estructura del balance general: relación entre activos, pasivos y capital contable',
                'Estado de resultados, análisis de ingresos, costos operativos y márgenes de utilidad',
                'Indicadores financieros de liquidez, solvencia, endeudamiento y rentabilidad',
                'Planeación presupuestaria, auditoría fiscal y toma de decisiones de inversión'
            ],
            datosClaveDefault: [
                'Ecuación Contable: Activo Total = Pasivo + Capital Contable',
                'Indicadores KPI: Evaluación de liquidez, flujo de efectivo y retorno (ROI)',
                'Control Presupuestal: Optimización de costos y maximización del valor patrimonial',
                'Normatividad: Cumplimiento de normas de información financiera y transparencia'
            ],
            pasosDefault: ['1. Registro', '2. Clasificar', '3. Balance', '4. Reporte'],
            proposito: 'Analizar la situación financiera y contable de la organización, facilitando la interpretación de estados financieros, razones de rentabilidad y decisiones estratégicas de asignación de capital.'
        },
        {
            id: 'administracion',
            nombre: 'Administración Estratégica, Gestión y Desarrollo Organizacional',
            keywords: [
                'administracion', 'gestion', 'empresa', 'organizacion', 'estrategia',
                'planeacion', 'liderazgo', 'recursos', 'humanos', 'operaciones',
                'calidad', 'proceso', 'procesos', 'proyecto', 'objetivos', 'metas',
                'direccion', 'control', 'marketing', 'mercadotecnia', 'negocios', 'foda'
            ],
            conceptosDefault: ['Planeacion', 'Organizacion', 'Direccion', 'Control'],
            subtemasDefault: [
                'Planeación estratégica: definición de misión, visión, objetivos y metas medibles',
                'Diseño organizacional: asignación eficiente de recursos, funciones y talento humano',
                'Dirección y liderazgo: coordinación de equipos, comunicación y toma de decisiones',
                'Control y mejora continua: evaluación de indicadores de desempeño y calidad'
            ],
            datosClaveDefault: [
                'Proceso Administrativo: Planear -> Organizar -> Dirigir -> Controlar',
                'Eficiencia Operativa: Optimización de recursos para alcanzar metas institucionales',
                'Gestión del Talento: Liderazgo colaborativo y alineación con la cultura organizacional',
                'Mejora Continua: Monitoreo de KPIs y retroalimentación estratégica'
            ],
            pasosDefault: ['1. Planear', '2. Organizar', '3. Dirigir', '4. Controlar'],
            proposito: 'Ilustrar las fases del proceso administrativo y la gestión estratégica de recursos para lograr la competitividad, eficiencia operativa y cumplimiento de objetivos en la organización.'
        },
        {
            id: 'estadistica',
            nombre: 'Estadística Aplicada, Métricas y Visualización de Datos',
            keywords: [
                'estadistica', 'grafica', 'metricas', 'probabilidad', 'tendencia',
                'indicadores', 'kpi', 'resultados', 'encuesta', 'poblacion',
                'frecuencia', 'media', 'varianza', 'correlacion', 'proyeccion',
                'evaluacion', 'medicion', 'reporte', 'distribucion', 'porcentaje'
            ],
            conceptosDefault: ['Muestreo', 'Tendencia', 'Metricas', 'Proyeccion'],
            subtemasDefault: [
                'Recolección y depuración de datos muestrales representativos de la población',
                'Análisis estadístico descriptivo: medidas de tendencia central y dispersión',
                'Representación visual mediante gráficas comparativas, histogramas y series',
                'Interpretación de correlaciones, proyecciones e inferencia para toma de decisiones'
            ],
            datosClaveDefault: [
                'Muestreo y Datos: Representatividad estadística y confiabilidad cuantitativa',
                'Tendencias Centrales: Comportamiento de media, mediana, varianza y desviación',
                'Visualización Analítica: Conversión de datos crudos en patrones interpretables',
                'Modelado Predictivo: Proyección de escenarios basada en evidencia histórica'
            ],
            pasosDefault: ['1. Recolectar', '2. Procesar', '3. Graficar', '4. Interpretar'],
            proposito: 'Comprender el comportamiento cuantitativo de los fenómenos estudiados a través del análisis estadístico, gráficas comparativas e interpretación de tendencias y métricas.'
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

    // Clasifica un color RGB en un nombre descriptivo en español
    function clasificarNombreColorRGB(r, g, b) {
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const sat = max === 0 ? 0 : (max - min) / max;

        if (lum > 225 && sat < 0.15) return 'Blanco / Gris Muy Claro';
        if (lum < 38) return 'Negro / Azul Noche Profundo';
        if (sat < 0.18) return lum > 135 ? 'Gris Plata' : 'Gris Pizarra';

        if (b > r + 25 && b > g + 15) {
            return lum < 100 ? 'Azul Marino Institucional' : 'Azul Celeste / Cian';
        }
        if (g > r + 15 && g >= b) {
            return lum < 110 ? 'Verde Esmeralda Institucional' : 'Verde Neón / Menta';
        }
        if (r > b + 35 && g > b + 25) {
            return r > g + 35 ? 'Naranja Ámbar' : 'Dorado / Amarillo Ocre';
        }
        if (r > g + 30 && r > b + 20) {
            return 'Rojo Carmesí / Coral';
        }
        if (r > g + 20 && b > g + 20) {
            return 'Púrpura / Magenta';
        }
        return 'Azul Corporativo';
    }

    // Analiza profundamente la imagen de la diapositiva por zonas espaciales, paleta cromática, contraste y densidad
    function analizarEstructuraVisualProfundaCanvas(imgObj) {
        const w = 360;
        const h = 202;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgObj, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;

        let sumLum = 0;
        let sumLumSq = 0;
        let colorfulPixels = 0;
        const conteoColores = {};

        // Dividir la diapositiva en zonas:
        // Header (arriba 25%), Izquierda (medio-izq), Centro (medio-centro), Derecha (medio-der), Footer (abajo 18%)
        let edgesHeader = 0;
        let edgesLeft = 0;
        let edgesCenter = 0;
        let edgesRight = 0;
        let edgesFooter = 0;
        let bloquesGraficosColor = 0;

        const lum = new Float32Array(w * h);
        const satMap = new Float32Array(w * h);

        for (let i = 0; i < w * h; i++) {
            const r = data[i * 4];
            const g = data[i * 4 + 1];
            const b = data[i * 4 + 2];
            const l = 0.299 * r + 0.587 * g + 0.114 * b;
            lum[i] = l;
            sumLum += l;
            sumLumSq += l * l;

            const maxC = Math.max(r, g, b);
            const minC = Math.min(r, g, b);
            const delta = maxC - minC;
            satMap[i] = maxC > 0 ? delta / maxC : 0;

            if (delta > 42) {
                colorfulPixels++;
            }

            // Muestreo de paleta cada 9 píxeles
            if (i % 9 === 0) {
                const nombreColor = clasificarNombreColorRGB(r, g, b);
                conteoColores[nombreColor] = (conteoColores[nombreColor] || 0) + 1;
            }
        }

        // Análisis de gradientes y bordes por zonas de la lámina
        for (let y = 2; y < h - 2; y++) {
            for (let x = 2; x < w - 2; x++) {
                const idx = y * w + x;
                const gx = Math.abs(lum[idx + 1] - lum[idx - 1]);
                const gy = Math.abs(lum[idx + w] - lum[idx - w]);
                const grad = gx + gy;

                if (grad > 36) {
                    if (y < h * 0.25) {
                        edgesHeader++;
                    } else if (y > h * 0.82) {
                        edgesFooter++;
                    } else {
                        if (x < w * 0.34) edgesLeft++;
                        else if (x < w * 0.67) edgesCenter++;
                        else edgesRight++;
                    }
                }
                if (satMap[idx] > 0.35 && grad > 28) {
                    bloquesGraficosColor++;
                }
            }
        }

        const totalPix = w * h;
        const avgLum = sumLum / totalPix;
        const varianceLum = Math.max(0, (sumLumSq / totalPix) - (avgLum * avgLum));
        const stdContrast = Math.sqrt(varianceLum);
        const ratioColor = Math.round((colorfulPixels / totalPix) * 100);
        const totalEdges = edgesHeader + edgesLeft + edgesCenter + edgesRight + edgesFooter;

        // Paleta dominante ordenada
        const paletaOrdenada = Object.entries(conteoColores)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([nombre, cuenta]) => {
                const pct = Math.max(1, Math.round((cuenta / (totalPix / 9)) * 100));
                return `${nombre} (${pct}%)`;
            });

        const fondoTipo = avgLum > 155
            ? 'fondo claro de alta legibilidad'
            : (avgLum > 85 ? 'fondo intermedio contrastado' : 'fondo oscuro / modo presentación de alto impacto');

        const nivelContraste = stdContrast > 62
            ? 'Alto (óptimo para detección inmediata por cámara AR)'
            : (stdContrast > 38 ? 'Medio-Alto (adecuado para seguimiento estable en cámara AR)' : 'Moderado');

        // Detectar distribución espacial exacta
        const elementosDetectados = [];
        if (edgesHeader > 320) {
            elementosDetectados.push('Franja superior con título principal y encabezado jerárquico resaltado');
        }
        if (edgesLeft > 380 && edgesRight > 380 && edgesCenter > 300) {
            elementosDetectados.push('Retícula de 3 bloques o matriz conceptual distribuida en izquierda, centro y derecha');
        } else if (edgesLeft > 420 && edgesRight > 420) {
            elementosDetectados.push('Diseño comparativo en 2 columnas principales (bloques informativos izquierdo y derecho)');
        } else if (edgesCenter > 450) {
            elementosDetectados.push('Composición central focalizada con listado de conceptos o esquema nuclear');
        } else {
            elementosDetectados.push('Estructura expositiva con bloques de síntesis textual');
        }

        if (bloquesGraficosColor > 650 || ratioColor >= 18) {
            elementosDetectados.push('Presencia de diagramas cromáticos, recuadros ilustrados, iconos o gráficos de apoyo visual');
        }
        if (edgesFooter > 220) {
            elementosDetectados.push('Franja inferior con notas de cierre, referencias o indicadores de pie de lámina');
        }

        return {
            anchoOriginal: imgObj.naturalWidth || imgObj.width || 1280,
            altoOriginal: imgObj.naturalHeight || imgObj.height || 720,
            aspectRatio: ((imgObj.naturalWidth || 16) / (imgObj.naturalHeight || 9)).toFixed(2),
            fondoTipo,
            nivelContraste,
            stdContrast: Math.round(stdContrast),
            ratioColor,
            totalEdges,
            paletaDominante: paletaOrdenada,
            elementosDetectados,
            zonas: {
                encabezado: edgesHeader,
                izquierda: edgesLeft,
                centro: edgesCenter,
                derecha: edgesRight,
                pie: edgesFooter
            }
        };
    }

    // Preprocesa la imagen de la diapositiva mejorando contraste para que el OCR lea con máxima nitidez
    function crearDataUrlPreprocesadaParaOCR(imgObj) {
        try {
            const rawW = imgObj.naturalWidth || imgObj.width || 960;
            const rawH = imgObj.naturalHeight || imgObj.height || 540;
            const targetW = Math.min(1280, Math.max(780, rawW));
            const targetH = Math.max(200, Math.round((rawH * targetW) / rawW));

            const canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(imgObj, 0, 0, targetW, targetH);

            const imgData = ctx.getImageData(0, 0, targetW, targetH);
            const d = imgData.data;

            // Calcular luminancia media para determinar si es fondo oscuro o claro
            let sumL = 0;
            const nPix = targetW * targetH;
            for (let i = 0; i < nPix; i++) {
                sumL += 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
            }
            const avgL = sumL / nPix;
            const invertir = avgL < 115; // Si el fondo es oscuro con letras claras, invertir a fondo blanco con letras negras para Tesseract

            for (let i = 0; i < nPix; i++) {
                const off = i * 4;
                let l = 0.299 * d[off] + 0.587 * d[off + 1] + 0.114 * d[off + 2];
                if (invertir) {
                    l = 255 - l;
                }
                // Estiramiento suave de contraste
                const contrast = 1.35;
                let c = (l - 128) * contrast + 128;
                c = Math.max(0, Math.min(255, Math.round(c)));
                d[off] = c;
                d[off + 1] = c;
                d[off + 2] = c;
            }
            ctx.putImageData(imgData, 0, 0);
            return canvas.toDataURL('image/png');
        } catch (e) {
            return null;
        }
    }

    // Carga dinámica de Tesseract.js si no está aún en window y ejecuta OCR local con timeout seguro
    async function asegurarTesseractYEjecutarOCR(imgObj, fallbackDataUrl) {
        if (typeof document !== 'undefined' && (!global.Tesseract || typeof global.Tesseract.recognize !== 'function')) {
            try {
                await new Promise((resolve) => {
                    const existing = document.querySelector('script[data-tesseract-ocr="1"]');
                    if (existing) {
                        existing.addEventListener('load', resolve, { once: true });
                        existing.addEventListener('error', resolve, { once: true });
                        setTimeout(resolve, 2500);
                        return;
                    }
                    const sc = document.createElement('script');
                    sc.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
                    sc.async = true;
                    sc.setAttribute('data-tesseract-ocr', '1');
                    sc.onload = resolve;
                    sc.onerror = resolve;
                    document.head.appendChild(sc);
                    setTimeout(resolve, 2800);
                });
            } catch (e) {}
        }

        if (!global.Tesseract || typeof global.Tesseract.recognize !== 'function') {
            return '';
        }

        try {
            const srcParaOCR = crearDataUrlPreprocesadaParaOCR(imgObj) || fallbackDataUrl;
            const ocrPromise = global.Tesseract.recognize(srcParaOCR, 'spa+eng');
            const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 5500));
            const result = await Promise.race([ocrPromise, timeoutPromise]);
            if (result && result.data && result.data.text) {
                return String(result.data.text)
                    .replace(/[^\x20-\x7E\xA1-\xFF\n]/g, ' ')
                    .trim();
            }
        } catch (e) {
            // Continuar con análisis visual y semántico
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
                nombre: 'Presentación Académica y Desarrollo Conceptual Universitario (UABC)',
                conceptosDefault: ['Analisis', 'Conceptos', 'Aplicacion', 'Sintesis'],
                subtemasDefault: [
                    'Introducción conceptual y definición del tema central de la unidad',
                    'Estructura teórica, clasificación de componentes y características principales',
                    'Análisis comparativo de casos, evidencias y elementos gráficos de la lámina',
                    'Aplicación práctica, conclusiones académicas y síntesis del aprendizaje'
                ],
                datosClaveDefault: [
                    'Eje Temático: Estructura conceptual alineada al programa de la asignatura',
                    'Metodología Expositiva: Integración de definiciones clave y esquemas visuales',
                    'Síntesis Visual: Organización jerárquica para facilitar la retención en 3D',
                    'Objetivo Didáctico: Comprensión integral de los fundamentos presentados'
                ],
                pasosDefault: ['1. Introduccion', '2. Desarrollo', '3. Analisis', '4. Conclusion'],
                proposito: 'Presentar de manera estructurada los conceptos fundamentales, subtemas y relaciones clave de la unidad académica para facilitar su comprensión interactiva en Realidad Aumentada.'
            };
        }
        return mejorDominio;
    }

    function extraerConceptosClaveDeTexto(nombrePres, nombreDiap, textoExtra, dominio) {
        const stopwords = new Set([
            'para', 'como', 'este', 'esta', 'estos', 'estas', 'sobre', 'entre',
            'desde', 'hasta', 'donde', 'cuando', 'porque', 'unidad', 'tema',
            'diapositiva', 'presentacion', 'clase', 'introduccion', 'parte',
            'con', 'del', 'las', 'los', 'una', 'uno', 'unos', 'unas', 'por',
            'que', 'lamina', 'captura', 'actualizada', 'archivo', 'datos',
            'informacion', 'contenido', 'sistema', 'analisis'
        ]);

        // Priorizar palabras significativas del texto OCR y de los títulos (ignorando nombres genéricos como "diapositiva 1")
        const fuenteLimpia = `${textoExtra || ''} ${nombreDiap} ${nombrePres}`
            .replace(/\bdiapositiva\s*\d*\b/gi, ' ')
            .replace(/\bunidad\s*[ivxlcdm0-9]+\b/gi, ' ');

        const palabras = normalizarASCII(fuenteLimpia)
            .replace(/[^a-zA-Z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length >= 4 && !/^\d+$/.test(w) && !stopwords.has(w.toLowerCase()));

        const unicas = [];
        for (const p of palabras) {
            const cap = p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
            if (!unicas.some((u) => u.toLowerCase() === cap.toLowerCase())) {
                unicas.push(cap);
            }
            if (unicas.length >= 6) break;
        }

        let idxFallback = 0;
        while (unicas.length < 4) {
            const fallback = dominio.conceptosDefault[idxFallback++] || 'Conocimiento';
            if (!unicas.some((u) => u.toLowerCase() === fallback.toLowerCase())) {
                unicas.push(fallback);
            } else if (idxFallback > 6) {
                unicas.push('Sintesis');
            }
        }
        return unicas.slice(0, 6);
    }

    // Procesa las líneas leídas por OCR de la imagen para separar título detectado, subtemas y puntos clave
    function estructurarLineasOCR(textoOCR, nombrePresentacion, nombreDiapositiva, dominio, conceptosClave) {
        const lineasCrudas = String(textoOCR || '')
            .split(/\r?\n/)
            .map((l) => l.replace(/\s+/g, ' ').trim())
            .filter((l) => {
                const letras = (l.match(/[a-zA-ZáéíóúÁÉÍÓÚñÑ]/g) || []).length;
                return letras >= 4 && l.length >= 5;
            });

        const tituloDetectadoEnImagen = lineasCrudas.length > 0
            ? lineasCrudas[0]
            : `${nombreDiapositiva} (${nombrePresentacion})`;

        // Extraer subtemas reales de la imagen o enriquecer con los subtemas del dominio
        const subtemasExtraidos = [];
        for (let i = 0; i < lineasCrudas.length && subtemasExtraidos.length < 4; i++) {
            const lin = lineasCrudas[i];
            if (lin.length >= 8 && lin.length <= 120) {
                subtemasExtraidos.push(lin);
            }
        }
        let sIdx = 0;
        while (subtemasExtraidos.length < 4) {
            const fallbackSub = dominio.subtemasDefault[sIdx++] || `Análisis de ${conceptosClave[subtemasExtraidos.length] || 'conceptos'}`;
            subtemasExtraidos.push(fallbackSub);
        }

        // Extraer datos clave / hallazgos específicos
        const datosClave = [];
        if (lineasCrudas.length > 1) {
            lineasCrudas.slice(1, 5).forEach((l, idx) => {
                datosClave.push(`Dato detectado #${idx + 1} en lámina: "${l}"`);
            });
        }
        let dIdx = 0;
        while (datosClave.length < 4) {
            datosClave.push(dominio.datosClaveDefault[dIdx++] || `Concepto clave: ${conceptosClave[dIdx] || 'Síntesis'}`);
        }

        return {
            tituloDetectadoEnImagen,
            lineasDetectadasOCR: lineasCrudas,
            subtemas: subtemasExtraidos.slice(0, 4),
            datosClave: datosClave.slice(0, 4)
        };
    }

    class SlideAnalyzerEngine {
        static async analizarDiapositiva(archivoFoto, nombrePresentacion, nombreDiapositiva) {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = function (ev) {
                    const dataUrl = ev.target.result;
                    const img = new Image();
                    img.onload = async function () {
                        const metricas = analizarEstructuraVisualProfundaCanvas(img);
                        const textoOCR = await asegurarTesseractYEjecutarOCR(img, dataUrl);
                        const nombreArchivo = archivoFoto && archivoFoto.name ? archivoFoto.name.replace(/\.[^.]+$/, '') : '';

                        const textoBase = `${textoOCR} ${nombrePresentacion} ${nombreDiapositiva} ${nombreArchivo}`;
                        const dominio = detectarDominioTematico(textoBase);
                        const conceptosClave = extraerConceptosClaveDeTexto(
                            nombrePresentacion,
                            nombreDiapositiva,
                            textoOCR,
                            dominio
                        );

                        const estructurado = estructurarLineasOCR(
                            textoOCR,
                            nombrePresentacion,
                            nombreDiapositiva,
                            dominio,
                            conceptosClave
                        );

                        const bloqueTextoExtraido = estructurado.lineasDetectadasOCR.length > 0
                            ? `   • Texto leído directamente de la imagen (${estructurado.lineasDetectadasOCR.length} línea(s)):\n` +
                              estructurado.lineasDetectadasOCR.slice(0, 6).map((l) => `     - "${l}"`).join('\n')
                            : `   • Ejes conceptuales identificados: ${conceptosClave.join(', ')}.`;

                        const analisisSistema = [
                            `📌 1. TEMA PRINCIPAL Y CONTEXTO ACADÉMICO`,
                            `   • Título / Tema central: "${estructurado.tituloDetectadoEnImagen}"`,
                            `   • Presentación / Unidad: "${nombrePresentacion}" (Diapositiva: "${nombreDiapositiva}")`,
                            `   • Clasificación disciplinar: ${dominio.nombre}`,
                            ``,
                            `📑 2. SUBTEMAS Y ESTRUCTURA DE CONTENIDO`,
                            ...estructurado.subtemas.map((sub, i) => `   ${i + 1}. ${sub}`),
                            ``,
                            `📊 3. DATOS CLAVE Y CONCEPTOS DETECTADOS EN LA DIAPOSITIVA`,
                            `   • Conceptos nucleares: ${conceptosClave.join(' • ')}`,
                            bloqueTextoExtraido,
                            ...estructurado.datosClave.map((d) => `   • ${d}`),
                            ``,
                            `🖼️ 4. ELEMENTOS VISUALES, COMPOSICIÓN Y PATRÓN AR (.MIND)`,
                            `   • Dimensiones y formato: ${metricas.anchoOriginal} × ${metricas.altoOriginal} px (Relación ${metricas.aspectRatio}:1) sobre ${metricas.fondoTipo}`,
                            `   • Contraste y calidad de rastreo AR: ${metricas.nivelContraste} (Desviación lumínica: ${metricas.stdContrast}, Bordes FREAK: ${metricas.totalEdges})`,
                            `   • Paleta cromática dominante: ${metricas.paletaDominante.join(', ')}`,
                            ...metricas.elementosDetectados.map((el) => `   • Estructura visual: ${el}`),
                            ``,
                            `🎯 5. PROPÓSITO DE LA DIAPOSITIVA`,
                            `   • ${dominio.proposito}`
                        ].join('\n');

                        resolve({
                            fotoDataUrl: dataUrl,
                            analisisSistema,
                            descripcionEditableSugerida: analisisSistema,
                            temaDetectado: dominio.nombre,
                            tituloDetectadoEnImagen: estructurado.tituloDetectadoEnImagen,
                            subtemasDetectados: estructurado.subtemas,
                            datosClaveDetectados: estructurado.datosClave,
                            dominioId: dominio.id,
                            conceptosClave,
                            pasosFlujo: dominio.pasosDefault.slice(0, 4),
                            metricasVisuales: metricas
                        });
                    };
                    img.onerror = function () {
                        const dominio = detectarDominioTematico(`${nombrePresentacion} ${nombreDiapositiva}`);
                        const conceptosClave = dominio.conceptosDefault.slice(0, 4);
                        const analisisSistema = [
                            `📌 1. TEMA PRINCIPAL Y CONTEXTO ACADÉMICO`,
                            `   • Tema central: "${nombreDiapositiva}" dentro de "${nombrePresentacion}"`,
                            `   • Área disciplinar: ${dominio.nombre}`,
                            ``,
                            `📑 2. SUBTEMAS Y ESTRUCTURA DE CONTENIDO`,
                            ...dominio.subtemasDefault.map((sub, i) => `   ${i + 1}. ${sub}`),
                            ``,
                            `📊 3. DATOS CLAVE Y CONCEPTOS DETECTADOS`,
                            `   • Conceptos nucleares: ${conceptosClave.join(' • ')}`,
                            ...dominio.datosClaveDefault.map((d) => `   • ${d}`),
                            ``,
                            `🎯 5. PROPÓSITO DE LA DIAPOSITIVA`,
                            `   • ${dominio.proposito}`
                        ].join('\n');

                        resolve({
                            fotoDataUrl: dataUrl || '',
                            analisisSistema,
                            descripcionEditableSugerida: analisisSistema,
                            temaDetectado: dominio.nombre,
                            tituloDetectadoEnImagen: nombreDiapositiva,
                            subtemasDetectados: dominio.subtemasDefault,
                            datosClaveDetectados: dominio.datosClaveDefault,
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
    // 3. MOTOR GENERADOR DE ANIMACIONES 3D A-FRAME DETALLADAS Y VINCULADAS
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
        const textoFinal = String(descripcionConfirmada || context.analisisSistema || '').trim();
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
        const badgeRaw = normalizarASCII(`${context.nombreDiapositiva} | ${context.nombrePresentacion}`).toUpperCase();
        const badgeTexto = badgeRaw.length > 36 ? badgeRaw.slice(0, 36) : (badgeRaw || 'DIAPOSITIVA AR - UABC');

        // Filtrar encabezados numerados del reporte del sistema para extraer oraciones sustantivas reales
        const lineasSustantivas = textoFinal
            .split(/\r?\n/)
            .map((linea) =>
                linea
                    .replace(/^[📌📑📊🖼️🎯•\-\s]+/, '')
                    .replace(/^\d+\.\s*(TEMA PRINCIPAL|SUBTEMAS|DATOS CLAVE|ELEMENTOS VISUALES|PROPOSITO|PROPÓSITO).*$/i, '')
                    .replace(/^(Titulo \/ Tema central|Título \/ Tema central|Tema central|Tema identificado|Presentacion \/ Unidad|Presentación \/ Unidad|Clasificacion disciplinar|Clasificación disciplinar|Area tematica clasificada|Área temática clasificada|Conceptos nucleares|Conceptos centrales detectados|Texto leido directamente[^:]*|Texto leído directamente[^:]*|Dimensiones y formato|Contraste y calidad[^:]*|Paleta cromatica dominante|Paleta cromática dominante|Estructura visual|Dato detectado #\d+ en lamina|Dato detectado #\d+ en lámina|Proposito de la diapositiva|Propósito de la diapositiva)\s*:\s*/i, '')
                    .replace(/^-\s*/, '')
                    .replace(/["'<>]/g, '')
                    .trim()
            )
            .filter((l) =>
                l.length > 6 &&
                !/^\d+\s*[x×]\s*\d+\s*px/i.test(l) &&
                !/^(Alto|Medio-Alto|Moderado)\s*\(/i.test(l) &&
                !/\(\d+%\)/.test(l) &&
                !/^Franja (superior|inferior)/i.test(l)
            );

        // Si el usuario ingresó información manual libre, sus líneas están intactas en lineasSustantivas
        const frasePrincipal = lineasSustantivas.length > 0
            ? lineasSustantivas.slice(0, 2).join(' - ')
            : `${context.nombreDiapositiva}: ${conceptos.slice(0, 4).join(', ')}`;

        const lineasHUD = envolverLineasHUD(frasePrincipal, 32, 3);
        const valorHUD = lineasHUD.join('\\n');
        const subtituloHUD = conceptos.slice(0, 4).join('  |  ');

        // Extraer 4 tarjetas informativas detalladas (Subtemas / Bloques de datos vinculados a la diapositiva)
        const bloquesFuente = (context.modoInformacionManual && lineasSustantivas.length > 0)
            ? lineasSustantivas
            : (Array.isArray(context.subtemasDetectados) && context.subtemasDetectados.length >= 2
                ? context.subtemasDetectados
                : (lineasSustantivas.length >= 2 ? lineasSustantivas : dominio.subtemasDefault));

        const tarjetasInformativas = [];
        for (let i = 0; i < 4; i++) {
            const conceptoTitulo = normalizarASCII(conceptos[i] || dominio.conceptosDefault[i] || `Bloque ${i + 1}`).toUpperCase().slice(0, 18);
            const textoDetalleRaw = bloquesFuente[i] || dominio.datosClaveDefault[i] || dominio.proposito;
            const lineasDetalle = envolverLineasHUD(textoDetalleRaw, 24, 3);
            tarjetasInformativas.push({
                etiqueta: `SUBTEMA 0${i + 1} | ${conceptoTitulo}`,
                conceptoCorto: normalizarASCII(conceptos[i] || `Clave ${i + 1}`).slice(0, 12),
                detalle3Lineas: lineasDetalle.join('\\n'),
                indicador: `${78 + ((i * 7) % 21)}%`
            });
        }

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
            conceptos: conceptos.slice(0, 4),
            tarjetasInformativas,
            pasos,
            dominio
        };
    }

    // Bloque 3D compartido de Tarjetas Holográficas Laterales de Subtemas e Indicadores vinculados a la diapositiva
    function construirPanelesLateralesDetallados(datos) {
        const t = datos.tarjetasInformativas;
        return `
    <!-- PANELES HOLOGRÁFICOS DE SUBTEMAS Y DATOS CLAVE VINCULADOS A LA DIAPOSITIVA -->
    <!-- Tarjeta Informativa Superior Izquierda (Subtema 1) -->
    <a-entity position="-3.45 0.55 0.65" rotation="0 22 0"
        animation="property: position; to: -3.45 0.67 0.65; dir: alternate; dur: 2400; loop: true; easing: easeInOutSine">
        <a-plane width="2.15" height="1.08" material="color: #040d21; opacity: 0.88; transparent: true; side: double"></a-plane>
        <a-box width="2.18" height="0.035" depth="0.03" position="0 0.53 0.01" material="color: #00f0ff; emissive: #00f0ff; emissiveIntensity: 1.3"></a-box>
        <a-box width="2.18" height="0.035" depth="0.03" position="0 -0.53 0.01" material="color: #0284c7; emissive: #0284c7; emissiveIntensity: 1.0"></a-box>
        <a-box width="2.0" height="0.22" depth="0.02" position="0 0.37 0.015" material="color: #092468; emissive: #0284c7; emissiveIntensity: 0.5">
            <a-text value="${t[0].etiqueta}" align="center" color="#38bdf8" width="2.4" position="0 0 0.02"></a-text>
        </a-box>
        <a-text value="${t[0].detalle3Lineas}" align="center" color="#f8fafc" width="2.35" line-height="56" position="0 -0.08 0.02"></a-text>
    </a-entity>

    <!-- Tarjeta Informativa Superior Derecha (Subtema 2) -->
    <a-entity position="3.45 0.55 0.65" rotation="0 -22 0"
        animation="property: position; to: 3.45 0.67 0.65; dir: alternate; dur: 2600; delay: 300; loop: true; easing: easeInOutSine">
        <a-plane width="2.15" height="1.08" material="color: #040d21; opacity: 0.88; transparent: true; side: double"></a-plane>
        <a-box width="2.18" height="0.035" depth="0.03" position="0 0.53 0.01" material="color: #fbbf24; emissive: #f59e0b; emissiveIntensity: 1.3"></a-box>
        <a-box width="2.18" height="0.035" depth="0.03" position="0 -0.53 0.01" material="color: #d97706; emissive: #d97706; emissiveIntensity: 1.0"></a-box>
        <a-box width="2.0" height="0.22" depth="0.02" position="0 0.37 0.015" material="color: #78350f; emissive: #d97706; emissiveIntensity: 0.5">
            <a-text value="${t[1].etiqueta}" align="center" color="#fde047" width="2.4" position="0 0 0.02"></a-text>
        </a-box>
        <a-text value="${t[1].detalle3Lineas}" align="center" color="#f8fafc" width="2.35" line-height="56" position="0 -0.08 0.02"></a-text>
    </a-entity>

    <!-- Tarjeta de Datos Destacados Inferior Frontal Izquierda (Subtema 3) -->
    <a-entity position="-1.55 -1.35 0.92" rotation="-12 8 0"
        animation="property: position; to: -1.55 -1.27 0.92; dir: alternate; dur: 2200; delay: 150; loop: true; easing: easeInOutSine">
        <a-plane width="2.25" height="0.76" material="color: #031525; opacity: 0.88; transparent: true; side: double"></a-plane>
        <a-box width="2.28" height="0.03" depth="0.02" position="0 0.37 0.01" material="color: #10b981; emissive: #10b981; emissiveIntensity: 1.3"></a-box>
        <a-text value="${t[2].etiqueta}" align="center" color="#6ee7b7" width="2.4" position="0 0.22 0.02"></a-text>
        <a-text value="${t[2].detalle3Lineas}" align="center" color="#e2e8f0" width="2.3" line-height="54" position="0 -0.08 0.02"></a-text>
    </a-entity>

    <!-- Tarjeta de Datos Destacados Inferior Frontal Derecha (Subtema 4) -->
    <a-entity position="1.55 -1.35 0.92" rotation="-12 -8 0"
        animation="property: position; to: 1.55 -1.27 0.92; dir: alternate; dur: 2200; delay: 450; loop: true; easing: easeInOutSine">
        <a-plane width="2.25" height="0.76" material="color: #190726; opacity: 0.88; transparent: true; side: double"></a-plane>
        <a-box width="2.28" height="0.03" depth="0.02" position="0 0.37 0.01" material="color: #ec4899; emissive: #ec4899; emissiveIntensity: 1.3"></a-box>
        <a-text value="${t[3].etiqueta}" align="center" color="#f9a8d4" width="2.4" position="0 0.22 0.02"></a-text>
        <a-text value="${t[3].detalle3Lineas}" align="center" color="#e2e8f0" width="2.3" line-height="54" position="0 -0.08 0.02"></a-text>
    </a-entity>`;
    }

    const VARIANTES_CATALOGO = [
        {
            id: 'laboratorio_holografico',
            nombre: 'Variante 1 • Laboratorio Científico Holográfico, Tarjetas de Subtemas, Investigador 3D y Gráfica de Conceptos',
            descripcion: 'Incluye 4 tarjetas holográficas con los subtemas y datos clave de la diapositiva, gráfica 3D etiquetada con los conceptos detectados, investigador 3D animado, microscopio láser, ADN, diagrama de 4 etapas y panel HUD central a 60 FPS.'
        },
        {
            id: 'comando_cibernetico',
            nombre: 'Variante 2 • Centro de Comando Cibernético, Paneles de Telemetría, Núcleo Orbital y Torres de Datos',
            descripcion: 'Incluye 4 paneles de telemetría con los subtemas de la lámina, núcleo icosaédrico con triple giroscopio, 4 satélites conceptuales 360°, servidor holográfico con indicadores LED, ruta de 4 nodos y HUD neón a 60 FPS.'
        },
        {
            id: 'ejecutivo_analitico',
            nombre: 'Variante 3 • Escenario Ejecutivo UABC, Tableros de Indicadores, Globo de Red Global y Columnas KPI',
            descripcion: 'Incluye 4 tableros ejecutivos con los datos clave de la diapositiva, podio institucional UABC (Azul/Oro/Verde), globo 3D de red conectada, columnas KPI etiquetadas, balanza estratégica y HUD a 60 FPS.'
        },
        {
            id: 'aula_interactiva',
            nombre: 'Variante 4 • Aula Virtual Interactiva, Módulos de Aprendizaje, Libro Proyector 3D y Carrusel Conceptual',
            descripcion: 'Incluye 4 módulos flotantes de aprendizaje con los subtemas de la diapositiva, libro 3D gigante con haz holográfico, carrusel de cristales etiquetados, ruta secuencial de 4 etapas y HUD académico a 60 FPS.'
        }
    ];

    // Generador de Variante 1: Laboratorio Holográfico & Investigador 3D + Tarjetas de Subtemas
    function construirEscenaVariante1(datos) {
        const [p1, p2, p3, p4] = datos.pasos;
        const [c1, c2, c3, c4] = datos.conceptos;
        const panelesSubtemas = construirPanelesLateralesDetallados(datos);
        return `<a-entity id="escena_estudio_pro" position="0 0 0" scale="0.12 0.12 0.12">

    <!-- 1. ILUMINACIÓN OPTIMIZADA -->
    <a-light type="ambient" color="#dbeafe" intensity="0.9"></a-light>
    <a-light type="hemisphere" color="#38bdf8" groundColor="#0f172a" intensity="0.9"></a-light>
    <a-light type="directional" color="#ffffff" intensity="1.2" position="2 6 5"></a-light>

    <!-- 2. BASE HOLOGRÁFICA MULTINIVEL + HAZ DE PROYECCIÓN -->
    <a-entity position="0 -2.0 0">
        <a-circle radius="4.3" rotation="-90 0 0" position="0 -0.02 0"
            material="color: #0284c7; opacity: 0.22; transparent: true; roughness: 0.15; metalness: 0.9; side: double">
        </a-circle>
        <a-cone radius-bottom="3.6" radius-top="4.3" height="2.5" open-ended="true" position="0 1.2 0"
            material="color: #00f0ff; emissive: #0284c7; emissiveIntensity: 0.6; opacity: 0.08; transparent: true; side: double"
            animation="property: material.opacity; from: 0.05; to: 0.13; dir: alternate; dur: 2200; loop: true; easing: easeInOutSine">
        </a-cone>
        <a-ring radius-inner="3.65" radius-outer="3.85" rotation="-90 0 0"
            material="color: #00f0ff; emissive: #00f0ff; emissiveIntensity: 1.0; opacity: 0.85; transparent: true; side: double"
            animation="property: rotation; to: -90 360 0; dur: 24000; loop: true; easing: linear">
        </a-ring>
        <a-ring radius-inner="2.65" radius-outer="2.8" rotation="-90 0 0"
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
        <a-octahedron radius="0.09" position="3.7 1.3 0.4" material="color: #00f0ff; emissive: #00f0ff; emissiveIntensity: 1.4"
            animation="property: position; to: 3.7 1.8 0.4; dir: alternate; dur: 1900; loop: true; easing: easeInOutSine"></a-octahedron>
        <a-octahedron radius="0.08" position="-3.6 1.5 -0.6" material="color: #fbbf24; emissive: #f59e0b; emissiveIntensity: 1.4"
            animation="property: position; to: -3.6 2.0 -0.6; dir: alternate; dur: 2300; loop: true; easing: easeInOutSine"></a-octahedron>
        <a-octahedron radius="0.07" position="1.9 2.5 -1.2" material="color: #ec4899; emissive: #db2777; emissiveIntensity: 1.4"
            animation="property: position; to: 1.9 2.9 -1.2; dir: alternate; dur: 2100; loop: true; easing: easeInOutSine"></a-octahedron>
        <a-octahedron radius="0.08" position="-2.1 -0.9 1.3" material="color: #10b981; emissive: #059669; emissiveIntensity: 1.4"
            animation="property: position; to: -2.1 -0.4 1.3; dir: alternate; dur: 1800; loop: true; easing: easeInOutSine"></a-octahedron>
    </a-entity>

    <!-- 4. GRÁFICA DE BARRAS 3D CON ETIQUETAS DE LOS CONCEPTOS DE LA DIAPOSITIVA (Izquierda Baja) -->
    <a-entity position="-3.4 -1.45 0.35" rotation="0 24 0">
        <a-box width="2.25" height="0.08" depth="0.75" position="0 0 0" material="color: #0f172a; metalness: 0.7; roughness: 0.3"></a-box>
        <a-plane width="2.25" height="1.35" position="0 0.7 -0.34"
            material="color: #020617; opacity: 0.72; transparent: true; side: double"></a-plane>
        <a-text value="METRICAS: ${normalizarASCII(c1).toUpperCase().slice(0, 12)}" align="center" color="#38bdf8" width="2.4" position="0 1.2 -0.3"></a-text>

        <a-entity position="-0.72 0.04 0"
            animation="property: scale; from: 1 0.3 1; to: 1 1 1; dir: alternate; dur: 2200; loop: true; easing: easeInOutSine">
            <a-box width="0.26" height="0.58" depth="0.24" position="0 0.29 0"
                material="color: #00f0ff; emissive: #0284c7; emissiveIntensity: 0.85"></a-box>
        </a-entity>
        <a-text value="${normalizarASCII(c1).slice(0, 7)}" align="center" color="#67e8f9" width="1.7" position="-0.72 0.74 0.14"></a-text>

        <a-entity position="-0.24 0.04 0"
            animation="property: scale; from: 1 0.35 1; to: 1 1 1; dir: alternate; dur: 2200; delay: 350; loop: true; easing: easeInOutSine">
            <a-box width="0.26" height="0.82" depth="0.24" position="0 0.41 0"
                material="color: #fbbf24; emissive: #d97706; emissiveIntensity: 0.85"></a-box>
        </a-entity>
        <a-text value="${normalizarASCII(c2).slice(0, 7)}" align="center" color="#fde047" width="1.7" position="-0.24 0.96 0.14"></a-text>

        <a-entity position="0.24 0.04 0"
            animation="property: scale; from: 1 0.3 1; to: 1 1 1; dir: alternate; dur: 2200; delay: 700; loop: true; easing: easeInOutSine">
            <a-box width="0.26" height="0.7" depth="0.24" position="0 0.35 0"
                material="color: #ec4899; emissive: #be185d; emissiveIntensity: 0.85"></a-box>
        </a-entity>
        <a-text value="${normalizarASCII(c3).slice(0, 7)}" align="center" color="#f9a8d4" width="1.7" position="0.24 0.84 0.14"></a-text>

        <a-entity position="0.72 0.04 0"
            animation="property: scale; from: 1 0.4 1; to: 1 1 1; dir: alternate; dur: 2200; delay: 1050; loop: true; easing: easeInOutSine">
            <a-box width="0.26" height="0.98" depth="0.24" position="0 0.49 0"
                material="color: #10b981; emissive: #059669; emissiveIntensity: 0.9"></a-box>
        </a-entity>
        <a-text value="${normalizarASCII(c4).slice(0, 7)}" align="center" color="#6ee7b7" width="1.7" position="0.72 1.1 0.14"></a-text>
    </a-entity>

    <!-- 5. PROFESOR / INVESTIGADOR ANIMADO SALUDANDO (Derecha) -->
    <a-entity position="3.15 -1.05 0.4" rotation="0 -24 0"
        animation="property: position; to: 3.15 -0.96 0.4; dir: alternate; dur: 2000; loop: true; easing: easeInOutSine"
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
    </a-entity>

    <!-- 6. MICROSCOPIO CON ESCÁNER LÁSER (Derecha Fondo) -->
    <a-entity position="3.8 -1.25 -0.6" rotation="0 -40 0">
        <a-cylinder radius="0.55" height="0.1" position="0 0 0" material="color: #1e293b; metalness: 0.8"></a-cylinder>
        <a-box width="0.16" height="1.25" depth="0.18" position="-0.3 0.68 0" rotation="0 0 -15" material="color: #334155; metalness: 0.8"></a-box>
        <a-box width="0.75" height="0.04" depth="0.65" position="0.05 0.65 0" material="color: #020617; metalness: 0.9"></a-box>
        <a-ring radius-inner="0.08" radius-outer="0.24" position="0.05 0.72 0" rotation="-90 0 0"
            material="color: #4ade80; emissive: #22c55e; emissiveIntensity: 1.2; opacity: 0.8; transparent: true; side: double"
            animation="property: position; to: 0.05 1.1 0; dir: alternate; dur: 1200; loop: true; easing: easeInOutSine">
        </a-ring>
    </a-entity>

    <!-- 7. DOBLE HÉLICE DE ADN ROTATORIA (Izquierda Arriba) -->
    <a-entity position="-3.25 2.05 0.2"
        animation="property: rotation; to: 0 360 0; dur: 7500; loop: true; easing: linear">
        <a-cylinder radius="0.03" height="0.85" position="0 0.5 0" rotation="0 0 90" material="color: #94a3b8"></a-cylinder>
        <a-sphere radius="0.11" position="-0.42 0.5 0" material="color: #ef4444; emissive: #dc2626; emissiveIntensity: 0.9"></a-sphere>
        <a-sphere radius="0.11" position="0.42 0.5 0" material="color: #00f0ff; emissive: #0284c7; emissiveIntensity: 0.9"></a-sphere>
        <a-cylinder radius="0.03" height="0.85" position="0 0.15 0" rotation="0 45 90" material="color: #94a3b8"></a-cylinder>
        <a-sphere radius="0.11" position="-0.3 0.15 0.3" material="color: #eab308; emissive: #ca8a04; emissiveIntensity: 0.9"></a-sphere>
        <a-sphere radius="0.11" position="0.3 0.15 -0.3" material="color: #22c55e; emissive: #16a34a; emissiveIntensity: 0.9"></a-sphere>
        <a-cylinder radius="0.03" height="0.85" position="0 -0.2 0" rotation="90 0 0" material="color: #94a3b8"></a-cylinder>
        <a-sphere radius="0.11" position="0 -0.2 0.42" material="color: #ec4899; emissive: #db2777; emissiveIntensity: 0.9"></a-sphere>
        <a-sphere radius="0.11" position="0 -0.2 -0.42" material="color: #a855f7; emissive: #7e22ce; emissiveIntensity: 0.9"></a-sphere>
    </a-entity>

    <!-- 8. BOMBILLA EUREKA CON TRIPLE ÓRBITA ATÓMICA (Centro Superior) -->
    <a-entity position="0 2.75 0.1"
        animation="property: position; to: 0 2.98 0.1; dir: alternate; dur: 2200; loop: true; easing: easeInOutSine">
        <a-sphere radius="0.42" material="color: #fef08a; opacity: 0.85; transparent: true; emissive: #facc15; emissiveIntensity: 1.1"></a-sphere>
        <a-entity rotation="60 30 0" animation="property: rotation; to: 60 390 0; dur: 5200; loop: true; easing: linear">
            <a-torus radius="0.82" radius-tubular="0.015" material="color: #00f0ff; emissive: #00f0ff; emissiveIntensity: 1; opacity: 0.8; transparent: true"></a-torus>
            <a-sphere radius="0.07" position="0.82 0 0" material="color: #ffffff; emissive: #00f0ff; emissiveIntensity: 1.6"></a-sphere>
        </a-entity>
        <a-entity rotation="-60 -30 0" animation="property: rotation; to: -60 -390 0; dur: 6800; loop: true; easing: linear">
            <a-torus radius="0.95" radius-tubular="0.015" material="color: #facc15; emissive: #f59e0b; emissiveIntensity: 1; opacity: 0.8; transparent: true"></a-torus>
            <a-sphere radius="0.07" position="-0.95 0 0" material="color: #ffffff; emissive: #facc15; emissiveIntensity: 1.6"></a-sphere>
        </a-entity>
    </a-entity>

    ${panelesSubtemas}

    <!-- 10. DIAGRAMA DE FLUJO SECUENCIAL CON FLECHAS 3D REALES -->
    <a-entity position="0 -0.52 0.96">
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
    <a-entity position="0 0.56 0.92"
        animation="property: position; to: 0 0.68 0.92; dir: alternate; dur: 2500; loop: true; easing: easeInOutSine">
        <a-plane width="4.4" height="2.0" position="0 0.08 -0.06"
            material="color: #030712; opacity: 0.88; transparent: true; roughness: 0.4; side: double">
        </a-plane>
        <a-box width="4.44" height="0.04" depth="0.03" position="0 1.08 -0.05"
            material="color: #00f0ff; emissive: #00f0ff; emissiveIntensity: 1.4"></a-box>
        <a-box width="4.44" height="0.04" depth="0.03" position="0 -0.92 -0.05"
            material="color: #10b981; emissive: #10b981; emissiveIntensity: 1.4"></a-box>

        <a-box width="3.9" height="0.34" depth="0.03" position="0 0.94 0.01"
            material="color: #092468; emissive: #1d4ed8; emissiveIntensity: 0.4">
            <a-text value="${datos.badgeTexto}" align="center" color="#38bdf8" width="3.8" position="0 0 0.025"></a-text>
        </a-box>

        <a-text class="texto-glow-cambiante"
            value="${datos.valorHUD}"
            color="#00f0ff" align="center" width="4.3" line-height="62" position="0.02 0.22 -0.01">
        </a-text>

        <a-text class="texto-color-cambiante"
            value="${datos.valorHUD}"
            color="#ffffff" align="center" width="4.15" line-height="62" position="0 0.22 0.02">
        </a-text>

        <a-text class="texto-acento-cambiante"
            value="${datos.subtituloHUD}"
            color="#fbbf24" align="center" width="3.5" position="0 -0.52 0.02">
        </a-text>
    </a-entity>

</a-entity>`;
    }

    // Generador de Variante 2: Centro de Comando Cibernético & Núcleo Orbital 360° + Paneles de Telemetría
    function construirEscenaVariante2(datos) {
        const [p1, p2, p3, p4] = datos.pasos;
        const [c1, c2, c3, c4] = datos.conceptos;
        const panelesSubtemas = construirPanelesLateralesDetallados(datos);
        return `<a-entity id="escena_comando_cyber" position="0 0 0" scale="0.12 0.12 0.12">

    <!-- 1. ILUMINACIÓN CIBERNÉTICA DE ALTO CONTRASTE -->
    <a-light type="ambient" color="#e0f2fe" intensity="0.95"></a-light>
    <a-light type="hemisphere" color="#00f0ff" groundColor="#092468" intensity="1.0"></a-light>
    <a-light type="directional" color="#ffffff" intensity="1.3" position="0 7 5"></a-light>

    <!-- 2. PLATAFORMA DE COMANDO RADIAL Y ESCÁNER DE ONDA -->
    <a-entity position="0 -2.0 0">
        <a-cylinder radius="4.1" height="0.08" position="0 -0.04 0"
            material="color: #091936; metalness: 0.85; roughness: 0.2; opacity: 0.78; transparent: true"></a-cylinder>
        <a-ring radius-inner="3.75" radius-outer="4.0" rotation="-90 0 0"
            material="color: #38bdf8; emissive: #0284c7; emissiveIntensity: 1.2; side: double"
            animation="property: rotation; to: -90 -360 0; dur: 18000; loop: true; easing: linear"></a-ring>
        <a-ring radius-inner="2.1" radius-outer="2.35" rotation="-90 0 0"
            material="color: #a855f7; emissive: #9333ea; emissiveIntensity: 1.1; side: double"
            animation="property: scale; from: 0.85 0.85 0.85; to: 1.22 1.22 1.22; dir: alternate; dur: 1600; loop: true; easing: easeInOutSine"></a-ring>
    </a-entity>

    <!-- 3. NÚCLEO CENTRAL HOLOGRÁFICO (ICOSAEDRO + TRIPLE GIROSCOPIO SUPERIOR) -->
    <a-entity position="0 2.72 0.15">
        <a-icosahedron radius="0.46"
            material="color: #00f0ff; emissive: #0284c7; emissiveIntensity: 1.3; metalness: 0.8; roughness: 0.15"
            animation="property: rotation; to: 360 360 0; dur: 9000; loop: true; easing: linear"></a-icosahedron>
        <a-torus radius="0.76" radius-tubular="0.022"
            material="color: #fbbf24; emissive: #f59e0b; emissiveIntensity: 1.2"
            animation="property: rotation; to: 360 180 0; dur: 5400; loop: true; easing: linear"></a-torus>
        <a-torus radius="0.96" radius-tubular="0.018"
            material="color: #ec4899; emissive: #db2777; emissiveIntensity: 1.2"
            animation="property: rotation; to: -360 0 360; dur: 7200; loop: true; easing: linear"></a-torus>
    </a-entity>

    <!-- 4. TORRE SERVIDOR HOLOGRÁFICO CON LEDS PULSANTES (Izquierda Fondo) -->
    <a-entity position="-3.6 -1.1 -0.3" rotation="0 25 0">
        <a-box width="1.1" height="1.9" depth="0.7" material="color: #0f172a; metalness: 0.85; roughness: 0.2"></a-box>
        <a-box width="0.9" height="0.2" depth="0.05" position="0 0.58 0.36"
            material="color: #00f0ff; emissive: #00f0ff; emissiveIntensity: 1.2"
            animation="property: material.emissiveIntensity; from: 0.4; to: 1.5; dir: alternate; dur: 700; loop: true"></a-box>
        <a-box width="0.9" height="0.2" depth="0.05" position="0 0.18 0.36"
            material="color: #10b981; emissive: #10b981; emissiveIntensity: 1.2"
            animation="property: material.emissiveIntensity; from: 0.4; to: 1.5; dir: alternate; dur: 900; delay: 250; loop: true"></a-box>
        <a-box width="0.9" height="0.2" depth="0.05" position="0 -0.22 0.36"
            material="color: #fbbf24; emissive: #fbbf24; emissiveIntensity: 1.2"
            animation="property: material.emissiveIntensity; from: 0.4; to: 1.5; dir: alternate; dur: 800; delay: 500; loop: true"></a-box>
        <a-text value="${normalizarASCII(c1).toUpperCase().slice(0, 12)}" align="center" color="#38bdf8" width="2.3" position="0 1.15 0"></a-text>
    </a-entity>

    <!-- 5. RADAR HOLOGRÁFICO 3D Y CÁPSULA DE ENERGÍA (Derecha Fondo) -->
    <a-entity position="3.6 -1.1 -0.3" rotation="0 -25 0">
        <a-cylinder radius="0.68" height="1.65" open-ended="true"
            material="color: #00f0ff; emissive: #0284c7; emissiveIntensity: 0.8; opacity: 0.25; transparent: true; side: double"></a-cylinder>
        <a-dodecahedron radius="0.42" position="0 0.1 0"
            material="color: #10b981; emissive: #059669; emissiveIntensity: 1.1"
            animation="property: rotation; to: 0 360 360; dur: 6500; loop: true; easing: linear"></a-dodecahedron>
        <a-text value="${normalizarASCII(c2).toUpperCase().slice(0, 12)}" align="center" color="#fbbf24" width="2.3" position="0 1.12 0"></a-text>
    </a-entity>

    <!-- 6. SATÉLITES CONCEPTUALES ORBITANDO EN 360 GRADOS -->
    <a-entity position="0 1.75 0" animation="property: rotation; to: 0 360 0; dur: 22000; loop: true; easing: linear">
        <a-entity position="3.45 0.35 0">
            <a-box width="1.35" height="0.34" depth="0.06" material="color: #092468; emissive: #0284c7; emissiveIntensity: 0.7"></a-box>
            <a-text value="${normalizarASCII(c1).slice(0, 14)}" align="center" color="#ffffff" width="2.6" position="0 0 0.04"></a-text>
        </a-entity>
        <a-entity position="-3.45 0.35 0" rotation="0 180 0">
            <a-box width="1.35" height="0.34" depth="0.06" material="color: #065f46; emissive: #10b981; emissiveIntensity: 0.7"></a-box>
            <a-text value="${normalizarASCII(c2).slice(0, 14)}" align="center" color="#ffffff" width="2.6" position="0 0 0.04"></a-text>
        </a-entity>
        <a-entity position="0 0.35 3.45">
            <a-box width="1.35" height="0.34" depth="0.06" material="color: #78350f; emissive: #f59e0b; emissiveIntensity: 0.7"></a-box>
            <a-text value="${normalizarASCII(c3).slice(0, 14)}" align="center" color="#ffffff" width="2.6" position="0 0 0.04"></a-text>
        </a-entity>
        <a-entity position="0 0.35 -3.45" rotation="0 180 0">
            <a-box width="1.35" height="0.34" depth="0.06" material="color: #701a75; emissive: #ec4899; emissiveIntensity: 0.7"></a-box>
            <a-text value="${normalizarASCII(c4).slice(0, 14)}" align="center" color="#ffffff" width="2.6" position="0 0 0.04"></a-text>
        </a-entity>
    </a-entity>

    ${panelesSubtemas}

    <!-- 7. RUTA DE PROCESAMIENTO DE 4 NODOS (Frontal Bajo) -->
    <a-entity position="0 -0.52 0.96">
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
    <a-entity position="0 0.56 0.92"
        animation="property: position; to: 0 0.68 0.92; dir: alternate; dur: 2400; loop: true; easing: easeInOutSine">
        <a-plane width="4.4" height="2.0" position="0 0.08 -0.06"
            material="color: #040b1a; opacity: 0.88; transparent: true; side: double"></a-plane>
        <a-box width="4.44" height="0.045" depth="0.04" position="0 1.08 -0.04"
            material="color: #a855f7; emissive: #a855f7; emissiveIntensity: 1.5"></a-box>
        <a-box width="4.44" height="0.045" depth="0.04" position="0 -0.92 -0.04"
            material="color: #00f0ff; emissive: #00f0ff; emissiveIntensity: 1.5"></a-box>

        <a-box width="3.9" height="0.34" depth="0.03" position="0 0.94 0.01"
            material="color: #3b0764; emissive: #7e22ce; emissiveIntensity: 0.55">
            <a-text value="${datos.badgeTexto}" align="center" color="#f0abfc" width="3.8" position="0 0 0.025"></a-text>
        </a-box>

        <a-text class="texto-glow-cambiante"
            value="${datos.valorHUD}"
            color="#00f0ff" align="center" width="4.3" line-height="62" position="0.02 0.22 -0.01">
        </a-text>
        <a-text class="texto-color-cambiante"
            value="${datos.valorHUD}"
            color="#ffffff" align="center" width="4.15" line-height="62" position="0 0.22 0.02">
        </a-text>
        <a-text class="texto-acento-cambiante"
            value="${datos.subtituloHUD}"
            color="#fbbf24" align="center" width="3.5" position="0 -0.52 0.02">
        </a-text>
    </a-entity>

</a-entity>`;
    }

    // Generador de Variante 3: Escenario Ejecutivo de Análisis, Gráficas & Red Global + Tableros de Datos
    function construirEscenaVariante3(datos) {
        const [p1, p2, p3, p4] = datos.pasos;
        const [c1, c2, c3, c4] = datos.conceptos;
        const panelesSubtemas = construirPanelesLateralesDetallados(datos);
        return `<a-entity id="escena_ejecutiva_uabc" position="0 0 0" scale="0.12 0.12 0.12">

    <!-- 1. ILUMINACIÓN INSTITUCIONAL DORADA Y ESMERALDA -->
    <a-light type="ambient" color="#fef3c7" intensity="0.95"></a-light>
    <a-light type="hemisphere" color="#fbbf24" groundColor="#092468" intensity="0.95"></a-light>
    <a-light type="directional" color="#ffffff" intensity="1.25" position="2 6 5"></a-light>

    <!-- 2. PODIO HOLOGRÁFICO UABC (AZUL, ORO Y VERDE) -->
    <a-entity position="0 -2.0 0">
        <a-circle radius="4.2" rotation="-90 0 0" position="0 -0.02 0"
            material="color: #092468; opacity: 0.35; transparent: true; metalness: 0.85; side: double"></a-circle>
        <a-ring radius-inner="3.65" radius-outer="3.9" rotation="-90 0 0"
            material="color: #f5b316; emissive: #d97706; emissiveIntensity: 1.1; side: double"
            animation="property: rotation; to: -90 360 0; dur: 20000; loop: true; easing: linear"></a-ring>
        <a-ring radius-inner="2.4" radius-outer="2.6" rotation="-90 0 0"
            material="color: #00843d; emissive: #10b981; emissiveIntensity: 1.1; side: double"
            animation="property: rotation; to: -90 -360 0; dur: 15000; loop: true; easing: linear"></a-ring>
    </a-entity>

    <!-- 3. GLOBO TERRÁQUEO 3D DE RED GLOBAL INTERCONECTADA (Centro Superior) -->
    <a-entity position="0 2.75 0.15"
        animation="property: rotation; to: 0 360 0; dur: 14000; loop: true; easing: linear">
        <a-sphere radius="0.6"
            material="color: #0284c7; emissive: #00f0ff; emissiveIntensity: 0.7; wireframe: true"></a-sphere>
        <a-sphere radius="0.44"
            material="color: #092468; opacity: 0.75; transparent: true"></a-sphere>
        <a-torus radius="0.8" radius-tubular="0.018" rotation="45 0 0"
            material="color: #f5b316; emissive: #fbbf24; emissiveIntensity: 1.2"></a-torus>
        <a-sphere radius="0.08" position="0.8 0 0" material="color: #10b981; emissive: #10b981; emissiveIntensity: 1.5"></a-sphere>
        <a-sphere radius="0.08" position="-0.8 0 0" material="color: #f43f5e; emissive: #f43f5e; emissiveIntensity: 1.5"></a-sphere>
    </a-entity>

    <!-- 4. COLUMNAS EJECUTIVAS DE CRECIMIENTO ETIQUETADAS (Izquierda Baja) -->
    <a-entity position="-3.45 -1.45 0.3" rotation="0 22 0">
        <a-box width="2.1" height="0.1" depth="0.7" material="color: #092468; metalness: 0.8"></a-box>
        <a-text value="KPI: ${normalizarASCII(c1).toUpperCase().slice(0, 12)}" align="center" color="#fbbf24" width="2.5" position="0 1.48 -0.2"></a-text>
        <a-cylinder radius="0.15" height="0.62" position="-0.62 0.34 0"
            material="color: #38bdf8; emissive: #0284c7; emissiveIntensity: 0.9"
            animation="property: scale; from: 1 0.4 1; to: 1 1.15 1; dir: alternate; dur: 1800; loop: true"></a-cylinder>
        <a-cylinder radius="0.15" height="0.88" position="-0.21 0.47 0"
            material="color: #f5b316; emissive: #d97706; emissiveIntensity: 0.9"
            animation="property: scale; from: 1 0.5 1; to: 1 1.2 1; dir: alternate; dur: 1800; delay: 300; loop: true"></a-cylinder>
        <a-cylinder radius="0.15" height="1.12" position="0.21 0.59 0"
            material="color: #10b981; emissive: #059669; emissiveIntensity: 0.95"
            animation="property: scale; from: 1 0.5 1; to: 1 1.25 1; dir: alternate; dur: 1800; delay: 600; loop: true"></a-cylinder>
        <a-cylinder radius="0.15" height="1.34" position="0.62 0.7 0"
            material="color: #a855f7; emissive: #9333ea; emissiveIntensity: 0.95"
            animation="property: scale; from: 1 0.6 1; to: 1 1.25 1; dir: alternate; dur: 1800; delay: 900; loop: true"></a-cylinder>
    </a-entity>

    <!-- 5. BALANZA DE EQUILIBRIO Y ESTRATEGIA 3D (Derecha Baja) -->
    <a-entity position="3.45 -1.35 0.3" rotation="0 -22 0">
        <a-cylinder radius="0.45" height="0.12" position="0 0 0" material="color: #f5b316; metalness: 0.9"></a-cylinder>
        <a-cylinder radius="0.065" height="1.35" position="0 0.7 0" material="color: #e2e8f0; metalness: 0.9"></a-cylinder>
        <a-entity position="0 1.32 0"
            animation="property: rotation; from: 0 0 -10; to: 0 0 10; dir: alternate; dur: 2400; loop: true; easing: easeInOutSine">
            <a-box width="1.45" height="0.06" depth="0.06" material="color: #fbbf24; emissive: #d97706; emissiveIntensity: 0.8"></a-box>
            <a-sphere radius="0.2" position="-0.66 -0.32 0" material="color: #00f0ff; emissive: #0284c7; emissiveIntensity: 1"></a-sphere>
            <a-sphere radius="0.2" position="0.66 -0.32 0" material="color: #10b981; emissive: #059669; emissiveIntensity: 1"></a-sphere>
        </a-entity>
    </a-entity>

    ${panelesSubtemas}

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
    <a-entity position="0 0.56 0.92"
        animation="property: position; to: 0 0.68 0.92; dir: alternate; dur: 2500; loop: true; easing: easeInOutSine">
        <a-plane width="4.4" height="2.0" position="0 0.08 -0.06"
            material="color: #061539; opacity: 0.88; transparent: true; side: double"></a-plane>
        <a-box width="4.44" height="0.045" depth="0.04" position="0 1.08 -0.04"
            material="color: #f5b316; emissive: #fbbf24; emissiveIntensity: 1.4"></a-box>
        <a-box width="4.44" height="0.045" depth="0.04" position="0 -0.92 -0.04"
            material="color: #00843d; emissive: #10b981; emissiveIntensity: 1.4"></a-box>

        <a-box width="3.9" height="0.34" depth="0.03" position="0 0.94 0.01"
            material="color: #00843d; emissive: #059669; emissiveIntensity: 0.5">
            <a-text value="${datos.badgeTexto}" align="center" color="#fef08a" width="3.8" position="0 0 0.025"></a-text>
        </a-box>

        <a-text class="texto-glow-cambiante"
            value="${datos.valorHUD}"
            color="#00f0ff" align="center" width="4.3" line-height="62" position="0.02 0.22 -0.01">
        </a-text>
        <a-text class="texto-color-cambiante"
            value="${datos.valorHUD}"
            color="#ffffff" align="center" width="4.15" line-height="62" position="0 0.22 0.02">
        </a-text>
        <a-text class="texto-acento-cambiante"
            value="${datos.subtituloHUD}"
            color="#fbbf24" align="center" width="3.5" position="0 -0.52 0.02">
        </a-text>
    </a-entity>

</a-entity>`;
    }

    // Generador de Variante 4: Aula Virtual Interactiva & Carrusel Conceptual 3D + Módulos de Aprendizaje
    function construirEscenaVariante4(datos) {
        const [p1, p2, p3, p4] = datos.pasos;
        const panelesSubtemas = construirPanelesLateralesDetallados(datos);
        return `<a-entity id="escena_aula_virtual" position="0 0 0" scale="0.12 0.12 0.12">

    <!-- 1. ILUMINACIÓN DE AULA HOLOGRÁFICA -->
    <a-light type="ambient" color="#f0fdf4" intensity="0.95"></a-light>
    <a-light type="hemisphere" color="#10b981" groundColor="#092468" intensity="0.95"></a-light>
    <a-light type="directional" color="#ffffff" intensity="1.25" position="0 7 5"></a-light>

    <!-- 2. LIBRO GIGANTE PROYECTOR DE CONOCIMIENTO EN LA BASE -->
    <a-entity position="0 -1.9 0.1" rotation="18 0 0">
        <a-cylinder radius="0.1" height="2.1" position="0 0 -0.05" rotation="90 0 0" material="color: #f5b316; metalness: 0.9"></a-cylinder>
        <a-box width="1.65" height="0.08" depth="2.0" position="-0.8 0.08 0" rotation="0 0 12" material="color: #fffbeb"></a-box>
        <a-box width="1.72" height="0.05" depth="2.08" position="-0.82 0.02 0" rotation="0 0 12" material="color: #092468"></a-box>
        <a-box width="1.65" height="0.08" depth="2.0" position="0.8 0.08 0" rotation="0 0 -12" material="color: #fffbeb"></a-box>
        <a-box width="1.72" height="0.05" depth="2.08" position="0.82 0.02 0" rotation="0 0 -12" material="color: #00843d"></a-box>
        <a-cone radius-bottom="1.2" radius-top="3.4" height="2.5" open-ended="true" position="0 1.35 0"
            material="color: #38bdf8; emissive: #0284c7; emissiveIntensity: 0.8; opacity: 0.11; transparent: true; side: double"></a-cone>
    </a-entity>

    <!-- 3. CARRUSEL ORBITAL DE CRISTALES DE CONOCIMIENTO 3D -->
    <a-entity position="0 1.65 0" animation="property: rotation; to: 0 -360 0; dur: 16000; loop: true; easing: linear">
        <a-octahedron radius="0.32" position="3.5 0.35 0"
            material="color: #00f0ff; emissive: #0284c7; emissiveIntensity: 1.2"
            animation="property: rotation; to: 360 360 0; dur: 4000; loop: true; easing: linear"></a-octahedron>
        <a-dodecahedron radius="0.32" position="-3.5 0.35 0"
            material="color: #fbbf24; emissive: #d97706; emissiveIntensity: 1.2"
            animation="property: rotation; to: 360 360 0; dur: 4000; loop: true; easing: linear"></a-dodecahedron>
        <a-icosahedron radius="0.32" position="0 0.35 3.5"
            material="color: #10b981; emissive: #059669; emissiveIntensity: 1.2"
            animation="property: rotation; to: 360 360 0; dur: 4000; loop: true; easing: linear"></a-icosahedron>
        <a-octahedron radius="0.32" position="0 0.35 -3.5"
            material="color: #ec4899; emissive: #db2777; emissiveIntensity: 1.2"
            animation="property: rotation; to: 360 360 0; dur: 4000; loop: true; easing: linear"></a-octahedron>
    </a-entity>

    <!-- 4. CORONA ESTELAR SUPERIOR DE SÍNTESIS ACADÉMICA -->
    <a-entity position="0 2.75 0.1"
        animation="property: position; to: 0 2.98 0.1; dir: alternate; dur: 2000; loop: true; easing: easeInOutSine">
        <a-torus-knot radius="0.4" radius-tubular="0.06" p="2" q="3"
            material="color: #fbbf24; emissive: #f59e0b; emissiveIntensity: 1.1; metalness: 0.8"
            animation="property: rotation; to: 360 360 0; dur: 8000; loop: true; easing: linear"></a-torus-knot>
    </a-entity>

    ${panelesSubtemas}

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
    <a-entity position="0 0.56 0.92"
        animation="property: position; to: 0 0.68 0.92; dir: alternate; dur: 2500; loop: true; easing: easeInOutSine">
        <a-plane width="4.4" height="2.0" position="0 0.08 -0.06"
            material="color: #02122c; opacity: 0.88; transparent: true; side: double"></a-plane>
        <a-box width="4.44" height="0.045" depth="0.04" position="0 1.08 -0.04"
            material="color: #10b981; emissive: #10b981; emissiveIntensity: 1.4"></a-box>
        <a-box width="4.44" height="0.045" depth="0.04" position="0 -0.92 -0.04"
            material="color: #fbbf24; emissive: #fbbf24; emissiveIntensity: 1.4"></a-box>

        <a-box width="3.9" height="0.34" depth="0.03" position="0 0.94 0.01"
            material="color: #092468; emissive: #0284c7; emissiveIntensity: 0.5">
            <a-text value="${datos.badgeTexto}" align="center" color="#6ee7b7" width="3.8" position="0 0 0.025"></a-text>
        </a-box>

        <a-text class="texto-glow-cambiante"
            value="${datos.valorHUD}"
            color="#00f0ff" align="center" width="4.3" line-height="62" position="0.02 0.22 -0.01">
        </a-text>
        <a-text class="texto-color-cambiante"
            value="${datos.valorHUD}"
            color="#ffffff" align="center" width="4.15" line-height="62" position="0 0.22 0.02">
        </a-text>
        <a-text class="texto-acento-cambiante"
            value="${datos.subtituloHUD}"
            color="#fbbf24" align="center" width="3.5" position="0 -0.52 0.02">
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
