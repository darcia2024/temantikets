/** Shows ?error= and ?ok= messages set by guard(). */
export function Flash({ sp, legacy = {} }: { sp: Record<string, string | string[] | undefined>; legacy?: Record<string, string> }) {
  const error = typeof sp.error === "string" ? (legacy[sp.error] ?? sp.error) : null;
  const ok = typeof sp.ok === "string" ? sp.ok : sp.paid ? "Pembayaran tercatat." : null;
  return (
    <>
      {error && (
        <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-100">
          {error}
        </p>
      )}
      {ok && <p className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-emerald-100">{ok}</p>}
    </>
  );
}
