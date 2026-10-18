import qrcode from "qrcode-generator";

/**
 * QR code as an SVG string: one path of square modules, drawn in currentColor so it takes the ink
 * token from the surrounding card. Includes a 4-module quiet zone so it scans from a projector.
 * Returns null when the text is too long for a QR code.
 */
export function qrSvg(text: string, quiet = 4): string | null {
  let qr: ReturnType<typeof qrcode>;
  try {
    qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
  } catch {
    return null;
  }
  const n = qr.getModuleCount();
  const size = n + quiet * 2;
  let d = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR code for the share link"><path fill="currentColor" d="${d}"/></svg>`;
}
