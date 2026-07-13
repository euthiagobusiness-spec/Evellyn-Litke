export const FIELD_MESSAGES = Object.freeze({
  name: "Informe seu nome completo.",
  email: "Informe um e-mail válido.",
  phone: "Inclua o DDI e o DDD, por exemplo: +55 11 99999-9999.",
  consentPrivacy: "Você precisa aceitar a Política de Privacidade.",
});

export function normalizeName(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizePhone(value) {
  const raw = String(value ?? "").trim();
  if (!raw.startsWith("+")) return null;
  const digits = raw.replace(/\D/g, "");
  if (!/^[1-9][0-9]{7,14}$/.test(digits)) return null;
  return `+${digits}`;
}

export function validateLeadFields(fields) {
  const name = normalizeName(fields.name);
  const email = normalizeEmail(fields.email);
  const phoneE164 = normalizePhone(fields.phone);
  const errors = {};

  if (name.length < 2 || name.length > 120) errors.name = FIELD_MESSAGES.name;
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    errors.email = FIELD_MESSAGES.email;
  }
  if (!phoneE164) errors.phone = FIELD_MESSAGES.phone;
  if (fields.consentPrivacy !== true) {
    errors.consentPrivacy = FIELD_MESSAGES.consentPrivacy;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    normalized: { name, email, phoneE164 },
  };
}

export function formatPhoneInput(value) {
  const raw = String(value ?? "");
  if (!raw.startsWith("+55")) return raw.slice(0, 20);

  const digits = raw.replace(/\D/g, "").slice(0, 13);
  const country = digits.slice(0, 2);
  const area = digits.slice(2, 4);
  const local = digits.slice(4);

  let formatted = `+${country}`;
  if (area) formatted += ` (${area}`;
  if (area.length === 2) formatted += ")";
  if (local) {
    const splitAt = local.length > 8 ? 5 : 4;
    formatted += ` ${local.slice(0, splitAt)}`;
    if (local.length > splitAt) formatted += `-${local.slice(splitAt)}`;
  }
  return formatted;
}
