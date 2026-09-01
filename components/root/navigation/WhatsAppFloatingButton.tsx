import { MessageCircle } from "lucide-react";

const WHATSAPP_NUMBER = "254117553747";
const WHATSAPP_MESSAGE = encodeURIComponent(
  "Hello Decor by Kasiwa, I would like help with a product or order.",
);

export default function WhatsAppFloatingButton() {
  return (
    <a
      href={`https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_MESSAGE}`}
      target="_blank"
      rel="noreferrer"
      aria-label="Chat with Decor by Kasiwa on WhatsApp"
      className="fixed bottom-[92px] right-4 z-50 inline-flex size-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_12px_30px_rgba(0,0,0,0.22)] transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]/40 focus-visible:ring-offset-2 lg:bottom-6 lg:right-6"
    >
      <MessageCircle size={27} strokeWidth={2} />
      <span className="sr-only">WhatsApp</span>
    </a>
  );
}
