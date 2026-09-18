"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function PasswordField({
  label,
  name,
  value,
  onChange,
  autoComplete,
  required = true,
  placeholder,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  required?: boolean;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{label}</span>
      <div className="relative mt-2">
        <input
          name={name}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          required={required}
          placeholder={placeholder}
          className="min-h-12 w-full rounded-xl border hairline bg-[var(--paper)] px-4 pr-12 text-sm outline-none focus:border-[var(--brand-green)]"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="focus-ring absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--paper-2)] hover:text-[var(--ink)]"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
    </label>
  );
}
