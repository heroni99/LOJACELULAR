import { LoaderCircle } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

type LoadingButtonProps = ButtonProps & {
  isLoading?: boolean;
  loadingText?: string;
};

export function LoadingButton({
  children,
  disabled,
  isLoading = false,
  loadingText = "Aguarde...",
  ...props
}: LoadingButtonProps) {
  return (
    <Button disabled={disabled || isLoading} {...props}>
      {isLoading ? (
        <>
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          {loadingText}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
