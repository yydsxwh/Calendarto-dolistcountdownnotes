function readVite(name: "VITE_DAYS_API_ORIGIN" | "VITE_ACCOUNT_URL" | "VITE_SITE_ORIGIN"): string {
  const value = import.meta.env[name]
  return typeof value === "string" ? value.trim().replace(/\/+$/, "") : ""
}

export function configuredApiOrigin(): string {
  return readVite("VITE_DAYS_API_ORIGIN")
}

export function configuredAccountUrl(): string {
  return readVite("VITE_ACCOUNT_URL")
}

export function configuredSiteOrigin(): string {
  return readVite("VITE_SITE_ORIGIN") || configuredApiOrigin()
}

export function browserHttpOrigin(): string {
  if (typeof window === "undefined") return ""
  const { protocol, origin } = window.location
  if (protocol === "http:" || protocol === "https:") return origin
  return ""
}

export function absoluteApiUrl(path: string, native: boolean): string {
  if (!native) {
    const web = browserHttpOrigin()
    if (web) return `${web}${path}`
  }
  const configured = configuredApiOrigin()
  if (!configured) throw new Error("MISSING_VITE_DAYS_API_ORIGIN")
  return `${configured}${path}`
}

export function productsHomeHref(): string {
  const web = browserHttpOrigin()
  if (web) return `${web}/products`
  const site = configuredSiteOrigin()
  return site ? `${site}/products` : "/products"
}
