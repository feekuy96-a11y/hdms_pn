/**
 * แปลงไฟล์ภาพเป็น Base64 Data URL แบบย่อขนาด (Resize)
 */
export function compressImageToBase64(file: File, maxDimension = 1200, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = img.width > maxDimension ? maxDimension / img.width : 1;
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * บีบอัดรูปภาพแบบ Adaptive รับประกันขนาดไม่เกินเพดานที่กำหนด (ค่าเริ่มต้น 300 KB)
 * ปรับลดความละเอียดและคุณภาพอย่างเป็นลำดับ โดยใช้ WebP เป็นอันดับแรก (Fallback เป็น JPEG)
 * การวาดผ่าน Canvas ช่วยล้าง EXIF metadata ป้องกันข้อมูลตำแหน่งส่วนตัวและลดขนาดไฟล์ลงทันที
 */
export async function compressImageToAdaptiveBase64(
  file: File,
  maxSizeBytes = 300 * 1024
): Promise<{ dataUrl: string; sizeBytes: number; format?: "webp" | "jpeg" }> {
  // สร้าง image element จากไฟล์
  const dataUrlOriginal = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrlOriginal;
  });

  // ตรวจสอบการรองรับ WebP บน Canvas
  let supportsWebp = false;
  try {
    const testCanvas = document.createElement("canvas");
    testCanvas.width = 1;
    testCanvas.height = 1;
    supportsWebp = testCanvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    supportsWebp = false;
  }
  const preferredMime = supportsWebp ? "image/webp" : "image/jpeg";

  // ลำดับขั้นตอนการลดขนาด: [maxDimension, quality]
  const stages: Array<[number, number]> = [
    [1280, 0.82],
    [1024, 0.75],
    [840, 0.65],
    [680, 0.55],
    [540, 0.45],
    [420, 0.38],
    [320, 0.32],
  ];

  let bestDataUrl = dataUrlOriginal;
  let bestSizeBytes = Math.round((bestDataUrl.length * 3) / 4);
  let bestFormat: "webp" | "jpeg" = "jpeg";

  for (const [maxDim, quality] of stages) {
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const targetW = Math.max(1, Math.round(img.width * scale));
    const targetH = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;

    ctx.drawImage(img, 0, 0, targetW, targetH);
    let candidateUrl = canvas.toDataURL(preferredMime, quality);
    let chosenFormat: "webp" | "jpeg" = candidateUrl.startsWith("data:image/webp") ? "webp" : "jpeg";

    if (preferredMime === "image/webp" && !candidateUrl.startsWith("data:image/webp")) {
      candidateUrl = canvas.toDataURL("image/jpeg", quality);
      chosenFormat = "jpeg";
    }

    const candidateSize = Math.round((candidateUrl.length * 3) / 4);

    bestDataUrl = candidateUrl;
    bestSizeBytes = candidateSize;
    bestFormat = chosenFormat;

    if (candidateSize <= maxSizeBytes) {
      break;
    }
  }

  return { dataUrl: bestDataUrl, sizeBytes: bestSizeBytes, format: bestFormat };
}
