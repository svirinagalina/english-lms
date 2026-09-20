// A round profile picture, or the person's initials on the accent colour.
export function Avatar({ user, size = 32, className = '' }) {
  const initials = (user?.name ?? '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) }
  return user?.avatar ? (
    <img className={`avatar ${className}`} src={user.avatar} alt="" style={style} />
  ) : (
    <span className={`avatar avatar-initials ${className}`} style={style} aria-hidden="true">{initials}</span>
  )
}
