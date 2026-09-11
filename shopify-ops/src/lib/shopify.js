import { request, ApiError } from './http.js';
import { env } from '../config.js';
import { log } from './log.js';

function base() {
  const store = env('SHOPIFY_STORE', { required: true }).replace(/^https?:\/\//, '').replace(/\/$/, '');
  const version = env('SHOPIFY_API_VERSION', { fallback: '2025-07' });
  return { store, version, token: env('SHOPIFY_ADMIN_TOKEN', { required: true }) };
}

/** Llamada a la Admin GraphQL API. Lanza si hay errors o userErrors. */
export async function gql(query, variables = {}, label = 'shopify') {
  const { store, version, token } = base();
  const body = await request(
    `https://${store}/admin/api/${version}/graphql.json`,
    {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    },
    { label }
  );

  if (body?.errors?.length) {
    throw new ApiError(`Shopify GraphQL: ${body.errors.map((e) => e.message).join(' | ')}`, { body });
  }
  // Cada mutacion de Shopify devuelve su propio userErrors; hay que mirarlos todos.
  for (const [field, payload] of Object.entries(body?.data || {})) {
    const ue = payload?.userErrors;
    if (Array.isArray(ue) && ue.length) {
      const msg = ue.map((e) => `${(e.field || []).join('.') || '-'}: ${e.message}`).join(' | ');
      throw new ApiError(`Shopify ${field}: ${msg}`, { body });
    }
  }
  return body.data;
}

/** Admin REST. Solo para lo que aun no existe en GraphQL, como la Asset API de temas. */
export async function rest(method, pathname, payload) {
  const { store, version, token } = base();
  return request(
    `https://${store}/admin/api/${version}/${pathname.replace(/^\//, '')}`,
    {
      method,
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
      body: payload ? JSON.stringify(payload) : undefined,
    },
    { label: `shopify:${method} ${pathname}` }
  );
}

// ── Comprobaciones ──────────────────────────────────────────────────────────

export async function shopInfo() {
  const d = await gql(`{ shop { name myshopifyDomain primaryDomain { url } currencyCode plan { displayName } ianaTimezone } }`);
  return d.shop;
}

export async function accessScopes() {
  const { store, version, token } = base();
  const d = await request(`https://${store}/admin/oauth/access_scopes.json`, {
    headers: { 'X-Shopify-Access-Token': token },
  }, { label: 'shopify:scopes' });
  return (d.access_scopes || []).map((s) => s.handle);
}

// ── Productos ───────────────────────────────────────────────────────────────

const PRODUCT_FIELDS = `id title handle status onlineStoreUrl variants(first: 1) { nodes { id price } }`;

export async function findProductByHandle(handle) {
  const d = await gql(
    `query($h: String!) { productByHandle(handle: $h) { ${PRODUCT_FIELDS} } }`,
    { h: handle }
  );
  return d.productByHandle;
}

/**
 * Crea el producto digital. Idempotente: si ya existe el handle, lo devuelve tal cual.
 * Un producto digital es, para Shopify, un producto cuyo variant no requiere envio
 * y no lleva control de inventario.
 */
export async function createDigitalProduct(offer, { descriptionHtml }) {
  const handle = offer.slug;
  const existing = await findProductByHandle(handle);
  if (existing) {
    log.warn(`El producto "${handle}" ya existe, no lo toco. Borralo en Shopify si quieres recrearlo.`);
    return { product: existing, created: false };
  }

  const d = await gql(
    `mutation($input: ProductInput!) {
       productCreate(input: $input) {
         product { ${PRODUCT_FIELDS} }
         userErrors { field message }
       }
     }`,
    {
      input: {
        title: offer.name,
        handle,
        descriptionHtml,
        productType: 'Digital',
        vendor: offer.vendor || offer.brand || 'Digital',
        status: 'ACTIVE',
        tags: ['digital', 'descarga', ...(offer.tags || [])],
        seo: { title: offer.seoTitle || offer.name, description: offer.seoDescription || offer.promise },
      },
    },
    'shopify:productCreate'
  );

  const product = d.productCreate.product;
  const variantId = product.variants.nodes[0]?.id;

  if (variantId) {
    await gql(
      `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
         productVariantsBulkUpdate(productId: $productId, variants: $variants) {
           productVariants { id price }
           userErrors { field message }
         }
       }`,
      {
        productId: product.id,
        variants: [{
          id: variantId,
          price: String(offer.price),
          compareAtPrice: offer.compareAtPrice ? String(offer.compareAtPrice) : null,
          inventoryItem: { requiresShipping: false, tracked: false },
          inventoryPolicy: 'CONTINUE',
          taxable: offer.taxable !== false,
        }],
      },
      'shopify:variantUpdate'
    );
  }
  return { product, created: true, variantId };
}

// ── Publicacion ─────────────────────────────────────────────────────────────

export async function onlineStorePublicationId() {
  const d = await gql(`{ publications(first: 25) { nodes { id name } } }`);
  const pub = d.publications.nodes.find((p) => /online store/i.test(p.name));
  return pub?.id || null;
}

export async function publish(resourceId, publicationId) {
  if (!publicationId) return false;
  await gql(
    `mutation($id: ID!, $input: [PublicationInput!]!) {
       publishablePublish(id: $id, input: $input) { userErrors { field message } }
     }`,
    { id: resourceId, input: [{ publicationId }] },
    'shopify:publish'
  );
  return true;
}

// ── Paginas ─────────────────────────────────────────────────────────────────

export async function upsertPage({ handle, title, body, templateSuffix = null }) {
  const found = await gql(
    `query($q: String!) { pages(first: 1, query: $q) { nodes { id handle title } } }`,
    { q: `handle:${handle}` }
  );
  const existing = found.pages.nodes[0];

  if (existing) {
    const d = await gql(
      `mutation($id: ID!, $page: PageUpdateInput!) {
         pageUpdate(id: $id, page: $page) { page { id handle } userErrors { field message } }
       }`,
      { id: existing.id, page: { title, body, templateSuffix } },
      'shopify:pageUpdate'
    );
    return { page: d.pageUpdate.page, created: false };
  }

  const d = await gql(
    `mutation($page: PageCreateInput!) {
       pageCreate(page: $page) { page { id handle } userErrors { field message } }
     }`,
    { page: { title, handle, body, templateSuffix, isPublished: true } },
    'shopify:pageCreate'
  );
  return { page: d.pageCreate.page, created: true };
}

// ── Tema (Asset API, solo REST) ─────────────────────────────────────────────

export async function mainThemeId() {
  const d = await rest('GET', 'themes.json');
  const theme = (d.themes || []).find((t) => t.role === 'main');
  return theme?.id || null;
}

export async function putAsset(themeId, key, value) {
  return rest('PUT', `themes/${themeId}/assets.json`, { asset: { key, value } });
}

// ── Pedidos (para calcular el ROAS real, no el que reporta la plataforma) ───

/**
 * Descarga pedidos desde una fecha, con las UTM de la sesion de captacion.
 * Shopify pagina de 250 en 250; seguimos el cursor hasta el final.
 */
export async function ordersSince(isoDate, { limit = 2000 } = {}) {
  const out = [];
  let cursor = null;
  const query = `created_at:>=${isoDate.slice(0, 10)}`;

  while (out.length < limit) {
    const d = await gql(
      `query($q: String!, $after: String) {
         orders(first: 250, after: $after, query: $q, sortKey: CREATED_AT) {
           pageInfo { hasNextPage endCursor }
           nodes {
             id name createdAt test cancelledAt
             currentTotalPriceSet { shopMoney { amount currencyCode } }
             totalRefundedSet { shopMoney { amount } }
             customerJourneySummary {
               firstVisit { utmParameters { source medium campaign content term } landingPage }
             }
             lineItems(first: 10) { nodes { quantity product { handle } } }
           }
         }
       }`,
      { q: query, after: cursor },
      'shopify:orders'
    );
    const conn = d.orders;
    out.push(...conn.nodes);
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  return out;
}
