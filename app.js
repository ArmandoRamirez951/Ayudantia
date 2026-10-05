document.addEventListener("DOMContentLoaded", () => {
    const sceneEl = document.querySelector('a-scene');
    const uiContainer = document.getElementById('ui-container');
    const arContent = document.getElementById('ar-content');
    const finishedMsg = document.getElementById('finished-msg');
    
    // Elemento del texto flotante en 3D
    // Cargar la configuración desde el JSON de la base de datos
    fetch('diapositivas.json?t=' + Date.now())
        .then(response => response.json())
        .then(data => {
            // Suponemos que la primera diapositiva (index 0) es la que estamos detectando
            const diapo = data.diapositivas[0];
            
            // Inyectamos todo el código 3D guardado en el CMS directamente a la cámara
            if (arContent && diapo.codigoAnimacion) {
                arContent.innerHTML = diapo.codigoAnimacion;
            }
            
            console.log("Animación 3D cargada desde la base de datos");
        })
        .catch(err => console.error("Error cargando JSON:", err));

    // Cuando la imagen es detectada por la cámara
    sceneEl.addEventListener("targetFound", event => {
        console.log("¡Diapositiva detectada!");
        uiContainer.classList.add('hidden'); // Ocultar mensaje de "apunta"
        arContent.setAttribute('visible', 'true'); // Mostrar animación
        finishedMsg.style.display = 'none';
        
        // El temporizador se ha eliminado para que la animación se reproduzca en bucle infinito
        // mientras la cámara siga enfocando la diapositiva.
    });

    // Cuando la imagen se pierde de vista
    sceneEl.addEventListener("targetLost", event => {
        console.log("Se perdió la diapositiva de vista.");
        uiContainer.classList.remove('hidden'); // Volver a pedir que apunte
        finishedMsg.style.display = 'none';
    });
});
