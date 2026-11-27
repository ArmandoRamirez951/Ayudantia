document.addEventListener("DOMContentLoaded", () => {
    const sceneEl = document.querySelector('a-scene');
    const uiContainer = document.getElementById('ui-container');
    const scannerText = document.querySelector('.scanner-text');
    const arContent = document.getElementById('ar-content');
    const finishedMsg = document.getElementById('finished-msg');

    // Combina múltiples archivos .mind (formato MsgPack v2 de MindAR) en un solo Blob multi-target
    // para que la cámara detecte cualquier diapositiva registrada en diapositivas.json.
    async function construirUrlMindMultiTarget(listaDiapositivas) {
        if (listaDiapositivas.length === 1) {
            return listaDiapositivas[0].mindFile + '?t=' + Date.now();
        }

        const payloadChunks = [];
        let totalTargets = 0;

        for (const item of listaDiapositivas) {
            if (!item.mindFile) continue;
            try {
                const res = await fetch(item.mindFile + '?t=' + Date.now());
                if (!res.ok) continue;
                const arrayBuf = await res.arrayBuffer();
                const bytes = new Uint8Array(arrayBuf);

                // Cabecera estándar MsgPack de MindAR v2:
                // 82 a1 76 02 a8 64 61 74 61 4c 69 73 74 [arrayHeader]
                if (
                    bytes.length > 14 &&
                    bytes[0] === 0x82 &&
                    bytes[1] === 0xa1 &&
                    bytes[2] === 0x76 &&
                    bytes[4] === 0xa8
                ) {
                    const arrHeader = bytes[13];
                    let countInFile = 1;
                    let offset = 14;

                    if ((arrHeader & 0xf0) === 0x90) {
                        countInFile = arrHeader & 0x0f;
                        offset = 14;
                    } else if (arrHeader === 0xdc && bytes.length > 16) {
                        countInFile = (bytes[14] << 8) | bytes[15];
                        offset = 16;
                    }

                    if (countInFile > 0) {
                        payloadChunks.push(bytes.subarray(offset));
                        totalTargets += countInFile;
                    }
                }
            } catch (e) {
                console.warn("No se pudo cargar el archivo .mind:", item.mindFile, e);
            }
        }

        if (totalTargets === 0 || payloadChunks.length === 0) {
            return listaDiapositivas[0].mindFile + '?t=' + Date.now();
        }

        // Construir cabecera MsgPack para totalTargets elementos en dataList
        const baseHeader = [0x82, 0xa1, 0x76, 0x02, 0xa8, 0x64, 0x61, 0x74, 0x61, 0x4c, 0x69, 0x73, 0x74];
        let arrayHeaderBytes;
        if (totalTargets <= 15) {
            arrayHeaderBytes = new Uint8Array([0x90 | totalTargets]);
        } else {
            arrayHeaderBytes = new Uint8Array([0xdc, (totalTargets >> 8) & 0xff, totalTargets & 0xff]);
        }

        const combinedParts = [new Uint8Array(baseHeader), arrayHeaderBytes, ...payloadChunks];
        const blob = new Blob(combinedParts, { type: 'application/octet-stream' });
        return URL.createObjectURL(blob);
    }

    let firmaCatalogoActual = '';
    let firmaTargetsMindActual = '';
    let urlBlobMindActual = null;
    let recargandoTargets = false;
    let recargaPendiente = false;

    function calcularFirmaCatalogo(lista) {
        return JSON.stringify(
            lista.map(d => ({
                id: d.id,
                mindFile: d.mindFile,
                fecha: d.fechaActualizacion || d.fechaCreacion || '',
                len: (d.codigoAnimacion || '').length
            }))
        );
    }

    function calcularFirmaTargetsMind(lista) {
        return JSON.stringify(
            lista.map(d => ({
                id: d.id,
                mindFile: d.mindFile
            }))
        );
    }

    function cambiarVisibilidadHijosTarget(targetEl, visible) {
        if (!targetEl) return;
        const hijos = targetEl.children;
        for (let i = 0; i < hijos.length; i++) {
            const hijo = hijos[i];
            if (hijo.object3D) {
                hijo.object3D.visible = Boolean(visible);
            }
            hijo.setAttribute('visible', visible ? 'true' : 'false');
        }
    }

    function aplicarEntidadesTargetEnEscena(lista) {
        // 1. Primera diapositiva en #ar-content (targetIndex: 0)
        // IMPORTANTE: Nunca llamar arContent.setAttribute('visible', 'false') sobre el contenedor mindar-image-target,
        // porque MindAR utiliza el.object3D.visible internamente para emitir targetFound / targetLost.
        const primeraDiapo = lista[0];
        if (arContent && primeraDiapo && primeraDiapo.codigoAnimacion) {
            arContent.innerHTML = primeraDiapo.codigoAnimacion;
        }

        // 2. Diapositivas adicionales (targetIndex: 1, 2, 3, ...)
        for (let i = 1; i < lista.length; i++) {
            const diapoExtra = lista[i];
            let extraEntity = document.getElementById(`ar-content-${i}`);
            if (!extraEntity) {
                extraEntity = document.createElement('a-entity');
                extraEntity.setAttribute('id', `ar-content-${i}`);
                extraEntity.setAttribute('mindar-image-target', `targetIndex: ${i}`);
                sceneEl.appendChild(extraEntity);
            }
            extraEntity.innerHTML = diapoExtra.codigoAnimacion;
        }

        // 3. Limpiar entidades sobrantes si se eliminó alguna diapositiva
        const todosTargets = sceneEl.querySelectorAll('[mindar-image-target]');
        todosTargets.forEach((el) => {
            if (el.id && el.id.startsWith('ar-content-')) {
                const idx = parseInt(el.id.replace('ar-content-', ''), 10);
                if (!isNaN(idx) && idx >= lista.length) {
                    el.remove();
                }
            }
        });

        // 4. Purgar únicamente referencias cuyo elemento DOM (item.el.el) ya no esté conectado al documento
        // NOTA: En mindar-image-system, item.el es la instancia del componente mindar-image-target y item.el.el es el nodo DOM <a-entity>
        const mindarSystem = sceneEl.systems && sceneEl.systems['mindar-image-system'];
        if (mindarSystem && Array.isArray(mindarSystem.anchorEntities)) {
            mindarSystem.anchorEntities = mindarSystem.anchorEntities.filter(
                item => item && item.el && item.el.el && item.el.el.isConnected
            );
        }
    }

    function iniciarMindARConTarget(targetSrcUrl, esActualizacionEnVivo = false) {
        const arrancar = async () => {
            try {
                const mindarSystem = sceneEl.systems && sceneEl.systems['mindar-image-system'];
                if (
                    esActualizacionEnVivo &&
                    mindarSystem &&
                    mindarSystem.controller &&
                    mindarSystem.video &&
                    mindarSystem.video.srcObject
                ) {
                    try {
                        mindarSystem.stop();
                    } catch (eStop) {
                        console.warn("Aviso al detener MindAR para actualizar targets:", eStop);
                    }
                }

                sceneEl.setAttribute(
                    'mindar-image',
                    `imageTargetSrc: ${targetSrcUrl}; autoStart: false; uiScanning: no; uiLoading: no;`
                );

                if (mindarSystem) {
                    mindarSystem.imageTargetSrc = targetSrcUrl;
                    setTimeout(() => {
                        try {
                            mindarSystem.start();
                        } catch (errStart) {
                            console.error("Error al iniciar MindAR:", errStart);
                        }
                    }, 90);
                }
            } catch (e) {
                console.error("Error configurando MindAR:", e);
            }
        };

        if (sceneEl.hasLoaded) {
            arrancar();
        } else {
            sceneEl.addEventListener('loaded', arrancar, { once: true });
        }
    }

    // Carga o actualiza en caliente todas las diapositivas desde diapositivas.json sin requerir recarga manual
    async function sincronizarCatalogoDiapositivas(esActualizacionEnVivo = false) {
        if (recargandoTargets) {
            recargaPendiente = true;
            return;
        }
        recargandoTargets = true;
        try {
            const response = await fetch('diapositivas.json?t=' + Date.now(), { cache: 'no-store' });
            const data = await response.json();
            const lista = (data && Array.isArray(data.diapositivas))
                ? data.diapositivas.filter(d => d && d.mindFile && d.codigoAnimacion)
                : [];

            const nuevaFirma = calcularFirmaCatalogo(lista);
            if (esActualizacionEnVivo && nuevaFirma === firmaCatalogoActual) {
                return;
            }
            const nuevaFirmaTargets = calcularFirmaTargetsMind(lista);
            const cambiaronTargetsMind = !esActualizacionEnVivo || (nuevaFirmaTargets !== firmaTargetsMindActual);

            firmaCatalogoActual = nuevaFirma;
            firmaTargetsMindActual = nuevaFirmaTargets;

            if (lista.length === 0) {
                console.warn("No hay diapositivas registradas en diapositivas.json");
                if (scannerText) {
                    scannerText.innerHTML = `
                        <h2>📷 Sin Diapositivas Activas</h2>
                        <p>Crea una diapositiva con su archivo .mind desde el panel de administración</p>
                    `;
                }
                return;
            }

            if (scannerText && esActualizacionEnVivo) {
                scannerText.innerHTML = `
                    <h2>📷 Escanea la Diapositiva</h2>
                    <p>Catálogo actualizado (${lista.length} diapositiva(s) activas)</p>
                `;
            }

            aplicarEntidadesTargetEnEscena(lista);

            if (cambiaronTargetsMind) {
                const prevBlobUrl = urlBlobMindActual;
                const targetUrl = await construirUrlMindMultiTarget(lista);
                urlBlobMindActual = targetUrl;
                iniciarMindARConTarget(targetUrl, esActualizacionEnVivo);
                if (prevBlobUrl && prevBlobUrl.startsWith('blob:')) {
                    setTimeout(() => {
                        try { URL.revokeObjectURL(prevBlobUrl); } catch (e) {}
                    }, 1500);
                }
            }

            console.log(`Animaciones 3D sincronizadas (${lista.length} diapositiva(s))`);
        } catch (err) {
            console.error("Error sincronizando diapositivas.json:", err);
        } finally {
            recargandoTargets = false;
            if (recargaPendiente) {
                recargaPendiente = false;
                sincronizarCatalogoDiapositivas(true);
            }
        }
    }

    // Carga inicial al abrir camara.html
    sincronizarCatalogoDiapositivas(false);

    // Escuchar notificaciones inmediatas cuando se implementa una nueva diapositiva desde programacion.html
    if (typeof BroadcastChannel !== 'undefined') {
        try {
            const canalSync = new BroadcastChannel('ayudantia_ar_sync');
            canalSync.onmessage = (ev) => {
                if (ev && ev.data && ev.data.tipo === 'CATALOGO_ACTUALIZADO') {
                    sincronizarCatalogoDiapositivas(true);
                }
            };
        } catch (e) {}
    }

    window.addEventListener('storage', (ev) => {
        if (ev.key === 'ayudantia_ar_last_update') {
            sincronizarCatalogoDiapositivas(true);
        }
    });

    // Verificación periódica ligera para dispositivos móviles en red local
    setInterval(() => {
        if (!document.hidden) {
            sincronizarCatalogoDiapositivas(true);
        }
    }, 4500);

    // =========================================================================
    // ENFOQUE EN EL CUADRO GUÍA (.scanner-frame) Y ZOOM MÓVIL REAL EN MINDAR
    // =========================================================================
    const scannerFrame = document.getElementById('scanner-guide-frame') || document.querySelector('.scanner-frame');
    const scannerFocusBadge = document.getElementById('scanner-focus-badge');
    let targetDetectadoActual = null;
    let animacionMostradaEnCuadro = false;

    function obtenerThreeCameraActiva() {
        const aCam = document.querySelector('a-camera');
        if (aCam && typeof aCam.getObject3D === 'function') {
            const camObj = aCam.getObject3D('camera');
            if (camObj) return camObj;
        }
        return sceneEl && sceneEl.camera ? sceneEl.camera : null;
    }

    // Verifica si la diapositiva detectada está alineada dentro del cuadro guía (.scanner-frame)
    function estaTargetEnfocadoDentroDelCuadro(targetEl) {
        if (!targetEl || !scannerFrame) return true;
        const rect = scannerFrame.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return true;

        try {
            const obj3D = targetEl.object3D;
            const threeCamera = obtenerThreeCameraActiva();
            if (!obj3D || !obj3D.matrix || !threeCamera || typeof AFRAME === 'undefined') {
                return true;
            }

            const elms = obj3D.matrix.elements;
            // En MindAR, invisibleMatrix tiene todos sus elementos en 0 (elms[15] === 0).
            // Además, targetFound se emite justo un instante antes de asignar obj3D.matrix = t.
            if (!elms || elms[15] === 0 || (elms[12] === 0 && elms[13] === 0 && elms[14] === 0)) {
                return true;
            }

            // En MindAR A-Frame, obj3D.matrix ya está en coordenadas de la cámara (post-multiplicada por postMatrix en el centro del marcador)
            const posCamSpace = new AFRAME.THREE.Vector3(elms[12], elms[13], elms[14]);
            const ndc = posCamSpace.clone().applyMatrix4(threeCamera.projectionMatrix);

            // Si la proyección devuelve NaN o fuera de rango válido, permitir visualización
            if (isNaN(ndc.x) || isNaN(ndc.y)) {
                return true;
            }

            const screenX = (ndc.x * 0.5 + 0.5) * window.innerWidth;
            const screenY = (-ndc.y * 0.5 + 0.5) * window.innerHeight;

            // Margen amplio y cómodo alrededor del cuadro guía (38% de tolerancia) para que al encuadrar la diapositiva
            // dentro o sobre el marco se active de inmediato sin parpadeos por movimiento de la mano.
            const padX = rect.width * 0.38;
            const padY = rect.height * 0.38;

            const dentroHorizontal = screenX >= (rect.left - padX) && screenX <= (rect.right + padX);
            const dentroVertical = screenY >= (rect.top - padY) && screenY <= (rect.bottom + padY);

            return dentroHorizontal && dentroVertical;
        } catch (e) {
            return true;
        }
    }

    function actualizarVisibilidadPorEnfoqueEnCuadro() {
        if (!targetDetectadoActual) return;

        const enfocadoEnCuadro = estaTargetEnfocadoDentroDelCuadro(targetDetectadoActual);
        const todosLosTargets = sceneEl.querySelectorAll('[mindar-image-target]');

        if (enfocadoEnCuadro) {
            todosLosTargets.forEach(el => {
                cambiarVisibilidadHijosTarget(el, el === targetDetectadoActual);
            });
            if (scannerText) scannerText.style.display = 'none';
            if (scannerFrame) scannerFrame.classList.add('frame-locked');
            if (scannerFocusBadge) scannerFocusBadge.textContent = '✓ Diapositiva enfocada • Animación activa';
            animacionMostradaEnCuadro = true;
        } else {
            todosLosTargets.forEach(el => {
                cambiarVisibilidadHijosTarget(el, false);
            });
            if (scannerFrame) scannerFrame.classList.remove('frame-locked');
            if (scannerText) {
                scannerText.style.display = 'block';
                scannerText.innerHTML = `
                    <h2>🎯 Centra la Diapositiva</h2>
                    <p>Ubica la diapositiva dentro del recuadro para activar la animación</p>
                `;
            }
            if (scannerFocusBadge) scannerFocusBadge.textContent = 'Centra la diapositiva dentro del marco';
            animacionMostradaEnCuadro = false;
        }
    }

    // Motor de cambio de color dinámico a 60 FPS + verificación continua de enfoque en el cuadro guía
    let hueCromatico = 180;
    function animarColoresTexto() {
        hueCromatico = (hueCromatico + 1.2) % 360;
        const colorFrontal = `hsl(${hueCromatico}, 100%, 78%)`;
        const colorGlow = `hsl(${(hueCromatico + 50) % 360}, 100%, 60%)`;
        const colorAcento = `hsl(${(hueCromatico + 120) % 360}, 100%, 70%)`;

        const textosFrontales = document.querySelectorAll('.texto-color-cambiante');
        for (let i = 0; i < textosFrontales.length; i++) {
            textosFrontales[i].setAttribute('color', colorFrontal);
        }

        const textosGlow = document.querySelectorAll('.texto-glow-cambiante');
        for (let i = 0; i < textosGlow.length; i++) {
            textosGlow[i].setAttribute('color', colorGlow);
        }

        const textosAcento = document.querySelectorAll('.texto-acento-cambiante');
        for (let i = 0; i < textosAcento.length; i++) {
            textosAcento[i].setAttribute('color', colorAcento);
        }

        // Verificar si algún target está actualmente visible para MindAR
        const mindarSystem = sceneEl && sceneEl.systems && sceneEl.systems['mindar-image-system'];
        if (mindarSystem && Array.isArray(mindarSystem.anchorEntities)) {
            let activo = null;
            for (let i = 0; i < mindarSystem.anchorEntities.length; i++) {
                const item = mindarSystem.anchorEntities[i];
                if (item && item.el && item.el.el && item.el.el.object3D && item.el.el.object3D.visible) {
                    activo = item.el.el;
                    break;
                }
            }
            if (activo) {
                targetDetectadoActual = activo;
            }
        }

        if (targetDetectadoActual) {
            actualizarVisibilidadPorEnfoqueEnCuadro();
        }

        // Asegurar que el gancho de zoom en el inputLoader de MindAR esté instalado cuando el controlador esté listo
        instalarHookZoomEnMindARInputLoader();

        requestAnimationFrame(animarColoresTexto);
    }
    requestAnimationFrame(animarColoresTexto);

    // Cuando cualquier diapositiva es detectada por la cámara
    sceneEl.addEventListener("targetFound", event => {
        console.log("¡Diapositiva detectada por MindAR!");
        targetDetectadoActual = (event && event.target) ? event.target : arContent;
        actualizarVisibilidadPorEnfoqueEnCuadro();
        if (finishedMsg) finishedMsg.style.display = 'none';
    });

    // Cuando la diapositiva se pierde de vista
    sceneEl.addEventListener("targetLost", event => {
        console.log("Se perdió la diapositiva de vista.");
        if (event && event.target) {
            cambiarVisibilidadHijosTarget(event.target, false);
        }
        if (!event || !event.target || event.target === targetDetectadoActual) {
            targetDetectadoActual = null;
            animacionMostradaEnCuadro = false;
        }
        if (scannerFrame) scannerFrame.classList.remove('frame-locked');
        if (scannerFocusBadge) scannerFocusBadge.textContent = 'Encuadra la diapositiva aquí';
        if (scannerText) {
            scannerText.style.display = 'block';
            scannerText.innerHTML = `
                <h2>📷 Escanea la Diapositiva</h2>
                <p>Alinea y enfoca la diapositiva dentro del recuadro</p>
            `;
        }
        if (finishedMsg) finishedMsg.style.display = 'none';
    });

    // =========================================================================
    // SOPORTE DE ZOOM DE CÁMARA EN TELÉFONOS MÓVILES (PELLIZCO TÁCTIL + SLIDER)
    // Conecta tanto el zoom de hardware como el recorte central del detector MindAR
    // =========================================================================
    const zoomSlider = document.getElementById('camera-zoom-slider');
    const zoomBadge = document.getElementById('camera-zoom-badge');
    const btnZoomIn = document.getElementById('btn-zoom-in');
    const btnZoomOut = document.getElementById('btn-zoom-out');

    let zoomActual = 1.0;
    let zoomDigitalEfectivo = 1.0;
    const ZOOM_MIN = 1.0;
    const zoomMaxPermitido = 4.0;
    let distanciaPellizcoInicial = null;
    let zoomAlIniciarPellizco = 1.0;
    let aplicandoConstraintZoom = false;

    function obtenerVideoMindAR() {
        const mindarSystem = sceneEl && sceneEl.systems && sceneEl.systems['mindar-image-system'];
        if (mindarSystem && mindarSystem.video) return mindarSystem.video;
        return document.querySelector('video');
    }

    // Intercepta loadInput(video) de MindAR para que cuando exista zoom digital (zoomDigitalEfectivo > 1),
    // MindAR analice exactamente la región central ampliada que el usuario ve en pantalla.
    function instalarHookZoomEnMindARInputLoader() {
        const mindarSystem = sceneEl && sceneEl.systems && sceneEl.systems['mindar-image-system'];
        const loader = mindarSystem && mindarSystem.controller && mindarSystem.controller.inputLoader;
        if (!loader || loader.__zoomHookInstalado || !loader.context || !loader.context.canvas) {
            return;
        }

        const ctx = loader.context;
        const origDrawImage = ctx.drawImage.bind(ctx);

        ctx.drawImage = function (img, ...args) {
            const z = zoomDigitalEfectivo;
            if (z > 1.01 && img && (img.videoWidth || img.width)) {
                const srcW = img.videoWidth || img.width;
                const srcH = img.videoHeight || img.height;
                const cropW = srcW / z;
                const cropH = srcH / z;
                const cropX = (srcW - cropW) / 2;
                const cropY = (srcH - cropH) / 2;

                if (args.length === 2) {
                    // Caso rotado 90 grados: drawImage(t, -t.width/2, -t.height/2)
                    return origDrawImage(img, cropX, cropY, cropW, cropH, args[0], args[1], img.width || srcW, img.height || srcH);
                } else if (args.length === 4) {
                    // Caso normal: drawImage(t, 0, 0, t.width, t.height)
                    return origDrawImage(img, cropX, cropY, cropW, cropH, args[0], args[1], args[2], args[3]);
                }
            }
            return origDrawImage(img, ...args);
        };

        loader.__zoomHookInstalado = true;
        console.log("Hook de Zoom óptico/digital instalado en el detector de MindAR.");
    }

    function aplicarZoomVisualInmediato(escalaDigital) {
        zoomDigitalEfectivo = Math.max(1.0, escalaDigital);
        const videoEl = obtenerVideoMindAR();
        if (videoEl) {
            videoEl.style.transformOrigin = 'center center';
            videoEl.style.transform = zoomDigitalEfectivo > 1.01 ? `scale(${zoomDigitalEfectivo})` : '';
        }
    }

    function aplicarZoomCamara(nuevoZoom) {
        const z = Math.min(zoomMaxPermitido, Math.max(ZOOM_MIN, Math.round(nuevoZoom * 100) / 100));
        zoomActual = z;

        if (zoomSlider) zoomSlider.value = String(z);
        if (zoomBadge) zoomBadge.textContent = `${z.toFixed(1)}x`;

        // 1. Aplicar respuesta visual inmediata a 60 FPS y recorte sincronizado en el detector de MindAR
        aplicarZoomVisualInmediato(z);
        instalarHookZoomEnMindARInputLoader();

        // 2. Si la cámara del teléfono soporta zoom óptico nativo por hardware, sincronizarlo sin bloquear la UI
        const videoEl = obtenerVideoMindAR();
        if (!aplicandoConstraintZoom && videoEl && videoEl.srcObject && typeof videoEl.srcObject.getVideoTracks === 'function') {
            const tracks = videoEl.srcObject.getVideoTracks();
            if (tracks && tracks.length > 0) {
                const track = tracks[0];
                try {
                    if (typeof track.getCapabilities === 'function') {
                        const caps = track.getCapabilities();
                        if (caps && typeof caps.zoom === 'object' && caps.zoom.max > caps.zoom.min) {
                            const hwMin = caps.zoom.min || 1;
                            const hwMax = caps.zoom.max || 4;
                            const hwTarget = Math.min(hwMax, Math.max(hwMin, z));
                            aplicandoConstraintZoom = true;
                            track.applyConstraints({ advanced: [{ zoom: hwTarget }] })
                                .then(() => {
                                    const settings = typeof track.getSettings === 'function' ? track.getSettings() : {};
                                    const realHwZoom = (settings && typeof settings.zoom === 'number' && settings.zoom >= 1)
                                        ? settings.zoom
                                        : 1.0;
                                    // Si el lente físico ya aplicó parte o todo el zoom, compensar la escala digital restante
                                    aplicarZoomVisualInmediato(zoomActual / realHwZoom);
                                })
                                .catch(() => {
                                    aplicarZoomVisualInmediato(zoomActual);
                                })
                                .finally(() => {
                                    aplicandoConstraintZoom = false;
                                });
                        }
                    }
                } catch (e) {
                    aplicandoConstraintZoom = false;
                }
            }
        }
    }

    if (zoomSlider) {
        zoomSlider.addEventListener('input', (e) => {
            aplicarZoomCamara(parseFloat(e.target.value) || 1.0);
        });
        zoomSlider.addEventListener('change', (e) => {
            aplicarZoomCamara(parseFloat(e.target.value) || 1.0);
        });
    }
    if (btnZoomIn) {
        btnZoomIn.addEventListener('click', (e) => {
            e.stopPropagation();
            aplicarZoomCamara(zoomActual + 0.3);
        });
    }
    if (btnZoomOut) {
        btnZoomOut.addEventListener('click', (e) => {
            e.stopPropagation();
            aplicarZoomCamara(zoomActual - 0.3);
        });
    }
    if (zoomBadge) {
        zoomBadge.addEventListener('click', (e) => {
            e.stopPropagation();
            aplicarZoomCamara(1.0);
        });
    }

    // Gestos táctiles de pellizco (Pinch-to-Zoom) con 2 dedos en fase de captura (capture: true, passive: false)
    // para que el canvas WebGL de A-Frame no bloquee el gesto en teléfonos móviles.
    function calcularDistanciaEntreDedos(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.hypot(dx, dy);
    }

    document.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches.length === 2) {
            distanciaPellizcoInicial = calcularDistanciaEntreDedos(e.touches);
            zoomAlIniciarPellizco = zoomActual;
        }
    }, { passive: false, capture: true });

    document.addEventListener('touchmove', (e) => {
        if (e.touches && e.touches.length === 2 && distanciaPellizcoInicial > 8) {
            if (e.cancelable) e.preventDefault();
            const distanciaActual = calcularDistanciaEntreDedos(e.touches);
            const factor = distanciaActual / distanciaPellizcoInicial;
            aplicarZoomCamara(zoomAlIniciarPellizco * factor);
        }
    }, { passive: false, capture: true });

    document.addEventListener('touchend', (e) => {
        if (!e.touches || e.touches.length < 2) {
            distanciaPellizcoInicial = null;
        }
    }, { passive: true, capture: true });

    document.addEventListener('touchcancel', () => {
        distanciaPellizcoInicial = null;
    }, { passive: true, capture: true });

    // Soporte adicional con rueda del mouse en escritorio para pruebas rápidas de zoom
    window.addEventListener('wheel', (e) => {
        if (e.target && e.target.closest && e.target.closest('#camera-zoom-controls')) return;
        const delta = e.deltaY < 0 ? 0.2 : -0.2;
        aplicarZoomCamara(zoomActual + delta);
    }, { passive: true });
});
