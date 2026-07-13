import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { HttpError } from "./http.ts";

export interface ValidatedLead {
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

function trackingText(value: unknown, field: string, maxLength: number): string | null {
  const result = text(value, field, maxLength);
  return result ? result.replace(/[\u0000-\u001f\u007f]/g, "") : null;
}

function metadata(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const value = input as Record<string, unknown>;
  const allowed = ["locale", "timezone", "viewport"];
  return Object.fromEntries(
    allowed.flatMap((key) => {
      const item = value[key];
      return typeof item === "string" && item.length <= 100 ? [[key, item]] : [];
    }),
  );
}

export function validateLead(input: unknown): ValidatedLead {
  const payload = requireObject(input);
  const name = text(payload.name, "name", 120, true)!;
  const email = text(payload.email, "email", 254, true)!.toLowerCase();
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
