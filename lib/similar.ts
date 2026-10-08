import { q } from './db'

type Row = {
  id: number
  phash: string
  width: number
  height: number
  size: number
  favorite: boolean
  month: string
  thumbUrl: string
  takenAt: string
}

export type SimilarGroup = {
  keepId: number
  items: (Row & { recommendDelete: boolean; distance: number })[]
}

function popcount32(n: number) {
  n = n - ((n >>> 1) & 0x55555555)
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333)
  return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
}

/** Groups visually similar images using 64-bit dHash Hamming distance, within the same month. */
export async function findSimilarGroups(threshold: number): Promise<SimilarGroup[]> {
  const rows = await q<Row>(
    `select id, phash, width, height, size::float8 as size, favorite, month,
       thumb_url as "thumbUrl", taken_at as "takenAt"
     from photos where kind = 'image' and deleted_at is null and phash is not null
     order by month, taken_at`,
  )
  const hi = rows.map((r) => parseInt(r.phash.slice(0, 8), 16) | 0)
  const lo = rows.map((r) => parseInt(r.phash.slice(8), 16) | 0)
  const parent = rows.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const bestDistance = new Map<number, number>()

  let start = 0
  while (start < rows.length) {
    let end = start
    while (end < rows.length && rows[end].month === rows[start].month) end++
    for (let i = start; i < end; i++) {
      for (let j = i + 1; j < end; j++) {
        const d = popcount32(hi[i] ^ hi[j]) + popcount32(lo[i] ^ lo[j])
        if (d <= threshold) {
          parent[find(j)] = find(i)
          bestDistance.set(i, Math.min(bestDistance.get(i) ?? 64, d))
          bestDistance.set(j, Math.min(bestDistance.get(j) ?? 64, d))
        }
      }
    }
    start = end
  }

  const groups = new Map<number, number[]>()
  rows.forEach((_, i) => {
    if (!bestDistance.has(i)) return
    const root = find(i)
    groups.set(root, [...(groups.get(root) ?? []), i])
  })

  return Array.from(groups.values())
    .filter((g) => g.length > 1)
    .map((indices) => {
      const sorted = [...indices].sort((a, b) => {
        const A = rows[a]
        const B = rows[b]
        if (A.favorite !== B.favorite) return A.favorite ? -1 : 1
        const area = B.width * B.height - A.width * A.height
        if (area) return area
        return B.size - A.size
      })
      const keep = rows[sorted[0]]
      return {
        keepId: keep.id,
        items: sorted.map((i) => ({
          ...rows[i],
          distance: bestDistance.get(i) ?? 0,
          recommendDelete: rows[i].id !== keep.id && !rows[i].favorite,
        })),
      }
    })
    .sort((a, b) => b.items.length - a.items.length)
}
