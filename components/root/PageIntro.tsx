"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ArrowUpRight } from "lucide-react";

type PageIntroProps = {
  eyebrow: string;
  title: string;
  body?: string;

  image: string;
  featureImage?: string;

  index?: string;
  meta?: string;

  featureLabel?: string;
  featureTitle?: string;

  ctaLabel?: string;
  ctaHref?: string;
  featureHref?: string;
};

export default function PageIntro({
  eyebrow,
  title,
  body,
  image,
  featureImage,
  index = "01",
  meta = "Decor by Kasiwa",
  featureLabel = "The Kasiwa Edit",
  featureTitle = "Explore the story",
  ctaLabel,
  ctaHref,
  featureHref,
}: PageIntroProps) {
  const reduceMotion = useReducedMotion();

  const transition = reduceMotion
    ? { duration: 0 }
    : {
        duration: 0.75,
        ease: [0.22, 1, 0.36, 1] as const,
      };

  const resolvedFeatureHref = featureHref ?? ctaHref;

  return (
    <section
      className="relative isolate w-full overflow-hidden bg-[var(--deep-green)] text-soft-cream"
      aria-label={`${eyebrow}: ${title}`}
    >
      <div className="relative min-h-[560px] w-full sm:min-h-[620px] lg:h-[clamp(620px,72vh,820px)]">
        {/* BACKGROUND IMAGE */}
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
            unoptimized
            priority
            sizes="100vw"
            className="object-cover"
          />
        </motion.div>

        {/* IMAGE TREATMENT */}
        <div className="absolute inset-0 bg-charcoal/15" />
        <div className="absolute inset-0 bg-gradient-to-r from-charcoal/65 via-charcoal/20 to-charcoal/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-charcoal/75 via-transparent to-charcoal/20" />

        {/* TOP META */}
        <div className="absolute inset-x-0 top-0 z-30 flex items-start justify-between px-5 pt-6 sm:px-8 sm:pt-8 lg:px-[3.5vw] lg:pt-9">
          <motion.p
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
            className="max-w-[300px] text-[9px] font-semibold uppercase leading-[1.35] tracking-[0.14em] text-soft-cream/80 sm:text-[10px]"
          >
            {eyebrow}
          </motion.p>

          <div className="flex items-center gap-3 text-[8px] font-medium uppercase tracking-[0.15em] text-soft-cream/60 sm:text-[9px]">
            <span className="hidden sm:inline">{meta}</span>
            <span className="hidden h-px w-8 bg-soft-cream/35 sm:block" />
            <span className="text-soft-cream">{index}</span>
          </div>
        </div>

        {/* FEATURE CARD */}
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
            className="absolute right-5 top-[105px] z-30 hidden w-[230px] border border-soft-cream/25 bg-charcoal/15 p-1.5 backdrop-blur-[3px] sm:block sm:right-8 sm:w-[250px] lg:right-[3.5vw] lg:top-[21%] lg:w-[290px] xl:w-[315px]"
          >
            <div className="flex items-center justify-between px-2.5 py-2">
              <div>
                <p className="text-[7px] uppercase tracking-[0.15em] text-soft-cream/50 sm:text-[8px]">
                  {featureLabel}
                </p>
                <p className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.04em] text-soft-cream sm:text-[10px]">
                  Decor by Kasiwa
                </p>
              </div>

              {resolvedFeatureHref && (
                <Link
                  href={resolvedFeatureHref}
                  aria-label={featureTitle}
                  className="grid size-8 place-items-center rounded-full bg-soft-cream text-charcoal transition-transform duration-300 hover:rotate-45"
                >
                  <ArrowUpRight size={14} strokeWidth={1.5} />
                </Link>
              )}
            </div>

            {resolvedFeatureHref ? (
              <Link
                href={resolvedFeatureHref}
                className="group relative block aspect-[1.55/1] overflow-hidden"
              >
                <Image
                  src={featureImage}
                  alt=""
                  fill
                  sizes="315px"
                  className="object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                />
                <div className="absolute inset-0 bg-charcoal/10" />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-charcoal/60 to-transparent px-3 pb-3 pt-10">
                  <span className="max-w-[175px] text-[8px] font-medium uppercase leading-[1.3] tracking-[0.1em] text-soft-cream">
                    {featureTitle}
                  </span>
                  <ArrowRight
                    size={13}
                    strokeWidth={1.5}
                    className="shrink-0 text-soft-cream transition-transform duration-300 group-hover:translate-x-1"
                  />
                </div>
              </Link>
            ) : (
              <div className="relative aspect-[1.55/1] overflow-hidden">
                <Image
                  src={featureImage}
                  alt=""
                  fill
                  sizes="315px"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-charcoal/10" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-charcoal/60 to-transparent px-3 pb-3 pt-10">
                  <span className="text-[8px] font-medium uppercase leading-[1.3] tracking-[0.1em] text-soft-cream">
                    {featureTitle}
                  </span>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* MAIN COPY */}
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
          className="absolute bottom-10 left-5 z-30 w-[calc(100%-40px)] sm:bottom-12 sm:left-8 sm:max-w-[680px] lg:bottom-[10%] lg:left-[3.5vw] lg:max-w-[850px]"
        >
          <div className="mb-5 flex items-center gap-3">
            <span className="text-[8px] font-semibold uppercase tracking-[0.16em] text-soft-cream/75 sm:text-[12px]">
              {meta}
            </span>
            <span className="h-px w-10 bg-soft-cream/40" />
            <span className="text-[8px] uppercase tracking-[0.14em] text-soft-cream/55 sm:text-[12px]">
              {index}
            </span>
          </div>

          <h1 className="max-w-[850px] text-balance text-[46px] font-medium leading-[0.94] tracking-[-0.055em] sm:text-[62px] lg:text-[clamp(64px,6vw,100px)]">
            {title}
          </h1>

          {(body || (ctaLabel && ctaHref)) && (
            <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:gap-10">
              {body && (
                <p className="max-w-[430px] text-[11px] leading-[1.65] text-soft-cream/75 sm:text-[14px]">
                  {body}
                </p>
              )}

              {ctaLabel && ctaHref && (
                <Link
                  href={ctaHref}
                  className="group inline-flex w-fit items-center gap-3 border-b border-soft-cream/65 pb-1.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-soft-cream sm:text-[11px]"
                >
                  {ctaLabel}
                  <ArrowRight
                    size={12}
                    strokeWidth={1.5}
                    className="transition-transform duration-300 group-hover:translate-x-1"
                  />
                </Link>
              )}
            </div>
          )}
        </motion.div>

        {/* MICRO META */}
        <div className="absolute bottom-5 right-5 z-30 hidden items-center gap-3 text-[10px] uppercase tracking-[0.14em] text-soft-cream/45 md:flex lg:bottom-[4%] lg:right-[3.5vw]">
          <span>Design</span>
          <span className="size-1 rounded-full bg-soft-cream/35" />
          <span>Detail</span>
          <span className="size-1 rounded-full bg-soft-cream/35" />
          <span>Transformation</span>
        </div>
      </div>
    </section>
  );
}
