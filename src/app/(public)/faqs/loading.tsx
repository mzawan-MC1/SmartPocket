export default function PublicFaqLoading() {
  return (
    <div className="bg-background px-4 py-10 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-[28px] border border-border bg-card px-5 py-6 shadow-card-sm sm:px-6 sm:py-7">
          <div className="h-9 w-72 animate-pulse rounded-xl bg-muted" />
          <div className="mt-4 h-4 w-full max-w-3xl animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-5/6 max-w-2xl animate-pulse rounded bg-muted" />
          <div className="mt-6 h-11 w-full animate-pulse rounded-2xl bg-muted" />
        </div>

        <div className="flex gap-2 overflow-hidden">
          {[1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className="h-11 w-36 animate-pulse rounded-2xl bg-muted"
            />
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="hidden rounded-[28px] border border-border bg-card p-4 shadow-card-sm lg:block">
            <div className="space-y-3">
              {[1, 2, 3, 4].map((item) => (
                <div
                  key={item}
                  className="h-20 animate-pulse rounded-2xl bg-muted"
                />
              ))}
            </div>
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="rounded-[28px] border border-border bg-card px-5 py-6 shadow-card-sm sm:px-6"
              >
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                <div className="mt-4 h-6 w-4/5 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
