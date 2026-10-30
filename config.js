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

// Cuentas y sincronización entre PCs (Supabase). La clave es la pública ("publishable"): está hecha
// para ir dentro de la app. Lo que protege los datos son los permisos por fila de la base de datos
// (supabase/migrations). La clave secreta NUNCA va aquí.
export const SUPABASE = {
  url: 'https://jhxzefcwehzfofcfudom.supabase.co',
  key: 'sb_publishable_FUZUcOjA6dGk8Ruep6QY5w_WxDUpOpk',
};
export const CLOUD_ENABLED = !!(SUPABASE.url && SUPABASE.key);
