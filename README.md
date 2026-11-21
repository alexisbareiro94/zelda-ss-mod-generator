# The Legend of Zelda: Skyward Sword HD (1.0.1) — Custom Hard Mode Generator

Generador open-source de mods de dificultad para **The Legend of Zelda: Skyward Sword HD** en **Nintendo Switch (`v1.0.1`)**.  
Permite personalizar **daño enemigo**, **velocidad de enemigos a 60 FPS fluidos** (movimiento, ataques e IA, sin acelerar a Link ni al mundo) y **curación reducida (−50%)**, generando paquetes listos para **emuladores (`.pchtxt`)** y **Nintendo Switch real con Atmosphère (`.ips`)**.

* **Title ID:** `01002DA013484000`
* **Versión soportada:** `1.0.1` (`Build ID: 5441AF3C89F97E1D25A8CCF14C742BF82336D8A8`)
* **100% libre de archivos de Nintendo:** no incluye ROMs, ejecutables ni assets del juego; solo genera parches de código ARM64.

---

## Cómo usar el generador

### Opción 1: Interfaz Web (`index.html`)
* Abre `index.html` directamente en tu navegador (funciona offline) o publícalo en **GitHub Pages**.
* Elige un preset o ajusta los sliders de **Daño (`1.0×`–`4.0×`)**, **Velocidad de enemigos (`1.0×`–`2.0×`)** y **Curación (`100%` / `50%`)**.
* Elige el formato (**Ambos**, solo **`.pchtxt`** o solo **`.ips`**) y haz clic en **Descargar Mod (.zip)**.

### Opción 2: Terminal (`generator.py`, sin dependencias externas)
```bash
# Generar carpetas .pchtxt y .ips en ./output
python3 generator.py --damage 2.5 --speed 1.5 --heal 0.5

# Generar un .zip listo para distribuir
python3 generator.py --damage 2.5 --speed 1.5 --heal 0.5 --zip mi_mod.zip
```

---

## Instalación del mod (para usuarios)

### Emuladores (Eden / Yuzu / Ryujinx) — usa `.pchtxt`
1. Verifica que tienes instalada y activada la actualización **`1.0.1`** del juego.
2. Clic derecho al juego → **Open Mod Data Location** (Eden/Yuzu) o **Open Mods Directory** (Ryujinx).
3. Copia la carpeta `SSHD_HardMode_1.0.1` (dentro de `Emulator_pchtxt/`) en ese directorio.
   * Ruta final: `.../SSHD_HardMode_1.0.1/exefs/1.0.1.pchtxt`
4. Asegúrate de que el mod esté marcado en **Propiedades** y arranca el juego.

### Nintendo Switch real (Atmosphère) — usa `.ips`
1. Requiere *Skyward Sword HD* actualizado a la versión **`1.0.1`**.
2. Copia la carpeta `atmosphere/` (dentro de `Switch_Atmosphere_ips/`) a la raíz de tu tarjeta SD.
   * Ruta final: `sd:/atmosphere/exefs_patches/SSHD_HardMode/5441AF3C89F97E1D25A8CCF14C742BF82336D8A8.ips`
3. Inicia el juego normalmente.

> **Importante:** No pongas `.pchtxt` y `.ips` dentro de la misma carpeta `exefs/` al mismo tiempo; usa solo el que corresponda a tu plataforma.

---

## Cómo publicarlo tú en GitHub Pages y GameBanana

### 1. Publicar el generador web gratis en GitHub Pages
1. Crea un repositorio nuevo en GitHub (por ejemplo `sshd-hard-mode-generator`) y sube el contenido de esta carpeta.
2. En el repositorio, ve a **Settings → Pages**.
3. En **Source**, selecciona **Deploy from a branch** → rama `main` → carpeta `/ (root)` → **Save**.
4. En ~1 minuto tendrás tu enlace público listo (`https://<tu-usuario>.github.io/sshd-hard-mode-generator/`).

### 2. Subirlo a GameBanana
1. Crea una publicación nueva en la sección de mods de *The Legend of Zelda: Skyward Sword HD*.
2. Sube los 3 archivos `.zip` de la carpeta `gamebanana_releases/` (ya traen `.pchtxt` + `.ips` separados + `INSTALL.txt`):
   * `SSHD_HardMode_1.0.1_Hard_2xDmg_1.35xSpd_50Heal.zip`
   * `SSHD_HardMode_1.0.1_Heroic_2.5xDmg_1.5xSpd_50Heal.zip` *(Recomendado)*
   * `SSHD_HardMode_1.0.1_Nightmare_3xDmg_1.8xSpd_50Heal.zip`
3. En la descripción, pega el link a tu **GitHub Pages** para que cualquier persona pueda crear su propia combinación personalizada en segundos.
# zelda-ss-mod-generator
# zelda-ss-mod-generator
# zelda-ss-mod-generator
