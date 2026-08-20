// type PageIntroProps = {
//   eyebrow: string;
//   title: string;
//   body?: string;
// };

// export default function PageIntro({ eyebrow, title, body }: PageIntroProps) {
//   return (
//     <section className="w-full border-b hairline bg-[var(--paper)] px-4 pb-14 pt-16 md:px-8 md:pb-24 md:pt-24">
//       <p className="kicker text-[var(--muted)]">{eyebrow}</p>
//       <h1 className="mt-6 max-w-6xl text-[clamp(4rem,10vw,10rem)] font-medium uppercase leading-[0.9] tracking-[-0.07em]">
//         {title}
//       </h1>
//       {body && (
//         <p className="ml-auto mt-10 max-w-xl text-sm leading-relaxed text-[var(--muted)] md:text-base">
//           {body}
//         </p>
//       )}
//     </section>
//   );
// }
"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
} from "lucide-react";

type PageIntroProps = {
  eyebrow: string;
  title: string;
  body?: string;

  index?: string;
  meta?: string;

  image: string;
  featureImage?: string;

  featureLabel?: string;
  featureTitle?: string;
};

export default function PageIntro({
  eyebrow,
  title,
  body,

  index = "01",
  meta = "Kasiwa Collection",

  image,
  featureImage,

  featureLabel = "Curated Edit",
  featureTitle = "Explore the collection",
}: PageIntroProps) {
  const reduceMotion = useReducedMotion();

  const transition = reduceMotion
    ? { duration: 0 }
    : {
        duration: 0.75,
        ease: [0.22, 1, 0.36, 1] as const,
      };

  return (
    <section
      className="
        relative
        isolate
        w-full
        overflow-hidden
        text-white
        bg-[var(--paper2)]
      "
    >
      {/* ============================================================ */}
      {/* HERO CANVAS                                                  */}
      {/* ============================================================ */}

      <div
        className="
          relative
          min-h-screen
          w-full

          sm:min-h-screen

          lg:h-[clamp(580px,68vh,760px)]
          lg:min-h-screen
        "
      >
        {/* ========================================================== */}
        {/* FULL BACKGROUND IMAGE                                      */}
        {/* ========================================================== */}

        <motion.div
          initial={
            reduceMotion
              ? false
              : {
                  opacity: 0,
                  scale: 1.035,
                }
          }
          animate={{
            opacity: 1,
            scale: 1,
          }}
          transition={transition}
          className="absolute inset-0"
        >
          <Image
            src={image}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        </motion.div>

        {/* ========================================================== */}
        {/* IMAGE TREATMENT                                            */}
        {/* Same treatment language as EditorialHero                   */}
        {/* ========================================================== */}

        <div className="absolute inset-0 bg-black/15" />

        <div
          className="
            absolute
            inset-0
            bg-gradient-to-r
            from-black/65
            via-black/20
            to-black/10
          "
        />

        <div
          className="
            absolute
            inset-0
            bg-gradient-to-t
            from-black/70
            via-transparent
            to-black/20
          "
        />

        {/* ========================================================== */}
        {/* TOP EDITORIAL ROW                                          */}
        {/* ========================================================== */}

        <div
          className="
            absolute
            inset-x-0
            top-0
            z-30
            flex
            items-start
            justify-between
            px-5
            pt-6

            sm:px-8
            sm:pt-8

            lg:px-[3.5vw]
            lg:pt-9
          "
        >
          <motion.div
            initial={
              reduceMotion
                ? false
                : {
                    opacity: 0,
                    y: 8,
                  }
            }
            animate={{
              opacity: 1,
              y: 0,
            }}
            transition={transition}
            className="max-w-[300px]"
          >
            <p
              className="
                text-[9px]
                font-semibold
                uppercase
                leading-[1.35]
                tracking-[0.14em]
                text-white/80

                sm:text-[10px]
              "
            >
              {eyebrow}
            </p>
          </motion.div>

          <div
            className="
              flex
              items-center
              gap-3
              text-[8px]
              font-medium
              uppercase
              tracking-[0.15em]
              text-white/60

              sm:text-[9px]
            "
          >
            <span className="hidden sm:inline">
              Decor by Kasiwa
            </span>

            <span className="hidden h-px w-8 bg-white/35 sm:block" />

            <span className="text-white">
              {index}
            </span>
          </div>
        </div>

        {/* ========================================================== */}
        {/* RIGHT FEATURE CARD                                         */}
        {/* ========================================================== */}

        {featureImage && (
          <motion.div
            initial={
              reduceMotion
                ? false
                : {
                    opacity: 0,
                    x: 14,
                  }
            }
            animate={{
              opacity: 1,
              x: 0,
            }}
            transition={{
              ...transition,
              delay: reduceMotion ? 0 : 0.12,
            }}
            className="
              absolute
              right-5
              top-[105px]
              z-30
              hidden
              w-[230px]
              border
              border-white/25
              bg-black/15
              p-1.5
              backdrop-blur-[3px]

              sm:block
              sm:right-8
              sm:w-[250px]

              lg:right-[3.5vw]
              lg:top-[22%]
              lg:w-[290px]

              xl:w-[315px]
            "
          >
            {/* CARD HEADER */}

            <div
              className="
                flex
                items-center
                justify-between
                px-2.5
                py-2
              "
            >
              <div>
                <p
                  className="
                    text-[7px]
                    uppercase
                    tracking-[0.15em]
                    text-white/50

                    sm:text-[8px]
                  "
                >
                  {featureLabel}
                </p>

                <p
                  className="
                    mt-0.5
                    text-[9px]
                    font-medium
                    uppercase
                    tracking-[0.04em]
                    text-white

                    sm:text-[10px]
                  "
                >
                  The Kasiwa Edit
                </p>
              </div>

              <Link
                href="#shop-collection"
                aria-label="Explore collection"
                className="
                  grid
                  size-8
                  place-items-center
                  rounded-full
                  bg-white
                  text-black
                  transition-transform
                  duration-300
                  hover:rotate-45
                "
              >
                <ArrowUpRight
                  size={14}
                  strokeWidth={1.5}
                />
              </Link>
            </div>

            {/* IMAGE */}

            <Link
              href="#shop-collection"
              className="
                group
                relative
                block
                aspect-[1.55/1]
                overflow-hidden
              "
            >
              <Image
                src={featureImage}
                alt=""
                fill
                sizes="315px"
                className="
                  object-cover
                  transition-transform
                  duration-700
                  group-hover:scale-[1.04]
                "
              />

              <div className="absolute inset-0 bg-black/10" />

              <div
                className="
                  absolute
                  inset-x-0
                  bottom-0
                  flex
                  items-center
                  justify-between
                  bg-gradient-to-t
                  from-black/60
                  to-transparent
                  px-3
                  pb-3
                  pt-10
                "
              >
                <span
                  className="
                    max-w-[170px]
                    text-[8px]
                    font-medium
                    uppercase
                    leading-[1.3]
                    tracking-[0.1em]
                    text-white
                  "
                >
                  {featureTitle}
                </span>

                <ArrowRight
                  size={13}
                  strokeWidth={1.5}
                  className="
                    shrink-0
                    text-white
                    transition-transform
                    duration-300
                    group-hover:translate-x-1
                  "
                />
              </div>
            </Link>
          </motion.div>
        )}

        {/* ========================================================== */}
        {/* MAIN EDITORIAL COPY                                        */}
        {/* ========================================================== */}

        <motion.div
          initial={
            reduceMotion
              ? false
              : {
                  opacity: 0,
                  y: 24,
                }
          }
          animate={{
            opacity: 1,
            y: 0,
          }}
          transition={{
            ...transition,
            delay: reduceMotion ? 0 : 0.06,
          }}
          className="
            absolute
            bottom-10
            left-5
            z-30
            w-[calc(100%-40px)]

            sm:bottom-12
            sm:left-8
            sm:max-w-[680px]

            lg:bottom-[10%]
            lg:left-[3.5vw]
            lg:max-w-[850px]
          "
        >
          {/* META */}

          <div className="mb-5 flex items-center gap-3">
            <span
              className="
                text-[8px]
                font-semibold
                uppercase
                tracking-[0.16em]
                text-white/75

                sm:text-[9px]
              "
            >
              {meta}
            </span>

            <span className="h-px w-10 bg-white/40" />

            <span
              className="
                text-[8px]
                uppercase
                tracking-[0.14em]
                text-white/55

                sm:text-[9px]
              "
            >
              Collection {index}
            </span>
          </div>

          {/* TITLE */}

          <h1
            className="
              max-w-[850px]
              text-balance
              text-[46px]
              font-medium
              leading-[0.94]
              tracking-[-0.055em]

              sm:text-[62px]

              lg:text-[clamp(64px,6vw,100px)]
            "
          >
            {title}
          </h1>

          {/* SUPPORTING COPY */}

          {body && (
            <div
              className="
                mt-6
                flex
                flex-col
                gap-5

                sm:flex-row
                sm:items-end
                sm:gap-10
              "
            >
              <p
                className="
                  max-w-[430px]
                  text-[11px]
                  leading-[1.65]
                  text-white/75

                  sm:text-[12px]
                "
              >
                {body}
              </p>

              <Link
                href="#shop-collection"
                className="
                  group
                  inline-flex
                  w-fit
                  items-center
                  gap-3
                  border-b
                  border-white/65
                  pb-1.5
                  text-[8px]
                  font-semibold
                  uppercase
                  tracking-[0.14em]
                  text-white

                  sm:text-[9px]
                "
              >
                Explore collection

                <ArrowRight
                  size={12}
                  strokeWidth={1.5}
                  className="
                    transition-transform
                    duration-300
                    group-hover:translate-x-1
                  "
                />
              </Link>
            </div>
          )}
        </motion.div>

        {/* ========================================================== */}
        {/* BOTTOM RIGHT MICRO LABEL                                   */}
        {/* ========================================================== */}

        <div
          className="
            absolute
            bottom-5
            right-5
            z-30
            hidden
            items-center
            gap-3
            text-[8px]
            uppercase
            tracking-[0.14em]
            text-white/45

            md:flex

            lg:bottom-[4%]
            lg:right-[3.5vw]
          "
        >
          <span>
            Objects
          </span>

          <span className="size-1 rounded-full bg-white/35" />

          <span>
            Materials
          </span>

          <span className="size-1 rounded-full bg-white/35" />

          <span>
            Atmosphere
          </span>
        </div>
      </div>
    </section>
  );
}
