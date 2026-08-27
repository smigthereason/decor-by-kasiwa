// "use client";

// import Image from "next/image";
// import Link from "next/link";
// import { motion } from "framer-motion";
// import { ArrowRight } from "lucide-react";

// const projects = [
//   {
//     name: "Warm Minimal Residence",
//     type: "Residential",
//     image:
//       "https://images.unsplash.com/photo-1600585152915-d208bec867a1?auto=format&fit=crop&w=1200&q=88",
//   },
//   {
//     name: "Quiet Luxury Suite",
//     type: "Hospitality",
//     image:
//       "https://images.unsplash.com/photo-1600566753051-f0b89df2dd90?auto=format&fit=crop&w=1200&q=88",
//   },
//   {
//     name: "Textured Living Room",
//     type: "Styling",
//     image:
//       "https://images.unsplash.com/photo-1600210491369-e753d80a41f3?auto=format&fit=crop&w=1200&q=88",
//   },
// ];

// export default function SelectedProjects() {
//   return (
//     <section className="w-full hairline bg-[var(--canvas)] px-4 py-14 md:px-8 md:py-24">
//       <motion.div
//         className="mb-10 flex items-end justify-between gap-4"
//         initial={{ opacity: 0, y: 24 }}
//         whileInView={{ opacity: 1, y: 0 }}
//         viewport={{ once: true }}
//       >
//         <div>
//           <p className="kicker text-[var(--muted)]">Selected spaces</p>
//           <h2 className="mt-4 text-[clamp(2.6rem,6vw,6rem)] font-medium leading-none tracking-[-0.065em]">
//             THE PORTFOLIO
//           </h2>
//         </div>
//         <Link href="/portfolio" className="focus-ring editorial-link hidden sm:inline-flex">
//           View all <ArrowRight size={13} />
//         </Link>
//       </motion.div>

//       <div className="grid gap-5 md:grid-cols-12">
//         {projects.map((project, index) => (
//           <motion.article
//             key={project.name}
//             className={index === 0 ? "md:col-span-6" : "md:col-span-3"}
//             initial={{ opacity: 0, y: 28 }}
//             whileInView={{ opacity: 1, y: 0 }}
//             viewport={{ once: true, amount: 0.2 }}
//             transition={{ delay: index * 0.08, duration: 0.6 }}
//           >
//             <Link href="/portfolio" className="focus-ring group block">
//               <div
//                 className={`relative overflow-hidden ${
//                   index === 0 ? "aspect-[4/5]" : "aspect-[3/5]"
//                 }`}
//               >
//                 <Image
//                   src={project.image}
//                   alt={project.name}
//                   fill
//                   className="object-cover transition-transform duration-700 group-hover:scale-[1.035]"
//                 />
//               </div>
//               <div className="mt-3 flex justify-between gap-3 border-t hairline pt-3">
//                 <div>
//                   <h3 className="text-sm font-semibold">{project.name}</h3>
//                   <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
//                     {project.type}
//                   </p>
//                 </div>
//                 <span className="text-[10px] text-[var(--muted)]">0{index + 1}</span>
//               </div>
//             </Link>
//           </motion.article>
//         ))}
//       </div>
//     </section>
//   );
// }
"use client";

import Image from "next/image";
import Link from "next/link";
import {
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
} from "lucide-react";

const projects = [
  {
    name: "Warm Minimal Residence",
    type: "Residential",
    location: "Nairobi",
    image:
      "https://images.unsplash.com/photo-1600585152915-d208bec867a1?auto=format&fit=crop&w=1600&q=92",
  },
  {
    name: "Quiet Luxury Suite",
    type: "Hospitality",
    location: "Private Suite",
    image:
      "https://images.unsplash.com/photo-1600566753051-f0b89df2dd90?auto=format&fit=crop&w=1400&q=92",
  },
  {
    name: "Textured Living Room",
    type: "Styling",
    location: "Residential Edit",
    image:
      "https://images.unsplash.com/photo-1600210491369-e753d80a41f3?auto=format&fit=crop&w=1400&q=92",
  },
];

export default function SelectedProjects() {
  const reduceMotion = useReducedMotion();

  const transition = {
    duration: reduceMotion ? 0 : 0.7,
    ease: [0.22, 1, 0.36, 1] as const,
  };

  return (
    <section
      className="
        w-full
        overflow-hidden
        border-b
        border-soft-cream/10

        text-muted
      "
    >
      <div
        className="
          px-2.5
          py-2

          sm:px-4
          sm:py-2

          lg:px-[1.7vw]
          lg:py-4
        "
      >



        {/* ============================================================ */}
        {/* SECTION HEADING                                              */}
        {/* ============================================================ */}

        <div
          className="
            grid
            gap-8
            py-9

            lg:grid-cols-[1fr_auto]
            lg:items-end
            lg:gap-16
            lg:py-12
          "
        >
          <motion.div
            initial={
              reduceMotion
                ? false
                : {
                    opacity: 0,
                    y: 22,
                  }
            }
            whileInView={{
              opacity: 1,
              y: 0,
            }}
            viewport={{
              once: true,
              amount: 0.4,
            }}
            transition={{
              ...transition,
              delay: reduceMotion ? 0 : 0.06,
            }}
          >
            <p
              className="
                text-[8px]
                font-semibold
                uppercase
                tracking-[0.15em]
                text-[var(--muted)]

                sm:text-[9px]
              "
            >
              Selected Work
            </p>

            <h2
              className="
                mt-4
                max-w-[920px]
                text-balance
                text-[46px]
                font-medium
                leading-[0.94]
                tracking-[-0.055em]

                sm:text-[62px]

                lg:text-[clamp(64px,6vw,98px)]
              "
            >
              Spaces with a point of view.
            </h2>
          </motion.div>

          <motion.div
            initial={
              reduceMotion
                ? false
                : {
                    opacity: 0,
                    y: 16,
                  }
            }
            whileInView={{
              opacity: 1,
              y: 0,
            }}
            viewport={{
              once: true,
            }}
            transition={{
              ...transition,
              delay: reduceMotion ? 0 : 0.12,
            }}
            className="
              max-w-[360px]
              lg:pb-2
            "
          >
            <p
              className="
                text-[12px]
                leading-[1.7]
                text-[var(--muted)]

                sm:text-[14px]
              "
            >
              A selection of residential, hospitality
              and styling projects shaped through
              furniture, material, light and detail.
            </p>

            <Link
              href="/portfolio"
              className="
                group
                mt-5
                inline-flex
                items-center
                gap-3
                border-b
                hairline
                border-[var(--muted)]
                pb-1.5
                text-[10px]
                font-semibold
                uppercase
                tracking-[0.14em]


                sm:text-[12px]
              "
            >
              View full portfolio

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
          </motion.div>
        </div>

        {/* ============================================================ */}
        {/* EDITORIAL PROJECT GRID                                       */}
        {/* ============================================================ */}

        <div
          className="
            grid
            gap-4

            md:grid-cols-12
            md:grid-rows-[290px_290px]

            lg:grid-rows-[330px_330px]

            xl:grid-rows-[370px_370px]
          "
        >
          {projects.map(
            (project, index) => {
              const placement =
                index === 0
                  ? `
                    md:col-span-7
                    md:row-span-2
                  `
                  : index === 1
                    ? `
                      md:col-span-5
                      md:row-span-1
                    `
                    : `
                      md:col-span-5
                      md:row-span-1
                    `;

              return (
                <motion.article
                  key={project.name}
                  initial={
                    reduceMotion
                      ? false
                      : {
                          opacity: 0,
                          y: 24,
                        }
                  }
                  whileInView={{
                    opacity: 1,
                    y: 0,
                  }}
                  viewport={{
                    once: true,
                    amount: 0.2,
                  }}
                  transition={{
                    ...transition,
                    delay:
                      reduceMotion
                        ? 0
                        : index * 0.08,
                  }}
                  className={placement}
                >
                  <Link
                    href="/portfolio"
                    className="
                      focus-ring
                      group
                      relative
                      block
                      h-full
                      min-h-[390px]
                      overflow-hidden

                      md:min-h-0
                    "
                  >
                    {/* IMAGE */}

                    <Image
                      src={project.image}
                      alt={project.name}
                      fill
                      unoptimized
                      priority
                      sizes={
                        index === 0
                          ? "(max-width: 768px) 100vw, 58vw"
                          : "(max-width: 768px) 100vw, 42vw"
                      }
                      className="
                        object-cover
                        transition-transform
                        duration-[900ms]
                        ease-out
                        group-hover:scale-[1.035]
                      "
                    />

                    {/* IMAGE OVERLAYS */}

                    <div
                      className="
                        absolute
                        inset-0
                        bg-charcoal/10
                        transition-colors
                        duration-500
                        group-hover:bg-charcoal/15
                      "
                    />

                    <div
                      className="
                        absolute
                        inset-0
                        bg-gradient-to-t
                        from-charcoal/75
                        via-charcoal/5
                        to-charcoal/10
                      "
                    />

                    {/* TOP META */}

                    <div
                      className="
                        absolute
                        inset-x-0
                        top-0
                        z-20
                        flex
                        items-start
                        justify-between
                        p-4

                        sm:p-5
                      "
                    >
                      <div>
                        <p
                          className="
                            text-[9px]
                            font-semibold
                            uppercase
                            tracking-[0.15em]
                            text-soft-cream/75

                            sm:text-[10px]
                          "
                        >
                          Project
                        </p>

                        <p
                          className="
                            mt-1
                            text-[10px]
                            uppercase
                            tracking-[0.13em]
                            text-soft-cream

                            sm:text-[11px]
                          "
                        >
                          {project.type}
                        </p>
                      </div>

                      <span
                        className="
                          text-[10px]
                          font-medium
                          tracking-[0.15em]
                          text-soft-cream/70

                          sm:text-[11px]
                        "
                      >
                        {String(index + 1).padStart(
                          2,
                          "0"
                        )}
                      </span>
                    </div>

                    {/* BOTTOM COPY */}

                    <div
                      className="
                        absolute
                        inset-x-0
                        bottom-0
                        z-20
                        p-4

                        sm:p-5

                        lg:p-6
                      "
                    >
                      <div
                        className="
                          flex
                          items-end
                          justify-between
                          gap-5
                        "
                      >
                        <div className="min-w-0">
                          <p
                            className="
                              mb-2
                              text-[9px]
                              uppercase
                              tracking-[0.15em]
                              text-soft-cream/50

                              sm:text-[10px]
                            "
                          >
                            {project.location}
                          </p>

                          <h3
                            className={[
                              `
                                max-w-[520px]
                                font-medium
                                leading-[0.98]
                                tracking-[-0.04em]
                                text-soft-cream
                              `,
                              index === 0
                                ? `
                                  text-[32px]
                                  sm:text-[40px]
                                  lg:text-[52px]
                                `
                                : `
                                  text-[27px]
                                  sm:text-[31px]
                                  lg:text-[35px]
                                `,
                            ].join(" ")}
                          >
                            {project.name}
                          </h3>
                        </div>

                        <span
                          className="
                            grid
                            size-9
                            shrink-0
                            place-items-center
                            rounded-full
                            bg-soft-cream
                            text-charcoal
                            transition-transform
                            duration-300
                            group-hover:rotate-45

                            sm:size-10
                          "
                        >
                          <ArrowUpRight
                            size={14}
                            strokeWidth={1.5}
                          />
                        </span>
                      </div>


                    </div>
                  </Link>
                </motion.article>
              );
            }
          )}
        </div>

        {/* ============================================================ */}
        {/* MOBILE VIEW ALL                                              */}
        {/* ============================================================ */}

        <div
          className="
            mt-8
            border-t
            border-soft-cream/15
            pt-5
            sm:hidden
          "
        >
          <Link
            href="/portfolio"
            className="
              flex
              items-center
              justify-between
              text-[9px]
              font-semibold
              uppercase
              tracking-[0.14em]
            "
          >
            View all projects

            <ArrowRight
              size={13}
              strokeWidth={1.5}
            />
          </Link>
        </div>

        {/* ============================================================ */}
        {/* LOWER MICRO META                                             */}
        {/* ============================================================ */}

        <div
          className="
            mt-8
            hidden
            grid-cols-[1fr_auto]
            items-center
            border-t
            border-soft-cream/15
            pt-4

            sm:grid
          "
        >
          <span
            className="
              text-[8px]
              uppercase
              tracking-[0.14em]
              text-soft-cream/35
            "
          >
            Residential · Hospitality · Styling
          </span>

          <span
            className="
              text-[8px]
              uppercase
              tracking-[0.14em]
              text-soft-cream/35
            "
          >
            Selected Spaces / 2026
          </span>
        </div>
      </div>
    </section>
  );
}
