import { useMemo } from "react";
import { buildCode128Svg } from "./code128";

export function Code128Barcode({
  value,
  height = 64,
  barWidth = 2,
  className
}: {
  value: string;
  height?: number;
  barWidth?: number;
  className?: string;
}) {
  const svgMarkup = useMemo(
    () => buildCode128Svg(value, { height, barWidth }),
    [barWidth, height, value]
  );

  return (
    <div
      aria-label={`Barcode ${value}`}
      className={className}
      dangerouslySetInnerHTML={{ __html: svgMarkup }}
    />
  );
}
