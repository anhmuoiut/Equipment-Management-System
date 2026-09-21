'use client';

/**
 * Small, reusable Dashboard building blocks — a KPI card and a horizontal
 * bar-list. No chart library: a bar list reads faster than a donut for
 * "which of these N categories is biggest" and stays legible as Types/
 * Statuses/Locations grow, which a pie chart doesn't. Every value here is
 * clickable where a drill-down makes sense — the Dashboard is meant to be
 * acted on, not just looked at.
 */
import type { ReactNode } from 'react';

export function KpiCard({
  label, value, tone = 'neutral', icon, onClick,
}: { label: string; value: number | string; tone?: 'neutral' | 'warn' | 'alert' | 'ok'; icon?: ReactNode; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} className="kpi-card" data-tone={tone} data-clickable={!!onClick}>
      <span className="kpi-card-icon" aria-hidden="true">{icon}</span>
      <span className="kpi-card-value">{value}</span>
      <span className="kpi-card-label">{label}</span>
    </Tag>
  );
}

export type BarDatum = { key: string; label: string; count: number; onClick?: () => void };

export function BarList({ data, total, emptyLabel }: { data: BarDatum[]; total: number; emptyLabel: string }) {
  if (data.length === 0) {
    return <p className="py-6 text-center text-[13px]" style={{ color: 'var(--ink-3)' }}>{emptyLabel}</p>;
  }
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <ul className="dashboard-bar-list">
      {data.map((d) => {
        const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
        const Row = d.onClick ? 'button' : 'div';
        return (
          <li key={d.key}>
            <Row type={d.onClick ? 'button' : undefined} onClick={d.onClick} className="dashboard-bar-row" data-clickable={!!d.onClick}>
              <span className="dashboard-bar-label">{d.label}</span>
              <span className="dashboard-bar-track"><span className="dashboard-bar-fill" style={{ width: `${(d.count / max) * 100}%` }} /></span>
              <span className="dashboard-bar-count">{d.count}<span className="dashboard-bar-pct">{pct}%</span></span>
            </Row>
          </li>
        );
      })}
    </ul>
  );
}

export function DashboardSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="dashboard-card">
      <div className="dashboard-card-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
