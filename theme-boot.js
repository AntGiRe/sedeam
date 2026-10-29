// Pinta el último tema elegido antes de cargar nada, para que la página no parpadee en azul.
try {
  const t = localStorage.getItem('sedeam-theme');
  if (t && t !== 'sede') document.documentElement.dataset.theme = t;
} catch {
  // sin almacenamiento local: se aplicará al cargar los datos
}
