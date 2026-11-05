import { useEffect } from "react";

export function useSystemFavicon(logoUrl?: string, systemName?: string, agencyName?: string) {
  useEffect(() => {
    if (systemName) document.title = agencyName ? `${systemName} | ${agencyName}` : systemName;
    if (!logoUrl) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"][data-system-favicon]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      link.dataset.systemFavicon = "true";
      document.head.appendChild(link);
    }
    const separator = logoUrl.includes("?") ? "&" : "?";
    link.href = `${logoUrl}${separator}v=${encodeURIComponent(logoUrl.slice(-24))}`;
  }, [logoUrl, systemName, agencyName]);
}
