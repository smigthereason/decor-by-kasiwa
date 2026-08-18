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
import { Logo } from "../../public/index";

const slides = [
  {
    label: "Studio collection",
    meta: "2026",
    statement: "Transforming spaces into places that feel like you.",
    supporting:
      "Design, furnishings and thoughtful details brought together as one complete interior.",
    portrait:
      "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=90",
    accent:
      "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1000&q=90",
    detail:
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1000&q=90",
    wide:
      "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1600&q=90",
  },
  {
    label: "Residential edit",
    meta: "Nairobi",
    statement: "Warm materials. Quiet detail. Spaces designed around living.",
    supporting:
      "A considered balance of furniture, light, texture and personal objects.",
    portrait:
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=90",
    accent:
      "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1000&q=90",
    detail:
      "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1000&q=90",
    wide:
      "https://images.unsplash.com/photo-1617104678098-de229db51175?auto=format&fit=crop&w=1600&q=90",
  },
  {
    label: "Hospitality edit",
    meta: "2026",
    statement: "Interiors that stay with you long after you leave.",
    supporting:
      "Hospitality environments shaped around comfort, atmosphere and memorable detail.",
    portrait:
      "https://images.unsplash.com/photo-1600566753051-f0b89df2dd90?auto=format&fit=crop&w=1200&q=90",
    accent:
      "https://images.unsplash.com/photo-1600210491369-e753d80a41f3?auto=format&fit=crop&w=1000&q=90",
    detail:
      "https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=1000&q=90",
    wide:
      "https://images.unsplash.com/photo-1600566753104-685f4f24cb4d?auto=format&fit=crop&w=1600&q=90",
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
    setActive((current) => (current - 1 + slides.length) % slides.length);
  }, []);

  useEffect(() => {
    if (paused) return;

    const interval = window.setInterval(goNext, SLIDE_INTERVAL);
    return () => window.clearInterval(interval);
  }, [goNext, paused]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") goNext();
      if (event.key === "ArrowLeft") goPrevious();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrevious]);

  const slide = slides[active];

  const imageTransition = reduceMotion
    ? { duration: 0 }
    : {
        duration: 0.65,
        ease: [0.22, 1, 0.36, 1] as const,
      };

  const copyTransition = reduceMotion
    ? { duration: 0 }
    : {
        duration: 0.45,
        ease: [0.22, 1, 0.36, 1] as const,
      };

  return (
    <section
      className="relative w-full overflow-hidden border-b hairline bg-[var(--paper)]"
      aria-roledescription="carousel"
      aria-label="Decor by Kasiwa featured interiors"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/*
        IMPORTANT:
        The hero canvas has a fixed responsive height.
        Individual image SLOT sizes also stay fixed across every slide.
        Only the image INSIDE each slot changes.
        This prevents the layout jumping when Previous / Next is clicked.
      */}
      <div className="relative h-[760px] w-full sm:h-[820px] lg:h-[clamp(760px,82vh,940px)]">
        {/* ---------------------------------------------------------------- */}
        {/* TOP STATEMENT                                                    */}
        {/* ---------------------------------------------------------------- */}
        <div className="absolute left-1/2 top-8 z-30 w-[min(92%,620px)] -translate-x-1/2 text-center sm:top-10 lg:top-12">
          <div className="relative min-h-[72px] sm:min-h-[82px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={`statement-${active}`}
                className="absolute inset-x-0 top-0"
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                transition={copyTransition}
              >
                <p className="mx-auto max-w-[560px] text-balance text-[11px] font-semibold uppercase leading-[1.2] tracking-[-0.01em] text-[var(--ink)] sm:text-[12px] lg:text-[13px]">
                  {slide.statement}
                </p>

                <Link
                  href="/about"
                  className="focus-ring mt-3 inline-flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.08em] text-[var(--muted)] underline decoration-[var(--ink)]/30 underline-offset-4 transition-colors hover:text-[var(--ink)]"
                >
                  Discover the studio
                </Link>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* TOP LEFT EDITORIAL CARD                                          */}
        {/* fixed viewport: image crop changes, card never changes size      */}
        {/* ---------------------------------------------------------------- */}
        <div className="absolute left-5 top-[126px] z-20 hidden w-[176px] sm:block lg:left-[4.5vw] lg:top-[150px] lg:w-[196px] xl:w-[220px]">
          <div className="relative h-[104px] w-full overflow-hidden bg-[var(--paper-2)] lg:h-[118px] xl:h-[128px]">
            <AnimatePresence initial={false}>
              <motion.div
                key={`accent-${active}`}
                className="absolute inset-0"
                initial={reduceMotion ? false : { opacity: 0, scale: 1.04 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={imageTransition}
              >
                <Image
                  src={slide.accent}
                  alt=""
                  fill
                  sizes="220px"
                  className="object-cover"
                />
              </motion.div>
            </AnimatePresence>

            <div className="absolute inset-0 bg-black/5" />
            <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-3 text-white">
              <span className="max-w-[105px] text-[8px] font-semibold uppercase leading-[1.15] tracking-[0.06em]">
                Thoughtful details for considered living
              </span>
              <ArrowUpRight size={13} strokeWidth={1.5} />
            </div>
          </div>

          <Link
            href="/services"
            className="focus-ring mt-2 inline-flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.12em]"
          >
            Our approach
            <ArrowRight size={10} strokeWidth={1.5} />
          </Link>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* COLLECTION LABEL                                                 */}
        {/* ---------------------------------------------------------------- */}
        <div className="absolute left-1/2 top-[215px] z-20 -translate-x-1/2 sm:top-[238px] lg:top-[26%]">
          <div className="flex min-h-[18px] items-center justify-center gap-3 whitespace-nowrap">
            <AnimatePresence mode="wait">
              <motion.div
                key={`meta-${active}`}
                className="absolute flex items-center gap-3"
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={copyTransition}
              >
                <span className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[var(--ink)] sm:text-[9px]">
                  {slide.label}
                </span>
                <span className="h-px w-5 bg-[var(--ink)]/25" />
                <span className="text-[8px] uppercase tracking-[0.11em] text-[var(--muted)] sm:text-[9px]">
                  {slide.meta}
                </span>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* CENTRAL BRAND MARK                                               */}
        {/* Same logo and same box on every slide = zero horizontal jump     */}
        {/* ---------------------------------------------------------------- */}
        <div className="absolute left-1/2 top-[255px] z-10 flex h-[132px] w-[88vw] -translate-x-1/2 items-center justify-center sm:top-[280px] sm:h-[155px] sm:w-[76vw] lg:top-[31%] lg:h-[clamp(150px,18vh,205px)] lg:w-[58vw] xl:w-[54vw]">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: reduceMotion ? 0 : 0.65,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="relative flex h-full w-full items-center justify-center"
          >
            <Image
              src={Logo}
              alt="Decor by Kasiwa"
              width={1200}
              height={420}
              priority
              className="max-h-full w-full object-contain"
            />
          </motion.div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* LEFT PORTRAIT SLOT                                               */}
        {/* ---------------------------------------------------------------- */}
        <div className="absolute left-5 top-[410px] z-10 h-[212px] w-[142px] overflow-hidden bg-[var(--paper-2)] sm:left-[12vw] sm:top-[455px] sm:h-[252px] sm:w-[172px] lg:left-[15vw] lg:top-[56%] lg:h-[clamp(235px,27vh,300px)] lg:w-[clamp(160px,12vw,205px)]">
          <AnimatePresence initial={false}>
            <motion.div
              key={`portrait-${active}`}
              className="absolute inset-0"
              initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 1.025 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={imageTransition}
            >
              <Image
                src={slide.portrait}
                alt={`${slide.label} interior`}
                fill
                sizes="(max-width: 640px) 142px, (max-width: 1024px) 172px, 205px"
                className="object-cover"
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* SUPPORTING COPY SLOT                                             */}
        {/* fixed min height means different sentence lengths do not shift   */}
        {/* ---------------------------------------------------------------- */}
        <div className="absolute left-1/2 top-[468px] z-20 w-[190px] -translate-x-1/2 sm:top-[514px] sm:w-[230px] lg:top-[61%] lg:w-[250px]">
          <div className="relative min-h-[112px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={`supporting-${active}`}
                className="absolute inset-x-0 top-0"
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={copyTransition}
              >
                <p className="text-[9px] font-semibold uppercase leading-[1.2] tracking-[0.015em] text-[var(--ink)] sm:text-[10px]">
                  {slide.supporting}
                </p>

                <Link
                  href="/services"
                  className="focus-ring group mt-7 inline-flex items-center gap-2 border-b border-[var(--ink)] pb-1 text-[8px] font-semibold uppercase tracking-[0.12em] sm:text-[9px]"
                >
                  Get inspired
                  <ArrowRight
                    size={11}
                    strokeWidth={1.5}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* RIGHT DETAIL SLOT                                                */}
        {/* ---------------------------------------------------------------- */}
        <div className="absolute right-[26vw] top-[542px] z-20 hidden h-[78px] w-[88px] overflow-hidden bg-[var(--paper-2)] sm:block lg:right-[25vw] lg:top-[69%] lg:h-[92px] lg:w-[104px]">
          <AnimatePresence initial={false}>
            <motion.div
              key={`detail-${active}`}
              className="absolute inset-0"
              initial={reduceMotion ? false : { opacity: 0, scale: 1.05 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={imageTransition}
            >
              <Image
                src={slide.detail}
                alt=""
                fill
                sizes="104px"
                className="object-cover"
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* RIGHT WIDE SLOT                                                  */}
        {/* ---------------------------------------------------------------- */}
        <div className="absolute right-5 top-[495px] z-10 h-[142px] w-[190px] overflow-hidden bg-[var(--paper-2)] sm:right-[7vw] sm:top-[506px] sm:h-[164px] sm:w-[238px] lg:right-[5vw] lg:top-[63%] lg:h-[clamp(155px,19vh,205px)] lg:w-[clamp(250px,19vw,340px)]">
          <AnimatePresence initial={false}>
            <motion.div
              key={`wide-${active}`}
              className="absolute inset-0"
              initial={reduceMotion ? false : { opacity: 0, x: 10, scale: 1.025 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={imageTransition}
            >
              <Image
                src={slide.wide}
                alt={`${slide.label} project by Decor by Kasiwa`}
                fill
                sizes="(max-width: 640px) 190px, (max-width: 1024px) 238px, 340px"
                className="object-cover"
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* SIDE NAVIGATION                                                  */}
        {/* ---------------------------------------------------------------- */}
        <button
          type="button"
          onClick={goPrevious}
          aria-label="Previous hero slide"
          className="focus-ring absolute left-4 top-1/2 z-40 hidden -translate-y-1/2 items-center gap-2 rounded-full border border-[var(--ink)]/20 bg-[var(--paper)]/80 px-3 py-2 text-[8px] font-semibold uppercase tracking-[0.08em] backdrop-blur-sm transition-colors hover:border-[var(--ink)] md:inline-flex lg:left-[2.2vw]"
        >
          <ArrowLeft size={11} strokeWidth={1.5} />
          Prev
        </button>

        <button
          type="button"
          onClick={goNext}
          aria-label="Next hero slide"
          className="focus-ring absolute right-4 top-1/2 z-40 hidden -translate-y-1/2 items-center gap-2 rounded-full border border-[var(--ink)]/20 bg-[var(--paper)]/80 px-3 py-2 text-[8px] font-semibold uppercase tracking-[0.08em] backdrop-blur-sm transition-colors hover:border-[var(--ink)] md:inline-flex lg:right-[2.2vw]"
        >
          Next
          <ArrowRight size={11} strokeWidth={1.5} />
        </button>

        {/* ---------------------------------------------------------------- */}
        {/* SLIDE INDICATORS                                                 */}
        {/* ---------------------------------------------------------------- */}
        <div
          className="absolute bottom-6 left-5 z-40 flex items-center gap-2 sm:bottom-8 sm:left-[4.5vw] lg:bottom-[7%] lg:flex-col"
          role="tablist"
          aria-label="Choose featured project"
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
                className="focus-ring grid size-4 place-items-center"
              >
                <span
                  className={[
                    "block rounded-full transition-all duration-300",
                    selected
                      ? "size-2 bg-[var(--ink)]"
                      : "size-1.5 bg-[var(--ink)]/20 hover:bg-[var(--ink)]/45",
                  ].join(" ")}
                />
              </button>
            );
          })}
        </div>

        {/* slide count */}
        <div className="absolute bottom-7 right-5 z-40 text-[8px] font-medium uppercase tracking-[0.14em] text-[var(--muted)] sm:bottom-9 sm:right-[4.5vw] lg:bottom-[7%]">
          {String(active + 1).padStart(2, "0")}
          <span className="mx-1.5 text-[var(--ink)]/25">/</span>
          {String(slides.length).padStart(2, "0")}
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* MOBILE NAVIGATION                                                */}
        {/* ---------------------------------------------------------------- */}
        <div className="absolute bottom-16 left-1/2 z-40 flex -translate-x-1/2 gap-2 md:hidden">
          <button
            type="button"
            onClick={goPrevious}
            aria-label="Previous hero slide"
            className="focus-ring grid size-10 place-items-center rounded-full border border-[var(--ink)]/20 bg-[var(--paper)]"
          >
            <ArrowLeft size={14} strokeWidth={1.5} />
          </button>

          <button
            type="button"
            onClick={goNext}
            aria-label="Next hero slide"
            className="focus-ring grid size-10 place-items-center rounded-full border border-[var(--ink)]/20 bg-[var(--paper)]"
          >
            <ArrowRight size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </section>
  );
}
