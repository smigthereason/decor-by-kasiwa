import Image from "next/image";
import Link from "next/link";
import { Logo as LogoImage } from "@/public/index";

export function Logo() {
  return (
    <Link href="/" aria-label="Decor by Kasiwa home" className="relative z-20 flex items-center justify-center">
      <Image
        src={LogoImage}
        alt="Decor by Kasiwa logo"
        width={400}
        height={300}
        priority
        quality={100}
        className="h-auto w-[125px] object-contain sm:w-[160px] lg:w-[190px]"
      />
    </Link>
  );
}