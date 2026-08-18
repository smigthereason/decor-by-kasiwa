type PageIntroProps = {
  eyebrow: string;
  title: string;
  body?: string;
};

export default function PageIntro({ eyebrow, title, body }: PageIntroProps) {
  return (
    <section className="w-full border-b hairline bg-[var(--paper)] px-4 pb-14 pt-16 md:px-8 md:pb-24 md:pt-24">
      <p className="kicker text-[var(--muted)]">{eyebrow}</p>
      <h1 className="mt-6 max-w-6xl text-[clamp(4rem,12vw,11rem)] font-medium uppercase leading-[0.82] tracking-[-0.085em]">
        {title}
      </h1>
      {body && (
        <p className="ml-auto mt-10 max-w-xl text-sm leading-relaxed text-[var(--muted)] md:text-base">
          {body}
        </p>
      )}
    </section>
  );
}
