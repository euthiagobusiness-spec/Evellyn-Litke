import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeEmail,
  normalizePhone,
  validateLeadFields,
} from "../src/lib/lead-validation.mjs";

test("normaliza e-mail e telefone internacional", () => {
  assert.equal(normalizeEmail("  Pessoa@Exemplo.COM "), "pessoa@exemplo.com");
  assert.equal(normalizePhone("+55 (11) 99999-9999"), "+5511999999999");
});

test("aceita cadastro válido sem consentimento de marketing", () => {
  const result = validateLeadFields({
    name: "Pessoa Teste",
    email: "pessoa@example.com",
    phone: "+55 11 99999-9999",
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
    phone: "11 99999-9999",
    consentPrivacy: false,
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.email);
  assert.ok(result.errors.phone);
  assert.ok(result.errors.consentPrivacy);
});
