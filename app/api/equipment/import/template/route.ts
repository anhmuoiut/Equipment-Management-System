import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { AppError } from '@/lib/errors';
import { generateTemplate } from '@/lib/services/import';

export const GET = withAuth(
  async (req) => {
    const format = new URL(req.url).searchParams.get('format');
    if (format !== 'xlsx' && format !== 'csv') throw new AppError('VALIDATION_ERROR', { fields: { format: 'must be xlsx or csv' } });

    const { buffer, contentType } = await generateTemplate(format);
    return new NextResponse(new Blob([buffer as unknown as BlobPart], { type: contentType }), {
      headers: {
        'Content-Disposition': `attachment; filename="equipment-import-template.${format}"`,
        'Cache-Control': 'no-store',
      },
    });
  },
  { role: ['admin', 'user'], action: 'equipment.create' },
);
