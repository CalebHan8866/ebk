export default function RootLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 rounded-full border-2 border-orange-500 border-t-transparent animate-spin mx-auto mb-4" />
        <p className="text-gray-400 text-sm tracking-widest uppercase">Loading...</p>
      </div>
    </div>
  )
}
