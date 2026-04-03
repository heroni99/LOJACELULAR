import {
  createContext,
  useContext,
  useEffect,
  useId,
  type HTMLAttributes,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type DialogContextValue = {
  titleId: string;
  descriptionId: string;
  onOpenChange?(open: boolean): void;
};

const DialogContext = createContext<DialogContextValue | null>(null);

export function Dialog({
  open,
  onOpenChange,
  children
}: {
  open: boolean;
  onOpenChange?(open: boolean): void;
  children: ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange?.(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onOpenChange, open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <DialogContext.Provider
      value={{
        titleId,
        descriptionId,
        onOpenChange
      }}
    >
      {children}
    </DialogContext.Provider>,
    document.body
  );
}

export function DialogContent({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  const context = useContext(DialogContext);

  if (!context) {
    throw new Error("DialogContent precisa ser usado dentro de Dialog.");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        aria-label="Fechar modal"
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
        onClick={() => context.onOpenChange?.(false)}
        type="button"
      />

      <div
        aria-describedby={context.descriptionId}
        aria-labelledby={context.titleId}
        aria-modal="true"
        className={cn(
          "relative z-10 w-full max-w-3xl rounded-[2rem] border border-border/70 bg-white shadow-panel",
          className
        )}
        role="dialog"
      >
        {children}
        <Button
          aria-label="Fechar modal"
          className="absolute right-4 top-4"
          onClick={() => context.onOpenChange?.(false)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function DialogHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-2 p-6 pb-0", className)} {...props} />;
}

export function DialogTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  const context = useContext(DialogContext);

  return (
    <h2
      className={cn("text-2xl font-black tracking-tight", className)}
      id={context?.titleId}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  const context = useContext(DialogContext);

  return (
    <p
      className={cn("text-sm leading-6 text-muted-foreground", className)}
      id={context?.descriptionId}
      {...props}
    />
  );
}

export function DialogBody({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-6 p-6", className)} {...props} />;
}

export function DialogFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-3 border-t border-border/70 bg-secondary/20 px-6 py-4 sm:flex-row sm:items-center sm:justify-end",
        className
      )}
      {...props}
    />
  );
}
