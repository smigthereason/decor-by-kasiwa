import { FaWhatsapp } from "react-icons/fa";

// Opens the existing staff-managed WhatsApp Business chat. This is not the bot webhook.
const WHATSAPP_NUMBER = "254117553747";
const WHATSAPP_MESSAGE = encodeURIComponent("Hello Decor by Kasiwa, I would like help with a product or order.");

export default function WhatsAppFloatingButton() {
  return (
    <a
      href={`https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_MESSAGE}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with Decor by Kasiwa on WhatsApp – Hi! Need help?"
      className="fixed bottom-[90px] right-3 z-50 flex max-w-[calc(100vw-1.5rem)] items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-left text-neutral-900 shadow-[0_12px_30px_rgba(0,0,0,0.16)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] lg:bottom-6 lg:right-6"
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white shadow-sm">
        <FaWhatsapp aria-hidden="true" className="size-8" />
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-sm font-bold sm:text-base">Hi! Need help?</span>
        <span className="mt-1 text-xs text-neutral-600 sm:text-sm">We&apos;re here to assist you</span>
      </span>
    </a>
  );
}
