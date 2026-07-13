export const COUNTRY_OPTIONS = Object.freeze([
  { iso: "BR", name: "Brasil", callingCode: "+55" },
  { iso: "US", name: "Estados Unidos", callingCode: "+1" },
  { iso: "CA", name: "Canadá", callingCode: "+1" },
  { iso: "PT", name: "Portugal", callingCode: "+351" },
  { iso: "AR", name: "Argentina", callingCode: "+54" },
  { iso: "BO", name: "Bolívia", callingCode: "+591" },
  { iso: "CL", name: "Chile", callingCode: "+56" },
  { iso: "CO", name: "Colômbia", callingCode: "+57" },
  { iso: "EC", name: "Equador", callingCode: "+593" },
  { iso: "PY", name: "Paraguai", callingCode: "+595" },
  { iso: "PE", name: "Peru", callingCode: "+51" },
  { iso: "UY", name: "Uruguai", callingCode: "+598" },
  { iso: "VE", name: "Venezuela", callingCode: "+58" },
  { iso: "MX", name: "México", callingCode: "+52" },
  { iso: "CR", name: "Costa Rica", callingCode: "+506" },
  { iso: "PA", name: "Panamá", callingCode: "+507" },
  { iso: "DO", name: "República Dominicana", callingCode: "+1" },
  { iso: "GB", name: "Reino Unido", callingCode: "+44" },
  { iso: "ES", name: "Espanha", callingCode: "+34" },
  { iso: "FR", name: "França", callingCode: "+33" },
  { iso: "DE", name: "Alemanha", callingCode: "+49" },
  { iso: "IT", name: "Itália", callingCode: "+39" },
  { iso: "NL", name: "Países Baixos", callingCode: "+31" },
  { iso: "BE", name: "Bélgica", callingCode: "+32" },
  { iso: "CH", name: "Suíça", callingCode: "+41" },
  { iso: "AT", name: "Áustria", callingCode: "+43" },
  { iso: "IE", name: "Irlanda", callingCode: "+353" },
  { iso: "SE", name: "Suécia", callingCode: "+46" },
  { iso: "NO", name: "Noruega", callingCode: "+47" },
  { iso: "DK", name: "Dinamarca", callingCode: "+45" },
  { iso: "FI", name: "Finlândia", callingCode: "+358" },
  { iso: "PL", name: "Polônia", callingCode: "+48" },
  { iso: "CZ", name: "República Tcheca", callingCode: "+420" },
  { iso: "RO", name: "Romênia", callingCode: "+40" },
  { iso: "GR", name: "Grécia", callingCode: "+30" },
  { iso: "UA", name: "Ucrânia", callingCode: "+380" },
  { iso: "TR", name: "Turquia", callingCode: "+90" },
  { iso: "AO", name: "Angola", callingCode: "+244" },
  { iso: "MZ", name: "Moçambique", callingCode: "+258" },
  { iso: "CV", name: "Cabo Verde", callingCode: "+238" },
  { iso: "GW", name: "Guiné-Bissau", callingCode: "+245" },
  { iso: "ST", name: "São Tomé e Príncipe", callingCode: "+239" },
  { iso: "ZA", name: "África do Sul", callingCode: "+27" },
  { iso: "NG", name: "Nigéria", callingCode: "+234" },
  { iso: "GH", name: "Gana", callingCode: "+233" },
  { iso: "KE", name: "Quênia", callingCode: "+254" },
  { iso: "IN", name: "Índia", callingCode: "+91" },
  { iso: "CN", name: "China", callingCode: "+86" },
  { iso: "JP", name: "Japão", callingCode: "+81" },
  { iso: "KR", name: "Coreia do Sul", callingCode: "+82" },
  { iso: "SG", name: "Singapura", callingCode: "+65" },
  { iso: "AE", name: "Emirados Árabes Unidos", callingCode: "+971" },
  { iso: "IL", name: "Israel", callingCode: "+972" },
  { iso: "SA", name: "Arábia Saudita", callingCode: "+966" },
  { iso: "AU", name: "Austrália", callingCode: "+61" },
  { iso: "NZ", name: "Nova Zelândia", callingCode: "+64" },
  { iso: "ZZ", name: "Outro país", callingCode: "custom" },
]);

function flagEmoji(iso) {
  if (!/^[A-Z]{2}$/.test(iso) || iso === "ZZ") return "🌐";
  return String.fromCodePoint(...iso.split("").map((letter) => 127397 + letter.charCodeAt(0)));
}

export function populateCountrySelect(select) {
  if (!select || select.options.length) return;
  COUNTRY_OPTIONS.forEach((country) => {
    const option = document.createElement("option");
    option.value = country.iso;
    option.dataset.callingCode = country.callingCode;
    option.textContent = country.callingCode === "custom"
      ? `${flagEmoji(country.iso)} ${country.name}`
      : `${flagEmoji(country.iso)} ${country.name} (${country.callingCode})`;
    option.selected = country.iso === "BR";
    select.append(option);
  });
}

export function getSelectedCountry(select, customCallingCode = "") {
  const option = select?.selectedOptions?.[0];
  const callingCode = option?.dataset.callingCode === "custom"
    ? normalizeCallingCode(customCallingCode)
    : option?.dataset.callingCode ?? "+55";

  return {
    iso: option?.value ?? "BR",
    callingCode,
    custom: option?.dataset.callingCode === "custom",
  };
}

export function normalizeCallingCode(value) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 4);
  return digits ? `+${digits}` : "";
}
