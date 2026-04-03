import {
  API_ORIGIN,
  createServiceOrderReceiptPrintLink,
  type ServiceOrderReceiptFormat
} from "@/lib/api";

export async function openServiceOrderReceiptWindow(
  token: string | undefined | null,
  serviceOrderId: string,
  format: ServiceOrderReceiptFormat
) {
  if (typeof window === "undefined") {
    return;
  }

  const popup = window.open("", "_blank");

  try {
    const { path } = await createServiceOrderReceiptPrintLink(
      token,
      serviceOrderId,
      format
    );
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

    throw new Error("Nao foi possivel abrir o comprovante da OS.");
  }
}
