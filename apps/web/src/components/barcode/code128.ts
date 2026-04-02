const CODE128_PATTERNS = [
  "212222",
  "222122",
  "222221",
  "121223",
  "121322",
  "131222",
  "122213",
  "122312",
  "132212",
  "221213",
  "221312",
  "231212",
  "112232",
  "122132",
  "122231",
  "113222",
  "123122",
  "123221",
  "223211",
  "221132",
  "221231",
  "213212",
  "223112",
  "312131",
  "311222",
  "321122",
  "321221",
  "312212",
  "322112",
  "322211",
  "212123",
  "212321",
  "232121",
  "111323",
  "131123",
  "131321",
  "112313",
  "132113",
  "132311",
  "211313",
  "231113",
  "231311",
  "112133",
  "112331",
  "132131",
  "113123",
  "113321",
  "133121",
  "313121",
  "211331",
  "231131",
  "213113",
  "213311",
  "213131",
  "311123",
  "311321",
  "331121",
  "312113",
  "312311",
  "332111",
  "314111",
  "221411",
  "431111",
  "111224",
  "111422",
  "121124",
  "121421",
  "141122",
  "141221",
  "112214",
  "112412",
  "122114",
  "122411",
  "142112",
  "142211",
  "241211",
  "221114",
  "413111",
  "241112",
  "134111",
  "111242",
  "121142",
  "121241",
  "114212",
  "124112",
  "124211",
  "411212",
  "421112",
  "421211",
  "212141",
  "214121",
  "412121",
  "111143",
  "111341",
  "131141",
  "114113",
  "114311",
  "411113",
  "411311",
  "113141",
  "114131",
  "311141",
  "411131",
  "211412",
  "211214",
  "211232",
  "2331112"
] as const;

function encodeCode128B(value: string) {
  if (!value) {
    throw new Error("Informe um valor para o barcode.");
  }

  const codes = [104];

  for (const char of value) {
    const codePoint = char.charCodeAt(0);

    if (codePoint < 32 || codePoint > 126) {
      throw new Error("O barcode suporta apenas caracteres ASCII visiveis.");
    }

    codes.push(codePoint - 32);
  }

  const checksum =
    codes.reduce(
      (sum, code, index) => sum + (index === 0 ? code : code * index),
      0
    ) % 103;

  return [...codes, checksum, 106];
}

export function buildCode128Svg(
  value: string,
  options?: {
    barWidth?: number;
    height?: number;
    quietZone?: number;
    background?: string;
    color?: string;
  }
) {
  const barWidth = options?.barWidth ?? 2;
  const height = options?.height ?? 64;
  const quietZone = options?.quietZone ?? 12;
  const background = options?.background ?? "#ffffff";
  const color = options?.color ?? "#111111";
  const codes = encodeCode128B(value);
  let x = quietZone;
  const rects: string[] = [];

  for (const encoded of codes.map((code) => CODE128_PATTERNS[code])) {
    let drawBar = true;

    for (const digit of encoded) {
      const width = Number(digit) * barWidth;

      if (drawBar) {
        rects.push(`<rect x="${x}" y="0" width="${width}" height="${height}" fill="${color}" />`);
      }

      x += width;
      drawBar = !drawBar;
    }
  }

  const width = x + quietZone;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Barcode Code 128 para ${escapeXml(value)}"><rect width="${width}" height="${height}" fill="${background}" />${rects.join("")}</svg>`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
