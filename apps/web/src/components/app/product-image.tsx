import { ImageIcon } from "lucide-react";
import { resolveApiAssetUrl } from "@/lib/api";

type ProductImageProps = {
  imageUrl?: string | null;
  name: string;
  className?: string;
};

export function ProductImage({ imageUrl, name, className }: ProductImageProps) {
  const resolvedUrl = resolveApiAssetUrl(imageUrl);

  if (!resolvedUrl) {
    return (
      <div
        className={`flex items-center justify-center rounded-2xl border border-border/70 bg-secondary/40 text-muted-foreground ${className ?? ""}`}
      >
        <ImageIcon className="h-6 w-6" />
      </div>
    );
  }

  return (
    <img
      alt={`Foto de ${name}`}
      className={`rounded-2xl border border-border/70 bg-secondary/20 object-cover ${className ?? ""}`}
      src={resolvedUrl}
    />
  );
}
