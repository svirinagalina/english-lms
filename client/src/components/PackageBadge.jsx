// "3 of 8 lessons used · 5 left" — the state of a student's paid package.
export function PackageBadge({ pkg }) {
  if (!pkg) return null
  if (pkg.lessonsPaid == null) {
    return <span className="paid-badge neutral">{pkg.held} {pkg.held === 1 ? 'lesson' : 'lessons'} held · no package set</span>
  }
  const left = pkg.remaining
  const tone = left <= 0 ? 'paid-badge' : left <= 2 ? 'paid-badge mid' : 'paid-badge active'
  return (
    <span className={tone}>
      {pkg.held} of {pkg.lessonsPaid} lessons used · {left > 0 ? `${left} left` : left === 0 ? 'package finished' : `${-left} over the package`}
    </span>
  )
}
