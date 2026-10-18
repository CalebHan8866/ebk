export default function RootLoading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 gap-10">
      {/* Skeleton header */}
      <div className="w-full max-w-md space-y-4">
        <div className="skeleton h-3 w-24 rounded-full" />
        <div className="skeleton h-10 w-56 rounded-xl" />
        <div className="skeleton h-3 w-40 rounded-full" />
      </div>
      {/* Skeleton cards */}
      <div className="w-full max-w-md space-y-3">
        <div className="skeleton h-24 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-3">
          <div className="skeleton h-20 rounded-2xl" />
          <div className="skeleton h-20 rounded-2xl" />
        </div>
        <div className="skeleton h-16 w-full rounded-2xl" />
      </div>
    </div>
  )
}
