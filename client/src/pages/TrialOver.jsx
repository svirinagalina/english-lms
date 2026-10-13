import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../AuthContext'

// Three days after a trial lesson without paying: the platform waits for
// the payment; the report (with the plan and prices) and Payment stay open.
export default function TrialOver() {
  const { user, loading } = useAuth()
  const [reportId, setReportId] = useState(null)
  useEffect(() => { api.myBilling().then((data) => setReportId(data?.billing?.trial?.reportId ?? null)).catch(() => {}) }, [])
  if (loading) return <div className="centered">Загрузка…</div>
  if (!user) return <Navigate to="/login" replace />
  if (!user.trialOver) return <Navigate to="/" replace />
  return (
    <div className="centered"><div className="card ll-card">
      <div className="ll-kicker">Advent Academy</div>
      <h1 className="ll-title">Пробный доступ закончился</h1>
      <p className="ll-when">Три дня бесплатного доступа к платформе после пробного урока прошли. Чтобы продолжить заниматься с преподавателем, оплатите занятия — платформа откроется сразу после оплаты.</p>
      <div style={{ display: 'grid', gap: 10 }}>
        {reportId && <Link className="button ll-go" to={`/report/${reportId}`}>Открыть отчёт и план</Link>}
        <Link className="button ll-go" to="/billing">Перейти к оплате</Link>
      </div>
    </div></div>
  )
}
