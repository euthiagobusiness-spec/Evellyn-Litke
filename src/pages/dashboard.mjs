import {
  fetchFunnelDashboard,
  FunnelApiError,
  importMetaMetrics,
  recordGroupSnapshot,
} from "../lib/funnel-api.mjs";
import {
  campaignDecision,
  evaluateDashboardDecision,
  parseMetaCsv,
  sortSnapshotsNewest,
} from "../lib/dashboard-rules.mjs";

const TOKEN_KEY = "mrc.dashboardAccessToken";
const authPanel = document.querySelector("[data-auth-panel]");
const authForm = document.querySelector("[data-auth-form]");
const authStatus = document.querySelector("[data-auth-status]");
const dashboard = document.querySelector("[data-dashboard]");
const daysSelect = document.querySelector("[data-days]");
const refreshButton = document.querySelector("[data-refresh]");
const logoutButton = document.querySelector("[data-logout]");
const importForm = document.querySelector("[data-import-form]");
const snapshotForm = document.querySelector("[data-snapshot-form]");

let accessToken = sessionStorage.getItem(TOKEN_KEY) ?? "";
let currentData = null;
let loading = false;

const numberFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function first(object, keys, fallback = null) {
  for (const key of keys) {
    if (object?.[key] !== undefined && object?.[key] !== null) return object[key];
  }
  return fallback;
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isKnownNumber(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function formatOptional(value, formatter) {
  return isKnownNumber(value) ? formatter(value) : "—";
}

function formatInteger(value) {
  return numberFormatter.format(asNumber(value));
}

function formatDecimal(value) {
  return decimalFormatter.format(asNumber(value));
}

function formatCurrency(value) {
  return currencyFormatter.format(asNumber(value));
}

function formatPercent(value) {
  return `${formatDecimal(value)}%`;
}

function formatDuration(value) {
  const milliseconds = asNumber(value);
  return milliseconds >= 1000 ? `${formatDecimal(milliseconds / 1000)} s` : `${formatInteger(milliseconds)} ms`;
}

function formatDate(value, includeTime = false) {
  const normalized = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T12:00:00`
    : value;
  const date = normalized ? new Date(normalized) : null;
  if (!date || Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    ...(includeTime ? { timeStyle: "short" } : {}),
  }).format(date);
}

function setStatus(node, message, type = "") {
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("is-error", type === "error");
  node.classList.toggle("is-success", type === "success");
}

function currentDays() {
  return Math.min(30, Math.max(1, Number(daysSelect?.value) || 7));
}

function humanError(error) {
  if (!(error instanceof FunnelApiError)) return "Não foi possível carregar os dados agora.";
  if (error.status === 401 || error.status === 403) return "Token inválido ou sem permissão.";
  if (error.status === 429) return "Muitas tentativas. Aguarde alguns minutos e atualize.";
  if (error.code === "pii_not_allowed") return "Não inclua nome, e-mail ou telefone na observação.";
  if (error.code === "request_timeout") return "A consulta demorou demais. Tente novamente.";
  if (error.code === "network_error") return "Falha de conexão. Verifique a internet e tente novamente.";
  return "A central está temporariamente indisponível.";
}

function unwrap(result) {
  return result?.dashboard ?? result?.data ?? result;
}

function summaryFrom(data) {
  return data?.summary ?? {};
}

function healthFrom(data) {
  return data?.health ?? {};
}

function summaryValue(summary, camel, snake = camel, fallback = null) {
  return first(summary, [camel, snake], fallback);
}

function rate(numerator, denominator) {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

function renderKpis(data) {
  const root = document.querySelector("[data-kpis]");
  const summary = summaryFrom(data);
  const health = healthFrom(data);
  const spend = summaryValue(summary, "spend", "spend");
  const leads = asNumber(summaryValue(summary, "leadsSaved", "leads_saved"));
  const groupMembers = summaryValue(summary, "groupMembers", "group_members");
  const netMembers = summaryValue(summary, "netMembers", "net_members");
  const redirects = asNumber(summaryValue(summary, "redirectsUnique", "redirects_unique"));
  const apiSamples = asNumber(first(health, ["apiSamples", "api_samples"], 0));
  const capiSamples = asNumber(first(health, ["capiSamples", "capi_samples"], 0));
  const cards = [
    ["Sessões rastreadas", summaryValue(summary, "landingViews", "landing_views"), "únicas por aba/página", (value) => formatOptional(value, formatInteger)],
    ["Leads Supabase", leads, "fonte first-party", formatInteger],
    ["Redirects únicos", redirects, "coorte do período", formatInteger],
    ["Total no grupo", groupMembers, "inventário mais recente", (value) => formatOptional(value, formatInteger)],
    ["Membros líquidos", netMembers, "exige baseline + snapshot atual", (value) => formatOptional(value, formatInteger)],
    ["Gasto importado", spend, `${asNumber(first(health, ["metricDays", "metric_days"], 0))} dia(s) Meta`, (value) => formatOptional(value, formatCurrency)],
    ["CPL Meta reportado", first(summary, ["metaReportedCpl", "meta_reported_cpl"], null), "gasto / leads reportados pela Meta", (value) => formatOptional(value, formatCurrency)],
    ["CPL first-party conciliado", first(summary, ["reconciledFirstPartyCpl", "reconciled_first_party_cpl"], null), "somente gasto e leads unidos por ID do anúncio", (value) => formatOptional(value, formatCurrency)],
    ["CPL blended", first(summary, ["blendedFirstPartyCpl", "blended_first_party_cpl"], null), "gasto total / todos os leads Supabase", (value) => formatOptional(value, formatCurrency)],
    ["Leads sem atribuição", first(summary, ["unattributedLeads", "unattributed_leads"], null), "sem campanha, conjunto ou anúncio identificável", (value) => formatOptional(value, formatInteger)],
    ["Custo por membro", first(summary, ["costPerMember", "cost_per_member"], null), "somente com membros líquidos positivos", (value) => formatOptional(value, formatCurrency)],
    ["Cobertura UTM completa", first(health, ["utmCoverage", "utm_coverage"], null), "source + medium + campaign + content + term", (value) => formatOptional(value, formatPercent)],
    ["Lead → redirect", first(health, ["leadRedirectRate", "lead_redirect_rate"], null), "meta: pelo menos 95%", (value) => formatOptional(value, formatPercent)],
    ["API p95", first(health, ["apiP95Ms", "api_p95_ms"], null), `${apiSamples} amostra(s); meta < 2 s`, (value) => formatOptional(value, formatDuration)],
    ["Erros do form", first(health, ["formErrorRate", "form_error_rate"], null), "meta: abaixo de 1%", (value) => formatOptional(value, formatPercent)],
    ["Falhas CAPI (servidor)", first(health, ["capiFailureRate", "capi_failure_rate"], null), `${capiSamples} entrega(s) servidor → Meta; alerta > 5%`, (value) => formatOptional(value, formatPercent)],
    ["CTR do link", first(summary, ["linkCtr", "link_ctr"], null), "verde: a partir de 1,8%", (value) => formatOptional(value, formatPercent)],
  ];

  root.replaceChildren();
  for (const [label, value, note, formatter] of cards) {
    const card = element("article", "kpi-card");
    card.append(
      element("span", "kpi-label", label),
      element("strong", "kpi-value", formatter(value)),
      element("span", "kpi-note", note),
    );
    root.append(card);
  }
}

function renderFunnel(data) {
  const root = document.querySelector("[data-funnel]");
  const summary = summaryFrom(data);
  const supplied = Array.isArray(data?.funnel) ? data.funnel : [];
  const fallback = [
    ["LandingView", "Landing view", summaryValue(summary, "landingViews", "landing_views")],
    ["FormStart", "Formulário iniciado", summaryValue(summary, "formStarts", "form_starts")],
    ["SubmitAttempt", "Tentativa de envio", summaryValue(summary, "submitAttempts", "submit_attempts")],
    ["LeadSaved", "Lead salvo", summaryValue(summary, "leadsSaved", "leads_saved")],
    ["RedirectUnique", "Redirect único", summaryValue(summary, "redirectsUnique", "redirects_unique")],
    ["GroupMemberSnapshot", "Membro líquido", summaryValue(summary, "groupMembers", "group_members")],
  ].map(([key, label, value]) => ({ key, label, value }));
  const rows = supplied.length ? supplied : fallback;

  root.replaceChildren();
  rows.forEach((row, index) => {
    const rawValue = first(row, ["value", "count"], null);
    const previousValue = index ? first(rows[index - 1], ["value", "count"], null) : rawValue;
    const rateKey = ["rate", "conversionRate", "conversion_rate"].find((key) => Object.hasOwn(row, key));
    const conversion = rateKey
      ? row[rateKey]
      : isKnownNumber(rawValue) && isKnownNumber(previousValue)
        ? rate(asNumber(rawValue), asNumber(previousValue))
        : null;
    const item = element("li", "funnel-item");
    const body = element("div");
    body.append(
      element("span", "funnel-name", first(row, ["label", "name"], row.key ?? "Etapa")),
      element(
        "span",
        "funnel-rate",
        isKnownNumber(conversion)
          ? index === 0 ? "base rastreada do período" : `${formatPercent(conversion)} da etapa anterior`
          : "sem leitura comparável",
      ),
    );
    item.append(
      element("span", "funnel-index", String(index + 1).padStart(2, "0")),
      body,
      element("strong", "funnel-value", formatOptional(rawValue, formatInteger)),
    );
    root.append(item);
  });
}

function computedAlerts(data) {
  const summary = summaryFrom(data);
  const health = healthFrom(data);
  const leads = asNumber(summaryValue(summary, "leadsSaved", "leads_saved"));
  const formErrorRate = first(health, ["formErrorRate", "form_error_rate"], null);
  const hoursSinceLastLead = first(health, ["hoursSinceLastLead", "hours_since_last_lead"], null);
  const capiFailureRate = first(health, ["capiFailureRate", "capi_failure_rate"], null);
  const utmCoverage = first(health, ["utmCoverage", "utm_coverage"], null);
  const leadRedirectRate = first(health, ["leadRedirectRate", "lead_redirect_rate"], null);
  const apiP95 = first(health, ["apiP95Ms", "api_p95_ms"], null);
  const alerts = [];
  const add = (condition, title, message, severity = "warning") => {
    if (condition) alerts.push({ title, message, severity });
  };

  add(isKnownNumber(formErrorRate) && asNumber(formErrorRate) > 2, "Erros de formulário acima de 2%", "Revisar validação, rede e resposta da Edge Function.", "critical");
  add(isKnownNumber(hoursSinceLastLead) && asNumber(hoursSinceLastLead) >= 2 && asNumber(summary.spend) > 0, "Duas horas sem lead", "Confirmar entrega, página, Supabase e tracking antes de mexer na verba.", "critical");
  add(isKnownNumber(capiFailureRate) && asNumber(capiFailureRate) > 5, "Falha CAPI acima de 5%", "Verificar outbox, token, retorno da Meta e retentativas.", "critical");
  add(isKnownNumber(utmCoverage) && asNumber(utmCoverage) < 95, "Cobertura UTM completa abaixo de 95%", "Corrigir as cinco UTMs e macros antes de comparar anúncios.");
  add(leads > 0 && isKnownNumber(leadRedirectRate) && asNumber(leadRedirectRate) < 90, "Lead → redirect abaixo de 90%", "Investigar bloqueio do WhatsApp e falha no evento de redirect.", "critical");
  add(isKnownNumber(apiP95) && asNumber(first(health, ["apiSamples", "api_samples"], 0)) >= 5 && asNumber(apiP95) > 2000, "API p95 acima de 2 s", "Retirar integrações externas do caminho crítico e revisar banco.");
  add(first(health, ["routesHealthy", "routes_healthy"], true) === false, "Rota ou imagem com erro", "Executar verificação de status e corrigir respostas 404.", "critical");
  add(first(health, ["sslHealthy", "ssl_healthy"], true) === false, "Falha no certificado HTTPS", "Pausar tráfego até restaurar o domínio seguro.", "critical");
  return alerts;
}

function renderAlerts(data) {
  const root = document.querySelector("[data-alerts]");
  const supplied = Array.isArray(data?.alerts) ? data.alerts : [];
  const normalized = supplied.map((alert) => typeof alert === "string"
    ? { title: alert, message: "Verificar no turno atual.", severity: "warning" }
    : {
        ...alert,
        title: alert.title ?? alert.message ?? alert.code ?? "Alerta operacional",
        message: alert.title ? (alert.message ?? "Verificar no turno atual.") : `Código: ${alert.code ?? "operacional"}.`,
        severity: alert.severity ?? alert.level ?? "warning",
      });
  const all = [...normalized, ...computedAlerts(data)];
  const unique = all.filter((alert, index, list) => list.findIndex((item) => item.title === alert.title) === index);
  const count = document.querySelector("[data-alert-count]");
  count.textContent = String(unique.length);
  count.classList.toggle("is-clear", unique.length === 0);
  root.replaceChildren();

  if (!unique.length) {
    const item = element("li", "alert-item is-ok");
    item.append(element("span", "alert-dot"));
    const body = element("div");
    body.append(element("strong", "", "Nenhum alerta ativo"), element("p", "", "Mantenha a rotina de leitura às 8h, 14h e 21h30."));
    item.append(body);
    root.append(item);
    return;
  }

  unique.forEach((alert) => {
    const item = element("li", `alert-item${alert.severity === "critical" ? " is-critical" : ""}`);
    item.append(element("span", "alert-dot"));
    const body = element("div");
    body.append(element("strong", "", alert.title), element("p", "", alert.message ?? "Verificar no turno atual."));
    item.append(body);
    root.append(item);
  });
}

function renderHealth(data) {
  const root = document.querySelector("[data-health]");
  const health = healthFrom(data);
  const apiSamples = asNumber(first(health, ["apiSamples", "api_samples"], 0));
  const capiSamples = asNumber(first(health, ["capiSamples", "capi_samples"], 0));
  const submitSamples = asNumber(first(health, ["submitSamples", "submit_samples"], 0));
  const pendingCapi = first(health, ["pendingCapi", "pending_capi"], null);
  const oldestPendingCapi = first(health, ["oldestPendingCapiMinutes", "oldest_pending_capi_minutes"], null);
  const metricDays = asNumber(first(health, ["metricDays", "metric_days"], 0));
  const cards = [
    ["Tracking first-party", first(health, ["trackingHealthy", "tracking_healthy"], null), (value) => value === true ? "Ativo" : value === false ? "Falhando" : "Sem leitura", "eventos essenciais"],
    ["CAPI do servidor", capiSamples ? first(health, ["capiFailureRate", "capi_failure_rate"], null) : null, (value) => value === null ? "Sem leitura" : `${formatPercent(value)} falhas`, `${capiSamples} entrega(s) servidor → Meta; não mede o Pixel do navegador`],
    ["Fila CAPI", pendingCapi, (value) => value === null ? "Sem leitura" : `${formatInteger(value)} pendente(s)`, isKnownNumber(oldestPendingCapi) ? `mais antiga: ${formatDecimal(oldestPendingCapi)} min` : "sem item pendente"],
    ["API de cadastro", apiSamples ? first(health, ["apiP95Ms", "api_p95_ms"], null) : null, (value) => value === null ? "Sem leitura" : formatDuration(value), `${apiSamples} amostra(s); p95 < 2 s`],
    ["Cobertura UTM", first(health, ["utmCoverage", "utm_coverage"], null), (value) => value === null ? "Sem leitura" : formatPercent(value), "alvo: ≥ 95%"],
    ["IDs de atribuição", first(health, ["attributionIdCoverage", "attribution_id_coverage"], null), (value) => value === null ? "Sem leitura" : formatPercent(value), "alvo: ≥ 95%; nomes são apenas auxiliares"],
    ["Formulário", submitSamples ? first(health, ["formErrorRate", "form_error_rate"], null) : null, (value) => value === null ? "Sem leitura" : `${formatPercent(value)} erros`, `${submitSamples} envio(s); alvo < 1%`],
    ["Lead → redirect", first(health, ["leadRedirectRate", "lead_redirect_rate"], null), (value) => value === null ? "Sem leitura" : formatPercent(value), "coorte; alvo: ≥ 95%"],
    ["Métricas Meta", first(health, ["metaDataFresh", "meta_data_fresh"], null), (value) => value === true ? "Atualizadas" : value === false ? "Desatualizadas" : "Sem leitura", `${metricDays} dia(s); último: ${formatDate(first(health, ["lastMetaMetricDate", "last_meta_metric_date"], null))}`],
    ["Completude Meta", first(health, ["metaDataComplete", "meta_data_complete"], null), (value) => value === true ? "Completa" : value === false ? "Incompleta" : "Sem leitura", "todos os dias do recorte, com gasto, impressões e cliques no link"],
    ["HTTPS e rotas", first(health, ["routesHealthy", "routes_healthy"], null) === false || first(health, ["sslHealthy", "ssl_healthy"], null) === false ? false : first(health, ["routesHealthy", "routes_healthy"], null), (value) => value === true ? "Saudável" : value === false ? "Falhando" : "Sem leitura", "zero 404 crítico"],
    ["Grupo medido", first(health, ["groupMeasured", "group_measured"], null), (value) => value === true ? "Atualizado" : value === false ? "Pendente" : "Sem leitura", "2 snapshots; último < 14 h"],
  ];

  const statusFor = (label, value) => {
    if (value === null) return "";
    if (typeof value === "boolean") return value ? "is-good" : "is-bad";
    if (label === "CAPI do servidor") return asNumber(value) <= 5 ? "is-good" : "is-bad";
    if (label === "Fila CAPI") return asNumber(value) === 0 ? "is-good" : "is-bad";
    if (label === "API de cadastro") return asNumber(value) < 2000 ? "is-good" : "is-bad";
    if (label === "Cobertura UTM") return asNumber(value) >= 95 ? "is-good" : "is-bad";
    if (label === "IDs de atribuição") return asNumber(value) >= 95 ? "is-good" : "is-bad";
    if (label === "Formulário") return asNumber(value) < 1 ? "is-good" : "is-bad";
    if (label === "Lead → redirect") return asNumber(value) >= 95 ? "is-good" : "is-bad";
    return "";
  };

  root.replaceChildren();
  cards.forEach(([label, value, formatter, target]) => {
    const card = element("article", `health-card ${statusFor(label, value)}`.trim());
    const header = element("header");
    header.append(element("h3", "", label), element("span", "health-status"));
    card.append(header, element("strong", "health-value", formatter(value)), element("span", "health-target", target));
    root.append(card);
  });
}

function renderCampaigns(data) {
  const root = document.querySelector("[data-campaigns]");
  const empty = document.querySelector("[data-campaign-empty]");
  const rows = Array.isArray(data?.campaigns) ? data.campaigns : [];
  root.replaceChildren();
  empty.hidden = rows.length > 0;

  const specs = [
    [["date", "data"], (v) => formatDate(v)],
    [["campaign", "campaignName", "campaign_name"], String],
    [["campaignId", "campaign_id"], String],
    [["adset", "adsetName", "adset_name"], String],
    [["adsetId", "adset_id"], String],
    [["ad", "adName", "ad_name"], String],
    [["adId", "ad_id"], String],
    [["angle", "angulo"], String],
    [["format", "formato"], String],
    [["hook", "gancho"], String],
    [["spend", "amountSpent", "amount_spent"], formatCurrency],
    [["impressions", "impressoes"], formatInteger],
    [["frequency", "frequencia"], formatDecimal],
    [["clicksAll", "allClicks", "clicks_all", "clicks"], formatInteger],
    [["linkClicks", "link_clicks"], formatInteger],
    [["linkCtr", "link_ctr"], formatPercent],
    [["linkCpc", "link_cpc"], formatCurrency],
    [["landingPageViews", "landing_page_views", "lpv"], formatInteger],
    [["metaLeads", "meta_leads"], formatInteger],
    [["supabaseLeads", "supabase_leads", "leadsSaved"], formatInteger],
    [["redirectsUnique", "redirects_unique"], formatInteger],
    [["matchingMethod", "matching_method"], (value) => ({
      id: "ID conciliado",
      name_auxiliary: "Nome auxiliar · não decide verba",
      id_zero_leads: "ID · zero leads",
      meta_only: "Somente Meta",
      lead_only: "Somente Supabase",
    }[value] ?? String(value))],
    [["netMembers", "net_members"], formatInteger],
    [["reconciledFirstPartyCpl", "reconciled_first_party_cpl", "firstPartyCpl", "first_party_cpl"], formatCurrency],
    [["costPerMember", "cost_per_member"], formatCurrency],
  ];

  rows.forEach((row) => {
    const tr = element("tr");
    specs.forEach(([keys, formatter]) => {
      const raw = first(row, keys, null);
      tr.append(element("td", "", raw === null || raw === "" ? "—" : formatter(raw)));
    });
    const decision = first(row, ["decision", "decisao"], null)
      ? { key: first(row, ["decisionLevel", "decision_level"], "yellow"), label: first(row, ["decision", "decisao"]), reason: first(row, ["reason", "motivo"], "") }
      : campaignDecision(row);
    const decisionCell = element("td");
    decisionCell.append(element("span", `decision-pill is-${decision.key}`, decision.label));
    tr.append(
      decisionCell,
      element("td", "", decision.reason || "—"),
      element("td", "", first(row, ["change", "mudanca"], "—")),
      element("td", "", first(row, ["owner", "responsavel"], "Gestor")),
    );
    root.append(tr);
  });
}

function renderSnapshots(data) {
  const root = document.querySelector("[data-snapshots]");
  const snapshots = Array.isArray(data?.groupSnapshots)
    ? sortSnapshotsNewest(data.groupSnapshots).slice(0, 6)
    : [];
  root.replaceChildren();
  if (!snapshots.length) {
    root.append(element("p", "empty-state", "Nenhum snapshot registrado."));
    return;
  }
  snapshots.forEach((snapshot) => {
    const row = element("div", "snapshot-row");
    const total = first(snapshot, ["count", "memberCount", "member_count"], null);
    const admins = first(snapshot, ["adminCount", "admin_count"], 0);
    const participants = first(snapshot, ["participantCount", "participant_count"], isKnownNumber(total) ? asNumber(total) - asNumber(admins) : null);
    const exits = first(snapshot, ["reportedExits", "reported_exits"], 0);
    const baseline = first(snapshot, ["isBaseline", "is_baseline"], false) === true;
    const detailText = [
      formatDate(first(snapshot, ["capturedAt", "captured_at", "createdAt", "created_at"]), true),
      `${formatInteger(admins)} admin(s)`,
      `${formatInteger(participants)} participante(s)`,
      `${formatInteger(exits)} saída(s)`,
      baseline ? "baseline" : "",
    ].filter(Boolean).join(" • ");
    row.append(element("span", "", detailText), element("strong", "", formatOptional(total, formatInteger)));
    root.append(row);
  });
}

function evaluateGoNoGo(data) {
  const result = evaluateDashboardDecision(healthFrom(data));
  if (result.status === "no-go") {
    return { status: result.status, title: "Não escalar ainda", message: `Falhas: ${result.failed.join(", ")}. Corrija mensuração e fluxo antes de aumentar a verba.` };
  }
  if (result.status === "inconclusive") {
    return { status: result.status, title: "Decisão inconclusiva", message: `Sem leitura suficiente: ${result.unknown.join(", ")}. Não trate ausência de dados como zero.` };
  }
  return { status: "go", title: "Escala tecnicamente liberada", message: "Critérios de tracking, conversão, grupo e estabilidade atendidos. Aplicar as regras por anúncio." };
}

function renderDecision(data) {
  const result = evaluateGoNoGo(data);
  const card = document.querySelector("[data-go-no-go]");
  card.classList.toggle("is-go", result.status === "go");
  card.classList.toggle("is-no-go", result.status === "no-go");
  card.classList.toggle("is-inconclusive", result.status === "inconclusive");
  document.querySelector("[data-decision-title]").textContent = result.title;
  document.querySelector("[data-decision-message]").textContent = result.message;
  document.querySelector("[data-decision-badge]").textContent = result.status === "go" ? "GO" : result.status === "no-go" ? "NO-GO" : "INCONCLUSIVO";
}

function renderSource(data) {
  const generatedAt = first(data, ["generatedAt", "generated_at"], new Date().toISOString());
  const source = first(data, ["source"], "Supabase + eventos first-party");
  const timezone = first(data, ["reportingTimezone", "reporting_timezone"], "fuso não informado");
  document.querySelector("[data-source-status]").textContent = `Fonte: ${source} • Fuso: ${timezone}`;
  document.querySelector("[data-generated-at]").textContent = `Atualizado ${formatDate(generatedAt, true)}`;
  document.querySelector("[data-footer-source]").textContent = `Fonte: ${source} • Fuso: ${timezone} • Atualizado ${formatDate(generatedAt, true)}`;
  document.querySelector("[data-source-dot]").className = "status-dot is-live";
}

function renderAll(data) {
  currentData = data;
  renderSource(data);
  renderDecision(data);
  renderKpis(data);
  renderFunnel(data);
  renderAlerts(data);
  renderHealth(data);
  renderCampaigns(data);
  renderSnapshots(data);
}

async function loadDashboard({ token = accessToken, persist = false } = {}) {
  if (loading) return false;
  loading = true;
  refreshButton?.setAttribute("disabled", "");
  document.querySelector("[data-source-status]").textContent = "Atualizando dados seguros…";
  try {
    const result = await fetchFunnelDashboard(token, currentDays());
    accessToken = token;
    if (persist) sessionStorage.setItem(TOKEN_KEY, accessToken);
    renderAll(unwrap(result));
    authPanel.hidden = true;
    dashboard.hidden = false;
    setStatus(authStatus, "");
    return true;
  } catch (error) {
    document.querySelector("[data-source-dot]")?.classList.add("is-error");
    if (error instanceof FunnelApiError && (error.status === 401 || error.status === 403)) {
      sessionStorage.removeItem(TOKEN_KEY);
      accessToken = "";
    }
    setStatus(authStatus, humanError(error), "error");
    if (!currentData) {
      authPanel.hidden = false;
      dashboard.hidden = true;
    }
    return false;
  } finally {
    loading = false;
    refreshButton?.removeAttribute("disabled");
  }
}

authForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const token = new FormData(authForm).get("token");
  setStatus(authStatus, "Validando acesso…");
  await loadDashboard({ token, persist: true });
});

refreshButton?.addEventListener("click", () => loadDashboard());
daysSelect?.addEventListener("change", () => loadDashboard());
logoutButton?.addEventListener("click", () => {
  sessionStorage.removeItem(TOKEN_KEY);
  accessToken = "";
  currentData = null;
  dashboard.hidden = true;
  authPanel.hidden = false;
  authForm.reset();
  setStatus(authStatus, "Sessão encerrada.", "success");
});

snapshotForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = document.querySelector("[data-snapshot-status]");
  const formData = new FormData(snapshotForm);
  const total = Number(formData.get("total"));
  const adminCount = Number(formData.get("adminCount"));
  const reportedExits = Number(formData.get("reportedExits"));
  if (
    !Number.isInteger(total) || total < 0
    || !Number.isInteger(adminCount) || adminCount < 0 || adminCount > total
    || !Number.isInteger(reportedExits) || reportedExits < 0
  ) {
    setStatus(status, "Revise total, administradores e saídas. Use apenas inteiros válidos.", "error");
    return;
  }
  setStatus(status, "Salvando snapshot…");
  try {
    await recordGroupSnapshot(accessToken, {
      total,
      adminCount,
      reportedExits,
      isBaseline: formData.get("isBaseline") === "on",
      note: formData.get("note"),
    }, currentDays());
    snapshotForm.reset();
    setStatus(status, "Snapshot salvo com sucesso.", "success");
    await loadDashboard();
  } catch (error) {
    setStatus(status, humanError(error), "error");
  }
});

importForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = document.querySelector("[data-import-status]");
  const file = new FormData(importForm).get("file");
  if (!(file instanceof File) || !file.size) {
    setStatus(status, "Selecione o CSV exportado da Meta.", "error");
    return;
  }
  setStatus(status, "Validando arquivo sem PII…");
  try {
    const rows = parseMetaCsv(await file.text());
    if (!rows.length) throw new Error("Nenhuma linha válida encontrada.");
    await importMetaMetrics(accessToken, rows, currentDays());
    importForm.reset();
    setStatus(status, `${rows.length} linhas agregadas importadas.`, "success");
    await loadDashboard();
  } catch (error) {
    setStatus(status, error instanceof FunnelApiError ? humanError(error) : error.message, "error");
  }
});

if (accessToken) {
  loadDashboard();
} else {
  authPanel.hidden = false;
  dashboard.hidden = true;
}
