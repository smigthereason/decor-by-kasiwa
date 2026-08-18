"use client";

import { FormEvent, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";

const projectTypes = [
  "Full Interior Design",
  "Room Transformation",
  "Interior Styling",
  "Furniture & Décor",
  "Curtains & Blinds",
  "Commercial Interior",
  "Airbnb / Hospitality",
  "Not sure yet",
];

const spaces = [
  "Living Room",
  "Bedroom",
  "Dining Area",
  "Home Office",
  "Office",
  "Restaurant / Café",
  "Hotel / Airbnb",
  "Other",
];

type FormData = {
  projectType: string;
  spaceType: string;
  location: string;
  budget: string;
  timeline: string;
  inspiration: string;
  name: string;
  email: string;
  phone: string;
};

const initialData: FormData = {
  projectType: "",
  spaceType: "",
  location: "",
  budget: "",
  timeline: "",
  inspiration: "",
  name: "",
  email: "",
  phone: "",
};

export default function ConsultationForm() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState(initialData);
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");

  const steps = useMemo(
    () => [
      {
        title: "What would you like help with?",
        body: (
          <div className="grid gap-2 sm:grid-cols-2">
            {projectTypes.map((item) => (
              <Choice
                key={item}
                active={data.projectType === item}
                onClick={() => setData({ ...data, projectType: item })}
              >
                {item}
              </Choice>
            ))}
          </div>
        ),
      },
      {
        title: "What kind of space are we designing?",
        body: (
          <div className="grid gap-2 sm:grid-cols-2">
            {spaces.map((item) => (
              <Choice
                key={item}
                active={data.spaceType === item}
                onClick={() => setData({ ...data, spaceType: item })}
              >
                {item}
              </Choice>
            ))}
          </div>
        ),
      },
      {
        title: "Tell us about the project.",
        body: (
          <div className="grid gap-4">
            <Field label="Location">
              <input
                value={data.location}
                onChange={(e) => setData({ ...data, location: e.target.value })}
                placeholder="e.g. Karen, Nairobi"
              />
            </Field>
            <Field label="Budget range">
              <select
                value={data.budget}
                onChange={(e) => setData({ ...data, budget: e.target.value })}
              >
                <option value="">Select a range</option>
                <option>Below KES 250,000</option>
                <option>KES 250,000 – 500,000</option>
                <option>KES 500,000 – 1,000,000</option>
                <option>KES 1,000,000 – 2,500,000</option>
                <option>KES 2,500,000+</option>
                <option>To be discussed</option>
              </select>
            </Field>
            <Field label="Desired timeline">
              <input
                value={data.timeline}
                onChange={(e) => setData({ ...data, timeline: e.target.value })}
                placeholder="e.g. Within 3 months"
              />
            </Field>
          </div>
        ),
      },
      {
        title: "What are you drawn to?",
        body: (
          <Field label="Inspiration / project notes">
            <textarea
              rows={7}
              value={data.inspiration}
              onChange={(e) => setData({ ...data, inspiration: e.target.value })}
              placeholder="Describe the feeling, colours, references or ideas you have in mind. Image upload can be connected next."
            />
          </Field>
        ),
      },
      {
        title: "How should we reach you?",
        body: (
          <div className="grid gap-4">
            <Field label="Name">
              <input
                required
                value={data.name}
                onChange={(e) => setData({ ...data, name: e.target.value })}
              />
            </Field>
            <Field label="Email">
              <input
                required
                type="email"
                value={data.email}
                onChange={(e) => setData({ ...data, email: e.target.value })}
              />
            </Field>
            <Field label="Phone">
              <input
                value={data.phone}
                onChange={(e) => setData({ ...data, phone: e.target.value })}
                placeholder="+254"
              />
            </Field>
          </div>
        ),
      },
    ],
    [data]
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      const response = await fetch("/api/consultations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error("Submission failed");
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="grid min-h-[520px] place-items-center border-t hairline text-center">
        <div className="max-w-lg">
          <div className="mx-auto grid size-12 place-items-center rounded-full border hairline">
            <Check size={18} />
          </div>
          <p className="kicker mt-6 text-[var(--muted)]">Enquiry received</p>
          <h2 className="mt-4 text-4xl font-medium tracking-[-0.05em]">
            Your space starts here.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">
            The Decor by Kasiwa team can review the project details from Sanity
            once the project credentials are configured.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <div className="flex items-center justify-between border-t hairline py-4">
        <span className="kicker text-[var(--muted)]">
          Step {step + 1} of {steps.length}
        </span>
        <div className="flex gap-1">
          {steps.map((_, index) => (
            <span
              key={index}
              className={`h-1 w-8 ${index <= step ? "bg-[var(--ink)]" : "bg-black/10"}`}
            />
          ))}
        </div>
      </div>

      <div className="grid min-h-[460px] gap-10 py-10 md:grid-cols-[0.8fr_1.2fr] md:py-16">
        <h2 className="max-w-md text-[clamp(2.5rem,5vw,5rem)] font-medium leading-[0.95] tracking-[-0.06em]">
          {steps[step].title}
        </h2>
        <div>{steps[step].body}</div>
      </div>

      <div className="flex justify-between border-t hairline py-5">
        <button
          type="button"
          onClick={() => setStep((value) => Math.max(0, value - 1))}
          disabled={step === 0}
          className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.08em] disabled:opacity-25"
        >
          <ArrowLeft size={14} /> Back
        </button>

        {step < steps.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-5 py-3 text-xs uppercase tracking-[0.08em] text-[var(--paper)]"
          >
            Continue <ArrowRight size={14} />
          </button>
        ) : (
          <button
            type="submit"
            disabled={status === "sending"}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-5 py-3 text-xs uppercase tracking-[0.08em] text-[var(--paper)] disabled:opacity-50"
          >
            {status === "sending" ? "Sending..." : "Send enquiry"} <ArrowRight size={14} />
          </button>
        )}
      </div>

      {status === "error" && (
        <p className="pb-4 text-sm text-red-700">
          Could not send the enquiry. Configure the Sanity environment variables and write token, then try again.
        </p>
      )}
    </form>
  );
}

function Choice({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-16 items-center justify-between border px-4 text-left text-sm transition-colors ${
        active
          ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
          : "hairline hover:bg-[var(--paper-2)]"
      }`}
    >
      {children}
      <span className={`size-2 rounded-full ${active ? "bg-[var(--paper)]" : "bg-black/15"}`} />
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="kicker text-[var(--muted)]">{label}</span>
      <div className="[&_input]:w-full [&_input]:border-b [&_input]:border-black/20 [&_input]:bg-transparent [&_input]:px-0 [&_input]:py-3 [&_input]:outline-none [&_select]:w-full [&_select]:border-b [&_select]:border-black/20 [&_select]:bg-transparent [&_select]:py-3 [&_select]:outline-none [&_textarea]:w-full [&_textarea]:border [&_textarea]:border-black/20 [&_textarea]:bg-transparent [&_textarea]:p-3 [&_textarea]:outline-none">
        {children}
      </div>
    </label>
  );
}
