# Sedeam

*Tu biblioteca de trámites.* Extensión de Chrome que cuenta, como horas de juego, el tiempo **activo** que pasas en las webs de la Administración: Agencia Tributaria, Seguridad Social, DEHú, Catastro, Registros, DGT, BOE y SEPE. Tiene niveles, XP, temporadas, logros, retos semanales y un Wrapped mensual y anual. Las webs que se cuentan las decide el catálogo (`catalog.json`): para añadir una sede nueva, se añade ahí y llega sola a todas las instalaciones.

## Instalar sin saber nada de git

1. Entra en [la última versión publicada](https://github.com/AntGiRe/sedeam/releases/latest) y descarga el archivo `sedeam-X.Y.Z.zip` (en *Assets*).
2. Descomprímelo en una carpeta fija, por ejemplo `Documentos/Sedeam`.
3. Abre `chrome://extensions`, activa **Modo de desarrollador** y pulsa **Cargar descomprimida**. Elige la carpeta `sedeam` que sale del zip.

Cuando salga una versión nueva, Sedeam te avisará. Descarga el zip nuevo y descomprímelo **encima de la misma carpeta**: la extensión se recarga sola y conserva tus horas y logros.

Las releases se crean solas: cada vez que cambia `version` en `manifest.json` y se sube a GitHub, una automatización empaqueta el zip y publica la release (`.github/workflows/release.yml`).

## Instalar con git (para desarrollar)

1. Clona el repositorio en una carpeta fija, por ejemplo `~/Documents/sedeam`:
   ```bash
   git clone https://github.com/AntGiRe/sedeam.git ~/Documents/sedeam
   ```
2. Abre `chrome://extensions`, activa **Modo de desarrollador** y pulsa **Cargar descomprimida**. Elige esa carpeta.
3. Fija el icono en la barra (icono del puzle → chincheta).
4. Opcional, pero recomendable: activa las actualizaciones automáticas.
   ```bash
   ~/Documents/sedeam/scripts/auto-actualizar.sh
   ```

> **¿Venías de "Horas en Sede"?** Es otra extensión para Chrome. Exporta la copia en su pestaña Ajustes (*Exportar copia*) y restáurala en Sedeam (*Ajustes → Restaurar copia*). Después, desinstala la antigua.

## Cómo se actualiza (sin perder datos)

Las horas y los logros se guardan en el almacenamiento de Chrome, ligados al identificador de la extensión. Ese identificador es fijo gracias al campo `key` del `manifest.json`, así que **actualizar nunca borra datos**. Solo se pierden si desinstalas la extensión.

Hay dos tipos de actualización:

| Qué cambia | Cómo llega | Qué hay que hacer |
|---|---|---|
| **Catálogo**: juegos, logros, niveles y novedades (`catalog.json`) | La extensión descarga el `catalog.json` de GitHub cada hora | Nada. Llega solo y avisa con una notificación. |
| **Código**: diseño, funciones nuevas… | `scripts/auto-actualizar.sh` hace `git pull` cada 3 horas y la extensión detecta la versión nueva y se recarga sola | Nada, si activaste el script. Si no, `git pull` a mano. |

### Publicar novedades, plazos, sedes o logros (sin tocar código)

Todo el catálogo vive en **Supabase**, en las tablas `catalog_*`. Se edita desde **Table Editor**:

| Para… | Tabla | Notas |
|---|---|---|
| Publicar una novedad | `catalog_news` | `date`, `title`, `body`. Con `published = false` queda como borrador. Si la fecha es futura, no sale hasta ese día. |
| Añadir o corregir un plazo | `catalog_deadlines` | `day` es un número o `last`. `months` vacío significa todos los meses. `shift`: `after` (pasa al lunes) o `before` (al viernes). |
| Añadir una sede | `catalog_games` | Los avisos y las caídas en una sede nueva necesitan además su permiso en `manifest.json` (versión nueva). |
| Logros, retos, recompensas | `catalog_achievements`, `catalog_challenges`, `catalog_rewards` | Las reglas van en JSON (tipos en `lib/rules.js`). |
| Planificar los retos de una semana | `catalog_challenge_weeks` | Una fila por semana (`2026-S45`) con sus retos (ids de `catalog_challenges`) y un lema. Las semanas sin fila salen al azar. Los retos con `in_pool = false` solo salen por calendario. No cambies una semana ya empezada. |
| Quitar algo sin borrarlo | cualquiera | `active = false` |
| Niveles, temporadas, Cl@ve | `catalog_settings` | `levels`, `seasons`, `loading`, `minAppVersion` |

Cualquier cambio sube la versión del catálogo sola y llega a todas las extensiones en menos de una hora. Las tablas no se pueden leer ni escribir desde fuera: la extensión solo llama a `get_catalog()`, que devuelve lo publicado.

`catalog.json`, dentro de la extensión, es una **copia de respaldo**: sirve para la primera instalación o si Supabase no responde. Antes de sacar una versión nueva conviene refrescarla:

```bash
python3 dev/pull-catalog.py
```

### Base de datos (Supabase)

Los SQL están en `supabase/` y se ejecutan en **SQL Editor**, en este orden:

1. `migrations/0001_cuentas_y_sincronizacion.sql`: cuentas y sincronización entre PCs.
2. `migrations/0002_catalogo.sql`: catálogo y ajustes sincronizados.
3. `seed/catalogo.sql`: carga inicial del catálogo. Se genera con `python3 dev/catalog-to-sql.py`.
4. `migrations/0003_calendario_retos.sql`: calendario de retos semanales.
5. `seed/retos_temporada_4T_2026.sql`: retos temáticos y calendario hasta el 1 de febrero de 2027.
6. `migrations/0004_admins.sql`: cuentas de la casa (Modo CEO).
7. `seed/admin.sql`: te da de alta como CEO. Antes tienes que haber entrado en Sedeam con Google.
8. `tests/aislamiento.sql`: comprueba que cada usuario solo ve lo suyo. Lo deshace todo al terminar.

### Modo CEO

Las cuentas de la tabla `admins` ven un botón **👑 Vista CEO / 👁 Vista normal** arriba y una tarjeta en Ajustes. En vista CEO se ven todos los logros, rangos, temas y el pase completo. También se puede abrir el Wrapped del año antes de diciembre y revisar el calendario de retos. Todo esto es **solo a la vista**: no se guarda ni se sube nada, y las estadísticas, el Wrapped y el informe usan los datos reales. Para añadir o quitar a alguien, usa Table Editor → `admins`. En el código no hay ningún email.

### Publicar una versión nueva del código

1. Sube `version` en `manifest.json` (por ejemplo, de `0.2.0` a `0.3.0`).
2. Haz commit y push.

Los equipos con el script activado la recargan solos, y el resto ve un aviso de "versión nueva disponible".

### Para toda la oficina

Si un día se usa en varios ordenadores, lo más cómodo es publicarla en la **Chrome Web Store como "no listada"**. La cuenta de desarrollador cuesta 5 $, una sola vez. Así Chrome la actualiza solo, sin git ni scripts, en Windows y Mac.

## Configuración

Para cambiar el nombre o el repositorio, edita `config.js`. Mientras `REPO.owner` sea `TU_USUARIO`, la extensión no consulta nada en internet.

## Privacidad

Todo se queda en el navegador. La extensión solo mira la dirección de la pestaña activa, nunca el contenido de las páginas. Las únicas peticiones a internet son la descarga de `catalog.json` y de `manifest.json` desde GitHub.

## Desarrollo

- `node dev/test.mjs`: pruebas de la lógica y del catálogo.
- `dev/mock-chrome.js`: simula Chrome con datos inventados. Para ver la interfaz fuera de la extensión, genera las páginas `dev/*.preview.html` (no se suben a git) y sírvelas con `python3 -m http.server`.
