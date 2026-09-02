import { toast } from "sonner";

import { appConfig } from "@/config/app";

const SUPPORT_WHATSAPP_URL = "https://wa.me/8801700000000";

function openExternalUrl(url: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

export function openSupportChat() {
  openExternalUrl(SUPPORT_WHATSAPP_URL);
}

export function openTutorialVideoSearch(query = "Bizovix ERP tutorial") {
  openExternalUrl(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`);
}

export function openVideoChannel(fallbackQuery = "Bizovix ERP") {
  const configuredUrl = appConfig.youtubeChannelUrl.trim();
  openExternalUrl(configuredUrl || `https://www.youtube.com/results?search_query=${encodeURIComponent(fallbackQuery)}`);
}

export function openWhatsAppShare(text: string) {
  openExternalUrl(`https://wa.me/?text=${encodeURIComponent(text)}`);
}

export function buildWhatsAppChatUrl(phoneNumber: string, text?: string) {
  const digits = phoneNumber.replace(/\D/g, "");
  if (!digits) return null;
  const normalized = digits.startsWith("880") ? digits : digits.startsWith("0") ? `880${digits.slice(1)}` : digits;
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${normalized}${query}`;
}

export function openWhatsAppChat(phoneNumber: string, text?: string) {
  const url = buildWhatsAppChatUrl(phoneNumber, text);
  if (url) openExternalUrl(url);
}

export function openMailComposer(subject: string, body: string, to?: string) {
  if (typeof window === "undefined") {
    return;
  }

  const recipient = to?.trim() ? encodeURIComponent(to.trim()) : "";
  window.location.href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** A contact field holds either a phone number or an email; only the latter can be mailed. */
export function isEmailAddress(value: string | null | undefined) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value ?? "").trim());
}

type ShareTextOptions = {
  title: string;
  text: string;
  copySuccessMessage?: string;
};

type ShareInvoiceDocumentOptions = {
  file: File;
  title: string;
  text: string;
  fallback: () => void;
};

export async function shareInvoiceDocument({ file, title, text, fallback }: ShareInvoiceDocumentOptions) {
  const canShareFile =
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] });

  if (canShareFile) {
    try {
      await navigator.share({ files: [file], title, text });
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        // User cancelled the native share sheet on purpose — don't also trigger the fallback.
        return false;
      }
      // Any other failure: fall through to the fallback below.
    }
  }

  fallback();
  return false;
}

export async function shareText({ title, text, copySuccessMessage = "Copied to clipboard" }: ShareTextOptions) {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text });
      return true;
    } catch {
      // Fall back to clipboard share when native share is unavailable or cancelled.
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    toast.success(copySuccessMessage);
    return false;
  }

  if (typeof window !== "undefined") {
    window.prompt("Copy this text", text);
  }

  return false;
}
