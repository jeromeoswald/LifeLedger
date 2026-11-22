import { Router } from 'express';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import { ATTENDANCE_EXPORT_HEADER, attendanceCsv, attendanceRows, periodRange } from '@lifeledger/shared';
import { requireAuth } from '../lib/tokens';
import { entriesBetween } from './attendance';

const monthQuery = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'month must be YYYY-MM') });

export const exportRouter = Router();
exportRouter.use(requireAuth);

async function monthData(userId: unknown, month: string) {
  const { start, end } = periodRange('month', `${month}-01`);
  return { start, end, entries: await entriesBetween(userId, start, end) };
}

exportRouter.get('/attendance.csv', async (req, res) => {
  const { month } = monthQuery.parse(req.query);
  const { start, end, entries } = await monthData(res.locals.userId, month);
  res
    .set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="attendance-${month}.csv"` })
    .send(attendanceCsv(entries, start, end));
});

exportRouter.get('/attendance.xlsx', async (req, res) => {
  const { month } = monthQuery.parse(req.query);
  const { start, end, entries } = await monthData(res.locals.userId, month);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Attendance ${month}`);
  ws.columns = ATTENDANCE_EXPORT_HEADER.map((header, i) => ({ header, width: [12, 6, 12, 11, 8, 9, 40][i] }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const r of attendanceRows(entries, start, end)) ws.addRow([r.date, r.day, r.status, r.work, r.ot, r.total, r.note]);
  // totals row; numbers stay numbers so Excel can sum/filter
  const last = ws.rowCount;
  const totals = ws.addRow(['Total', '', '', { formula: `SUM(D2:D${last})` }, { formula: `SUM(E2:E${last})` }, { formula: `SUM(F2:F${last})` }, '']);
  totals.font = { bold: true };
  res
    .set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="attendance-${month}.xlsx"`,
    })
    .send(Buffer.from(await wb.xlsx.writeBuffer()));
});
