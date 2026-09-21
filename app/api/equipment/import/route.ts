import { withAuth, ok } from '@/lib/auth/withAuth';
import { AppError } from '@/lib/errors';
import { parseCsv, parseXlsx, importEquipment } from '@/lib/services/import';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export const POST = withAuth(
  async (req, { requestId, profile }) => {
    const form = await req.formData();
    const file = form.get('file');
    const dryRun = form.get('dryRun') !== 'false';

    if (!(file instanceof File)) throw new AppError('VALIDATION_ERROR', { fields: { file: 'required' } });
    if (file.size > MAX_FILE_BYTES) throw new AppError('VALIDATION_ERROR', { fields: { file: 'file is too large' } });

    const isXlsx = file.name.toLowerCase().endsWith('.xlsx');
    const isCsv = file.name.toLowerCase().endsWith('.csv');
    if (!isXlsx && !isCsv) throw new AppError('VALIDATION_ERROR', { fields: { file: 'must be .xlsx or .csv' } });

    const rows = isXlsx
      ? await parseXlsx(await file.arrayBuffer())
      : parseCsv(await file.text());

    const [header, ...dataRows] = rows;
    if (!header) throw new AppError('VALIDATION_ERROR', { fields: { file: 'file is empty' } });

    const report = await importEquipment(dataRows, header, profile, requestId, !dryRun);
    return ok(report, requestId);
  },
  { role: ['admin', 'user'], action: 'equipment.create' },
);
