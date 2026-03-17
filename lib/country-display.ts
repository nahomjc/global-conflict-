const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  "united states": "US",
  usa: "US",
  us: "US",
  america: "US",
  "united states of america": "US",
  "united kingdom": "GB",
  uk: "GB",
  britain: "GB",
  "great britain": "GB",
  england: "GB",
  russia: "RU",
  "russian federation": "RU",
  "united arab emirates": "AE",
  uae: "AE",
  "united arab emirate": "AE",
  "iran uae": "AE",
  ukraine: "UA",
  ethiopia: "ET",
  eritrea: "ER",
  sudan: "SD",
  "south sudan": "SS",
  israel: "IL",
  palestine: "PS",
  iran: "IR",
  iraq: "IQ",
  syria: "SY",
  yemen: "YE",
  lebanon: "LB",
  jordan: "JO",
  egypt: "EG",
  saudi: "SA",
  "saudi arabia": "SA",
  turkey: "TR",
  "turkiye": "TR",
  china: "CN",
  taiwan: "TW",
  india: "IN",
  pakistan: "PK",
  afghanistan: "AF",
  myanmar: "MM",
  armenia: "AM",
  azerbaijan: "AZ",
  georgia: "GE",
};

const COUNTRY_NAME_LABELS: Record<string, string> = {
  usa: "United States",
  us: "United States",
  "united states of america": "United States",
  uk: "United Kingdom",
  britain: "United Kingdom",
  "great britain": "United Kingdom",
  england: "United Kingdom",
  "russian federation": "Russia",
  uae: "United Arab Emirates",
  "united arab emirate": "United Arab Emirates",
  "iran uae": "United Arab Emirates",
  turkiye: "Turkey",
};

function normalizeCountry(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toTitleCase(value: string) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getCountryDisplay(country: string) {
  const normalized = normalizeCountry(country);
  const displayName =
    COUNTRY_NAME_LABELS[normalized] ?? toTitleCase(normalized || country);
  const code = COUNTRY_NAME_TO_CODE[normalized];
  return {
    name: displayName,
    code,
  };
}
