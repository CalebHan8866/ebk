import dynamic from 'next/dynamic'

// Dynamically import the heavy client component — defers the large EVENTS and
// comparisons static-data arrays from the initial JS bundle parse.
const FunFactsClient = dynamic(() => import('./FunFactsClient'), { ssr: false })

export default function FunFactsPage() {
  return <FunFactsClient />
}
