import { useState } from 'react'
import { searchLocalities, type Localities, type LocalityFeature } from '../lib/localities'

interface Props {
  localities: Localities | null
  onPick: (f: LocalityFeature) => void
}

export default function SearchBox({ localities, onPick }: Props) {
  const [q, setQ] = useState('')
  const matches = localities ? searchLocalities(localities, q) : []
  const pick = (f: LocalityFeature) => {
    setQ('')
    onPick(f)
  }
  return (
    <div className="search">
      <input
        type="search"
        placeholder="Find locality by name or number"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && matches[0]) pick(matches[0])
          if (e.key === 'Escape') setQ('')
        }}
        aria-label="Search localities"
      />
      {matches.length > 0 && (
        <ul className="search-results">
          {matches.map((f) => (
            <li key={f.properties.loknr}>
              <button type="button" onClick={() => pick(f)}>
                {f.properties.navn} <small>{f.properties.loknr} · {f.properties.kommune}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
