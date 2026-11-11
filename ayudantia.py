import os
import sys
import subprocess
import shutil

def sincronizar_github():
    git_bin = shutil.which("git")
    if not git_bin:
        return
    print("[GITHUB] Sincronizando archivos y datos con GitHub Pages...")
    subprocess.run([git_bin, "add", "."], check=False)
    subprocess.run(
        [git_bin, "commit", "-m", "Actualizacion Sistema de Realidad Virtual"],
        capture_output=True,
        text=True
    )
    subprocess.run([git_bin, "pull", "--rebase", "origin", "main"], check=False)
    push_res = subprocess.run([git_bin, "push", "origin", "main"], check=False)
    if push_res.returncode == 0:
        print("[GITHUB] ¡Cambios enviados exitosamente a GitHub!")

def iniciar_sistema():
    directorio_base = os.path.dirname(os.path.abspath(__file__))
    os.chdir(directorio_base)

    print("=" * 60)
    print("  SISTEMA DE REALIDAD VIRTUAL • FCA UABC")
    print("=" * 60)

    # Si solo quiere subir a GitHub: python ayudantia.py github
    if len(sys.argv) > 1 and sys.argv[1].lower() in ("github", "subir", "push"):
        sincronizar_github()
        return

    # Sincronizar automáticamente antes de levantar el servidor
    sincronizar_github()

    node_bin = shutil.which("node")
    if not node_bin:
        print("[ERROR] No se encontró Node.js instalado en el sistema.")
        sys.exit(1)

    if not os.path.exists(os.path.join(directorio_base, "node_modules")):
        npm_bin = shutil.which("npm")
        if npm_bin:
            print("[INFO] Instalando dependencias del proyecto (npm install)...")
            subprocess.run([npm_bin, "install"], check=False)

    print("\n[INFO] Iniciando servidor principal (server.js) en http://localhost:3000 ...")
    print("[INFO] Cualquier animación o usuario que guardes se subirá automáticamente a GitHub.")
    print("[INFO] Presiona Ctrl + C para detener el servidor.\n")

    try:
        subprocess.run([node_bin, "server.js"], check=True)
    except KeyboardInterrupt:
        print("\n[INFO] Servidor detenido correctamente por el usuario.")
    except subprocess.CalledProcessError as e:
        print(f"\n[ERROR] El servidor finalizó con código: {e.returncode}")

if __name__ == "__main__":
    iniciar_sistema()
