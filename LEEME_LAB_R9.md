# Pancko Gestión LAB · Tinto Online Bridge · v0.12.19 R9

**Entorno: LAB. Comercio: LAB / futura Demo. No es producción Cañada.**

## Ficha de entorno

| Campo | R9 LAB |
|---|---|
| Entorno / comercio | LAB / LAB (futura Demo) |
| STORE_ID propuesto | `LAB-DEMO-001` (identificador documental; no se envía a ningún backend) |
| Versión | Frontend v0.12.19 R9; Bridge LAB v0.3.4 |
| Frontend destino | Repositorio nuevo `pancko-apps/pancko-integral-lab`, URL `https://pancko-apps.github.io/pancko-integral-lab/` |
| Worker destino | Ninguno; URL vacía. No se utiliza Worker de Cañada |
| Apps Script destino | Ninguno; no se utiliza el de Cañada |
| Sheet destino | Ninguna; no se utiliza la de Cañada |
| Tokens | Ninguno en R9; la app no permite guardar clave central |
| Sync central | Bloqueada por `PANCKO_API_URL=''` y por `panckoFetch` que rechaza cualquier solicitud |
| Bridge | Habilitado sólo para consulta puntual de fórmulas con la sesión oficial ya iniciada |
| Páginas aceptadas por Bridge LAB | `http://127.0.0.1:8765`, `http://localhost:8765`, `https://pancko-apps.github.io/pancko-integral-lab/` |
| Página de producción | `https://pancko-apps.github.io/pancko-integral/` expresamente rechazada |
| ZIP frontend | `Pancko_Gestion_LAB_BRIDGE_R9.zip` |
| ZIP extensión | `Pancko_Tinto_Bridge_Extension_LAB_v0.3.4.zip` |

## Aislamiento en GitHub Pages

GitHub Pages guarda `localStorage`, `sessionStorage` y Cache Storage **por origen**, no por nombre de repositorio. Por ello, `pancko-integral/` y `pancko-integral-lab/` comparten el origen `pancko-apps.github.io`. R9 prefija todas las claves usadas por el frontend con `pancko_lab_r9:` mediante `assets/lab-storage.js`; la lectura de datos de Cañada sin prefijo queda fuera de la app LAB. También limita los eventos de almacenamiento a ese prefijo. El service worker LAB usa cachés `pancko-lab-*` y las funciones de actualización sólo borran cachés LAB. El service worker se registra bajo la ruta del repositorio LAB. **No borres los datos del sitio entero desde Chrome**: eso sí afectaría a ambos proyectos en este origen.

La extensión limita el content script a la ruta LAB y el background comprueba la ruta completa del emisor. Chrome declara el permiso de host GitHub Pages a nivel de origen, pero el código rechaza mensajes de la ruta estable de producción.

## Datos incluidos

- `data/clientes.csv` sólo contiene encabezados. No se copiaron clientes ni documentos de Cañada.
- `data/articulos.csv` contiene **16 COD y nombres reales de productos Recuplast Interior Mate** de los cuatro tamaños y bases PASTEL, TINT, DEEP y ACCENT. Estos COD/nombres mínimos son necesarios para verificar la coincidencia exacta con el artículo del tintométrico oficial. Son los COD `84520993/94/96/97`, `84520983/84/86/87`, `84520973/74/76/77` y `84520963/64/66/67`. **Todos los precios del archivo son ficticios** (`10.000 × litros nominales`); no se copiaron precios reales ni el catálogo de 3.998 artículos.
- `data/recetas.csv` contiene una única receta **ficticia** `LAB-LOCAL`, base TINT, B=1, para probar prioridad offline. No se copiaron las 16.958 recetas de Cañada.
- Los precios locales por pulso se cargan en LAB manualmente como valores de prueba. No se transfieren los valores del navegador de producción. La app puede requerir configurar el precio de los colorantes usados por cada receta antes de aplicarla.
- Los presupuestos y registros creados en LAB se quedan en el almacenamiento LAB de ese navegador. Usar nombres de clientes ficticios al probar.

## Publicación en GitHub Pages LAB

1. Crear **un repositorio nuevo** `pancko-integral-lab` en la organización/cuenta `pancko-apps`. No usar el repositorio estable `pancko-integral`.
2. Descomprimir `Pancko_Gestion_LAB_BRIDGE_R9.zip` en la **raíz** del nuevo repositorio. `index.html`, `sw.js`, `manifest.webmanifest`, `assets/` y `data/` deben quedar directamente en esa raíz.
3. Activar Pages en el repositorio LAB: Settings → Pages → Deploy from a branch → rama elegida, carpeta `/ (root)`. Esperar a que abra `https://pancko-apps.github.io/pancko-integral-lab/`.
4. Comprobar en el encabezado y en la barra lateral `LAB · NO PRODUCCIÓN`, `v0.12.19 R9`, `Tinto Online Bridge`, y que la sincronización central figura bloqueada.
5. Desactivar o quitar extensiones experimentales anteriores. Descomprimir el ZIP de la extensión y cargar en `chrome://extensions` la carpeta `extension_lab` que contiene `manifest.json`, en modo desarrollador. Debe indicar versión **0.3.4**. Conceder acceso al sitio LAB si Chrome lo solicita. Recargar la pestaña LAB.
6. Abrir el tintométrico oficial en otra pestaña e iniciar sesión manualmente. Si la lista de precios no se detecta, consultar una fórmula oficial una vez. En Pancko LAB usar **Probar Bridge**.
7. No configurar tokens de Cañada ni importar respaldos reales en LAB. No activar sincronización central.

No se publicó ningún repositorio desde este paquete: los pasos 1–3 son necesarios para obtener la URL real. Si `pancko-integral-lab` no está disponible, **no cambiar la ruta a otro nombre sin actualizar el manifest y las dos validaciones de URL de la extensión**.

## Checklist de prueba

- [ ] Abrir URL LAB publicada y verificar `LAB · NO PRODUCCIÓN · v0.12.19 R9` en header/sidebar.
- [ ] Confirmar catálogo mínimo de 16 artículos, receta offline ficticia y ausencia de clientes reales.
- [ ] Instalar extensión LAB v0.3.4 y abrir sesión manual en tintométrico oficial.
- [ ] Pulsar **Probar Bridge**: extensión, pestaña oficial y lista detectadas.
- [ ] Laboratorio: buscar código online ausente de la receta ficticia, seleccionar producto con COD y revisar vista previa.
- [ ] Laboratorio: buscar por nombre/descripción y seleccionar sugerencia online.
- [ ] Presupuesto: elegir TINT y `LAB-LOCAL`; debe aplicar la receta offline sin consultar la extensión.
- [ ] Presupuesto: elegir fórmula online ausente de `recetas.csv`; confirmar COD, base, presentación nominal/real, pulsos y precios de prueba en la vista previa; aplicar manualmente.
- [ ] Guardar presupuesto LAB, reabrir y verificar fórmula y `online_snapshot`.
- [ ] Comprobar PDF, ticket y WhatsApp sólo con comercio/cliente ficticios; verificar que no aparezca nombre, dirección ni precios reales de Cañada.
- [ ] Cerrar pestaña oficial y comprobar mensaje de diagnóstico claro.
- [ ] Desactivar extensión LAB, recargar LAB y comprobar que **Probar Bridge** no responde.
- [ ] Abrir producción Cañada aparte: verificar que conserva sus datos y que la extensión LAB no responde desde `pancko-integral/`.
- [ ] Revisar en DevTools que las claves LAB empiezan por `pancko_lab_r9:` y que sólo hay cachés `pancko-lab-*` nuevos.

## Alcance de R9

Se conserva la prioridad offline, sugerencias online, consulta exacta por COD, validación de base y presentación, vista previa, pulsos exactos y snapshot local de R8. Las equivalencias de envase nominal de 1/4/10/20 L permanecen iguales. Ninguna receta online se agrega a `recetas.csv` ni se descarga masivamente. No se implementó comparación total de base, router multi-comercio ni sincronización.

Cuando se decida habilitar sincronización, preparar **Sheet LAB, Apps Script LAB, Worker LAB y tokens LAB separados**, y validar su flujo antes de retirar el bloqueo en un paquete distinto. Nada de eso es necesario para probar el Bridge desde GitHub Pages en R9.
