import { API_ORIGIN, createFiscalReceiptPrintLink } from "@/lib/api";

export async function openFiscalReceiptPrintWindow(
  token: string | undefined | null,
  saleId: string
) {
  if (typeof window === "undefined") {
    return;
  }

  const popup = window.open("", "_blank");

  try {
    const { path } = await createFiscalReceiptPrintLink(token, saleId);
    const url = new URL(path, API_ORIGIN).toString();

    if (popup) {
      popup.location.href = url;
      popup.focus();
      return;
    }

    window.open(url, "_blank");
  } catch (error) {
    popup?.close();

    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Nao foi possivel abrir o comprovante.");
  }
}
