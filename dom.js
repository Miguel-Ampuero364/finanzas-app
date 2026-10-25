// replaceChildren escribe false, null y undefined como texto ("false", "null"): aquí se descartan.
export function poner(nodo, ...hijos) {
  nodo.replaceChildren(...hijos.filter((h) => h !== null && h !== undefined && h !== false));
}

// Crea un elemento. Los textos se agregan como nodos de texto, nunca como HTML.
export function el(tag, props = {}, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const h of hijos.flat()) {
    if (h === false || h === null || h === undefined) continue;
    e.append(h instanceof Node ? h : String(h));
  }
  return e;
}
