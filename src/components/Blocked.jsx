export default function Blocked({
  title = "Forbidden",
  message = "Branch access only.",
}) {
  return (
    <div className="min-h-[50vh] grid place-items-center">
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 max-w-md">
        <div className="text-lg font-semibold mb-1">{title}</div>
        <div className="text-neutral-600">{message}</div>
      </div>
    </div>
  );
}
