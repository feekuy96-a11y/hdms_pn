import { useEffect } from "react";

export function useSystemFavicon(logoUrl?: string) {
  useEffect(() => {
    if (!logoUrl) return;
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = logoUrl;
    document.head.appendChild(link);
    return () => { link.remove(); };
  }, [logoUrl]);
}
