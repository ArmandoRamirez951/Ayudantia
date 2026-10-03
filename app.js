document.addEventListener("DOMContentLoaded", () => {
    const sceneEl = document.querySelector('a-scene');
    const uiContainer = document.getElementById('ui-container');
    const arContent = document.getElementById('ar-content');
    const finishedMsg = document.getElementById('finished-msg');
    
    // Elemento del texto flotante en 3D
    const arText = document.querySelector('a-text');
    
    let animationTimer;
    let configActual = { duracion: 10000, mensaje: "Metodo Cientifico Activado" };

    // Cargar la configuración desde el JSON
    fetch('diapositivas.json')
        .then(response => response.json())
        .then(data => {
            // Suponemos que la primera diapositiva (index 0) es la que estamos detectando
            const diapo = data.diapositivas[0];
            configActual.duracion = diapo.duracion_animacion_segundos * 1000;
            configActual.mensaje = diapo.mensaje_ar;
            
            // Actualizar el texto en el modelo 3D
            if (arText) {
                arText.setAttribute('value', configActual.mensaje);
            }
            console.log("Configuración JSON cargada:", diapo);
        })
        .catch(err => console.error("Error cargando JSON:", err));

    // Cuando la imagen es detectada por la cámara
    sceneEl.addEventListener("targetFound", event => {
        console.log("¡Diapositiva detectada!");
        uiContainer.classList.add('hidden'); // Ocultar mensaje de "apunta"
        arContent.setAttribute('visible', 'true'); // Mostrar animación
        finishedMsg.style.display = 'none';
        
        clearTimeout(animationTimer);
        
        // Lógica para la duración (basada en el JSON)
        animationTimer = setTimeout(() => {
            arContent.setAttribute('visible', 'false');
            finishedMsg.style.display = 'block'; 
            
            setTimeout(() => {
                finishedMsg.style.display = 'none';
            }, 3000);
        }, configActual.duracion);
    });

    // Cuando la imagen se pierde de vista
    sceneEl.addEventListener("targetLost", event => {
        console.log("Se perdió la diapositiva de vista.");
        uiContainer.classList.remove('hidden'); // Volver a pedir que apunte
        clearTimeout(animationTimer);
        finishedMsg.style.display = 'none';
    });
});
