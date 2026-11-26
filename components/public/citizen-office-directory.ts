import type { DohOfficeLocation } from "@/db/default-data";

const publicRoster = [
  { name: "แขวงทางหลวงปัตตานี", type: "HEADQUARTERS" },
  { name: "หมวดทางหลวงโคกโพธิ์", type: "SUBDIVISION" },
  { name: "หมวดทางหลวงหนองจิก", type: "SUBDIVISION" },
  { name: "หมวดทางหลวงปะนาเระ", type: "SUBDIVISION" },
  { name: "หมวดทางหลวงสายบุรี", type: "SUBDIVISION" },
  { name: "หมวดทางหลวงยะรัง", type: "SUBDIVISION" },
] as const;

function normalizeOfficeName(value: unknown): string {
  if (typeof value !== "string") return "";
  // Keep Thai marks intact. Ignore separation and the standard office prefix only.
  return value.normalize("NFC").replace(/[\s\u200b\u2060\ufeff]+/gu, "").replace(/^สำนักงาน(?=แขวงทางหลวง|หมวดทางหลวง)/u, "");
}

// NBTC/ITU current Thai plan: fixed numbers have 8 digits excluding the trunk
// prefix; mobile/VoIP have 9. Format validation is not ownership verification.
function isThaiOfficePhone(national: string): boolean {
  return /^[1-57][0-9]{7}$/.test(national) || /^[689][0-9]{8}$/.test(national);
}

function phoneLink(value: string): string | null {
  const roman = value.replace(/[๐-๙]/g, (digit) => String(digit.charCodeAt(0) - 0x0e50));
  // An explicit extension is display-only; never append it to the main number.
  const main = roman.replace(/\s+(?:ต่อ|ext\.?)\s*[0-9]{1,6}\s*$/iu, "").trim();
  if (!/^\+?[0-9().\s-]+$/u.test(main)) return null;
  const digits = main.replace(/\D/g, "");
  if (main.startsWith("+")) {
    if (digits.startsWith("66")) return isThaiOfficePhone(digits.slice(2)) ? "tel:+" + digits : null;
    return /^[1-9][0-9]{7,14}$/.test(digits) ? "tel:+" + digits : null;
  }
  return digits.startsWith("0") && isThaiOfficePhone(digits.slice(1)) ? "tel:" + digits : null;
}

function officeDirections(lat: unknown, lon: unknown): string | null {
  if (typeof lat !== "number" || typeof lon !== "number" ||
      !Number.isFinite(lat) || !Number.isFinite(lon) ||
      lat === 0 || lon === 0 || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const params = new URLSearchParams({ api: "1", destination: [lat, lon].join(",") });
  return "https://www.google.com/maps/dir/?" + params.toString();
}

export interface CitizenOffice {
  name: string;
  type: "HEADQUARTERS" | "SUBDIVISION";
  availability: "available" | "missing" | "ambiguous";
  address: string;
  phone: string;
  tel: string | null;
  directions: string | null;
}

export function resolveCitizenOfficeDirectory(offices: readonly DohOfficeLocation[] | undefined): CitizenOffice[] {
  const active = Array.isArray(offices) ? offices.filter((record) => record?.is_active === true) : [];
  return publicRoster.map((office) => {
    const allowedNames = office.type === "HEADQUARTERS"
      ? [office.name, "แขวงทางหลวงปัตตานี (สำนักงานใหญ่)"]
      : [office.name];
    const normalized = allowedNames.map(normalizeOfficeName);
    const matched = active.filter((record) => record.type === office.type && normalized.includes(normalizeOfficeName(record.name)));
    const unique = matched.length === 1 ? matched[0] : null;
    const address = unique && typeof unique.address === "string" ? unique.address.trim() : "";
    const phone = unique && typeof unique.phone === "string" ? unique.phone.trim() : "";
    return {
      ...office,
      availability: unique ? "available" : matched.length > 1 ? "ambiguous" : "missing",
      address: address === "-" ? "" : address,
      phone,
      tel: phoneLink(phone),
      directions: unique ? officeDirections(unique.lat, unique.lon) : null,
    };
  });
}
