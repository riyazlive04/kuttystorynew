export function inr(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function languageLabel(lang: "en" | "ta" | "bilingual"): string {
  switch (lang) {
    case "en":
      return "English";
    case "ta":
      return "Tamil";
    case "bilingual":
      return "English + Tamil";
  }
}
