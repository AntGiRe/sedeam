// Configuración de marca y del repositorio de actualizaciones. Es lo único que hay que tocar
// para renombrar la extensión o apuntarla a otro repositorio de GitHub.

export const BRAND = {
  name: 'Sedeam',
  tagline: 'Tu biblioteca de trámites',
};

// Repositorio público de GitHub del que se descargan el catálogo (juegos, logros) y los avisos de versión.
// Mientras owner sea 'TU_USUARIO' no se consulta nada remoto.
export const REPO = {
  owner: 'AntGiRe',
  name: 'sedeam',
  branch: 'main',
};

export const REMOTE_ENABLED = REPO.owner !== 'TU_USUARIO';
export const rawUrl = (path) => `https://raw.githubusercontent.com/${REPO.owner}/${REPO.name}/${REPO.branch}/${path}`;
export const repoUrl = () => `https://github.com/${REPO.owner}/${REPO.name}`;
export const releasesUrl = () => `${repoUrl()}/releases/latest`;
