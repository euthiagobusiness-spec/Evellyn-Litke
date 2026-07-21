// Caminho relativo mantém o servidor local sem bundler funcional; o Vite
// incorpora o mesmo módulo no build de produção.
import { parsePhoneNumberFromString } from "../../node_modules/libphonenumber-js/max/index.js";

export const FIELD_MESSAGES = Object.freeze({
  name: "Informe seu nome completo.",
  email: "Informe um e-mail válido.",
  phone: "Informe um telefone válido para o país selecionado.",
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

export function composeInternationalPhone(callingCode, localNumber, countryIso = "") {
  const normalizedCode = String(callingCode ?? "").replace(/\D/g, "");
  const rawLocal = String(localNumber ?? "").trim();
  let normalizedLocal = rawLocal.replace(/\D/g, "");
  if (!/^[1-9][0-9]{0,3}$/.test(normalizedCode)) {
    return null;
  }

  const pastedInternational = parsePhoneNumberFromString(`+${normalizedLocal}`);
  if (normalizedLocal.startsWith(normalizedCode) && (
    rawLocal.startsWith("+") || (
      pastedInternational?.isValid() &&
      pastedInternational.countryCallingCode === normalizedCode
    )
  )) {
    normalizedLocal = normalizedLocal.slice(normalizedCode.length);
  }

  const parsedPhone = parsePhoneNumberFromString(`+${normalizedCode}${normalizedLocal}`);
  if (!parsedPhone?.isValid() || parsedPhone.countryCallingCode !== normalizedCode) {
    return null;
  }
  return parsedPhone.number;
}

export function validateLeadFields(fields) {
  const name = normalizeName(fields.name);
  const email = normalizeEmail(fields.email);
  const phoneE164 = composeInternationalPhone(
    fields.countryCallingCode,
    fields.phone,
    fields.countryIso,
  );
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

export function formatPhoneInput(value, callingCode = "+55") {
  const maximumLength = ({ "+55": 11, "+54": 11, "+56": 9, "+33": 10 })[callingCode] ?? 15;
  const callingCodeDigits = String(callingCode).replace(/\D/g, "");
  let nationalDigits = String(value ?? "").replace(/\D/g, "");
  if (nationalDigits.length > maximumLength && nationalDigits.startsWith(callingCodeDigits)) {
    nationalDigits = nationalDigits.slice(callingCodeDigits.length);
  }
  const digits = nationalDigits.slice(0, maximumLength);

  if (callingCode === "+55") {
    const area = digits.slice(0, 2);
    const local = digits.slice(2);
    let formatted = area ? `(${area}` : "";
    if (area.length === 2) formatted += ")";
    if (local) {
      const splitAt = local.length > 8 ? 5 : 4;
      formatted += ` ${local.slice(0, splitAt)}`;
      if (local.length > splitAt) formatted += `-${local.slice(splitAt)}`;
    }
    return formatted;
  }

  if (callingCode === "+54") {
    const mobilePrefix = digits.startsWith("9") && digits.length > 10;
    const offset = mobilePrefix ? 1 : 0;
    return [
      mobilePrefix ? "9" : "",
      digits.slice(offset, offset + 2),
      digits.slice(offset + 2, offset + 6),
      digits.slice(offset + 6, offset + 10),
    ].filter(Boolean).join(" ");
  }

  if (callingCode === "+56") {
    return [digits.slice(0, 1), digits.slice(1, 5), digits.slice(5, 9)].filter(Boolean).join(" ");
  }

  if (callingCode === "+33") {
    const firstGroupLength = digits.startsWith("0") ? 2 : 1;
    const groups = [digits.slice(0, firstGroupLength)];
    for (let index = firstGroupLength; index < digits.length; index += 2) {
      groups.push(digits.slice(index, index + 2));
    }
    return groups.filter(Boolean).join(" ");
  }

  return digits.replace(/(\d{3})(?=\d)/g, "$1 ").trim();
}
