const DEFAULT_API_BASE = "http://localhost:3000/api";
const PAGE_SIZE = 100;
const REFRESH_INTERVAL_MS = 60_000;
const SYNC_SUMMARY_FIELDS = [
  ["totalProducts", "Total products"],
  ["syncedProducts", "Synced products"],
  ["failedProducts", "Failed products"],
  ["totalVariants", "Total variants"],
  ["syncedVariants", "Synced variants"],
  ["failedVariants", "Failed variants"],
  ["totalCMSRecord", "Total CMS records"],
  ["totalSyncedRecord", "Synced CMS records"],
  ["totalCmsFailed", "Failed CMS records"],
  ["unmatchedCmsRecord", "Unmatched CMS records"],
];

const state = {
  apiBase: localStorage.getItem("commerce-console-api-base") || DEFAULT_API_BASE,
  products: [],
  webhooks: [],
  expandedProducts: new Set(),
  loadedVariants: new Map(),
  selectedVariantIds: new Map(),
  variantDetails: new Map(),
  activeTab: "products",
  refreshing: false,
  syncing: false,
};

const elements = {
  connection: document.querySelector("#connection-indicator"),
  connectionLabel: document.querySelector("#connection-label"),
  lastUpdated: document.querySelector("#last-updated"),
  refreshButton: document.querySelector("#refresh-button"),
  settingsToggle: document.querySelector("#settings-toggle"),
  settingsPanel: document.querySelector("#settings-panel"),
  settingsForm: document.querySelector("#api-settings-form"),
  apiBaseUrl: document.querySelector("#api-base-url"),
  syncButton: document.querySelector("#sync-button"),
  syncButtonLabel: document.querySelector("#sync-button-label"),
  syncSummaryPanel: document.querySelector("#sync-summary-panel"),
  syncSummaryTitle: document.querySelector("#sync-summary-title"),
  syncSummaryMessage: document.querySelector("#sync-summary-message"),
  syncSummaryGrid: document.querySelector("#sync-summary-grid"),
  syncSummaryDismiss: document.querySelector("#sync-summary-dismiss"),
  statProducts: document.querySelector("#stat-products"),
  statReady: document.querySelector("#stat-ready"),
  statAttention: document.querySelector("#stat-attention"),
  statWebhooks: document.querySelector("#stat-webhooks"),
  productsTab: document.querySelector("#products-tab"),
  webhooksTab: document.querySelector("#webhooks-tab"),
  productsPanel: document.querySelector("#products-panel"),
  webhooksPanel: document.querySelector("#webhooks-panel"),
  productsTabCount: document.querySelector("#products-tab-count"),
  webhooksTabCount: document.querySelector("#webhooks-tab-count"),
  productSearch: document.querySelector("#product-search"),
  contentStatusFilter: document.querySelector("#content-status-filter"),
  productsTableBody: document.querySelector("#products-table-body"),
  productsResultCount: document.querySelector("#products-result-count"),
  dashboardNotice: document.querySelector("#dashboard-notice"),
  webhookSearch: document.querySelector("#webhook-search"),
  webhookStatusFilter: document.querySelector("#webhook-status-filter"),
  webhooksTableBody: document.querySelector("#webhooks-table-body"),
  webhooksResultCount: document.querySelector("#webhooks-result-count"),
};

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = String(text);
  return element;
}

function displayValue(value, fallback = "—") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function normalized(value) {
  return String(value ?? "").trim().toLowerCase();
}

function shortId(value) {
  const text = displayValue(value);
  return text.length > 22 ? `${text.slice(0, 10)}…${text.slice(-8)}` : text;
}

function dateValue(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value) {
  const date = dateValue(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatRelative(value) {
  const date = dateValue(value);
  if (!date) return "—";
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const units = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return formatter.format(seconds, "second");
}

function latestWebhookTime(webhook) {
  const received = dateValue(webhook.receivedAt);
  const processed = dateValue(webhook.processedAt);
  if (received && processed) return received > processed ? received : processed;
  return received || processed;
}

function setConnection(status, label) {
  elements.connection.classList.toggle("is-connected", status === "connected");
  elements.connection.classList.toggle("is-error", status === "error");
  elements.connectionLabel.textContent = label;
}

function setNotice(message, isError = false) {
  elements.dashboardNotice.hidden = !message;
  elements.dashboardNotice.classList.toggle("is-error", isError);
  elements.dashboardNotice.textContent = message || "";
}

function getApiUrl(path, params = {}) {
  const base = state.apiBase.replace(/\/+$/, "");
  const url = new URL(`${base}${path}`, window.location.href);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`API returned ${response.status} ${response.statusText}`.trim());
  }
  return response.json();
}

async function fetchProducts() {
  const products = [];
  let offset = 0;
  while (true) {
    const result = await fetchJson(getApiUrl("/products", { limit: PAGE_SIZE, offset }));
    if (!Array.isArray(result.products)) {
      throw new Error("Products API response did not contain a products array.");
    }
    products.push(...result.products);
    if (result.products.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return products;
}

async function fetchWebhooks() {
  const webhooks = [];
  let offset = 0;
  while (true) {
    const result = await fetchJson(getApiUrl("/webhooks", { limit: PAGE_SIZE, offset }));
    if (!Array.isArray(result.webhooks)) {
      throw new Error("Webhooks API response did not contain a webhooks array.");
    }
    webhooks.push(...result.webhooks);
    if (result.webhooks.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return webhooks.sort((a, b) => {
    const aTime = latestWebhookTime(a)?.getTime() ?? 0;
    const bTime = latestWebhookTime(b)?.getTime() ?? 0;
    return bTime - aTime;
  });
}

function makeCell(row, value, className = "") {
  const cell = makeElement("td", className, value);
  row.append(cell);
  return cell;
}

function statusClass(value) {
  const status = normalized(value);
  if (["complete", "completed", "ready", "published", "success", "succeeded"].includes(status)) return "status-positive";
  if (["missing", "failed", "error", "rejected"].includes(status)) return "status-danger";
  if (["pending", "received", "queued", "processing", "in_progress"].includes(status)) return "status-warning";
  return "status-neutral";
}

function makeBadge(value) {
  return makeElement("span", `status-badge ${statusClass(value)}`, displayValue(value, "unknown"));
}

function updateProductFilters() {
  const selected = elements.contentStatusFilter.value;
  const statuses = [...new Set(state.products.map((product) => product.contentStatus).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b)));
  elements.contentStatusFilter.replaceChildren(new Option("All content statuses", ""));
  for (const status of statuses) {
    elements.contentStatusFilter.add(new Option(String(status).replaceAll("_", " "), String(status)));
  }
  elements.contentStatusFilter.value = statuses.includes(selected) ? selected : "";
}

function updateWebhookFilters() {
  const selected = elements.webhookStatusFilter.value;
  const statuses = [...new Set(state.webhooks.map((webhook) => webhook.status).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b)));
  elements.webhookStatusFilter.replaceChildren(new Option("All event statuses", ""));
  for (const status of statuses) {
    elements.webhookStatusFilter.add(new Option(String(status).replaceAll("_", " "), String(status)));
  }
  elements.webhookStatusFilter.value = statuses.includes(selected) ? selected : "";
}

function filteredProducts() {
  const query = normalized(elements.productSearch.value);
  const status = elements.contentStatusFilter.value;
  return state.products.filter((product) => {
    if (status && product.contentStatus !== status) return false;
    if (!query) return true;
    return [
      product.title,
      product.handle,
      product.commerceProductId,
      product.cmsContentId,
      product.seoTitle,
    ].some((value) => normalized(value).includes(query));
  });
}

function renderProductDetails(product, productId) {
  const row = makeElement("tr", "details-row");
  const cell = makeElement("td");
  cell.colSpan = 6;
  const details = makeElement("div", "product-details");

  const description = makeElement("div", "detail-block");
  description.append(makeElement("span", "detail-label", "Description"));
  description.append(makeElement("div", "detail-value", displayValue(product.description, "No description available.")));

  const seo = makeElement("div", "detail-block");
  seo.append(makeElement("span", "detail-label", "SEO title"));
  seo.append(makeElement("div", "detail-value", displayValue(product.seoTitle)));

  const seoDescription = makeElement("div", "detail-block");
  seoDescription.append(makeElement("span", "detail-label", "SEO description"));
  seoDescription.append(makeElement("div", "detail-value", displayValue(product.seoDescription)));

  const variants = makeElement("div", "detail-block variants-block");
  const variantsHeading = makeElement("div", "variants-heading", "Variants");
  variants.append(variantsHeading);
  const cached = state.loadedVariants.get(productId);
  if (cached?.loading) {
    variants.append(makeElement("span", "details-loading", "Loading variants…"));
  } else if (cached?.error) {
    variants.append(makeElement("span", "details-loading", cached.error));
  } else if (cached?.items) {
    variantsHeading.append(makeElement("span", "variant-count", cached.items.length));
    if (cached.items.length) {
      const list = makeElement("div", "variant-list");
      for (const variant of cached.items) {
        const variantId = String(variant.id ?? "");
        const chip = makeElement("button", "variant-chip");
        chip.type = "button";
        chip.disabled = !variantId;
        chip.setAttribute("aria-expanded", String(state.selectedVariantIds.get(productId) === variantId));
        chip.append(makeElement("strong", "", displayValue(variant.title, "Untitled variant")));
        const pieces = [
          variant.sku ? `SKU ${variant.sku}` : null,
          variant.inventoryQuantity !== null && variant.inventoryQuantity !== undefined
            ? `Stock ${variant.inventoryQuantity}`
            : null,
          variant.price !== null && variant.price !== undefined
            ? `Price ${formatPrice(variant.price)}`
            : null,
        ].filter(Boolean);
        chip.append(makeElement("span", "", pieces.join(" · ") || "No SKU or inventory details"));
        chip.addEventListener("click", () => toggleVariantDetails(productId, variant));
        list.append(chip);
      }
      variants.append(list);
      const selectedVariantId = state.selectedVariantIds.get(productId);
      if (selectedVariantId) {
        const key = `${productId}:${selectedVariantId}`;
        variants.append(renderVariantDetails(state.variantDetails.get(key)));
      }
    } else {
      variants.append(makeElement("span", "details-loading", "No variants found."));
    }
  } else {
    variants.append(makeElement("span", "details-loading", "Variant details are not loaded yet."));
  }

  details.append(description, seo, seoDescription, variants);
  cell.append(details);
  row.append(cell);
  return row;
}

function renderVariantDetails(cached) {
  const panel = makeElement("div", "variant-detail-panel");
  if (cached?.loading) {
    panel.append(makeElement("span", "details-loading", "Loading selected variant…"));
    return panel;
  }
  if (cached?.error) {
    panel.append(makeElement("span", "details-loading", cached.error));
    return panel;
  }
  if (!cached?.item) return panel;

  const variant = cached.item;
  panel.append(makeElement("strong", "variant-detail-title", "Selected variant details"));
  const fields = [
    ["SKU", variant.sku],
    ["Commerce variant ID", variant.commerceVariantId],
    ["Price", variant.price === null || variant.price === undefined ? null : formatPrice(variant.price)],
    ["Inventory", variant.inventoryQuantity],
    ["Options", variant.options === null || variant.options === undefined ? null : JSON.stringify(variant.options)],
    ["Last synced", formatDate(variant.lastSyncedAt)],
  ];
  const grid = makeElement("div", "variant-detail-grid");
  for (const [label, value] of fields) {
    const field = makeElement("div", "variant-detail-field");
    field.append(makeElement("span", "detail-label", label));
    field.append(makeElement("span", "detail-value", displayValue(value)));
    grid.append(field);
  }
  panel.append(grid);
  return panel;
}

async function toggleVariantDetails(productId, variant) {
  const variantId = String(variant.id ?? "");
  if (!variantId) return;
  if (state.selectedVariantIds.get(productId) === variantId) {
    state.selectedVariantIds.delete(productId);
    renderProducts();
    return;
  }

  state.selectedVariantIds.set(productId, variantId);
  const key = `${productId}:${variantId}`;
  if (!state.variantDetails.has(key)) {
    state.variantDetails.set(key, { loading: true });
    renderProducts();
    try {
      const result = await fetchJson(getApiUrl(
        `/variants/${encodeURIComponent(variantId)}/${encodeURIComponent(productId)}`
      ));
      if (!result.variant || typeof result.variant !== "object") {
        throw new Error("Variant API response did not contain a variant.");
      }
      state.variantDetails.set(key, { item: result.variant });
    } catch (error) {
      state.variantDetails.set(key, { error: `Could not load variant: ${error.message}` });
    }
  }
  renderProducts();
}

function formatPrice(price) {
  if (typeof price === "number" || typeof price === "string") return String(price);
  if (Array.isArray(price)) return price.map(formatPrice).join(", ");
  if (price && typeof price === "object") {
    const amount = price.amount ?? price.value;
    const currency = price.currency_code ?? price.currency ?? price.currencyCode;
    if (amount !== undefined) return `${amount}${currency ? ` ${currency}` : ""}`;
    return JSON.stringify(price);
  }
  return String(price);
}

function renderProducts() {
  const products = filteredProducts();
  elements.productsTableBody.replaceChildren();
  elements.productsResultCount.textContent = `${products.length} of ${state.products.length} products`;

  if (!products.length) {
    const row = makeElement("tr");
    const cell = makeElement("td", "table-message", state.products.length ? "No products match your filters." : "No products found.");
    cell.colSpan = 6;
    row.append(cell);
    elements.productsTableBody.append(row);
    return;
  }

  for (const product of products) {
    const productId = String(product.id ?? product.commerceProductId ?? "");
    const row = makeElement("tr");
    const productCell = makeElement("td");
    const productButton = makeElement("button", "product-name-button");
    productButton.type = "button";
    productButton.setAttribute("aria-expanded", String(state.expandedProducts.has(productId)));
    productButton.setAttribute("aria-label", `View details for ${displayValue(product.title, "Untitled product")}`);
    productButton.append(makeElement("strong", "", displayValue(product.title, "Untitled product")));
    productButton.append(makeElement("span", "product-handle", product.handle ? `/${product.handle}` : "No handle"));
    productButton.addEventListener("click", () => toggleProductDetails(product, productId));
    productCell.append(productButton);

    const statusCell = makeElement("td");
    statusCell.append(makeBadge(product.contentStatus));
    const commerceCell = makeElement("td", "mono");
    commerceCell.append(makeElement("span", "truncate-id", shortId(product.commerceProductId)));
    if (product.commerceProductId) commerceCell.title = String(product.commerceProductId);
    const cmsCell = makeElement("td", "mono");
    cmsCell.append(makeElement("span", "truncate-id", shortId(product.cmsContentId)));
    if (product.cmsContentId) cmsCell.title = String(product.cmsContentId);
    const syncedCell = makeElement("td", "", formatDate(product.lastSyncedAt));
    const actionCell = makeElement("td");
    const expand = makeElement("button", "expand-button");
    expand.type = "button";
    expand.setAttribute("aria-expanded", String(state.expandedProducts.has(productId)));
    expand.setAttribute("aria-label", `Toggle details for ${displayValue(product.title, "product")}`);
    expand.innerHTML = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    expand.addEventListener("click", () => toggleProductDetails(product, productId));
    actionCell.append(expand);
    row.append(productCell, statusCell, commerceCell, cmsCell, syncedCell, actionCell);
    elements.productsTableBody.append(row);
    if (state.expandedProducts.has(productId)) {
      elements.productsTableBody.append(renderProductDetails(product, productId));
    }
  }
}

async function toggleProductDetails(product, productId) {
  if (state.expandedProducts.has(productId)) {
    state.expandedProducts.delete(productId);
    renderProducts();
    return;
  }
  state.expandedProducts.add(productId);
  if (!state.loadedVariants.has(productId)) {
    state.loadedVariants.set(productId, { loading: true });
    renderProducts();
    try {
      const result = await fetchJson(getApiUrl(`/variants/${encodeURIComponent(productId)}`));
      if (!Array.isArray(result.variants)) throw new Error("Variants API response did not contain a variants array.");
      state.loadedVariants.set(productId, { items: result.variants });
    } catch (error) {
      state.loadedVariants.set(productId, { error: `Could not load variants: ${error.message}` });
    }
  }
  renderProducts();
}

function filteredWebhooks() {
  const query = normalized(elements.webhookSearch.value);
  const status = elements.webhookStatusFilter.value;
  return state.webhooks.filter((webhook) => {
    if (status && webhook.status !== status) return false;
    if (!query) return true;
    return [
      webhook.eventType,
      webhook.source,
      webhook.status,
      webhook.externalEventId,
      webhook.errorMessage,
    ].some((value) => normalized(value).includes(query));
  });
}

function renderWebhooks() {
  const webhooks = filteredWebhooks();
  elements.webhooksTableBody.replaceChildren();
  elements.webhooksResultCount.textContent = `${webhooks.length} of ${state.webhooks.length} events`;

  if (!webhooks.length) {
    const row = makeElement("tr");
    const cell = makeElement("td", "table-message", state.webhooks.length ? "No events match your filters." : "No webhook events found.");
    cell.colSpan = 6;
    row.append(cell);
    elements.webhooksTableBody.append(row);
    return;
  }

  for (const webhook of webhooks) {
    const row = makeElement("tr");
    const eventCell = makeElement("td");
    eventCell.append(makeElement("span", "event-name", displayValue(webhook.eventType, "Unknown event")));
    const id = makeElement("span", "event-id", shortId(webhook.externalEventId));
    if (webhook.externalEventId) id.title = String(webhook.externalEventId);
    eventCell.append(id);

    const sourceCell = makeElement("td");
    const source = normalized(webhook.source);
    const sourceLabel = makeElement("span", "source-label");
    sourceLabel.append(makeElement("span", `source-mark source-${source}`));
    sourceLabel.append(document.createTextNode(displayValue(webhook.source, "unknown")));
    sourceCell.append(sourceLabel);

    const statusCell = makeElement("td");
    statusCell.append(makeBadge(webhook.status));
    if (webhook.errorMessage) statusCell.title = String(webhook.errorMessage);
    const received = makeCell(row, formatDate(webhook.receivedAt));
    received.title = webhook.receivedAt ? new Date(webhook.receivedAt).toLocaleString() : "";
    const processed = makeCell(row, formatDate(webhook.processedAt));
    processed.title = webhook.processedAt ? new Date(webhook.processedAt).toLocaleString() : "";
    const latest = latestWebhookTime(webhook);
    const latestCell = makeCell(row, latest ? formatRelative(latest) : "—", "latest-time");
    if (latest) latestCell.title = latest.toLocaleString();
    row.prepend(eventCell, sourceCell, statusCell);
    elements.webhooksTableBody.append(row);
  }
}

function renderStats() {
  const ready = state.products.filter((product) => {
    const status = normalized(product.contentStatus);
    return status && !["missing", "pending", "failed", "error"].includes(status);
  }).length;
  const attention = state.products.filter((product) => normalized(product.contentStatus) === "missing").length;
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const recent = state.webhooks.filter((webhook) => {
    const timestamp = latestWebhookTime(webhook);
    return timestamp && timestamp.getTime() >= since;
  }).length;

  elements.statProducts.textContent = String(state.products.length);
  elements.statReady.textContent = String(ready);
  elements.statAttention.textContent = String(attention);
  elements.statWebhooks.textContent = String(recent);
  elements.productsTabCount.textContent = String(state.products.length);
  elements.webhooksTabCount.textContent = String(state.webhooks.length);
}

async function refreshDashboard() {
  if (state.refreshing) return;
  state.refreshing = true;
  elements.refreshButton.disabled = true;
  setConnection("connecting", "Refreshing");
  setNotice("");

  try {
    const [products, webhooks] = await Promise.all([fetchProducts(), fetchWebhooks()]);
    state.products = products;
    state.webhooks = webhooks;
    setConnection("connected", "API connected");
    elements.lastUpdated.textContent = `Updated ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date())}`;
    renderStats();
    updateProductFilters();
    updateWebhookFilters();
    renderProducts();
    renderWebhooks();
  } catch (error) {
    setConnection("error", "API unavailable");
    const detail = error instanceof TypeError
      ? "Could not reach the API. Check the API URL, server availability, and cross-origin (CORS) access."
      : error.message;
    setNotice(`${detail} Configure the API under API settings.`, true);
    if (!state.products.length) {
      elements.productsTableBody.replaceChildren();
      const row = makeElement("tr");
      const cell = makeElement("td", "table-message", "Could not load products. Check the API connection above.");
      cell.colSpan = 6;
      row.append(cell);
      elements.productsTableBody.append(row);
      elements.productsResultCount.textContent = "Products unavailable";
    }
    if (!state.webhooks.length) {
      elements.webhooksTableBody.replaceChildren();
      const row = makeElement("tr");
      const cell = makeElement("td", "table-message", "Could not load webhook activity.");
      cell.colSpan = 6;
      row.append(cell);
      elements.webhooksTableBody.append(row);
      elements.webhooksResultCount.textContent = "Events unavailable";
    }
  } finally {
    state.refreshing = false;
    elements.refreshButton.disabled = false;
  }
}

function renderSyncSummary(summary, title, message, isError = false) {
  elements.syncSummaryPanel.hidden = false;
  elements.syncSummaryPanel.classList.toggle("is-error", isError);
  elements.syncSummaryTitle.textContent = title;
  elements.syncSummaryMessage.textContent = message;
  elements.syncSummaryGrid.replaceChildren();

  if (!summary) return;
  for (const [key, label] of SYNC_SUMMARY_FIELDS) {
    const card = makeElement("article", "sync-stat-card");
    card.append(makeElement("span", "sync-stat-label", label));
    card.append(makeElement("strong", "sync-stat-value", summary[key]));
    elements.syncSummaryGrid.append(card);
  }
}

async function startInitialSync() {
  if (state.syncing) return;
  state.syncing = true;
  elements.syncButton.disabled = true;
  elements.syncButtonLabel.textContent = "Sync in progress…";
  renderSyncSummary(null, "Sync in progress", "Fetching products and content. This may take a little while.");

  let completed = false;
  try {
    const result = await fetchJson(getApiUrl("/sync"));
    if (result.status === false) {
      throw new Error(result.message || "Sync request failed.");
    }

    const summary = result.response ?? result;
    const hasSummary = SYNC_SUMMARY_FIELDS.every(([key]) => Number.isFinite(summary[key]));
    if (!hasSummary) {
      throw new Error("Sync API returned an incomplete summary.");
    }

    renderSyncSummary(
      summary,
      "Initial sync complete",
      `Finished at ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date())}.`
    );
    completed = true;
  } catch (error) {
    renderSyncSummary(null, "Sync failed", error.message || "Could not complete the sync.", true);
  } finally {
    state.syncing = false;
    elements.syncButton.disabled = false;
    elements.syncButtonLabel.textContent = "Sync all";
  }

  if (completed) await refreshDashboard();
}

function showTab(tab) {
  state.activeTab = tab;
  const productsActive = tab === "products";
  elements.productsTab.classList.toggle("is-active", productsActive);
  elements.productsTab.setAttribute("aria-selected", String(productsActive));
  elements.webhooksTab.classList.toggle("is-active", !productsActive);
  elements.webhooksTab.setAttribute("aria-selected", String(!productsActive));
  elements.productsPanel.hidden = !productsActive;
  elements.webhooksPanel.hidden = productsActive;
}

elements.apiBaseUrl.value = state.apiBase;
elements.refreshButton.addEventListener("click", refreshDashboard);
elements.syncButton.addEventListener("click", startInitialSync);
elements.syncSummaryDismiss.addEventListener("click", () => {
  elements.syncSummaryPanel.hidden = true;
});
elements.productSearch.addEventListener("input", renderProducts);
elements.contentStatusFilter.addEventListener("change", renderProducts);
elements.webhookSearch.addEventListener("input", renderWebhooks);
elements.webhookStatusFilter.addEventListener("change", renderWebhooks);
elements.productsTab.addEventListener("click", () => showTab("products"));
elements.webhooksTab.addEventListener("click", () => showTab("webhooks"));
elements.settingsToggle.addEventListener("click", () => {
  const open = elements.settingsPanel.hidden;
  elements.settingsPanel.hidden = !open;
  elements.settingsToggle.setAttribute("aria-expanded", String(open));
  if (open) elements.apiBaseUrl.focus();
});
elements.settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = elements.apiBaseUrl.value.trim().replace(/\/+$/, "");
  if (!value) {
    elements.apiBaseUrl.setCustomValidity("Enter the base URL for your API.");
    elements.apiBaseUrl.reportValidity();
    return;
  }
  elements.apiBaseUrl.setCustomValidity("");
  try {
    new URL(value, window.location.href);
  } catch {
    elements.apiBaseUrl.setCustomValidity("Enter a valid API URL.");
    elements.apiBaseUrl.reportValidity();
    return;
  }
  state.apiBase = value;
  localStorage.setItem("commerce-console-api-base", value);
  refreshDashboard();
});

refreshDashboard();
window.setInterval(() => {
  if (!document.hidden) refreshDashboard();
}, REFRESH_INTERVAL_MS);
