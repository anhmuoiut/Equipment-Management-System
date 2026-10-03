'use client';

/** Xuất Excel đúng các cột và dòng đang hiện (sau tìm kiếm / lọc / sắp xếp). */
export type ExportColumn<R> = { label: string; value: (row: R, index: number) => string | number | null };

export async function exportToExcel<R>(name: string, columns: ExportColumn<R>[], rows: R[]): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(name.slice(0, 31));
  ws.addRow(columns.map((c) => c.label));
  ws.getRow(1).font = { bold: true };
  rows.forEach((r, i) => ws.addRow(columns.map((c) => c.value(r, i) ?? '')));
  ws.columns.forEach((col, i) => {
    const longest = Math.max(columns[i]?.label.length ?? 8, ...rows.slice(0, 500).map((r, j) => String(columns[i]?.value(r, j) ?? '').length));
    col.width = Math.min(Math.max(longest + 2, 6), 60);
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `${name}-${stamp}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
