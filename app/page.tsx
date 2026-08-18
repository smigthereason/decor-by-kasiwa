import EditorialHero from "@/components/home/EditorialHero";
import FeatureRoom from "@/components/home/FeatureRoom";
import ServiceIndex from "@/components/home/ServiceIndex";
import SelectedProjects from "@/components/home/SelectedProjects";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <>
      <EditorialHero />
      <FeatureRoom />
      <ServiceIndex />
      <SelectedProjects />

      <section className="page-shell border-b hairline bg-[var(--forest)] px-4 py-16 text-[var(--paper)] md:px-8 md:py-24">
        <div className="grid gap-10 md:grid-cols-[1fr_1.4fr] md:items-end">
          <p className="kicker text-white/55">Our point of view</p>
          <div>
            <p className="text-[clamp(2rem,4.8vw,5rem)] font-medium leading-[1.02] tracking-[-0.055em]">
              A beautiful space is not simply about how it looks.
              <br />
              It is about how it makes you feel.
            </p>
            <Link href="/process" className="editorial-link mt-8">
              See our process <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
