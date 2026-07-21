import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { HttpError } from "./http.ts";

export interface ValidatedLead {
  idempotencyKey: string | null;
  eventId: string | null;
  name: string;
  email: string;
  phone: string;
  phoneE164: string;
  countryIso: string;
  countryCallingCode: string;
  businessStage: string | null;
  goal: string | null;
  niche: string | null;
  instagramHandle: string | null;
  audienceSize: string | null;
  biggestChallenge: string | null;
  preferredContactPeriod: string | null;
  consentPrivacy: boolean;
  consentMarketing: boolean;
  consentAnalytics: boolean;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  gclid: string | null;
  fbclid: string | null;
  referrer: string | null;
  landingPath: string | null;
  sessionId: string | null;
  turnstileToken: string | null;
  website: string;
  metadata: Record<string, string>;
}

function requireObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new HttpError(400, "invalid_payload");
  }
  return input as Record<string, unknown>;
}

function text(
  value: unknown,
  field: string,
  maxLength: number,
  required = false,
): string | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw new HttpError(422, "required", field);
    return null;
  }
  if (typeof value !== "string") throw new HttpError(422, "invalid", field);

  const normalized = value.replace(/\s+/g, " ").trim();
  if ((required && normalized.length < 2) || normalized.length > maxLength) {
    throw new HttpError(422, "invalid", field);
  }
  return normalized;
}

function optionalBoolean(value: unknown): boolean {
  return value === true;
}

function optionalUuid(value: unknown, field: string): string | null {
  const result = text(value, field, 36);
  if (!result) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
    throw new HttpError(422, "invalid", field);
  }
  return result.toLowerCase();
}

function trackingText(value: unknown, field: string, maxLength: number): string | null {
  const result = text(value, field, maxLength);
  if (!result || /^\{\{[^{}]+\}\}$/.test(result)) return null;
  return result.replace(/[\u0000-\u001f\u007f]/g, "");
}

function metadata(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const value = input as Record<string, unknown>;
  const limits: Record<string, number> = {
    locale: 32,
    timezone: 64,
    viewport: 32,
    fbc: 512,
    fbp: 512,
    campaignId: 100,
    adsetId: 100,
    adId: 100,
    placement: 200,
    landingUrl: 1000,
  };
  return Object.fromEntries(
    Object.entries(limits).flatMap(([key, maxLength]) => {
      const item = value[key];
      if (typeof item !== "string") return [];
      const normalized = item.replace(/[\u0000-\u001f\u007f]/g, "").trim();
      if (!normalized || normalized.length > maxLength || /^\{\{[^{}]+\}\}$/.test(normalized)) return [];
      return [[key, normalized]];
    }),
  );
}

export function validateLead(input: unknown): ValidatedLead {
  const payload = requireObject(input);
  const name = text(payload.name, "name", 120, true)!;
  const email = text(payload.email, "email", 254, true)!
    .normalize("NFKC")
    .toLowerCase();
  const phone = text(payload.phone, "phone", 40, true)!;
  const countryIso = text(payload.countryIso, "countryIso", 2, true)!.toUpperCase();
  const countryCallingCode = text(
    payload.countryCallingCode,
    "countryCallingCode",
    5,
    true,
  )!;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(422, "invalid", "email");
  }

  if (!phone.startsWith("+")) {
    throw new HttpError(422, "country_code_required", "phone");
  }

  if (!/^[A-Z]{2}$/.test(countryIso)) {
    throw new HttpError(422, "invalid", "countryIso");
  }

  if (!/^\+[1-9][0-9]{0,3}$/.test(countryCallingCode)) {
    throw new HttpError(422, "invalid", "countryCallingCode");
  }

  const parsedPhone = parsePhoneNumberFromString(phone);
  if (!parsedPhone?.isValid()) {
    throw new HttpError(422, "invalid", "phone");
  }

  if (`+${parsedPhone.countryCallingCode}` !== countryCallingCode) {
    throw new HttpError(422, "country_code_mismatch", "phone");
  }

  if (payload.consentPrivacy !== true) {
    throw new HttpError(422, "privacy_consent_required", "consentPrivacy");
  }

  return {
    idempotencyKey: optionalUuid(payload.idempotencyKey, "idempotencyKey"),
    eventId: optionalUuid(payload.eventId, "eventId"),
    name,
    email,
    phone,
    phoneE164: parsedPhone.number,
    countryIso,
    countryCallingCode,
    businessStage: text(payload.businessStage, "businessStage", 100),
    goal: text(payload.goal, "goal", 160),
    niche: text(payload.niche, "niche", 120),
    instagramHandle: text(payload.instagramHandle, "instagramHandle", 160),
    audienceSize: text(payload.audienceSize, "audienceSize", 40),
    biggestChallenge: text(payload.biggestChallenge, "biggestChallenge", 120),
    preferredContactPeriod: text(
      payload.preferredContactPeriod,
      "preferredContactPeriod",
      40,
    ),
    consentPrivacy: true,
    consentMarketing: optionalBoolean(payload.consentMarketing),
    consentAnalytics: optionalBoolean(payload.consentAnalytics),
    utmSource: trackingText(payload.utmSource, "utmSource", 200),
    utmMedium: trackingText(payload.utmMedium, "utmMedium", 200),
    utmCampaign: trackingText(payload.utmCampaign, "utmCampaign", 200),
    utmContent: trackingText(payload.utmContent, "utmContent", 200),
    utmTerm: trackingText(payload.utmTerm, "utmTerm", 200),
    gclid: trackingText(payload.gclid, "gclid", 500),
    fbclid: trackingText(payload.fbclid, "fbclid", 500),
    referrer: trackingText(payload.referrer, "referrer", 1000),
    landingPath: trackingText(payload.landingPath, "landingPath", 500),
    sessionId: trackingText(payload.sessionId, "sessionId", 128),
    turnstileToken: text(payload.turnstileToken, "turnstileToken", 2048),
    website: text(payload.website, "website", 200) ?? "",
    metadata: metadata(payload.metadata),
  };
}

const FIRST_PARTY_EVENTS: Record<string, string> = {
  LandingView: "landing_view",
  FormStart: "form_start",
  ValidationError: "validation_error",
  SubmitAttempt: "submit_attempt",
  LeadSaved: "lead_saved",
  RedirectStarted: "redirect_started",
  RedirectUnique: "redirect_unique",
  WebVital: "web_vital",
  ApiRequest: "api_request",
};

export interface ValidatedFirstPartyEvent {
  eventId: string;
  eventName: string;
  leadReference: string | null;
  sessionId: string | null;
  page: string | null;
  occurredAt: string | null;
  consentAnalytics: boolean;
  utm: {
    source: string | null;
    medium: string | null;
    campaign: string | null;
    content: string | null;
    term: string | null;
  };
  metadata: Record<string, string>;
  durationMs: number | null;
  website: string;
}

function eventMetadata(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const value = input as Record<string, unknown>;
  const allowed = [
    "viewport",
    "locale",
    "timezone",
    "field",
    "errorCode",
    "connection",
    "device",
    "metric",
    "value",
    "rating",
    "endpoint",
    "httpStatus",
    "success",
  ];
  return Object.fromEntries(allowed.flatMap((key) => {
    const item = value[key];
    if (typeof item !== "string") return [];
    const sanitized = item.replace(/[\u0000-\u001f\u007f]/g, "").trim();
    return sanitized && sanitized.length <= 100 ? [[key, sanitized]] : [];
  }));
}

export function validateFirstPartyEvent(input: unknown): ValidatedFirstPartyEvent {
  const payload = requireObject(input);
  const publicName = text(payload.eventName, "eventName", 40, true)!;
  const eventName = FIRST_PARTY_EVENTS[publicName];
  if (!eventName) throw new HttpError(422, "invalid", "eventName");

  const utmInput = payload.utm && typeof payload.utm === "object" && !Array.isArray(payload.utm)
    ? payload.utm as Record<string, unknown>
    : {};
  const occurredAt = text(payload.occurredAt, "occurredAt", 40);
  if (occurredAt && Number.isNaN(Date.parse(occurredAt))) {
    throw new HttpError(422, "invalid", "occurredAt");
  }
  const durationMs = payload.durationMs === undefined || payload.durationMs === null
    ? null
    : Number(payload.durationMs);
  if (durationMs !== null && (!Number.isInteger(durationMs) || durationMs < 0 || durationMs > 120_000)) {
    throw new HttpError(422, "invalid", "durationMs");
  }

  return {
    eventId: optionalUuid(payload.eventId, "eventId") ?? (() => {
      throw new HttpError(422, "required", "eventId");
    })(),
    eventName,
    leadReference: optionalUuid(payload.leadReference, "leadReference"),
    sessionId: trackingText(payload.sessionId, "sessionId", 128),
    page: trackingText(payload.page, "page", 500),
    occurredAt,
    consentAnalytics: optionalBoolean(payload.consentAnalytics),
    utm: {
      source: trackingText(utmInput.source, "utm.source", 200),
      medium: trackingText(utmInput.medium, "utm.medium", 200),
      campaign: trackingText(utmInput.campaign, "utm.campaign", 200),
      content: trackingText(utmInput.content, "utm.content", 200),
      term: trackingText(utmInput.term, "utm.term", 200),
    },
    metadata: eventMetadata(payload.metadata),
    durationMs,
    website: text(payload.website, "website", 200) ?? "",
  };
}

export interface ValidatedPrivacyRequest {
  requestType: string;
  name: string;
  email: string;
  phoneE164: string | null;
  requestedChanges: Record<string, string>;
  website: string;
}

export function validatePrivacyRequest(input: unknown): ValidatedPrivacyRequest {
  const payload = requireObject(input);
  const rawRequestType = text(payload.requestType, "requestType", 20, true)!;
  const requestType = rawRequestType === "withdrawal" ? "revocation" : rawRequestType;
  if (!["access", "correction", "deletion", "revocation", "portability"].includes(requestType)) {
    throw new HttpError(422, "invalid", "requestType");
  }
  const name = text(payload.name, "name", 120, true)!;
  const email = text(payload.email, "email", 254, true)!.normalize("NFKC").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(422, "invalid", "email");
  }
  const phoneE164 = text(payload.phoneE164, "phoneE164", 20);
  if (phoneE164 && !/^\+[1-9][0-9]{7,14}$/.test(phoneE164)) {
    throw new HttpError(422, "invalid", "phoneE164");
  }
  const changesInput = payload.requestedChanges && typeof payload.requestedChanges === "object" && !Array.isArray(payload.requestedChanges)
    ? payload.requestedChanges as Record<string, unknown>
    : {};
  const requestedChanges = Object.fromEntries(
    ["name", "email", "phone"].flatMap((key) => {
      const value = changesInput[key];
      if (typeof value !== "string") return [];
      const sanitized = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
      return sanitized && sanitized.length <= 254 ? [[key, sanitized]] : [];
    }),
  );
  const details = text(payload.details, "details", 1000);
  if (details) requestedChanges.details = details;
  if (payload.consentPrivacy !== true) {
    throw new HttpError(422, "privacy_consent_required", "consentPrivacy");
  }
  return {
    requestType,
    name,
    email,
    phoneE164,
    requestedChanges,
    website: text(payload.website, "website", 200) ?? "",
  };
}

const PUBLIC_EVENTS = new Set([
  "thank_you_registration_viewed",
  "whatsapp_clicked",
  "sales_page_viewed",
  "checkout_clicked",
  "upsell_viewed",
  "upsell_accepted",
  "upsell_declined",
]);

export interface ValidatedEvent {
  leadReference: string;
  eventName: string;
  page: string | null;
  sessionId: string | null;
  metadata: Record<string, string>;
}

export function validateEvent(input: unknown): ValidatedEvent {
  const payload = requireObject(input);
  const leadReference = text(payload.leadReference, "leadReference", 36, true)!;
  const eventName = text(payload.eventName, "eventName", 80, true)!;

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      leadReference,
    )
  ) {
    throw new HttpError(422, "invalid", "leadReference");
  }

  if (!PUBLIC_EVENTS.has(eventName)) {
    throw new HttpError(422, "invalid", "eventName");
  }

  return {
    leadReference,
    eventName,
    page: trackingText(payload.page, "page", 500),
    sessionId: trackingText(payload.sessionId, "sessionId", 128),
    metadata: metadata(payload.metadata),
  };
}
