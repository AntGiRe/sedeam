# Sedeam

*Tu biblioteca de trámites.* Extensión de Chrome que cuenta, como horas de juego, el tiempo **activo** que pasas en las webs de la Administración: Agencia Tributaria, Seguridad Social, DEHú, Catastro, Registros, DGT, BOE y SEPE. Tiene niveles, logros y estadísticas. Puedes añadir más webs desde Ajustes.

## Instalar

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

> **¿Venías de "Horas en Sede"?** Es otra extensión para Chrome. Exporta la copia en su pestaña Ajustes (*Exportar copia*) e impórtala en Sedeam (*Ajustes → Importar copia*). Después, desinstala la antigua.

## Cómo se actualiza (sin perder datos)

Las horas y los logros se guardan en el almacenamiento de Chrome, ligados al identificador de la extensión. Ese identificador es fijo gracias al campo `key` del `manifest.json`, así que **actualizar nunca borra datos**. Solo se pierden si desinstalas la extensión.

Hay dos tipos de actualización:

| Qué cambia | Cómo llega | Qué hay que hacer |
|---|---|---|
| **Catálogo**: juegos, logros, niveles y novedades (`catalog.json`) | La extensión descarga el `catalog.json` de GitHub cada hora | Nada. Llega solo y avisa con una notificación. |
| **Código**: diseño, funciones nuevas… | `scripts/auto-actualizar.sh` hace `git pull` cada 3 horas y la extensión detecta la versión nueva y se recarga sola | Nada, si activaste el script. Si no, `git pull` a mano. |

### Publicar juegos o logros nuevos

1. Edita `catalog.json`: añade el juego o el logro.
2. **Sube `catalogVersion`** en 1.
3. Ejecuta `node dev/test.mjs` para comprobar que el catálogo es válido.
4. Haz commit y push. Todas las instalaciones lo recibirán en menos de una hora.

Los logros son reglas en JSON, no código: la extensión nunca ejecuta nada descargado. Los tipos de regla disponibles están explicados al principio de `lib/rules.js`. Algunos ejemplos:

```json
{ "type": "time", "agg": "sum", "game": "aeat", "target": { "hours": 100 } }
{ "type": "time", "agg": "day", "weekdays": [5], "hours": [17, 24], "target": { "hours": 1 } }
{ "type": "time", "agg": "year", "game": "aeat", "months": [4, 5, 6], "target": { "hours": 40 } }
{ "type": "streak", "days": 20 }
```

Si un logro necesita un tipo de regla nuevo, hay que publicar también código nuevo. En ese caso, pon en el catálogo `"minAppVersion"` con la versión que lo entiende; así las extensiones antiguas siguen usando su catálogo hasta actualizarse.

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
