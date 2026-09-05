# Agencia de estudiantes internacionales

Material de trabajo para la agencia de reclutamiento de estudiantes
internacionales (Chile · México · España → Estados Unidos).

Independiente de la PWA de metas de ahorro que vive en la raíz del repo.

| Archivo | Qué es |
| --- | --- |
| `plan.html` | Plan fundacional: modelo económico, estructura legal, reparto entre socios, proceso completo del estudiante, calendario, roadmap y riesgos. Documento interno. |
| `index.html` | Landing pública de la agencia, en español, con calculadora de plazos y captación de leads por WhatsApp. |
| `presentacion.pptx` | Presentación de 16 diapositivas del plan, para exponerlo a los otros dos socios. Se genera con `scripts/deck.js`. |
| `scripts/deck.js` | Generador de la presentación (pptxgenjs). Editar aquí y regenerar, no tocar el .pptx a mano. |

## Pendiente antes de publicar la landing

- Nombre y marca definitivos — «Vía Norte» es un marcador de posición.
- Teléfonos de México y Chile (el de España ya está puesto). El formulario
  envía los leads al número de la constante `WA_NUMBER` en `index.html`;
  conviene cambiarlo por un WhatsApp Business cuando lo den de alta.
- Aviso de privacidad, términos y política de reembolso (los enlaces del pie
  están vacíos).
- Verificar en fuente oficial las tasas citadas en `plan.html`
  (I-901 SEVIS, MRV, tasa de integridad de visado) antes de usarlas en
  cualquier material de cara al cliente.

## Reparto de socios

- **Socio español** — mercado España y UE, cumplimiento RGPD.
- **Socio mexicano con green card** — titular de la LLC en EE. UU., firma los
  contratos con las instituciones y cobra las comisiones; además cubre la red
  mexicana. Pendiente confirmar dónde reside: si vive de forma permanente en
  EE. UU. no puede ser él quien capte a las familias mexicanas.
- **Socio chileno** — mercado Chile y Cono Sur, operación del proceso de visa.

## Regenerar la presentación

```
cd scripts && npm install pptxgenjs && node deck.js
```
