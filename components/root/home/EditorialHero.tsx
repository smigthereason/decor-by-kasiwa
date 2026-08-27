"use client";

import Image from "next/image";
import Link from "next/link";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { Logo } from "../../../public/index";

const slides = [
  {
    label: "Studio Collection",
    meta: "01",
    eyebrow: "Curated interiors for considered living",
    title: "Beautiful Homes Start Right Here",
    description:
      "Curated home décor, furniture and thoughtful interior pieces designed to elevate the way you live.",
    image:
      "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=2200&q=95",
    featureImage:
      "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=900&q=90",
  },
  {
    label: "Residential Edit",
    meta: "02",
    eyebrow: "Spaces shaped around real everyday living",
    title: "Interiors Made To Feel Like Home",
    description:
      "Warm materials, natural textures and considered objects come together to create spaces that feel personal.",
    image:
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=2200&q=95",
    featureImage:
      "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=900&q=90",
  },
  {
    label: "Hospitality Edit",
    meta: "03",
    eyebrow: "Atmosphere, comfort and memorable detail",
    title: "Designed To Leave An Impression",
    description:
      "Thoughtful hospitality interiors designed around atmosphere, comfort and experiences people remember.",
    image:
      "https://images.unsplash.com/photo-1600566753051-f0b89df2dd90?auto=format&fit=crop&w=2200&q=95",
    featureImage:
      "https://images.unsplash.com/photo-1600210491369-e753d80a41f3?auto=format&fit=crop&w=900&q=90",
  },
];

const SLIDE_INTERVAL = 8500;

export default function EditorialHero() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const reduceMotion = useReducedMotion();

  const goNext = useCallback(() => {
    setActive((current) => (current + 1) % slides.length);
  }, []);

  const goPrevious = useCallback(() => {
    setActive(
      (current) => (current - 1 + slides.length) % slides.length
    );
  }, []);

  useEffect(() => {
    if (paused) return;

    const interval = window.setInterval(goNext, SLIDE_INTERVAL);

    return () => window.clearInterval(interval);
  }, [goNext, paused]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        goNext();
      }

      if (event.key === "ArrowLeft") {
        goPrevious();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [goNext, goPrevious]);

  const slide = slides[active];

  const transition = reduceMotion
    ? { duration: 0 }
    : {
        duration: 0.8,
        ease: [0.22, 1, 0.36, 1] as const,
      };

  return (
    <section
      className="relative isolate w-full overflow-hidden bg-[var(--deep-green)]"
      aria-roledescription="carousel"
      aria-label="Decor by Kasiwa featured interiors"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/*
        ==============================================================
        HERO CANVAS
        ==============================================================
      */}
      <div className="relative min-h-[720px] w-full sm:min-h-[780px] lg:h-[calc(100svh-72px)] lg:min-h-[720px] lg:max-h-[980px]">

        {/*
          ============================================================
          FULL BLEED BACKGROUND
          ============================================================
        */}
        <AnimatePresence initial={false}>
          <motion.div
            key={`background-${active}`}
            className="absolute inset-0"
            initial={
              reduceMotion
                ? false
                : {
                    opacity: 0,
                    scale: 1.04,
                  }
            }
            animate={{
              opacity: 1,
              scale: 1,
            }}
            exit={{
              opacity: 0,
            }}
            transition={transition}
          >
            <Image
              src={slide.image}
              alt={`${slide.label} interior`}
              fill
              unoptimized
              priority={active === 0}
              sizes="100vw"
              className="object-cover"
            />
          </motion.div>
        </AnimatePresence>

        {/*
          ============================================================
          IMAGE TREATMENT
          ============================================================
        */}
        <div className="absolute inset-0 bg-charcoal/10" />

        <div className="absolute inset-0 bg-gradient-to-r from-charcoal/45 via-charcoal/5 to-charcoal/10" />

        <div className="absolute inset-0 bg-gradient-to-t from-charcoal/65 via-transparent to-charcoal/15" />


        {/*
          ============================================================
          TOP EDITORIAL ROW
          ============================================================
        */}
        <div className="absolute inset-x-0 top-0 z-30 flex items-start justify-between px-5 pt-6 text-soft-cream sm:px-8 sm:pt-8 lg:px-[3.5vw] lg:pt-10">

          <AnimatePresence mode="wait">
            <motion.div
              key={`eyebrow-${active}`}
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
              exit={{
                opacity: 0,
                y: -5,
              }}
              transition={transition}
              className="max-w-[250px] sm:max-w-[320px]"
            >
              <p className="text-[10px] font-medium uppercase leading-[1.4] tracking-[0.08em] text-soft-cream/85 sm:text-[11px]">
                {slide.eyebrow}
              </p>
            </motion.div>
          </AnimatePresence>

          <div className="hidden items-center gap-3 sm:flex">
            <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-soft-cream/65">
              Decor by Kasiwa
            </span>

            <span className="h-px w-8 bg-soft-cream/40" />

            <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-soft-cream">
              {slide.meta}
            </span>
          </div>
        </div>


        {/*
          ============================================================
          CENTER LOGO
          Keeps your existing main Decor by Kasiwa logo
          ============================================================
        */}
        <motion.div
          initial={
            reduceMotion
              ? false
              : {
                  opacity: 0,
                  y: -10,
                }
          }
          animate={{
            opacity: 1,
            y: 0,
          }}
          transition={{
            duration: reduceMotion ? 0 : 0.7,
            delay: reduceMotion ? 0 : 0.15,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="
            absolute
            left-1/2
            top-[88px]
            z-30
            w-[160px]
            -translate-x-1/2
            sm:top-[85px]
            sm:w-[190px]
            lg:top-[30%]
            lg:w-[500px]
          "
        >
          <Image
            src={Logo}
            alt="Decor by Kasiwa"
            width={900}
            height={300}
            priority
            className="h-auto w-full object-contain brightness-0 invert hidden"
          />
        </motion.div>


        {/*
          ============================================================
          RIGHT FLOATING EDITORIAL FEATURE
          ============================================================
        */}
        <div
          className="
            absolute
            right-5
            top-[185px]
            z-30
            hidden
            w-[250px]
            border
            border-soft-cream/25
            bg-charcoal/15
            p-1.5
            backdrop-blur-[3px]
            sm:block
            lg:right-[3.5vw]
            lg:top-[24%]
            lg:w-[290px]
            xl:w-[320px]
          "
        >
          <div className="flex items-center justify-between px-2.5 py-2">
            <div>
              <p className="text-[8px] uppercase tracking-[0.15em] text-soft-cream/60">
                Featured
              </p>

              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.04em] text-soft-cream">
                The Kasiwa Edit
              </p>
            </div>

            <Link
              href="/shop"
              aria-label="Explore the featured collection"
              className="grid size-8 place-items-center rounded-full bg-soft-cream text-charcoal transition-transform duration-300 hover:rotate-45"
            >
              <ArrowUpRight
                size={14}
                strokeWidth={1.5}
              />
            </Link>
          </div>

          <Link
            href="/shop"
            className="group relative block aspect-[1.5/1] overflow-hidden"
          >
            <AnimatePresence initial={false}>
              <motion.div
                key={`feature-${active}`}
                className="absolute inset-0"
                initial={
                  reduceMotion
                    ? false
                    : {
                        opacity: 0,
                        scale: 1.04,
                      }
                }
                animate={{
                  opacity: 1,
                  scale: 1,
                }}
                exit={{
                  opacity: 0,
                }}
                transition={transition}
              >
                <Image
                  src={slide.featureImage}
                  alt={`${slide.label} curated detail`}
                  fill
                  sizes="320px"
                  className="object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                />
              </motion.div>
            </AnimatePresence>

            <div className="absolute inset-0 bg-charcoal/5" />

            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-charcoal/50 to-transparent px-3 pb-3 pt-10">
              <span className="text-[8px] font-medium uppercase tracking-[0.1em] text-soft-cream">
                Explore collection
              </span>

              <ArrowRight
                size={13}
                strokeWidth={1.5}
                className="text-soft-cream transition-transform duration-300 group-hover:translate-x-1"
              />
            </div>
          </Link>
        </div>


        {/*
          ============================================================
          LARGE EDITORIAL HEADLINE
          ============================================================
        */}
        <div
          className="
            absolute
            bottom-[100px]
            left-5
            z-30
            w-[calc(100%-40px)]
            text-soft-cream
            sm:bottom-[105px]
            sm:left-8
            sm:max-w-[680px]
            lg:bottom-[8%]
            lg:left-[3.5vw]
            lg:max-w-[840px]
          "
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={`copy-${active}`}
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
              exit={{
                opacity: 0,
                y: -14,
              }}
              transition={transition}
            >
              <div className="mb-5 flex items-center gap-3">
                <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-soft-cream/75">
                  {slide.label}
                </span>

                <span className="h-px w-10 bg-soft-cream/40" />

                <span className="text-[9px] uppercase tracking-[0.14em] text-soft-cream/60">
                  Interior Collection
                </span>
              </div>

              <h1
                className="
                  max-w-[850px]
                  text-[48px]
                  font-medium
                  leading-[0.94]
                  tracking-[-0.055em]
                  sm:text-[64px]
                  lg:text-[clamp(66px,6.4vw,108px)]
                "
              >
                {slide.title}
              </h1>

              <div className="mt-7 flex flex-col gap-6 sm:flex-row sm:items-end sm:gap-10">
                <p className="max-w-[390px] text-[11px] leading-[1.55] text-soft-cream/80 sm:text-[12px]">
                  {slide.description}
                </p>

                <Link
                  href="/shop"
                  className="
                    group
                    inline-flex
                    w-fit
                    items-center
                    gap-3
                    border-b
                    border-soft-cream/70
                    pb-1.5
                    text-[9px]
                    font-semibold
                    uppercase
                    tracking-[0.14em]
                    text-soft-cream
                  "
                >
                  Shop the collection

                  <ArrowRight
                    size={12}
                    strokeWidth={1.5}
                    className="transition-transform duration-300 group-hover:translate-x-1"
                  />
                </Link>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>


        {/*
          ============================================================
          CAROUSEL NAVIGATION
          ============================================================
        */}
        <div
          className="
            absolute
            bottom-6
            right-5
            z-40
            flex
            items-center
            gap-2
            sm:bottom-8
            sm:right-8
            lg:bottom-[8%]
            lg:right-[3.5vw]
          "
        >
          <button
            type="button"
            onClick={goPrevious}
            aria-label="Previous hero slide"
            className="
              grid
              size-11
              place-items-center
              rounded-full
              border
              border-soft-cream/35
              bg-charcoal/10
              text-soft-cream
              backdrop-blur-md
              transition
              duration-300
              hover:bg-soft-cream
              hover:text-charcoal
            "
          >
            <ArrowLeft
              size={15}
              strokeWidth={1.4}
            />
          </button>

          <button
            type="button"
            onClick={goNext}
            aria-label="Next hero slide"
            className="
              grid
              size-11
              place-items-center
              rounded-full
              border
              border-soft-cream/35
              bg-charcoal/10
              text-soft-cream
              backdrop-blur-md
              transition
              duration-300
              hover:bg-soft-cream
              hover:text-charcoal
            "
          >
            <ArrowRight
              size={15}
              strokeWidth={1.4}
            />
          </button>
        </div>


        {/*
          ============================================================
          CAROUSEL PROGRESS / DOTS
          ============================================================
        */}
        <div
          className="
            absolute
            bottom-7
            left-5
            z-40
            hidden
            items-center
            gap-3
            text-soft-cream
            sm:left-8
            md:flex
            lg:left-auto
            lg:right-[3.5vw]
            lg:top-[calc(24%+335px)]
            lg:bottom-auto
          "
          role="tablist"
          aria-label="Choose featured interior"
        >
          {slides.map((item, index) => {
            const selected = index === active;

            return (
              <button
                key={item.label}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-label={`Show ${item.label}`}
                onClick={() => setActive(index)}
                className="group flex items-center gap-2"
              >
                <span
                  className={[
                    "block h-px transition-all duration-500",
                    selected
                      ? "w-10 bg-soft-cream"
                      : "w-4 bg-soft-cream/35 group-hover:bg-soft-cream/70",
                  ].join(" ")}
                />

                {selected && (
                  <span className="text-[8px] font-medium tracking-[0.15em] text-soft-cream">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                )}
              </button>
            );
          })}
        </div>


        {/*
          ============================================================
          DESKTOP SIDE INDEX
          ============================================================
        */}
        <div className="absolute bottom-[8.5%] right-[145px] z-30 hidden items-center gap-2 text-soft-cream/60 lg:flex">
          <span className="text-[9px] font-semibold tracking-[0.15em] text-soft-cream">
            {String(active + 1).padStart(2, "0")}
          </span>

          <span className="h-px w-7 bg-soft-cream/40" />

          <span className="text-[9px] tracking-[0.15em]">
            {String(slides.length).padStart(2, "0")}
          </span>
        </div>
      </div>
    </section>
  );
}
