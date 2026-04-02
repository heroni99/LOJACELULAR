import type { StoreSettings } from "./api";

type Rgb = {
  r: number;
  g: number;
  b: number;
};

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function normalizeHex(hex: string) {
  const normalized = hex.trim().replace("#", "");

  if (normalized.length === 3) {
    return normalized
      .split("")
      .map((channel) => `${channel}${channel}`)
      .join("");
  }

  return normalized;
}

function hexToRgb(hex: string): Rgb {
  const normalized = normalizeHex(hex);

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16)
  };
}

function rgbToHex({ r, g, b }: Rgb) {
  return `#${[r, g, b]
    .map((channel) => clampChannel(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

function mixHex(baseHex: string, mixHexColor: string, ratio: number) {
  const base = hexToRgb(baseHex);
  const mix = hexToRgb(mixHexColor);

  return rgbToHex({
    r: base.r + (mix.r - base.r) * ratio,
    g: base.g + (mix.g - base.g) * ratio,
    b: base.b + (mix.b - base.b) * ratio
  });
}

function hexToHslChannels(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) {
    return `0 0% ${Math.round(lightness * 100)}%`;
  }

  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);

  let hue = 0;

  switch (max) {
    case red:
      hue = (green - blue) / delta + (green < blue ? 6 : 0);
      break;
    case green:
      hue = (blue - red) / delta + 2;
      break;
    default:
      hue = (red - green) / delta + 4;
      break;
  }

  hue /= 6;

  return `${Math.round(hue * 360)} ${Math.round(saturation * 100)}% ${Math.round(
    lightness * 100
  )}%`;
}

function toRgbChannels(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return `${r} ${g} ${b}`;
}

export function applyStoreTheme(store: StoreSettings | null | undefined) {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  const primaryColor = store?.primaryColor ?? "#f97316";
  const secondaryColor = store?.secondaryColor ?? "#111827";
  const accentColor = store?.accentColor ?? "#ffffff";
  const backgroundColor = mixHex(accentColor, "#f5f5f4", 0.35);
  const cardColor = mixHex(accentColor, "#ffffff", 0.75);
  const mutedColor = mixHex(accentColor, "#d6d3d1", 0.35);
  const borderColor = mixHex(accentColor, secondaryColor, 0.18);
  const secondarySurface = mixHex(accentColor, primaryColor, 0.16);

  root.style.setProperty("--background", hexToHslChannels(backgroundColor));
  root.style.setProperty("--foreground", hexToHslChannels(secondaryColor));
  root.style.setProperty("--card", hexToHslChannels(cardColor));
  root.style.setProperty("--card-foreground", hexToHslChannels(secondaryColor));
  root.style.setProperty("--primary", hexToHslChannels(primaryColor));
  root.style.setProperty("--primary-foreground", hexToHslChannels("#ffffff"));
  root.style.setProperty("--secondary", hexToHslChannels(secondarySurface));
  root.style.setProperty("--secondary-foreground", hexToHslChannels(secondaryColor));
  root.style.setProperty("--muted", hexToHslChannels(mutedColor));
  root.style.setProperty("--muted-foreground", hexToHslChannels(mixHex(secondaryColor, accentColor, 0.28)));
  root.style.setProperty("--border", hexToHslChannels(borderColor));
  root.style.setProperty("--input", hexToHslChannels(borderColor));
  root.style.setProperty("--ring", hexToHslChannels(primaryColor));
  root.style.setProperty("--brand-primary-rgb", toRgbChannels(primaryColor));
  root.style.setProperty("--brand-secondary-rgb", toRgbChannels(secondaryColor));
  root.style.setProperty("--shell-sidebar", secondaryColor);
  root.style.setProperty("--shell-sidebar-foreground", accentColor);
  root.style.setProperty("--shell-sidebar-muted", mixHex(accentColor, secondaryColor, 0.35));
  root.style.setProperty("--shell-surface", accentColor);
  root.style.setProperty("--shell-surface-foreground", secondaryColor);
}
