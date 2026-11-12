import { useEffect } from "react";

export function useSystemFavicon(logoUrl?: string, systemName?: string, agencyName?: string) {
  useEffect(() => {
    if (systemName) document.title = agencyName ? `${systemName} | ${agencyName}` : systemName;
    if (!logoUrl) return;

    // Next.js inserts its own icon link during the initial document render. Updating
    // only a new link left some browsers choosing that older link instead of the
    // uploaded agency logo. Update every icon candidate and leave one tagged link
    // behind for deterministic inspection and later updates.
    const existingLinks = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="shortcut icon"]'));
    const link = existingLinks.find((candidate) => candidate.dataset.systemFavicon === "true") ?? existingLinks[0] ?? document.createElement("link");
    if (!link.isConnected) {
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.dataset.systemFavicon = "true";
    const separator = logoUrl.includes("?") ? "&" : "?";
    const versionedLogoUrl = `${logoUrl}${separator}v=${encodeURIComponent(logoUrl.slice(-24))}`;
    existingLinks.forEach((candidate) => {
      candidate.href = versionedLogoUrl;
      candidate.dataset.systemFavicon = "true";
    });
    link.href = versionedLogoUrl;
  }, [logoUrl, systemName, agencyName]);
}
