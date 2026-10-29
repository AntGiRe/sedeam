// Actualizaciones del código de la extensión.
//
// Con la extensión cargada desde una carpeta clonada de GitHub ("Cargar descomprimida"):
//   1. el script scripts/auto-actualizar.sh hace `git pull` en esa carpeta cada pocas horas,
//   2. la extensión compara la versión que tiene cargada con la del manifest.json del disco,
//   3. si la del disco es más nueva, se recarga sola. Los datos (chrome.storage) no se tocan.
// Además consulta la versión publicada en GitHub para avisar si la carpeta se ha quedado atrás.

import { compareVersions } from './core.js';
import { REMOTE_ENABLED, rawUrl } from '../config.js';

export const running = () => chrome.runtime.getManifest().version;

async function diskVersion() {
  try {
    const m = await fetch(chrome.runtime.getURL('manifest.json'), { cache: 'no-store' }).then((r) => r.json());
    return m.version;
  } catch {
    return null;
  }
}

async function publishedVersion() {
  if (!REMOTE_ENABLED) return null;
  try {
    const m = await fetch(rawUrl('manifest.json'), { cache: 'no-store' }).then((r) => r.json());
    return m.version;
  } catch {
    return null;
  }
}

// Devuelve { reload: bool, status } y deja el estado en storage para que lo enseñe la interfaz.
export async function checkForUpdates() {
  const current = running();
  const [disk, published] = await Promise.all([diskVersion(), publishedVersion()]);
  const status = {
    running: current,
    disk,
    published,
    checkedAt: Date.now(),
    available: !!published && compareVersions(published, current) > 0,
  };
  await chrome.storage.local.set({ updateStatus: status });
  return { reload: !!disk && compareVersions(disk, current) > 0, status };
}
