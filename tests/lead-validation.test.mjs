import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeEmail,
  normalizePhone,
  composeInternationalPhone,
  formatPhoneInput,
  validateLeadFields,
} from "../src/lib/lead-validation.mjs";

test("normaliza e-mail e telefone internacional", () => {
  assert.equal(normalizeEmail("  Pessoa@Exemplo.COM "), "pessoa@exemplo.com");
  assert.equal(normalizePhone("+55 (11) 99999-9999"), "+5511999999999");
  assert.equal(composeInternationalPhone("+55", "(11) 99999-9999"), "+5511999999999");
  assert.equal(formatPhoneInput("11999999999", "+55"), "(11) 99999-9999");
  assert.equal(formatPhoneInput("2025550198", "+1"), "202 555 019 8");
});

test("aceita cadastro válido sem consentimento de marketing", () => {
  const result = validateLeadFields({
    name: "Pessoa Teste",
    email: "pessoa@example.com",
    phone: "11 99999-9999",
    countryCallingCode: "+55",
    consentPrivacy: true,
    consentMarketing: false,
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
});

test("rejeita e-mail, telefone e aceite inválidos", () => {
  const result = validateLeadFields({
    name: "Pessoa Teste",
    email: "email-invalido",
    phone: "123",
    countryCallingCode: "+55",
    consentPrivacy: false,
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.email);
  assert.ok(result.errors.phone);
  assert.ok(result.errors.consentPrivacy);
});
