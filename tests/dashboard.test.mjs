import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  campaignDecision,
  evaluateDashboardDecision,
  parseLocalizedNumber,
  parseMetaCsv,
  sortSnapshotsNewest,
} from "../src/lib/dashboard-rules.mjs";

const html = await readFile(new URL("../dashboard.html", import.meta.url), "utf8");
const script = await readFile(new URL("../src/pages/dashboard.mjs", import.meta.url), "utf8");
const api = await readFile(new URL("../src/lib/funnel-api.mjs", import.meta.url), "utf8");
const vite = await readFile(new URL("../vite.config.js", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/funnel-dashboard/index.ts", import.meta.url), "utf8");
const migration = await readFile(
  new URL("../supabase/migrations/20260721054736_dashboard_measurement_contract.sql", import.meta.url),
  "utf8",
);

test("dashboard é restrito, agregado e entra no build", () => {
  assert.match(html, /name="robots" content="noindex, nofollow, noarchive"/);
  assert.match(html, /type="password"/);
  assert.match(html, /dados agregados/i);
  assert.doesNotMatch(html, /name="(?:email|phone|telefone|name)"/i);
  assert.match(api, /Authorization: `Bearer \$\{cleanToken\}`/);
  assert.match(api, /funnel-dashboard/);
  assert.match(vite, /dashboard\.html/);
});

test("dashboard cobre funil, alertas, regras e tabela operacional do playbook", () => {
  for (const content of [
    "LandingView",
    "FormStart",
    "SubmitAttempt",
    "LeadSaved",
    "RedirectUnique",
    "GroupMemberSnapshot",
    "Cobertura UTM",
    "API p95",
    "CPL first-party",
    "Custo por membro",
    "Faixa verde",
    "Faixa amarela",
    "Faixa vermelha",
  ]) {
    assert.match(`${html}\n${script}`, new RegExp(content, "i"));
  }

  for (const column of [
    "Campanha", "ID campanha", "Conjunto", "ID conjunto", "Anúncio", "ID anúncio", "Ângulo", "Formato", "Gancho",
    "Gasto", "Impressões", "CTR link", "CPC link", "LPV", "Leads Meta",
    "Leads Supabase", "Redirects", "Conciliação", "Membros líq.", "Decisão", "Responsável",
  ]) {
    assert.match(html, new RegExp(column, "i"));
  }

  assert.match(html, /name="adminCount"/);
  assert.match(html, /name="reportedExits"/);
  assert.match(html, /name="isBaseline"/);
  assert.match(script, /sortSnapshotsNewest/);
  assert.match(script, /sem leitura comparável/i);
});

test("biblioteca mantém continuidade por canal e UTMs padrão", () => {
  assert.match(html, /Pare de ser invisível no digital/);
  assert.match(html, /Cresça sem abandonar seus princípios/);
  assert.match(html, /Conteúdo com direção gera autoridade/);
  assert.match(html, /Quero minha vaga gratuita para 26\/07/);
  assert.match(html, /utm_source=\{\{site_source_name\}\}/);
  assert.match(html, /utm_campaign=\{\{campaign\.name\}\}/);
  assert.match(html, /utm_content=\{\{ad\.name\}\}/);
  assert.match(html, /utm_term=\{\{adset\.name\}\}/);
  assert.match(html, /ad_id=\{\{ad\.id\}\}/);
  assert.match(html, /Nunca enviar tráfego direto ao grupo/);
});

test("contrato SQL usa fuso local, UTM completa, LPV, IDs e dois snapshots", () => {
  assert.match(migration, /America\/Manaus/);
  for (const field of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
    assert.match(migration, new RegExp(`first_touch ->> '${field}'`));
  }
  assert.match(migration, /admin_count/);
  assert.match(migration, /reported_exits/);
  assert.match(migration, /is_baseline/);
  assert.match(migration, /landing_page_views/);
  assert.match(migration, /alter column link_clicks drop not null/);
  assert.match(edge, /optionalNonNegativeNumber/);
  assert.match(migration, /when ad_id is not null then 'ad:id:' \|\| ad_id/);
  assert.match(migration, /if v_has_current then[\s\S]+if v_has_baseline then/);
  assert.match(migration, /'netMembers', v_group_net/);
  assert.match(migration, /order by captured_at desc, id desc/);
  assert.match(migration, /captured_at >= v_start[\s\S]+captured_at < v_end/);
  assert.match(migration, /least\(100, round\(100\.0 \* v_validation_failures \/ v_submit/);
  assert.match(migration, /v_metric_days >= v_days and v_meta_incomplete_rows = 0/);
  assert.match(migration, /v_metric_days < v_days or v_meta_incomplete_rows > 0/);
  assert.doesNotMatch(migration, /'note', note/);
  assert.match(migration, /metric_days = 1 and reach > 0/);
});

test("Edge valida importação operacional, protege notas e mede a saúde real", () => {
  assert.match(edge, /funnel-dashboard-auth/);
  assert.match(edge, /funnel-dashboard-write/);
  assert.match(edge, /pii_not_allowed/);
  assert.match(edge, /campaignId/);
  assert.match(edge, /adsetId/);
  assert.match(edge, /adId/);
  assert.match(edge, /landingPageViews/);
  assert.match(edge, /probeSiteHealth/);
  assert.match(edge, /routesHealthy/);
  assert.match(edge, /sslHealthy/);
  assert.match(edge, /angle/);
  assert.match(edge, /creative_format/);
  assert.match(edge, /hook/);
  assert.doesNotMatch(edge, /Number\(value \?\? 0\)/);
  assert.match(migration, /add column if not exists angle/);
  assert.match(migration, /add column if not exists creative_format/);
  assert.match(migration, /add column if not exists hook/);
});

test("decisão geral distingue falha, aprovação e ausência de leitura", () => {
  const inconclusive = evaluateDashboardDecision({});
  assert.equal(inconclusive.status, "inconclusive");
  assert.ok(inconclusive.unknown.includes("tracking"));

  const healthy = {
    trackingHealthy: true,
    formErrorRate: 0.2,
    utmCoverage: 98,
    leadRedirectRate: 97,
    groupMeasured: true,
    apiP95Ms: 700,
    capiFailureRate: 0,
    pendingCapi: 0,
    metaDataFresh: true,
    metaDataComplete: true,
    attributionIdCoverage: 100,
    routesHealthy: true,
    sslHealthy: true,
  };
  assert.equal(evaluateDashboardDecision(healthy).status, "go");
  assert.equal(evaluateDashboardDecision({ ...healthy, utmCoverage: 70 }).status, "no-go");
  assert.equal(evaluateDashboardDecision({ ...healthy, pendingCapi: 1 }).status, "no-go");
  assert.equal(evaluateDashboardDecision({ ...healthy, metaDataComplete: false }).status, "no-go");
});

test("regra por anúncio exige conciliação e amostra antes de otimizar", () => {
  assert.equal(campaignDecision({ impressions: 2_000, linkCtr: 3, linkCpc: 0.4 }).key, "inconclusive");
  assert.equal(campaignDecision({
    reconciled: true,
    matchingMethod: "name_auxiliary",
    impressions: 2_000,
    spend: 12,
    linkCtr: 2.4,
    linkCpc: 0.4,
  }).key, "inconclusive");
  assert.equal(campaignDecision({
    reconciled: true,
    adId: "ad-123",
    matchingMethod: "id",
    metaDataFresh: true,
    groupMeasured: true,
    impressions: 2_000,
    spend: 12,
    linkCtr: 2.4,
    linkCpc: 0.4,
    supabaseLeads: 4,
    firstPartyCpl: 3,
  }).key, "green");
  assert.equal(campaignDecision({
    reconciled: true,
    adId: "ad-456",
    matchingMethod: "id_zero_leads",
    metaDataFresh: true,
    impressions: 2_000,
    spend: 15,
    linkCtr: 0.8,
    linkCpc: 1,
    supabaseLeads: 0,
  }).key, "red");
  assert.equal(campaignDecision({
    adId: "ad-789",
    matchingMethod: "id",
    metaDataFresh: true,
    spend: null,
    impressions: 2_000,
    linkCtr: 2,
    linkCpc: 0.5,
  }).key, "inconclusive");
});

test("parser aceita números pt-BR e en-US sem transformar ausência em zero", () => {
  assert.equal(parseLocalizedNumber("R$ 1.234,56"), 1234.56);
  assert.equal(parseLocalizedNumber("$1,234.56"), 1234.56);
  assert.equal(parseLocalizedNumber("12.345", { integer: true }), 12345);
  assert.equal(parseLocalizedNumber("12,345", { integer: true }), 12345);
  assert.equal(parseLocalizedNumber(""), null);

  const pt = parseMetaCsv([
    "Data;ID da campanha;Nome da campanha;ID do anúncio;Nome do anúncio;Montante gasto (BRL);Impressões;Cliques no link;Ângulo;Formato;Gancho",
    "21/07/2026;camp-1;Campanha;ad-1;Anúncio;1.234,56;12.345;321;Reconhecimento;Vídeo;Pare de ser invisível",
  ].join("\n"));
  assert.equal(pt[0].date, "2026-07-21");
  assert.equal(pt[0].spend, 1234.56);
  assert.equal(pt[0].impressions, 12345);
  assert.equal(pt[0].angle, "Reconhecimento");

  const en = parseMetaCsv([
    "Reporting starts,Campaign ID,Campaign name,Ad ID,Ad name,Amount spent (BRL),Impressions,Link clicks,Angle,Format,Hook",
    '07/21/2026,camp-2,Campaign,ad-2,Ad,"1,234.56","12,345",321,Values,Video,Keep your principles',
  ].join("\n"));
  assert.equal(en[0].date, "2026-07-21");
  assert.equal(en[0].spend, 1234.56);
  assert.equal(en[0].impressions, 12345);
  assert.throws(() => parseMetaCsv([
    "Data;ID da campanha;ID do anúncio;Montante gasto;Impressões",
    "21/07/2026;camp;ad;;100",
  ].join("\n")), /Gasto inválido ou ausente/);
});

test("dashboard separa CPLs, atribuição e não declara que CAPI mede Pixel", () => {
  assert.match(script, /CPL Meta reportado/);
  assert.match(script, /CPL first-party conciliado/);
  assert.match(script, /CPL blended/);
  assert.match(script, /Leads sem atribuição/);
  assert.match(script, /não mede o Pixel do navegador/);
  assert.match(migration, /'metaReportedCpl'/);
  assert.match(migration, /'reconciledFirstPartyCpl'/);
  assert.match(migration, /'blendedFirstPartyCpl'/);
  assert.match(migration, /'unattributedLeads'/);
  assert.match(migration, /'optimizationEligible'/);
  assert.match(migration, /name_auxiliary/);
});

test("snapshots são sempre apresentados do mais recente para o mais antigo", () => {
  const snapshots = sortSnapshotsNewest([
    { capturedAt: "2026-07-20T10:00:00Z", count: 60 },
    { capturedAt: "2026-07-21T10:00:00Z", count: 70 },
  ]);
  assert.deepEqual(snapshots.map((row) => row.count), [70, 60]);
});
