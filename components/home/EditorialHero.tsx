// "use client";

// import Image from "next/image";
// import Link from "next/link";
// import {
//   AnimatePresence,
//   motion,
//   useReducedMotion,
// } from "framer-motion";
// import {
//   ArrowLeft,
//   ArrowRight,
//   ArrowUpRight,
// } from "lucide-react";
// import {
//   useCallback,
//   useEffect,
//   useState,
// } from "react";
// import { Logo } from "../../public/index";

// const slides = [
//   {
//     label: "Studio collection",
//     meta: "2026",
//     statement: "Transforming spaces into places that feel like you.",
//     supporting:
//       "Design, furnishings and thoughtful details brought together as one complete interior.",
//     portrait:
//       "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=90",
//     accent:
//       "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1000&q=90",
//     detail:
//       "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1000&q=90",
//     wide:
//       "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1600&q=90",
//   },
//   {
//     label: "Residential edit",
//     meta: "Nairobi",
//     statement: "Warm materials. Quiet detail. Spaces designed around living.",
//     supporting:
//       "A considered balance of furniture, light, texture and personal objects.",
//     portrait:
//       "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=90",
//     accent:
//       "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1000&q=90",
//     detail:
//       "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1000&q=90",
//     wide:
//       "https://images.unsplash.com/photo-1617104678098-de229db51175?auto=format&fit=crop&w=1600&q=90",
//   },
//   {
//     label: "Hospitality edit",
//     meta: "2026",
//     statement: "Interiors that stay with you long after you leave.",
//     supporting:
//       "Hospitality environments shaped around comfort, atmosphere and memorable detail.",
//     portrait:
//       "https://images.unsplash.com/photo-1600566753051-f0b89df2dd90?auto=format&fit=crop&w=1200&q=90",
//     accent:
//       "https://images.unsplash.com/photo-1600210491369-e753d80a41f3?auto=format&fit=crop&w=1000&q=90",
//     detail:
//       "https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=1000&q=90",
//     wide:
//       "https://images.unsplash.com/photo-1600566753104-685f4f24cb4d?auto=format&fit=crop&w=1600&q=90",
//   },
// ];

// const SLIDE_INTERVAL = 8500;

// export default function EditorialHero() {
//   const [active, setActive] = useState(0);
//   const [paused, setPaused] = useState(false);
//   const reduceMotion = useReducedMotion();

//   const goNext = useCallback(() => {
//     setActive((current) => (current + 1) % slides.length);
//   }, []);

//   const goPrevious = useCallback(() => {
//     setActive((current) => (current - 1 + slides.length) % slides.length);
//   }, []);

//   useEffect(() => {
//     if (paused) return;

//     const interval = window.setInterval(goNext, SLIDE_INTERVAL);
//     return () => window.clearInterval(interval);
//   }, [goNext, paused]);

//   useEffect(() => {
//     const handleKeyDown = (event: KeyboardEvent) => {
//       if (event.key === "ArrowRight") goNext();
//       if (event.key === "ArrowLeft") goPrevious();
//     };

//     window.addEventListener("keydown", handleKeyDown);
//     return () => window.removeEventListener("keydown", handleKeyDown);
//   }, [goNext, goPrevious]);

//   const slide = slides[active];

//   const imageTransition = reduceMotion
//     ? { duration: 0 }
//     : {
//         duration: 0.65,
//         ease: [0.22, 1, 0.36, 1] as const,
//       };

//   const copyTransition = reduceMotion
//     ? { duration: 0 }
//     : {
//         duration: 0.45,
//         ease: [0.22, 1, 0.36, 1] as const,
//       };

//   return (
//     <section
//       className="relative w-full overflow-hidden border-b hairline bg-[var(--paper)]"
//       aria-roledescription="carousel"
//       aria-label="Decor by Kasiwa featured interiors"
//       onMouseEnter={() => setPaused(true)}
//       onMouseLeave={() => setPaused(false)}
//     >
//       {/*
//         IMPORTANT:
//         The hero canvas has a fixed responsive height.
//         Individual image SLOT sizes also stay fixed across every slide.
//         Only the image INSIDE each slot changes.
//         This prevents the layout jumping when Previous / Next is clicked.
//       */}
//       <div className="relative h-[760px] w-full sm:h-[820px] lg:h-[clamp(760px,82vh,940px)]">
//         {/* ---------------------------------------------------------------- */}
//         {/* TOP STATEMENT                                                    */}
//         {/* ---------------------------------------------------------------- */}
//         <div className="absolute left-1/2 top-8 z-30 w-[min(92%,620px)] -translate-x-1/2 text-center sm:top-10 lg:top-12">
//           <div className="relative min-h-[72px] sm:min-h-[82px]">
//             <AnimatePresence mode="wait">
//               <motion.div
//                 key={`statement-${active}`}
//                 className="absolute inset-x-0 top-0"
//                 initial={reduceMotion ? false : { opacity: 0, y: 8 }}
//                 animate={{ opacity: 1, y: 0 }}
//                 exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
//                 transition={copyTransition}
//               >
//                 <p className="mx-auto max-w-[560px] text-balance text-[11px] font-semibold uppercase leading-[1.2] tracking-[-0.01em] text-[var(--ink)] sm:text-[12px] lg:text-[13px]">
//                   {slide.statement}
//                 </p>

//                 <Link
//                   href="/about"
//                   className="focus-ring mt-3 inline-flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.08em] text-[var(--muted)] underline decoration-[var(--ink)]/30 underline-offset-4 transition-colors hover:text-[var(--ink)]"
//                 >
//                   Discover the studio
//                 </Link>
//               </motion.div>
//             </AnimatePresence>
//           </div>
//         </div>

//         {/* ---------------------------------------------------------------- */}
//         {/* TOP LEFT EDITORIAL CARD                                          */}
//         {/* fixed viewport: image crop changes, card never changes size      */}
//         {/* ---------------------------------------------------------------- */}
//         <div className="absolute left-5 top-[126px] z-20 hidden w-[176px] sm:block lg:left-[4.5vw] lg:top-[150px] lg:w-[196px] xl:w-[220px]">
//           <div className="relative h-[104px] w-full overflow-hidden bg-[var(--paper-2)] lg:h-[118px] xl:h-[128px]">
//             <AnimatePresence initial={false}>
//               <motion.div
//                 key={`accent-${active}`}
//                 className="absolute inset-0"
//                 initial={reduceMotion ? false : { opacity: 0, scale: 1.04 }}
//                 animate={{ opacity: 1, scale: 1 }}
//                 exit={{ opacity: 0 }}
//                 transition={imageTransition}
//               >
//                 <Image
//                   src={slide.accent}
//                   alt=""
//                   fill
//                   sizes="220px"
//                   className="object-cover"
//                 />
//               </motion.div>
//             </AnimatePresence>

//             <div className="absolute inset-0 bg-black/5" />
//             <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-3 text-white">
//               <span className="max-w-[105px] text-[8px] font-semibold uppercase leading-[1.15] tracking-[0.06em]">
//                 Thoughtful details for considered living
//               </span>
//               <ArrowUpRight size={13} strokeWidth={1.5} />
//             </div>
//           </div>

//           <Link
//             href="/services"
//             className="focus-ring mt-2 inline-flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.12em]"
//           >
//             Our approach
//             <ArrowRight size={10} strokeWidth={1.5} />
//           </Link>
//         </div>

//         {/* ---------------------------------------------------------------- */}
//         {/* COLLECTION LABEL                                                 */}
//         {/* ---------------------------------------------------------------- */}
//         <div className="absolute left-1/2 top-[215px] z-20 -translate-x-1/2 sm:top-[238px] lg:top-[26%]">
//           <div className="flex min-h-[18px] items-center justify-center gap-3 whitespace-nowrap">
//             <AnimatePresence mode="wait">
//               <motion.div
//                 key={`meta-${active}`}
//                 className="absolute flex items-center gap-3"
//                 initial={reduceMotion ? false : { opacity: 0 }}
//                 animate={{ opacity: 1 }}
//                 exit={{ opacity: 0 }}
//                 transition={copyTransition}
//               >
//                 <span className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[var(--ink)] sm:text-[9px]">
//                   {slide.label}
//                 </span>
//                 <span className="h-px w-5 bg-[var(--ink)]/25" />
//                 <span className="text-[8px] uppercase tracking-[0.11em] text-[var(--muted)] sm:text-[9px]">
//                   {slide.meta}
//                 </span>
//               </motion.div>
//             </AnimatePresence>
//           </div>
//         </div>

//         {/* ---------------------------------------------------------------- */}
//         {/* CENTRAL BRAND MARK                                               */}
//         {/* Same logo and same box on every slide = zero horizontal jump     */}
//         {/* ---------------------------------------------------------------- */}
//         <div className="absolute left-1/2 top-[255px] z-10 flex h-[132px] w-[88vw] -translate-x-1/2 items-center justify-center sm:top-[280px] sm:h-[155px] sm:w-[76vw] lg:top-[31%] lg:h-[clamp(150px,18vh,205px)] lg:w-[58vw] xl:w-[54vw]">
//           <motion.div
//             initial={{ opacity: 0, y: 10 }}
//             animate={{ opacity: 1, y: 0 }}
//             transition={{
//               duration: reduceMotion ? 0 : 0.65,
//               ease: [0.22, 1, 0.36, 1],
//             }}
//             className="relative flex h-full w-full items-center justify-center"
//           >
//             <Image
//               src={Logo}
//               alt="Decor by Kasiwa"
//               width={1200}
//               height={420}
//               priority
//               className="max-h-full w-full object-contain"
//             />
//           </motion.div>
//         </div>

//         {/* ---------------------------------------------------------------- */}
//         {/* LEFT PORTRAIT SLOT                                               */}
//         {/* ---------------------------------------------------------------- */}
//         <div className="absolute left-5 top-[410px] z-10 h-[212px] w-[142px] overflow-hidden bg-[var(--paper-2)] sm:left-[12vw] sm:top-[455px] sm:h-[252px] sm:w-[172px] lg:left-[15vw] lg:top-[56%] lg:h-[clamp(235px,27vh,300px)] lg:w-[clamp(160px,12vw,205px)]">
//           <AnimatePresence initial={false}>
//             <motion.div
//               key={`portrait-${active}`}
//               className="absolute inset-0"
//               initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 1.025 }}
//               animate={{ opacity: 1, y: 0, scale: 1 }}
//               exit={{ opacity: 0 }}
//               transition={imageTransition}
//             >
//               <Image
//                 src={slide.portrait}
//                 alt={`${slide.label} interior`}
//                 fill
//                 sizes="(max-width: 640px) 142px, (max-width: 1024px) 172px, 205px"
//                 className="object-cover"
//               />
//             </motion.div>
//           </AnimatePresence>
//         </div>

//         {/* ---------------------------------------------------------------- */}
//         {/* SUPPORTING COPY SLOT                                             */}
//         {/* fixed min height means different sentence lengths do not shift   */}
//         {/* ---------------------------------------------------------------- */}
//         <div className="absolute left-1/2 top-[468px] z-20 w-[190px] -translate-x-1/2 sm:top-[514px] sm:w-[230px] lg:top-[61%] lg:w-[250px]">
//           <div className="relative min-h-[112px]">
//             <AnimatePresence mode="wait">
//               <motion.div
//                 key={`supporting-${active}`}
//                 className="absolute inset-x-0 top-0"
//                 initial={reduceMotion ? false : { opacity: 0, y: 10 }}
//                 animate={{ opacity: 1, y: 0 }}
//                 exit={{ opacity: 0 }}
//                 transition={copyTransition}
//               >
//                 <p className="text-[9px] font-semibold uppercase leading-[1.2] tracking-[0.015em] text-[var(--ink)] sm:text-[10px]">
//                   {slide.supporting}
//                 </p>

//                 <Link
//                   href="/services"
//                   className="focus-ring group mt-7 inline-flex items-center gap-2 border-b border-[var(--ink)] pb-1 text-[8px] font-semibold uppercase tracking-[0.12em] sm:text-[9px]"
//                 >
//                   Get inspired
//                   <ArrowRight
//                     size={11}
//                     strokeWidth={1.5}
//                     className="transition-transform group-hover:translate-x-0.5"
//                   />
//                 </Link>
//               </motion.div>
//             </AnimatePresence>
//           </div>
//         </div>

//         {/* ---------------------------------------------------------------- */}
//         {/* RIGHT DETAIL SLOT                                                */}
//         {/* ---------------------------------------------------------------- */}
//         <div className="absolute right-[26vw] top-[542px] z-20 hidden h-[78px] w-[88px] overflow-hidden bg-[var(--paper-2)] sm:block lg:right-[25vw] lg:top-[69%] lg:h-[92px] lg:w-[104px]">
//           <AnimatePresence initial={false}>
//             <motion.div
//               key={`detail-${active}`}
//               className="absolute inset-0"
//               initial={reduceMotion ? false : { opacity: 0, scale: 1.05 }}
//               animate={{ opacity: 1, scale: 1 }}
//               exit={{ opacity: 0 }}
//               transition={imageTransition}
//             >
//               <Image
//                 src={slide.detail}
//                 alt=""
//                 fill
//                 sizes="104px"
//                 className="object-cover"
//               />
//             </motion.div>
//           </AnimatePresence>
//         </div>

//         {/* ---------------------------------------------------------------- */}
//         {/* RIGHT WIDE SLOT                                                  */}
//         {/* ---------------------------------------------------------------- */}
//         <div className="absolute right-5 top-[495px] z-10 h-[142px] w-[190px] overflow-hidden bg-[var(--paper-2)] sm:right-[7vw] sm:top-[506px] sm:h-[164px] sm:w-[238px] lg:right-[5vw] lg:top-[63%] lg:h-[clamp(155px,19vh,205px)] lg:w-[clamp(250px,19vw,340px)]">
//           <AnimatePresence initial={false}>
//             <motion.div
//               key={`wide-${active}`}
//               className="absolute inset-0"
//               initial={reduceMotion ? false : { opacity: 0, x: 10, scale: 1.025 }}
//               animate={{ opacity: 1, x: 0, scale: 1 }}
//               exit={{ opacity: 0 }}
//               transition={imageTransition}
//             >
//               <Image
//                 src={slide.wide}
//                 alt={`${slide.label} project by Decor by Kasiwa`}
//                 fill
//                 sizes="(max-width: 640px) 190px, (max-width: 1024px) 238px, 340px"
//                 className="object-cover"
//               />
//             </motion.div>
//           </AnimatePresence>
//         </div>

//         {/* ---------------------------------------------------------------- */}
//         {/* SIDE NAVIGATION                                                  */}
//         {/* ---------------------------------------------------------------- */}
//         <button
//           type="button"
//           onClick={goPrevious}
//           aria-label="Previous hero slide"
//           className="focus-ring absolute left-4 top-1/2 z-40 hidden -translate-y-1/2 items-center gap-2 rounded-full border border-[var(--ink)]/20 bg-[var(--paper)]/80 px-3 py-2 text-[8px] font-semibold uppercase tracking-[0.08em] backdrop-blur-sm transition-colors hover:border-[var(--ink)] md:inline-flex lg:left-[2.2vw]"
//         >
//           <ArrowLeft size={11} strokeWidth={1.5} />
//           Prev
//         </button>

//         <button
//           type="button"
//           onClick={goNext}
//           aria-label="Next hero slide"
//           className="focus-ring absolute right-4 top-1/2 z-40 hidden -translate-y-1/2 items-center gap-2 rounded-full border border-[var(--ink)]/20 bg-[var(--paper)]/80 px-3 py-2 text-[8px] font-semibold uppercase tracking-[0.08em] backdrop-blur-sm transition-colors hover:border-[var(--ink)] md:inline-flex lg:right-[2.2vw]"
//         >
//           Next
//           <ArrowRight size={11} strokeWidth={1.5} />
//         </button>

//         {/* ---------------------------------------------------------------- */}
//         {/* SLIDE INDICATORS                                                 */}
//         {/* ---------------------------------------------------------------- */}
//         <div
//           className="absolute bottom-6 left-5 z-40 flex items-center gap-2 sm:bottom-8 sm:left-[4.5vw] lg:bottom-[7%] lg:flex-col"
//           role="tablist"
//           aria-label="Choose featured project"
//         >
//           {slides.map((item, index) => {
//             const selected = index === active;

//             return (
//               <button
//                 key={item.label}
//                 type="button"
//                 role="tab"
//                 aria-selected={selected}
//                 aria-label={`Show ${item.label}`}
//                 onClick={() => setActive(index)}
//                 className="focus-ring grid size-4 place-items-center"
//               >
//                 <span
//                   className={[
//                     "block rounded-full transition-all duration-300",
//                     selected
//                       ? "size-2 bg-[var(--ink)]"
//                       : "size-1.5 bg-[var(--ink)]/20 hover:bg-[var(--ink)]/45",
//                   ].join(" ")}
//                 />
//               </button>
//             );
//           })}
//         </div>

//         {/* slide count */}
//         <div className="absolute bottom-7 right-5 z-40 text-[8px] font-medium uppercase tracking-[0.14em] text-[var(--muted)] sm:bottom-9 sm:right-[4.5vw] lg:bottom-[7%]">
//           {String(active + 1).padStart(2, "0")}
//           <span className="mx-1.5 text-[var(--ink)]/25">/</span>
//           {String(slides.length).padStart(2, "0")}
//         </div>

//         {/* ---------------------------------------------------------------- */}
//         {/* MOBILE NAVIGATION                                                */}
//         {/* ---------------------------------------------------------------- */}
//         <div className="absolute bottom-16 left-1/2 z-40 flex -translate-x-1/2 gap-2 md:hidden">
//           <button
//             type="button"
//             onClick={goPrevious}
//             aria-label="Previous hero slide"
//             className="focus-ring grid size-10 place-items-center rounded-full border border-[var(--ink)]/20 bg-[var(--paper)]"
//           >
//             <ArrowLeft size={14} strokeWidth={1.5} />
//           </button>

//           <button
//             type="button"
//             onClick={goNext}
//             aria-label="Next hero slide"
//             className="focus-ring grid size-10 place-items-center rounded-full border border-[var(--ink)]/20 bg-[var(--paper)]"
//           >
//             <ArrowRight size={14} strokeWidth={1.5} />
//           </button>
//         </div>
//       </div>
//     </section>
//   );
// }
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
      className="relative isolate w-full overflow-hidden bg-[#17120f]"
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
        <div className="absolute inset-0 bg-black/10" />

        <div className="absolute inset-0 bg-gradient-to-r from-black/45 via-black/5 to-black/10" />

        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/15" />


        {/*
          ============================================================
          TOP EDITORIAL ROW
          ============================================================
        */}
        <div className="absolute inset-x-0 top-0 z-30 flex items-start justify-between px-5 pt-6 text-white sm:px-8 sm:pt-8 lg:px-[3.5vw] lg:pt-10">

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
              <p className="text-[10px] font-medium uppercase leading-[1.4] tracking-[0.08em] text-white/85 sm:text-[11px]">
                {slide.eyebrow}
              </p>
            </motion.div>
          </AnimatePresence>

          <div className="hidden items-center gap-3 sm:flex">
            <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-white/65">
              Decor by Kasiwa
            </span>

            <span className="h-px w-8 bg-white/40" />

            <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-white">
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
            border-white/25
            bg-black/15
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
              <p className="text-[8px] uppercase tracking-[0.15em] text-white/60">
                Featured
              </p>

              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.04em] text-white">
                The Kasiwa Edit
              </p>
            </div>

            <Link
              href="/shop"
              aria-label="Explore the featured collection"
              className="grid size-8 place-items-center rounded-full bg-white text-black transition-transform duration-300 hover:rotate-45"
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

            <div className="absolute inset-0 bg-black/5" />

            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/50 to-transparent px-3 pb-3 pt-10">
              <span className="text-[8px] font-medium uppercase tracking-[0.1em] text-white">
                Explore collection
              </span>

              <ArrowRight
                size={13}
                strokeWidth={1.5}
                className="text-white transition-transform duration-300 group-hover:translate-x-1"
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
            text-white
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
                <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/75">
                  {slide.label}
                </span>

                <span className="h-px w-10 bg-white/40" />

                <span className="text-[9px] uppercase tracking-[0.14em] text-white/60">
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
                <p className="max-w-[390px] text-[11px] leading-[1.55] text-white/80 sm:text-[12px]">
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
                    border-white/70
                    pb-1.5
                    text-[9px]
                    font-semibold
                    uppercase
                    tracking-[0.14em]
                    text-white
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
              border-white/35
              bg-black/10
              text-white
              backdrop-blur-md
              transition
              duration-300
              hover:bg-white
              hover:text-black
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
              border-white/35
              bg-black/10
              text-white
              backdrop-blur-md
              transition
              duration-300
              hover:bg-white
              hover:text-black
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
            text-white
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
                      ? "w-10 bg-white"
                      : "w-4 bg-white/35 group-hover:bg-white/70",
                  ].join(" ")}
                />

                {selected && (
                  <span className="text-[8px] font-medium tracking-[0.15em] text-white">
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
        <div className="absolute bottom-[8.5%] right-[145px] z-30 hidden items-center gap-2 text-white/60 lg:flex">
          <span className="text-[9px] font-semibold tracking-[0.15em] text-white">
            {String(active + 1).padStart(2, "0")}
          </span>

          <span className="h-px w-7 bg-white/40" />

          <span className="text-[9px] tracking-[0.15em]">
            {String(slides.length).padStart(2, "0")}
          </span>
        </div>
      </div>
    </section>
  );
}

// "use client";

// import Image from "next/image";
// import Link from "next/link";
// import {
//   AnimatePresence,
//   motion,
//   useReducedMotion,
// } from "framer-motion";
// import {
//   ArrowLeft,
//   ArrowRight,
//   ArrowUpRight,
//   Clock3,
//   Sparkles,
//   Truck,
// } from "lucide-react";
// import {
//   useCallback,
//   useEffect,
//   useState,
// } from "react";

// import { Logo } from "../../public/index";

// const slides = [
//   {
//     label: "Studio Collection",
//     meta: "01",
//     eyebrow: "Curated interiors for considered living",
//     title: "Discover pieces that make every room feel complete.",
//     description:
//       "Furniture, lighting and décor selected to work together beautifully — thoughtful pieces for homes that feel warm, personal and considered.",
//     image:
//       "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=2200&q=95",
//     featureImage:
//       "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1200&q=90",
//     detailImage:
//       "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1000&q=90",
//     accent: "New edit",
//     featureTitle: "Warm, modern living",
//   },
//   {
//     label: "Residential Edit",
//     meta: "02",
//     eyebrow: "Spaces shaped around everyday living",
//     title: "Furniture chosen for the way you actually live.",
//     description:
//       "Warm materials, quiet details and pieces with presence — brought together to create rooms that feel effortless rather than over-styled.",
//     image:
//       "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=2200&q=95",
//     featureImage:
//       "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1200&q=90",
//     detailImage:
//       "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1000&q=90",
//     accent: "Residential",
//     featureTitle: "Soft forms & texture",
//   },
//   {
//     label: "Hospitality Edit",
//     meta: "03",
//     eyebrow: "Atmosphere, comfort and memorable detail",
//     title: "Interiors designed to leave a lasting impression.",
//     description:
//       "Layered furniture, lighting and styling for hospitality spaces where comfort, character and visual identity all matter.",
//     image:
//       "https://images.unsplash.com/photo-1600566753051-f0b89df2dd90?auto=format&fit=crop&w=2200&q=95",
//     featureImage:
//       "https://images.unsplash.com/photo-1600210491369-e753d80a41f3?auto=format&fit=crop&w=1200&q=90",
//     detailImage:
//       "https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=1000&q=90",
//     accent: "Hospitality",
//     featureTitle: "Designed for atmosphere",
//   },
// ];

// const SLIDE_INTERVAL = 8500;

// export default function EditorialHero() {
//   const [active, setActive] = useState(0);
//   const [paused, setPaused] = useState(false);
//   const reduceMotion = useReducedMotion();

//   const goNext = useCallback(() => {
//     setActive((current) => (current + 1) % slides.length);
//   }, []);

//   const goPrevious = useCallback(() => {
//     setActive(
//       (current) => (current - 1 + slides.length) % slides.length
//     );
//   }, []);

//   useEffect(() => {
//     if (paused) return;

//     const interval = window.setInterval(goNext, SLIDE_INTERVAL);
//     return () => window.clearInterval(interval);
//   }, [goNext, paused]);

//   useEffect(() => {
//     const handleKeyDown = (event: KeyboardEvent) => {
//       if (event.key === "ArrowRight") goNext();
//       if (event.key === "ArrowLeft") goPrevious();
//     };

//     window.addEventListener("keydown", handleKeyDown);
//     return () => window.removeEventListener("keydown", handleKeyDown);
//   }, [goNext, goPrevious]);

//   const slide = slides[active];

//   const imageTransition = reduceMotion
//     ? { duration: 0 }
//     : {
//         duration: 0.7,
//         ease: [0.22, 1, 0.36, 1] as const,
//       };

//   const copyTransition = reduceMotion
//     ? { duration: 0 }
//     : {
//         duration: 0.48,
//         ease: [0.22, 1, 0.36, 1] as const,
//       };

//   return (
//     <section
//       className="w-full overflow-hidden bg-[#f7f3ed] text-[#171717]"
//       aria-roledescription="carousel"
//       aria-label="Decor by Kasiwa featured interiors"
//       onMouseEnter={() => setPaused(true)}
//       onMouseLeave={() => setPaused(false)}
//     >
//       <div className="w-full px-5 pb-7 pt-5 sm:px-8 sm:pb-8 sm:pt-6 lg:px-[4vw] lg:pb-10 lg:pt-7">

//         {/* ================================================================ */}
//         {/* MAIN HERO                                                        */}
//         {/* ================================================================ */}
//         <div className="grid gap-12 py-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-[6vw] lg:py-12 xl:gap-[7vw] xl:py-14">
//           {/* ================================================================ */}
//           {/* LEFT COLUMN                                                     */}
//           {/* ================================================================ */}
//           <div className="flex min-w-0 flex-col justify-center">
//             <AnimatePresence mode="wait">
//               <motion.div
//                 key={`copy-${active}`}
//                 initial={reduceMotion ? false : { opacity: 0, y: 16 }}
//                 animate={{ opacity: 1, y: 0 }}
//                 exit={{ opacity: 0, y: -12 }}
//                 transition={copyTransition}
//                 className="w-full"
//               >
//                 <div className="flex max-w-[560px] items-center gap-3">
//                   <span className="shrink-0 text-[8px] font-semibold uppercase tracking-[0.16em] text-black/50 sm:text-[9px]">
//                     {slide.meta}
//                   </span>
//                   <span className="h-px w-8 shrink-0 bg-black/20" />
//                   <span className="text-[8px] uppercase tracking-[0.12em] text-black/45 sm:text-[9px]">
//                     {slide.eyebrow}
//                   </span>
//                 </div>

//                 <h1 className="mt-6 max-w-[650px] text-balance text-[44px] font-medium leading-[0.98] tracking-[-0.055em] sm:text-[58px] lg:text-[clamp(54px,4.55vw,78px)]">
//                   {slide.title}
//                 </h1>

//                 <p className="mt-6 max-w-[520px] text-[12px] leading-[1.7] text-black/55 sm:text-[13px]">
//                   {slide.description}
//                 </p>

//                 <div className="mt-8 flex flex-wrap items-center gap-2.5">
//                   <Link
//                     href="/shop"
//                     className="group inline-flex h-12 items-center justify-center gap-3 bg-[#171717] px-6 text-[9px] font-semibold uppercase tracking-[0.13em] text-white transition-colors hover:bg-black/80 sm:text-[10px]"
//                   >
//                     Shop collection
//                     <ArrowUpRight
//                       size={14}
//                       strokeWidth={1.5}
//                       className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
//                     />
//                   </Link>

//                   <Link
//                     href="/consultation"
//                     className="inline-flex h-12 items-center justify-center border border-black/10 bg-transparent px-5 text-[9px] font-semibold uppercase tracking-[0.13em] text-black/65 transition-colors hover:border-black/25 hover:text-black sm:text-[10px]"
//                   >
//                     Start a project
//                   </Link>
//                 </div>

//                 {/* -------------------------------------------------------- */}
//                 {/* BENEFITS                                                  */}
//                 {/* -------------------------------------------------------- */}
//                 <div className="mt-10 grid max-w-[560px] grid-cols-1 border-y border-black/[0.07] sm:grid-cols-3">
//                   <div className="flex h-14 items-center gap-2 border-b border-black/[0.07] text-[9px] font-medium text-black/58 sm:border-b-0 sm:border-r sm:border-black/[0.07]">
//                     <Truck size={14} strokeWidth={1.4} />
//                     <span>Delivery support</span>
//                   </div>

//                   <div className="flex h-14 items-center gap-2 border-b border-black/[0.07] text-[9px] font-medium text-black/58 sm:border-b-0 sm:border-r sm:border-black/[0.07] sm:px-4">
//                     <Sparkles size={14} strokeWidth={1.4} />
//                     <span>Curated selection</span>
//                   </div>

//                   <div className="flex h-14 items-center gap-2 text-[9px] font-medium text-black/58 sm:pl-4">
//                     <Clock3 size={14} strokeWidth={1.4} />
//                     <span>Design guidance</span>
//                   </div>
//                 </div>
//               </motion.div>
//             </AnimatePresence>
//           </div>

//           {/* ================================================================ */}
//           {/* RIGHT COLUMN — strict 12-column / 12-row editorial grid         */}
//           {/* ================================================================ */}
//           <div className="grid h-[500px] min-w-0 grid-cols-12 grid-rows-12 gap-3 sm:h-[560px] sm:gap-4 lg:h-[520px] xl:h-[560px]">
//             {/* -------------------------------------------------------------- */}
//             {/* FEATURE CARD — aligned top left                                */}
//             {/* -------------------------------------------------------------- */}
//             <div className="relative col-span-7 row-span-6 overflow-hidden bg-[#e5e1dc]">
//               <AnimatePresence initial={false}>
//                 <motion.div
//                   key={`feature-${active}`}
//                   className="absolute inset-0"
//                   initial={reduceMotion ? false : { opacity: 0, scale: 1.03 }}
//                   animate={{ opacity: 1, scale: 1 }}
//                   exit={{ opacity: 0 }}
//                   transition={imageTransition}
//                 >
//                   <Image
//                     src={slide.featureImage}
//                     alt={`${slide.label} furniture detail`}
//                     fill
//                     sizes="(max-width: 1024px) 58vw, 420px"
//                     className="object-cover"
//                   />
//                 </motion.div>
//               </AnimatePresence>

//               <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3 sm:p-4">
//                 <span className="bg-white px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.12em] text-black sm:text-[8px]">
//                   {slide.accent}
//                 </span>

//                 <Link
//                   href="/shop"
//                   aria-label="Explore collection"
//                   className="grid size-8 place-items-center rounded-full bg-white/95 text-black transition-transform hover:rotate-45"
//                 >
//                   <ArrowUpRight size={13} strokeWidth={1.5} />
//                 </Link>
//               </div>

//               <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent p-3 pt-12 text-white sm:p-4">
//                 <p className="text-[7px] uppercase tracking-[0.14em] text-white/65 sm:text-[8px]">
//                   Featured selection
//                 </p>
//                 <p className="mt-1 text-[11px] font-medium sm:text-[12px]">
//                   {slide.featureTitle}
//                 </p>
//               </div>
//             </div>

//             {/* -------------------------------------------------------------- */}
//             {/* SERVICE CARD — aligned top right                               */}
//             {/* -------------------------------------------------------------- */}
//             <div className="relative col-span-5 row-span-5 overflow-hidden bg-[#6b6965]">
//               <AnimatePresence initial={false}>
//                 <motion.div
//                   key={`detail-${active}`}
//                   className="absolute inset-0"
//                   initial={reduceMotion ? false : { opacity: 0 }}
//                   animate={{ opacity: 1 }}
//                   exit={{ opacity: 0 }}
//                   transition={imageTransition}
//                 >
//                   <Image
//                     src={slide.detailImage}
//                     alt=""
//                     fill
//                     sizes="(max-width: 1024px) 40vw, 300px"
//                     className="object-cover"
//                   />
//                 </motion.div>
//               </AnimatePresence>

//               <div className="absolute inset-0 bg-black/35" />

//               <div className="absolute inset-x-0 bottom-0 p-3 text-white sm:p-4">
//                 <p className="text-[7px] uppercase tracking-[0.14em] text-white/60 sm:text-[8px]">
//                   Personal service
//                 </p>

//                 <p className="mt-1 max-w-[210px] text-[11px] font-medium leading-[1.3] sm:text-[12px]">
//                   Design guidance, sourcing & styling
//                 </p>

//                 <Link
//                   href="/consultation"
//                   className="mt-3 inline-flex items-center gap-2 text-[7px] font-semibold uppercase tracking-[0.12em] sm:text-[8px]"
//                 >
//                   Book consultation
//                   <ArrowRight size={11} strokeWidth={1.5} />
//                 </Link>
//               </div>
//             </div>

//             {/* -------------------------------------------------------------- */}
//             {/* MAIN IMAGE — aligned lower left                                */}
//             {/* -------------------------------------------------------------- */}
//             <div className="relative col-span-8 row-span-6 row-start-7 overflow-hidden bg-[#dedad4]">
//               <AnimatePresence initial={false}>
//                 <motion.div
//                   key={`main-${active}`}
//                   className="absolute inset-0"
//                   initial={
//                     reduceMotion
//                       ? false
//                       : { opacity: 0, y: 8, scale: 1.02 }
//                   }
//                   animate={{ opacity: 1, y: 0, scale: 1 }}
//                   exit={{ opacity: 0 }}
//                   transition={imageTransition}
//                 >
//                   <Image
//                     src={slide.image}
//                     alt={`${slide.label} interior`}
//                     fill
//                     sizes="(max-width: 1024px) 66vw, 500px"
//                     className="object-cover"
//                   />
//                 </motion.div>
//               </AnimatePresence>

//               <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/45 via-transparent to-transparent p-3 pt-14 text-white sm:p-4">
//                 <div>
//                   <p className="text-[7px] uppercase tracking-[0.14em] text-white/60 sm:text-[8px]">
//                     Decor by Kasiwa
//                   </p>
//                   <p className="mt-1 text-[10px] font-medium sm:text-[11px]">
//                     Complete-room thinking
//                   </p>
//                 </div>

//                 <Link
//                   href="/portfolio"
//                   aria-label="View portfolio"
//                   className="grid size-8 place-items-center rounded-full bg-white text-black"
//                 >
//                   <ArrowUpRight size={13} strokeWidth={1.5} />
//                 </Link>
//               </div>
//             </div>

//             {/* -------------------------------------------------------------- */}
//             {/* PROOF CARD — fills remaining lower-right space                 */}
//             {/* -------------------------------------------------------------- */}
//             <div className="col-span-4 row-span-7 row-start-6 flex flex-col justify-between bg-white p-3 shadow-[0_12px_35px_rgba(0,0,0,0.045)] sm:p-4">
//               <div>
//                 <p className="text-[7px] font-semibold uppercase tracking-[0.14em] text-black/40 sm:text-[8px]">
//                   Kasiwa community
//                 </p>

//                 <p className="mt-3 text-[28px] font-medium leading-none tracking-[-0.05em] sm:text-[34px]">
//                   500+
//                 </p>

//                 <p className="mt-2 max-w-[130px] text-[8px] leading-[1.45] text-black/45 sm:text-[9px]">
//                   considered spaces, objects and interior moments.
//                 </p>
//               </div>

//               <div className="border-t border-black/[0.07] pt-3">
//                 <div className="flex -space-x-2">
//                   <span className="grid size-7 place-items-center rounded-full border-2 border-white bg-[#d9d2c8] text-[8px] font-semibold">
//                     K
//                   </span>
//                   <span className="grid size-7 place-items-center rounded-full border-2 border-white bg-[#b9aea0] text-[8px] font-semibold">
//                     D
//                   </span>
//                   <span className="grid size-7 place-items-center rounded-full border-2 border-white bg-[#eee9e2] text-[8px] font-semibold">
//                     +
//                   </span>
//                 </div>

//                 <p className="mt-2 text-[7px] uppercase tracking-[0.12em] text-black/35 sm:text-[8px]">
//                   Homes shaped with intention
//                 </p>
//               </div>
//             </div>
//           </div>
//         </div>

//         {/* ================================================================ */}
//         {/* BOTTOM NAV — aligned to the same outer container                 */}
//         {/* ================================================================ */}
//         <div className="grid grid-cols-[1fr_auto] items-center border-t border-black/[0.07] pt-5">
//           <div
//             className="flex items-center gap-2"
//             role="tablist"
//             aria-label="Choose featured collection"
//           >
//             {slides.map((item, index) => {
//               const selected = index === active;

//               return (
//                 <button
//                   key={item.label}
//                   type="button"
//                   role="tab"
//                   aria-selected={selected}
//                   aria-label={`Show ${item.label}`}
//                   onClick={() => setActive(index)}
//                   className="group flex h-6 items-center"
//                 >
//                   <span
//                     className={[
//                       "block h-px transition-all duration-500",
//                       selected
//                         ? "w-10 bg-black"
//                         : "w-4 bg-black/20 group-hover:bg-black/50",
//                     ].join(" ")}
//                   />
//                 </button>
//               );
//             })}
//           </div>

//           <div className="flex items-center gap-2">
//             <button
//               type="button"
//               onClick={goPrevious}
//               aria-label="Previous hero slide"
//               className="grid size-10 place-items-center rounded-full border border-black/10 bg-white transition-colors hover:border-black/30 hover:bg-black hover:text-white"
//             >
//               <ArrowLeft size={14} strokeWidth={1.4} />
//             </button>

//             <button
//               type="button"
//               onClick={goNext}
//               aria-label="Next hero slide"
//               className="grid size-10 place-items-center rounded-full border border-black/10 bg-white transition-colors hover:border-black/30 hover:bg-black hover:text-white"
//             >
//               <ArrowRight size={14} strokeWidth={1.4} />
//             </button>
//           </div>
//         </div>
//       </div>
//     </section>
//   );
// }
