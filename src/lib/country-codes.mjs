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

const PHONE_PLACEHOLDERS = Object.freeze({
  BR: "(11) 99999-9999",
  AR: "11 9999 9999",
  CL: "9 1234 5678",
  FR: "6 12 34 56 78",
  US: "(202) 555-0198",
  CA: "(202) 555-0198",
  PT: "912 345 678",
});

function countryLabel(country) {
  return country.callingCode === "custom"
    ? `${flagEmoji(country.iso)} ${country.name}`
    : `${flagEmoji(country.iso)} ${country.name} (${country.callingCode})`;
}

function searchable(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function syncPhonePlaceholder(country) {
  const phoneInput = document.querySelector('[name="phone"]');
  if (phoneInput) {
    phoneInput.placeholder = PHONE_PLACEHOLDERS[country.iso] ?? "Número com código de área";
  }
}

function initCountryCombobox(select) {
  const search = document.querySelector("[data-country-search]");
  const optionsWrap = document.querySelector("[data-country-options]");
  if (!search || !optionsWrap || search.dataset.ready === "true") return;

  search.dataset.ready = "true";
  let activeIndex = -1;
  let visibleCountries = COUNTRY_OPTIONS;

  function closeOptions() {
    optionsWrap.hidden = true;
    search.setAttribute("aria-expanded", "false");
    search.removeAttribute("aria-activedescendant");
    activeIndex = -1;
  }

  function selectCountry(country, { returnFocus = false } = {}) {
    select.value = country.iso;
    search.value = countryLabel(country);
    select.dispatchEvent(new Event("change", { bubbles: true }));
    syncPhonePlaceholder(country);
    closeOptions();
    if (returnFocus) search.focus();
  }

  function setActive(nextIndex) {
    const buttons = Array.from(optionsWrap.querySelectorAll(".country-option"));
    if (!buttons.length) return;
    activeIndex = (nextIndex + buttons.length) % buttons.length;
    buttons.forEach((button, index) => button.classList.toggle("is-active", index === activeIndex));
    const active = buttons[activeIndex];
    search.setAttribute("aria-activedescendant", active.id);
    active.scrollIntoView({ block: "nearest" });
  }

  function renderOptions(query = "") {
    const normalizedQuery = searchable(query).replace(/^\+/, "").trim();
    visibleCountries = COUNTRY_OPTIONS.filter((country) => {
      if (!normalizedQuery) return true;
      const haystack = searchable(`${country.name} ${country.iso} ${country.callingCode}`);
      return haystack.includes(normalizedQuery);
    });

    optionsWrap.replaceChildren();
    activeIndex = -1;
    if (!visibleCountries.length) {
      const empty = document.createElement("p");
      empty.className = "country-option-empty";
      empty.textContent = "Nenhum país encontrado.";
      optionsWrap.append(empty);
      return;
    }

    visibleCountries.forEach((country, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "country-option";
      button.id = `lead-country-option-${country.iso}`;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(select.value === country.iso));
      button.dataset.index = String(index);
      button.textContent = countryLabel(country);
      button.addEventListener("pointerdown", (event) => event.preventDefault());
      button.addEventListener("click", () => selectCountry(country, { returnFocus: true }));
      optionsWrap.append(button);
    });
  }

  function openOptions({ clearSearch = false } = {}) {
    if (clearSearch) search.value = "";
    renderOptions(search.value);
    optionsWrap.hidden = false;
    search.setAttribute("aria-expanded", "true");
  }

  search.addEventListener("focus", () => openOptions({ clearSearch: true }));
  search.addEventListener("input", () => openOptions());
  search.addEventListener("blur", () => {
    window.setTimeout(() => {
      if (!optionsWrap.hidden) return;
      const selected = COUNTRY_OPTIONS.find((country) => country.iso === select.value) ?? COUNTRY_OPTIONS[0];
      search.value = countryLabel(selected);
    });
  });
  search.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (optionsWrap.hidden) openOptions({ clearSearch: true });
      setActive(activeIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (optionsWrap.hidden) openOptions({ clearSearch: true });
      setActive(activeIndex - 1);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      selectCountry(visibleCountries[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      const selected = COUNTRY_OPTIONS.find((country) => country.iso === select.value) ?? COUNTRY_OPTIONS[0];
      search.value = countryLabel(selected);
      closeOptions();
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (!search.contains(event.target) && !optionsWrap.contains(event.target)) closeOptions();
  });

  const initialCountry = COUNTRY_OPTIONS.find((country) => country.iso === select.value) ?? COUNTRY_OPTIONS[0];
  search.value = countryLabel(initialCountry);
  queueMicrotask(() => syncPhonePlaceholder(initialCountry));
}

export function populateCountrySelect(select) {
  if (!select) return;
  if (!select.options.length) {
    COUNTRY_OPTIONS.forEach((country) => {
      const option = document.createElement("option");
      option.value = country.iso;
      option.dataset.callingCode = country.callingCode;
      option.textContent = countryLabel(country);
      option.selected = country.iso === "BR";
      select.append(option);
    });
  }
  initCountryCombobox(select);
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
