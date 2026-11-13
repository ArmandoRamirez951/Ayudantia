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

    function iniciarMindARConTarget(targetSrcUrl) {
        const arrancar = () => {
            try {
                sceneEl.setAttribute(
                    'mindar-image',
                    `imageTargetSrc: ${targetSrcUrl}; autoStart: false; uiScanning: no; uiLoading: no;`
                );
                const mindarSystem = sceneEl.systems && sceneEl.systems['mindar-image-system'];
                if (mindarSystem) {
                    mindarSystem.imageTargetSrc = targetSrcUrl;
                    setTimeout(() => {
                        try {
                            mindarSystem.start();
                        } catch (errStart) {
                            console.error("Error al iniciar MindAR:", errStart);
                        }
                    }, 80);
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

    // Cargar todas las diapositivas desde el JSON de la base de datos
    fetch('diapositivas.json?t=' + Date.now())
        .then(response => response.json())
        .then(async data => {
            const lista = (data && Array.isArray(data.diapositivas))
                ? data.diapositivas.filter(d => d && d.mindFile && d.codigoAnimacion)
                : [];

            // Si se borraron todas las diapositivas, evitar fallo por undefined
            if (lista.length === 0) {
                console.warn("No hay diapositivas registradas en diapositivas.json");
                if (scannerText) {
                    scannerText.innerHTML = `
                        <h2>📷 Sin Diapositivas Activas</h2>
                        <p>Agrega una diapositiva con su archivo .mind desde el panel de administración</p>
                    `;
                }
                return;
            }

            // 1. Primera diapositiva en #ar-content (targetIndex: 0)
            const primeraDiapo = lista[0];
            if (arContent && primeraDiapo.codigoAnimacion) {
                arContent.innerHTML = primeraDiapo.codigoAnimacion;
            }

            // 2. Diapositivas adicionales (targetIndex: 1, 2, ...)
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

            // 3. Construir el archivo .mind (individual o combinado) e iniciar la cámara AR
            const targetUrl = await construirUrlMindMultiTarget(lista);
            iniciarMindARConTarget(targetUrl);

            console.log(`Animaciones 3D cargadas desde la base de datos (${lista.length} diapositiva(s))`);
        })
        .catch(err => console.error("Error cargando JSON:", err));

    // Motor de cambio de color dinámico para los textos 3D del Método Científico
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

        requestAnimationFrame(animarColoresTexto);
    }
    requestAnimationFrame(animarColoresTexto);

    // Cuando cualquier diapositiva es detectada por la cámara
    sceneEl.addEventListener("targetFound", event => {
        console.log("¡Diapositiva detectada!");
        if (scannerText) scannerText.style.display = 'none';
        if (event && event.target) {
            event.target.setAttribute('visible', 'true');
        } else if (arContent) {
            arContent.setAttribute('visible', 'true');
        }
        if (finishedMsg) finishedMsg.style.display = 'none';
    });

    // Cuando la imagen se pierde de vista
    sceneEl.addEventListener("targetLost", event => {
        console.log("Se perdió la diapositiva de vista.");
        if (scannerText) scannerText.style.display = 'block';
        if (finishedMsg) finishedMsg.style.display = 'none';
    });
});
