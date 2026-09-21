'use client';

/**
 * Bulk import from a spreadsheet — Spec v0.9 mục 46.
 *
 * All-or-nothing, matching lib/services/import.ts: "Check file" always runs
 * a dry run first (no writes). Only once every row comes back clean does
 * "Import" become available, which re-submits the same file with the write
 * flag on. The server re-validates from scratch either way — this modal
 * never assumes the dry run it saw is still true.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ApiError } from '@/lib/client/api';
import { Button, Modal, Notice, Tag } from '@/components/ui';
import { translateError } from '@/lib/i18n/errors';

type ImportRowResult = {
  row: number;
  status: 'created' | 'error';
  serial_number?: string;
  errors?: string[];
  duplicate_warning?: boolean;
};

type ImportReport = {
  total: number;
  valid: number;
  invalid: number;
  committed: boolean;
  rows: ImportRowResult[];
};

async function submitImport(file: File, dryRun: boolean): Promise<ImportReport> {
  const form = new FormData();
  form.append('file', file);
  form.append('dryRun', String(dryRun));
  const res = await fetch('/api/equipment/import', { method: 'POST', body: form });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    const err = body?.error ?? {};
    throw new ApiError(err.code ?? 'SERVER_ERROR', err.message ?? 'Import failed.', err.details ?? {}, err.request_id ?? '-', res.status);
  }
  return body.data as ImportReport;
}

export function ImportEquipmentModal({
  open, onClose, onImported,
}: { open: boolean; onClose: () => void; onImported: () => void }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'vi' ? 'vi' : 'en';
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  function reset() {
    setFile(null);
    setReport(null);
    setError(null);
  }

  async function check() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      setReport(await submitImport(file, true));
    } catch (e) {
      if (e instanceof ApiError) setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const result = await submitImport(file, false);
      setReport(result);
      onImported();
    } catch (e) {
      if (e instanceof ApiError) setError(e);
    } finally {
      setBusy(false);
    }
  }

  const canConfirm = !!report && !report.committed && report.invalid === 0 && report.valid > 0;

  return (
    <Modal open={open} wide title={t('import.title')} onClose={() => { reset(); onClose(); }}
      footer={
        <>
          {/* "Cancel" before anything has committed (matches every other
              modal's dismiss button); "Close" once rows are actually
              imported, since there's nothing left to cancel at that point. */}
          <Button type="button" onClick={() => { reset(); onClose(); }}>
            {report?.committed ? t('common.close') : t('common.cancel')}
          </Button>
          {!report?.committed && (
            <Button type="button" disabled={!file} loading={busy} onClick={() => void check()}>
              {t('import.checkFile')}
            </Button>
          )}
          {canConfirm && (
            <Button type="button" variant="primary" loading={busy} onClick={() => void confirmImport()}>
              {t('import.importRows', { count: report!.valid })}
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-4">
        <div>
          <p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>{t('import.instructions')}</p>
          <div className="mt-2 flex gap-2">
            <Link href="/api/equipment/import/template?format=xlsx" className="inline-block">
              <Button type="button" size="sm">{t('import.downloadXlsx')}</Button>
            </Link>
            <Link href="/api/equipment/import/template?format=csv" className="inline-block">
              <Button type="button" size="sm">{t('import.downloadCsv')}</Button>
            </Link>
          </div>
        </div>

        <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
          {t('import.fileLabel')}
          <input
            type="file" accept=".xlsx,.csv"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setReport(null); setError(null); }}
            className="mt-1 block w-full text-[13px]"
          />
        </label>

        {error && <Notice tone="alert">{translateError(error.code, language, error.message)}</Notice>}

        {report && (
          <div>
            <p className="text-[13px] font-medium">
              {report.committed
                ? t('import.importedSummary', { valid: report.valid, total: report.total })
                : report.invalid === 0
                  ? t('import.allRowsGood', { total: report.total })
                  : t('import.someRowsHaveProblem', { invalid: report.invalid, total: report.total })}
            </p>
            <div className="mt-2 max-h-64 overflow-y-auto border" style={{ borderColor: 'var(--rule-soft)' }}>
              <table className="grid-table">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>{t('import.row')}</th>
                    <th>{t('import.serial')}</th>
                    <th>{t('common.status')}</th>
                    <th>{t('import.details')}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr key={r.row}>
                      <td className="ident">{r.row}</td>
                      <td className="ident">{r.serial_number ?? '—'}</td>
                      <td>
                        {r.status === 'created'
                          ? <Tag text={report.committed ? t('import.created') : t('import.ok')} tone="ok" />
                          : <Tag text={t('import.error')} tone="warn" />}
                      </td>
                      <td className="text-[12px]" style={{ color: 'var(--ink-2)' }}>
                        {r.errors?.join(' ')}
                        {r.duplicate_warning && t('import.duplicateWarning')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
