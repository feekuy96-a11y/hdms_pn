/** The current gold DOH seal is a circular mark flattened on a black JPEG.
 * Clip that known bitmap only; other uploaded logos retain their full shape. */
export function websiteEmblemClip(logo: string): string | undefined {
  const prefix = "data:image/jpeg;base64,";
  if (!logo.startsWith(prefix)) return undefined;
  const encoded = logo.slice(prefix.length);
  if (encoded.length !== 58372 ||
    encoded.slice(1900, 1948) !== "OpUt340B58wb0SOG9kabdyCRcMjljqsur8Bgn4IR1181Grpx") return undefined;
  return "circle(42.2% at 49.5% 48.75%)";
}
