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
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
        className="size-7 fill-current"
      >
        <path d="M19.11 17.35c-.27-.14-1.6-.79-1.85-.88-.25-.09-.43-.14-.61.14-.18.27-.7.88-.86 1.06-.16.18-.32.2-.59.07-.27-.14-1.15-.42-2.19-1.35-.81-.72-1.36-1.61-1.52-1.88-.16-.27-.02-.42.12-.56.12-.12.27-.32.41-.48.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.14-.61-1.47-.84-2.01-.22-.53-.45-.46-.61-.47h-.52c-.18 0-.48.07-.72.34-.25.27-.95.93-.95 2.26s.97 2.62 1.11 2.8c.14.18 1.91 2.91 4.62 4.08.65.28 1.15.45 1.54.57.65.21 1.24.18 1.71.11.52-.08 1.6-.65 1.83-1.29.23-.63.23-1.18.16-1.29-.07-.11-.25-.18-.52-.32Z" />
        <path d="M16.03 3C8.86 3 3.03 8.81 3.03 15.96c0 2.53.74 5.01 2.12 7.12L3 29l6.1-2.01a13 13 0 0 0 6.92 1.89h.01C23.2 28.88 29 23.06 29 15.91 29 8.77 23.19 3 16.03 3Zm0 23.68h-.01a10.8 10.8 0 0 1-5.51-1.51l-.39-.23-3.62 1.19 1.21-3.52-.25-.4a10.7 10.7 0 0 1-1.65-5.72c0-5.94 4.85-10.77 10.81-10.77 2.89 0 5.6 1.12 7.64 3.16a10.72 10.72 0 0 1 3.17 7.62c0 5.94-4.85 10.78-10.8 10.78Z" />
      </svg>
      <span className="sr-only">WhatsApp</span>
    </a>
  );
}
