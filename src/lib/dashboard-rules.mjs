function first(object, keys, fallback = null) {
  for (const key of keys) {
    if (object?.[key] !== undefined && object?.[key] !== null) return object[key];
  }
  return fallback;
}

function knownNumber(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function number(value, fallback = 0) {
  return knownNumber(value) ? Number(value) : fallback;
}

export function campaignDecision(row) {
  const rawImpressions = first(row, ["impressions", "impressoes"], null);
  const rawSpend = first(row, ["spend", "amountSpent", "amount_spent"], null);
  const rawLinkCtr = first(row, ["linkCtr", "link_ctr"], null);
  const rawLinkCpc = first(row, ["linkCpc", "link_cpc"], null);
  const leads = number(first(row, ["supabaseLeads", "supabase_leads", "leadsSaved"], 0));
  const rawCpl = first(row, ["reconciledFirstPartyCpl", "reconciled_first_party_cpl", "firstPartyCpl", "first_party_cpl"], null);
  const matchingMethod = first(row, ["matchingMethod", "matching_method"], null);
  const adId = first(row, ["adId", "ad_id"], null);
  const optimizationEligible = first(row, ["optimizationEligible", "optimization_eligible"], false) === true
    || (Boolean(adId) && (matchingMethod === "id" || matchingMethod === "id_zero_leads"));
  const metaDataFresh = first(row, ["metaDataFresh", "meta_data_fresh"], null);
  const groupMeasured = first(row, ["groupMeasured", "group_measured"], false) === true;

  if (!optimizationEligible) {
    return { key: "inconclusive", label: "Sem decisão", reason: "Decisões de verba exigem conciliação pelo ID do anúncio; o nome é apenas auxiliar." };
  }
  if (metaDataFresh !== true) {
    return { key: "inconclusive", label: "Meta pendente", reason: "Atualize o CSV da Meta antes de otimizar." };
  }
  if (!knownNumber(rawImpressions) || !knownNumber(rawSpend) || !knownNumber(rawLinkCtr) || !knownNumber(rawLinkCpc)) {
    return { key: "inconclusive", label: "Sem leitura", reason: "Gasto, impressões, CTR ou CPC do link ausente." };
  }

  const impressions = number(rawImpressions);
  const spend = number(rawSpend);
  const linkCtr = number(rawLinkCtr);
  const linkCpc = number(rawLinkCpc);
  const cpl = knownNumber(rawCpl) ? number(rawCpl) : null;

  if (linkCtr >= 1.8 && linkCpc <= 0.8 && cpl !== null && cpl <= 5 && leads >= 3 && groupMeasured) {
    return { key: "green", label: "Escalar", reason: "Sinais verdes, dados conciliados e grupo medido." };
  }
  if (
    (impressions >= 1500 && linkCtr < 1)
    || (leads === 0 && spend > 10)
    || linkCpc > 1.5
    || (leads >= 3 && cpl !== null && cpl > 8)
  ) {
    return { key: "red", label: "Pausar", reason: "Atingiu um limite vermelho do playbook." };
  }
  if (!groupMeasured && linkCtr >= 1.8 && linkCpc <= 0.8 && cpl !== null && cpl <= 5 && leads >= 3) {
    return { key: "inconclusive", label: "Aguardar grupo", reason: "Criativo promissor, mas faltam dois snapshots do WhatsApp." };
  }
  return {
    key: "yellow",
    label: "Observar",
    reason: impressions < 1500 ? "Amostra ainda inconclusiva." : "Testar uma única variável.",
  };
}

export function evaluateDashboardDecision(health = {}) {
  const booleanCheck = (value) => value === true ? true : value === false ? false : null;
  const numericCheck = (value, predicate) => knownNumber(value) ? predicate(number(value)) : null;
  const checks = [
    ["tracking", booleanCheck(first(health, ["trackingHealthy", "tracking_healthy"], null))],
    ["erros", numericCheck(first(health, ["formErrorRate", "form_error_rate"], null), (value) => value < 1)],
    ["UTMs", numericCheck(first(health, ["utmCoverage", "utm_coverage"], null), (value) => value >= 95)],
    ["IDs", numericCheck(first(health, ["attributionIdCoverage", "attribution_id_coverage"], null), (value) => value >= 95)],
    ["redirect", numericCheck(first(health, ["leadRedirectRate", "lead_redirect_rate"], null), (value) => value >= 95)],
    ["grupo", booleanCheck(first(health, ["groupMeasured", "group_measured"], null))],
    ["API", numericCheck(first(health, ["apiP95Ms", "api_p95_ms"], null), (value) => value < 2000)],
    ["CAPI", numericCheck(first(health, ["capiFailureRate", "capi_failure_rate"], null), (value) => value <= 5)],
    ["fila CAPI", numericCheck(first(health, ["pendingCapi", "pending_capi"], null), (value) => value === 0)],
    ["Meta", booleanCheck(first(health, ["metaDataFresh", "meta_data_fresh"], null))],
    ["dados Meta", booleanCheck(first(health, ["metaDataComplete", "meta_data_complete"], null))],
    ["rotas", booleanCheck(first(health, ["routesHealthy", "routes_healthy"], null))],
    ["SSL", booleanCheck(first(health, ["sslHealthy", "ssl_healthy"], null))],
  ];
  const failed = checks.filter(([, result]) => result === false).map(([label]) => label);
  const unknown = checks.filter(([, result]) => result === null).map(([label]) => label);
  if (failed.length) {
    return { status: "no-go", failed, unknown };
  }
  if (unknown.length) {
    return { status: "inconclusive", failed, unknown };
  }
  return { status: "go", failed, unknown };
}

export function sortSnapshotsNewest(snapshots = []) {
  return [...snapshots].sort((left, right) => {
    const rightDate = new Date(first(right, ["capturedAt", "captured_at"], 0)).getTime();
    const leftDate = new Date(first(left, ["capturedAt", "captured_at"], 0)).getTime();
    return rightDate - leftDate;
  });
}

function normalizedHeader(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim();
}

function splitCsvLine(line, delimiter) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(value.trim());
      value = "";
    } else {
      value += char;
    }
  }
  cells.push(value.trim());
  return cells;
}

export function parseLocalizedNumber(value, { integer = false } = {}) {
  let clean = String(value ?? "")
    .replace(/R\$|BRL|USD|[$€£%]/gi, "")
    .replace(/[\s\u00a0']/g, "")
    .trim();
  if (!clean || clean === "—" || clean === "-") return null;
  if (!/^-?[\d.,]+$/.test(clean)) return null;

  const commaCount = (clean.match(/,/g) ?? []).length;
  const dotCount = (clean.match(/\./g) ?? []).length;
  const lastComma = clean.lastIndexOf(",");
  const lastDot = clean.lastIndexOf(".");
  let decimalSeparator = null;

  if (commaCount && dotCount) {
    decimalSeparator = lastComma > lastDot ? "," : ".";
  } else if (commaCount || dotCount) {
    const separator = commaCount ? "," : ".";
    const count = commaCount || dotCount;
    const digitsAfter = clean.length - clean.lastIndexOf(separator) - 1;
    // Three trailing digits are the conventional thousands grouping in both
    // pt-BR and en-US. One/two digits are decimals; repeated separators use
    // only the last one as decimal when it has one/two trailing digits.
    if (digitsAfter !== 3 && digitsAfter > 0 && digitsAfter <= 2) decimalSeparator = separator;
    else if (count > 1 && digitsAfter > 0 && digitsAfter <= 2) decimalSeparator = separator;
  }

  if (decimalSeparator) {
    const groupingSeparator = decimalSeparator === "," ? "." : ",";
    clean = clean.split(groupingSeparator).join("");
    const decimalIndex = clean.lastIndexOf(decimalSeparator);
    clean = `${clean.slice(0, decimalIndex).split(decimalSeparator).join("")}.${clean.slice(decimalIndex + 1)}`;
  } else {
    clean = clean.replace(/[.,]/g, "");
  }

  const parsed = Number(clean);
  if (!Number.isFinite(parsed) || (integer && !Number.isInteger(parsed))) return null;
  return parsed;
}

function parseMetricDate(value, dayFirst) {
  const clean = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const match = clean.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (!match) return null;
  let firstPart = Number(match[1]);
  let secondPart = Number(match[2]);
  const year = Number(match[3]);
  const inferredDayFirst = firstPart > 12 ? true : secondPart > 12 ? false : dayFirst;
  const day = inferredDayFirst ? firstPart : secondPart;
  const month = inferredDayFirst ? secondPart : firstPart;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const HEADER_MAP = new Map([
  ["data", "date"], ["dia", "date"], ["inicio dos relatorios", "date"], ["reporting starts", "date"],
  ["nome da campanha", "campaign"], ["campanha", "campaign"], ["campaign name", "campaign"],
  ["id da campanha", "campaignId"], ["campaign id", "campaignId"],
  ["nome do conjunto de anuncios", "adset"], ["conjunto de anuncios", "adset"], ["ad set name", "adset"],
  ["id do conjunto de anuncios", "adsetId"], ["ad set id", "adsetId"],
  ["nome do anuncio", "ad"], ["anuncio", "ad"], ["ad name", "ad"],
  ["id do anuncio", "adId"], ["ad id", "adId"],
  ["angulo", "angle"], ["angle", "angle"], ["formato", "format"], ["format", "format"], ["gancho", "hook"], ["hook", "hook"],
  ["montante gasto brl", "spend"], ["montante gasto", "spend"], ["amount spent brl", "spend"], ["amount spent", "spend"],
  ["impressoes", "impressions"], ["impressions", "impressions"],
  ["alcance", "reach"], ["reach", "reach"],
  ["frequencia", "frequency"], ["frequency", "frequency"],
  ["cliques todos", "allClicks"], ["cliques totais", "allClicks"], ["clicks all", "allClicks"],
  ["cliques no link", "linkClicks"], ["link clicks", "linkClicks"],
  ["ctr do link", "linkCtr"], ["ctr link", "linkCtr"], ["link ctr", "linkCtr"],
  ["cpc do link", "linkCpc"], ["cpc link", "linkCpc"], ["link cpc", "linkCpc"],
  ["visualizacoes da pagina de destino", "landingPageViews"], ["landing page views", "landingPageViews"], ["lpv", "landingPageViews"],
  ["leads no site", "metaLeads"], ["leads meta", "metaLeads"], ["website leads", "metaLeads"],
]);

const INTEGER_COLUMNS = new Set(["impressions", "reach", "allClicks", "linkClicks", "landingPageViews", "metaLeads"]);
const NUMERIC_COLUMNS = new Set(["spend", "impressions", "reach", "frequency", "allClicks", "linkClicks", "linkCtr", "linkCpc", "landingPageViews", "metaLeads"]);
const FORBIDDEN_HEADERS = ["email", "e mail", "telefone", "phone", "celular", "whatsapp", "nome do lead", "full name", "endereco", "address"];

export function parseMetaCsv(text) {
  if (text.length > 2_000_000) throw new Error("Arquivo acima de 2 MB.");
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("CSV vazio ou sem linhas de dados.");
  const delimiters = [";", ",", "\t"];
  const delimiter = delimiters.sort((a, b) => splitCsvLine(lines[0], b).length - splitCsvLine(lines[0], a).length)[0];
  const rawHeaders = splitCsvLine(lines[0], delimiter);
  const headers = rawHeaders.map(normalizedHeader);
  const forbidden = headers.find((header) => FORBIDDEN_HEADERS.includes(header));
  if (forbidden) throw new Error(`Remova a coluna de dado pessoal: ${forbidden}.`);
  const mapped = headers.map((header) => HEADER_MAP.get(header) ?? null);
  if (
    !mapped.includes("date")
    || (!mapped.includes("campaign") && !mapped.includes("campaignId"))
    || (!mapped.includes("ad") && !mapped.includes("adId"))
    || !mapped.includes("spend")
    || !mapped.includes("impressions")
  ) {
    throw new Error("O CSV precisa conter data, campanha/ID, anúncio/ID, gasto e impressões.");
  }
  const dayFirst = headers.some((header) => ["data", "dia", "inicio dos relatorios"].includes(header));

  return lines.slice(1, 501).map((line, rowIndex) => {
    const cells = splitCsvLine(line, delimiter);
    const row = {};
    mapped.forEach((key, index) => {
      if (!key) return;
      const raw = cells[index];
      if (key === "date") row[key] = parseMetricDate(raw, dayFirst);
      else if (NUMERIC_COLUMNS.has(key)) row[key] = parseLocalizedNumber(raw, { integer: INTEGER_COLUMNS.has(key) });
      else row[key] = String(raw ?? "").trim().slice(0, 200);
    });
    const rowNumber = rowIndex + 2;
    if (!row.date) throw new Error(`Data inválida na linha ${rowNumber}.`);
    if (!knownNumber(row.spend) || Number(row.spend) < 0) throw new Error(`Gasto inválido ou ausente na linha ${rowNumber}.`);
    if (!knownNumber(row.impressions) || Number(row.impressions) < 0 || !Number.isInteger(Number(row.impressions))) {
      throw new Error(`Impressões inválidas ou ausentes na linha ${rowNumber}.`);
    }
    for (const key of NUMERIC_COLUMNS) {
      if (key === "spend" || key === "impressions") continue;
      const index = mapped.indexOf(key);
      if (index >= 0 && String(cells[index] ?? "").trim() && !knownNumber(row[key])) {
        throw new Error(`Número inválido na coluna ${rawHeaders[index]} (linha ${rowNumber}).`);
      }
    }
    if (!(row.ad || row.adId || row.campaign || row.campaignId)) {
      throw new Error(`Campanha/anúncio ausente na linha ${rowNumber}.`);
    }
    return row;
  });
}
