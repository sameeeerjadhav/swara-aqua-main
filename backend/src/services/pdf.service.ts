import PDFDocument from 'pdfkit';
import { Response } from 'express';
import { Bill } from '../models/billing.model';
import path from 'path';
import fs from 'fs';
import pool from '../config/db';
import { RowDataPacket } from 'mysql2/promise';
import { formatLocalDate } from '../utils/date';

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt  = (n: number | string) => `₹ ${Number(n).toFixed(2)}`;

const monthLabel = (m: string) => {
  const [y, mo] = m.split('-');
  const names = ['January','February','March','April','May','June',
                 'July','August','September','October','November','December'];
  return `${names[Number(mo) - 1]} ${y}`;
};

/** Convert number to Indian English words */
const numberToWords = (n: number): string => {
  if (n === 0) return 'Zero';
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
    'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];

  const convert = (num: number): string => {
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
    if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' and ' + convert(num % 100) : '');
    if (num < 100000) return convert(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + convert(num % 1000) : '');
    if (num < 10000000) return convert(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + convert(num % 100000) : '');
    return convert(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + convert(num % 10000000) : '');
  };

  const intPart = Math.floor(n);
  const decPart = Math.round((n - intPart) * 100);
  let result = convert(intPart) + ' Rupees';
  if (decPart > 0) result += ' and ' + convert(decPart) + ' Paise';
  return result + ' only';
};

// ── Asset paths ──────────────────────────────────────────────────────────────

const assetsDir   = path.resolve(__dirname, '../../assets/bill');
const frontendDir = path.resolve(__dirname, '../../../frontend/public/bill');

const getAssetPath = (filename: string): string | null => {
  const candidates = [
    path.join(assetsDir, filename),
    path.join(frontendDir, filename),
    path.join(process.cwd(), 'assets', 'bill', filename),
    path.join(process.cwd(), '..', 'frontend', 'public', 'bill', filename),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  console.warn(`[PDF] Asset not found: ${filename}`);
  return null;
};

// ── Daily delivery data ──────────────────────────────────────────────────────

interface DailyJar { day: number; jars: number; }

const getDailyDeliveries = async (customerId: number, month: string): Promise<DailyJar[]> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT DAY(COALESCE(d.delivered_at, d.created_at)) AS day, SUM(d.delivered_quantity) AS jars
     FROM deliveries d
     JOIN orders o ON o.id = d.order_id
     WHERE o.customer_id = ?
       AND DATE_FORMAT(COALESCE(d.delivered_at, d.created_at), '%Y-%m') = ?
       AND d.status = 'delivered'
     GROUP BY DAY(COALESCE(d.delivered_at, d.created_at))
     ORDER BY day ASC`,
    [customerId, month]
  );
  return rows.map(r => ({ day: Number(r.day), jars: Number(r.jars) }));
};

// ── Company Details ──────────────────────────────────────────────────────────

const COMPANY = {
  name:    'Swara Aqua',
  address: 'wagh nagar, Jalgaon',
  phone:   '+91 83800 38838',
  email:   'sarvam.enterprises1234@gmail.com',
  state:   '27-Maharashtra',
  firm:    'Swara Aqua',
  bank: {
    name:    'Union Bank Of India, Jalgaon',
    account: '174411010000103',
    ifsc:    'UBIN0817449',
    holder:  'Swara Aqua',
  },
};

// ── Colors ───────────────────────────────────────────────────────────────────

const C = {
  black:    '#000000',
  dark:     '#1a1a1a',
  mid:      '#555555',
  light:    '#888888',
  border:   '#cccccc',
  headerBg: '#e8e8e8',
  totalBg:  '#333333',
  white:    '#ffffff',
  green:    '#16a34a',
  red:      '#dc2626',
  calBg:    '#f0f0f0',
  calFill:  '#d4edda',
};

// ═══════════════════════════════════════════════════════════════════════════════
//  PDF GENERATION — Monthly Bill
// ═══════════════════════════════════════════════════════════════════════════════

export const generateBillPDF = async (bill: Bill, res: Response): Promise<void> => {
  const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition',
    `inline; filename=SwaraAqua-Invoice-${bill.month}-${bill.id}.pdf`);
  doc.pipe(res);

  const W  = 595;
  const M  = 36;
  const IW = W - M * 2;

  const logoPath = getAssetPath('swaralogo.png');
  const sigPath  = getAssetPath('signature.png');

  const dailyData = await getDailyDeliveries(bill.customer_id, bill.month);
  const dailyMap  = new Map<number, number>();
  dailyData.forEach(d => dailyMap.set(d.day, d.jars));

  const due         = Math.max(0, Number(bill.total_amount) - Number(bill.paid_amount));
  const invoiceDate = new Date(bill.created_at).toLocaleDateString('en-IN',
    { day: '2-digit', month: '2-digit', year: 'numeric' });

  // ═════════════════════════════════════════════════════════════════════════════
  // HEADER — Company info + Logo
  // ═════════════════════════════════════════════════════════════════════════════

  let y = M;

  if (logoPath) {
    try { doc.image(logoPath, W - M - 70, y, { width: 70, height: 70 }); } catch {}
  }

  doc.fillColor(C.black).fontSize(18).font('Helvetica-Bold')
     .text(COMPANY.firm, M, y);
  y += 22;
  doc.fillColor(C.mid).fontSize(9).font('Helvetica')
     .text(COMPANY.address, M, y);
  y += 13;
  doc.text(`Phone no.: ${COMPANY.phone}`, M, y);
  y += 13;
  doc.text(`Email: ${COMPANY.email}`, M, y);
  y += 13;
  doc.text(`State: ${COMPANY.state}`, M, y);
  y += 24;

  // ═════════════════════════════════════════════════════════════════════════════
  // TAX INVOICE title
  // ═════════════════════════════════════════════════════════════════════════════

  doc.moveTo(M, y).lineTo(W - M, y).strokeColor(C.border).lineWidth(0.5).stroke();
  y += 8;
  doc.fillColor(C.mid).fontSize(20).font('Helvetica')
     .text('Tax Invoice', M, y, { width: IW, align: 'center' });
  y += 28;
  doc.moveTo(M, y).lineTo(W - M, y).strokeColor(C.border).lineWidth(0.5).stroke();
  y += 14;

  // ═════════════════════════════════════════════════════════════════════════════
  // BILL TO + INVOICE DETAILS
  // ═════════════════════════════════════════════════════════════════════════════

  doc.fillColor(C.mid).fontSize(10).font('Helvetica-Bold').text('Bill To', M, y);
  y += 15;
  doc.fillColor(C.black).fontSize(12).font('Helvetica-Bold')
     .text(bill.customer_name || 'Customer', M, y);

  const rightX = W - M - 180;
  doc.fillColor(C.mid).fontSize(10).font('Helvetica-Bold')
     .text('Invoice Details', rightX, y - 15, { width: 180, align: 'right' });
  doc.fillColor(C.dark).fontSize(9.5).font('Helvetica')
     .text(`Invoice No.: ${bill.id}`, rightX, y, { width: 180, align: 'right' });
  doc.text(`Date: ${invoiceDate}`, rightX, y + 14, { width: 180, align: 'right' });

  y += 36;

  // ═════════════════════════════════════════════════════════════════════════════
  // ITEMS TABLE
  // ═════════════════════════════════════════════════════════════════════════════

  const colX = {
    hash:  M,
    item:  M + 30,
    hsn:   M + 200,
    qty:   M + 290,
    price: M + 370,
    amt:   M + 440,
  };
  const colW = {
    hash:  30,
    item:  170,
    hsn:   90,
    qty:   80,
    price: 70,
    amt:   IW - 440,
  };

  doc.rect(M, y, IW, 24).fill(C.headerBg);
  doc.fillColor(C.dark).fontSize(9).font('Helvetica-Bold');
  doc.text('#',           colX.hash + 6, y + 7, { width: colW.hash });
  doc.text('Item Name',   colX.item,     y + 7, { width: colW.item });
  doc.text('HSN/ SAC',    colX.hsn,      y + 7, { width: colW.hsn });
  doc.text('Quantity',    colX.qty,      y + 7, { width: colW.qty,   align: 'center' });
  doc.text('Price/ Unit', colX.price,    y + 7, { width: colW.price, align: 'right' });
  doc.text('Amount',      colX.amt,      y + 7, { width: colW.amt,   align: 'right' });
  y += 24;

  doc.rect(M, y, IW, 28).strokeColor(C.border).lineWidth(0.5).stroke();
  doc.fillColor(C.dark).fontSize(9.5).font('Helvetica');
  doc.text('1',                        colX.hash + 6, y + 9, { width: colW.hash });
  doc.font('Helvetica-Bold').text('Water Jar Refill', colX.item, y + 9, { width: colW.item });
  doc.font('Helvetica').text('',       colX.hsn,      y + 9, { width: colW.hsn });
  doc.text(String(bill.total_jars),    colX.qty,      y + 9, { width: colW.qty,   align: 'center' });
  doc.text(`₹ ${Number(bill.jar_rate).toFixed(2)}`, colX.price, y + 9, { width: colW.price, align: 'right' });
  doc.font('Helvetica-Bold')
     .text(`₹ ${Number(bill.subtotal).toFixed(2)}`, colX.amt, y + 9, { width: colW.amt, align: 'right' });
  y += 28;

  doc.rect(M, y, IW, 24).strokeColor(C.border).lineWidth(0.5).stroke();
  doc.fillColor(C.dark).fontSize(9.5).font('Helvetica-Bold');
  doc.text('Total',              colX.item, y + 7, { width: colW.item });
  doc.text(String(bill.total_jars), colX.qty, y + 7, { width: colW.qty, align: 'center' });
  doc.text(`₹ ${Number(bill.subtotal).toFixed(2)}`, colX.amt, y + 7, { width: colW.amt, align: 'right' });
  y += 24;

  // ═════════════════════════════════════════════════════════════════════════════
  // PAYMENT BREAKDOWN
  // ═════════════════════════════════════════════════════════════════════════════

  y += 10;
  const cashPaid    = Number(bill.cash_paid)    || 0;
  const onlinePaid  = Number(bill.online_paid)  || 0;
  const advancePaid = Number(bill.advance_paid) || 0;
  const totalPaid   = Number(bill.paid_amount)  || 0;
  const amtDue      = Math.max(0, Number(bill.total_amount) - totalPaid);

  // Section heading
  doc.fillColor(C.dark).fontSize(9).font('Helvetica-Bold')
     .text('Payment Breakdown', M, y);
  y += 14;

  const pbRowH = 20;
  const pbRows: { label: string; value: string; bold?: boolean; dark?: boolean }[] = [
    { label: 'Paid by Cash',    value: `₹ ${cashPaid.toFixed(2)}`   },
    { label: 'Paid by Online',  value: `₹ ${onlinePaid.toFixed(2)}` },
    { label: 'Paid by Advance', value: `₹ ${advancePaid.toFixed(2)}` },
    { label: 'Total Paid',      value: `₹ ${totalPaid.toFixed(2)}`,   bold: true },
    { label: 'Amount Due',      value: `₹ ${amtDue.toFixed(2)}`,      bold: true, dark: amtDue > 0 },
  ];

  const halfW = IW / 2;
  pbRows.forEach(({ label, value, bold, dark }) => {
    doc.rect(M, y, halfW, pbRowH).strokeColor(C.border).lineWidth(0.4).stroke();
    doc.rect(M + halfW, y, halfW, pbRowH).strokeColor(C.border).lineWidth(0.4).stroke();
    doc.fillColor(dark ? C.red : C.dark).fontSize(9).font(bold ? 'Helvetica-Bold' : 'Helvetica')
       .text(label, M + 6, y + 6, { width: halfW - 12 });
    doc.fillColor(dark ? C.red : C.dark).fontSize(9).font('Helvetica-Bold')
       .text(value, M + halfW + 6, y + 6, { width: halfW - 12, align: 'right' });
    y += pbRowH;
  });
  y += 8;

  // ═════════════════════════════════════════════════════════════════════════════
  // AMOUNT IN WORDS + FINANCIAL SUMMARY (side by side)
  // ═════════════════════════════════════════════════════════════════════════════

  y += 12;
  const leftColW   = IW * 0.48;
  const rightColW  = IW * 0.52;
  const rightStartX = M + leftColW;

  doc.fillColor(C.dark).fontSize(9).font('Helvetica-Bold')
     .text('Invoice Amount In Words', M, y);
  y += 14;
  const wordsY = y;
  doc.fillColor(C.mid).fontSize(8.5).font('Helvetica')
     .text(numberToWords(Number(bill.total_amount)), M, y, { width: leftColW - 20 });

  const summaryRows = [
    { label: 'Sub Total',    value: `₹ ${Number(bill.subtotal).toFixed(2)}`,     highlight: false },
    { label: 'Total',        value: `₹ ${Number(bill.total_amount).toFixed(2)}`, highlight: true  },
    { label: 'Received',     value: `₹ ${Number(bill.paid_amount).toFixed(2)}`,  highlight: false },
    { label: 'Balance',      value: `₹ ${due.toFixed(2)}`,                       highlight: false },
    { label: 'Payment Mode', value: due > 0 ? 'Credit' : 'Paid',                highlight: false },
  ];

  let ssy = wordsY - 14;
  summaryRows.forEach(({ label, value, highlight }) => {
    if (highlight) {
      doc.rect(rightStartX, ssy, rightColW, 18).fill(C.totalBg);
      doc.fillColor(C.white).fontSize(9).font('Helvetica-Bold')
         .text(label, rightStartX + 8, ssy + 5, { width: rightColW * 0.45 });
      doc.fillColor(C.white).fontSize(9).font('Helvetica-Bold')
         .text(value, rightStartX + 8, ssy + 5, { width: rightColW - 16, align: 'right' });
    } else {
      doc.rect(rightStartX, ssy, rightColW, 18).strokeColor(C.border).lineWidth(0.5).stroke();
      doc.fillColor(C.dark).fontSize(9).font('Helvetica')
         .text(label, rightStartX + 8, ssy + 5, { width: rightColW * 0.45 });
      doc.fillColor(C.dark).fontSize(9).font('Helvetica-Bold')
         .text(value, rightStartX + 8, ssy + 5, { width: rightColW - 16, align: 'right' });
    }
    ssy += 18;
  });

  y = Math.max(y + 20, ssy + 8);

  // Terms
  doc.fillColor(C.dark).fontSize(9).font('Helvetica-Bold')
     .text('Terms And Conditions', M, y);
  y += 14;
  doc.fillColor(C.mid).fontSize(8.5).font('Helvetica')
     .text('Thank you for doing business with us.', M, y, { width: leftColW - 20 });

  y += 30;
  doc.moveTo(M, y).lineTo(W - M, y).strokeColor(C.border).lineWidth(0.5).stroke();
  y += 14;

  // ═════════════════════════════════════════════════════════════════════════════
  // BANK DETAILS + SIGNATURE
  // ═════════════════════════════════════════════════════════════════════════════

  doc.fillColor(C.dark).fontSize(9.5).font('Helvetica-Bold').text('Pay To:', M, y);
  y += 16;
  const bankY = y;
  doc.fillColor(C.mid).fontSize(8.5).font('Helvetica')
     .text(`Bank Name: ${COMPANY.bank.name}`, M, y);       y += 13;
  doc.text(`Bank Account No.: ${COMPANY.bank.account}`, M, y); y += 13;
  doc.text(`Bank IFSC code: ${COMPANY.bank.ifsc}`, M, y);  y += 13;
  doc.text(`Account Holder's Name: ${COMPANY.bank.holder}`, M, y);

  const sigBlockX = rightStartX + 20;
  doc.fillColor(C.dark).fontSize(9).font('Helvetica')
     .text(`For: ${COMPANY.firm}`, sigBlockX, bankY - 16, { width: rightColW - 20 });
  if (sigPath) {
    try { doc.image(sigPath, sigBlockX + 10, bankY, { width: 100, height: 45 }); } catch {}
  }
  doc.fillColor(C.dark).fontSize(9).font('Helvetica-Bold')
     .text('Authorized Signatory', sigBlockX, bankY + 50, { width: rightColW - 20 });

  y += 65;
  doc.moveTo(M, y).lineTo(W - M, y).strokeColor(C.border).lineWidth(0.5).stroke();
  y += 14;

  // ═════════════════════════════════════════════════════════════════════════════
  // DAILY DELIVERY BREAKDOWN — at the bottom
  // ═════════════════════════════════════════════════════════════════════════════

  doc.fillColor(C.dark).fontSize(9).font('Helvetica-Bold')
     .text(`Daily Delivery Breakdown — ${monthLabel(bill.month)}`, M, y);
  y += 16;

  const [bY, bM] = bill.month.split('-').map(Number);
  const daysInMonth = new Date(bY, bM, 0).getDate();

  const COLS  = 16;
  const cellW = Math.floor(IW / COLS);
  const cellH = 28;

  // Row 1: Days 1–15
  doc.rect(M, y, cellW, cellH).fill(C.headerBg).strokeColor(C.border).lineWidth(0.5).stroke();
  doc.fillColor(C.dark).fontSize(7).font('Helvetica-Bold')
     .text('Day', M + 3, y + 10, { width: cellW - 6 });

  for (let d = 1; d <= 15; d++) {
    const cx   = M + d * cellW;
    const jars = dailyMap.get(d) || 0;
    doc.rect(cx, y, cellW, cellH).fill(jars > 0 ? C.calFill : C.white).strokeColor(C.border).lineWidth(0.5).stroke();
    doc.fillColor(C.mid).fontSize(6.5).font('Helvetica')
       .text(String(d), cx + 2, y + 3, { width: cellW - 4, align: 'center' });
    doc.fillColor(jars > 0 ? C.dark : C.light).fontSize(9).font(jars > 0 ? 'Helvetica-Bold' : 'Helvetica')
       .text(String(jars), cx + 2, y + 13, { width: cellW - 4, align: 'center' });
  }
  y += cellH;

  // Row 2: Days 16–end
  doc.rect(M, y, cellW, cellH).fill(C.headerBg).strokeColor(C.border).lineWidth(0.5).stroke();
  doc.fillColor(C.dark).fontSize(7).font('Helvetica-Bold')
     .text('Day', M + 3, y + 10, { width: cellW - 6 });

  for (let i = 0; i < 15; i++) {
    const d  = 16 + i;
    const cx = M + (i + 1) * cellW;
    if (d <= daysInMonth) {
      const jars = dailyMap.get(d) || 0;
      doc.rect(cx, y, cellW, cellH).fill(jars > 0 ? C.calFill : C.white).strokeColor(C.border).lineWidth(0.5).stroke();
      doc.fillColor(C.mid).fontSize(6.5).font('Helvetica')
         .text(String(d), cx + 2, y + 3, { width: cellW - 4, align: 'center' });
      doc.fillColor(jars > 0 ? C.dark : C.light).fontSize(9).font(jars > 0 ? 'Helvetica-Bold' : 'Helvetica')
         .text(String(jars), cx + 2, y + 13, { width: cellW - 4, align: 'center' });
    } else {
      doc.rect(cx, y, cellW, cellH).fill(C.calBg).strokeColor(C.border).lineWidth(0.5).stroke();
    }
  }
  y += cellH + 10;

  // ═════════════════════════════════════════════════════════════════════════════

  doc.end();
};

// ═══════════════════════════════════════════════════════════════════════════════
//  REPORT PDF — Flexible date range invoice
// ═══════════════════════════════════════════════════════════════════════════════

interface ReportData {
  customer: { id: number; name: string; phone: string; jar_rate: number; address?: string };
  startDate: string;
  endDate: string;
  totalJars: number;
  jarRate: number;
  totalAmount: number;
  days: { date: string; jars: number }[];
  cashPaid:    number;
  onlinePaid:  number;
  advancePaid: number;
  totalPaid:   number;
  amountDue:   number;
}

export const generateReportPDF = async (data: ReportData, res: Response): Promise<void> => {
  const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true });

  const periodLabel = data.startDate === data.endDate
    ? new Date(data.startDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : `${new Date(data.startDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} — ${new Date(data.endDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition',
    `inline; filename=SwaraAqua-Report-${data.startDate}-to-${data.endDate}.pdf`);
  doc.pipe(res);

  const W  = 595;
  const M  = 36;
  const IW = W - M * 2;

  const logoPath = getAssetPath('swaralogo.png');
  const sigPath  = getAssetPath('signature.png');

  const dailyMap = new Map<string, number>();
  data.days.forEach(d => dailyMap.set(d.date, d.jars));

  let y = M;

  // ═══ HEADER ════════════════════════════════════════════════════════════════

  if (logoPath) {
    try { doc.image(logoPath, W - M - 70, y, { width: 70, height: 70 }); } catch {}
  }

  doc.fillColor(C.black).fontSize(18).font('Helvetica-Bold').text(COMPANY.firm, M, y);
  y += 22;
  doc.fillColor(C.mid).fontSize(9).font('Helvetica').text(COMPANY.address, M, y);
  y += 13;
  doc.text(`Phone no.: ${COMPANY.phone}`, M, y);
  y += 13;
  doc.text(`Email: ${COMPANY.email}`, M, y);
  y += 13;
  doc.text(`State: ${COMPANY.state}`, M, y);
  y += 24;

  // ═══ TITLE ════════════════════════════════════════════════════════════════

  doc.moveTo(M, y).lineTo(W - M, y).strokeColor(C.border).lineWidth(0.5).stroke();
  y += 8;
  doc.fillColor(C.mid).fontSize(20).font('Helvetica')
     .text('Delivery Report', M, y, { width: IW, align: 'center' });
  y += 28;
  doc.moveTo(M, y).lineTo(W - M, y).strokeColor(C.border).lineWidth(0.5).stroke();
  y += 14;

  // ═══ BILL TO + DETAILS ══════════════════════════════════════════════════════

  doc.fillColor(C.mid).fontSize(10).font('Helvetica-Bold').text('Bill To', M, y);
  y += 15;
  doc.fillColor(C.black).fontSize(12).font('Helvetica-Bold').text(data.customer.name, M, y);

  const rightX = W - M - 180;
  doc.fillColor(C.mid).fontSize(10).font('Helvetica-Bold')
     .text('Report Details', rightX, y - 15, { width: 180, align: 'right' });
  doc.fillColor(C.dark).fontSize(9.5).font('Helvetica')
     .text(`Period: ${periodLabel}`, rightX, y, { width: 180, align: 'right' });
  doc.text(`Date: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`,
     rightX, y + 14, { width: 180, align: 'right' });

  y += 36;

  // ═══ ITEMS TABLE ════════════════════════════════════════════════════════════

  const colX = { hash: M, item: M + 30, hsn: M + 200, qty: M + 290, price: M + 370, amt: M + 440 };
  const colW = { hash: 30, item: 170, hsn: 90, qty: 80, price: 70, amt: IW - 440 };

  doc.rect(M, y, IW, 24).fill(C.headerBg);
  doc.fillColor(C.dark).fontSize(9).font('Helvetica-Bold');
  doc.text('#',           colX.hash + 6, y + 7, { width: colW.hash });
  doc.text('Item Name',   colX.item,     y + 7, { width: colW.item });
  doc.text('HSN/ SAC',    colX.hsn,      y + 7, { width: colW.hsn });
  doc.text('Quantity',    colX.qty,      y + 7, { width: colW.qty,   align: 'center' });
  doc.text('Price/ Unit', colX.price,    y + 7, { width: colW.price, align: 'right' });
  doc.text('Amount',      colX.amt,      y + 7, { width: colW.amt,   align: 'right' });
  y += 24;

  doc.rect(M, y, IW, 28).strokeColor(C.border).lineWidth(0.5).stroke();
  doc.fillColor(C.dark).fontSize(9.5).font('Helvetica');
  doc.text('1', colX.hash + 6, y + 9, { width: colW.hash });
  doc.font('Helvetica-Bold').text('Water Jar Refill', colX.item, y + 9, { width: colW.item });
  doc.font('Helvetica').text('', colX.hsn, y + 9, { width: colW.hsn });
  doc.text(String(data.totalJars), colX.qty, y + 9, { width: colW.qty, align: 'center' });
  doc.text(`₹ ${data.jarRate.toFixed(2)}`, colX.price, y + 9, { width: colW.price, align: 'right' });
  doc.font('Helvetica-Bold').text(`₹ ${data.totalAmount.toFixed(2)}`, colX.amt, y + 9, { width: colW.amt, align: 'right' });
  y += 28;

  doc.rect(M, y, IW, 24).strokeColor(C.border).lineWidth(0.5).stroke();
  doc.fillColor(C.dark).fontSize(9.5).font('Helvetica-Bold');
  doc.text('Total',                   colX.item, y + 7, { width: colW.item });
  doc.text(String(data.totalJars),    colX.qty,  y + 7, { width: colW.qty, align: 'center' });
  doc.text(`₹ ${data.totalAmount.toFixed(2)}`, colX.amt, y + 7, { width: colW.amt, align: 'right' });
  y += 24;

  // ═══ PAYMENT BREAKDOWN ══════════════════════════════════════════════════════

  y += 10;
  doc.fillColor(C.dark).fontSize(9).font('Helvetica-Bold')
     .text('Payment Breakdown', M, y);
  y += 14;

  const pbRowH = 20;
  const halfW  = IW / 2;
  const pbRows: { label: string; value: string; bold?: boolean; dark?: boolean }[] = [
    { label: 'Paid by Cash',    value: `₹ ${(data.cashPaid    || 0).toFixed(2)}` },
    { label: 'Paid by Online',  value: `₹ ${(data.onlinePaid  || 0).toFixed(2)}` },
    { label: 'Paid by Advance', value: `₹ ${(data.advancePaid || 0).toFixed(2)}` },
    { label: 'Total Paid',      value: `₹ ${(data.totalPaid   || 0).toFixed(2)}`,   bold: true },
    { label: 'Amount Due',      value: `₹ ${(data.amountDue   || 0).toFixed(2)}`,   bold: true, dark: (data.amountDue || 0) > 0 },
  ];

  pbRows.forEach(({ label, value, bold, dark }) => {
    doc.rect(M, y, halfW, pbRowH).strokeColor(C.border).lineWidth(0.4).stroke();
    doc.rect(M + halfW, y, halfW, pbRowH).strokeColor(C.border).lineWidth(0.4).stroke();
    doc.fillColor(dark ? C.red : C.dark).fontSize(9).font(bold ? 'Helvetica-Bold' : 'Helvetica')
       .text(label, M + 6, y + 6, { width: halfW - 12 });
    doc.fillColor(dark ? C.red : C.dark).fontSize(9).font('Helvetica-Bold')
       .text(value, M + halfW + 6, y + 6, { width: halfW - 12, align: 'right' });
    y += pbRowH;
  });
  y += 8;

  // ═══ AMOUNT IN WORDS + SUMMARY ══════════════════════════════════════════════

  y += 12;

  const leftColW   = IW * 0.48;
  const rightColW  = IW * 0.52;
  const rightStartX = M + leftColW;

  doc.fillColor(C.dark).fontSize(9).font('Helvetica-Bold').text('Invoice Amount In Words', M, y);
  y += 14;
  const wordsY = y;
  doc.fillColor(C.mid).fontSize(8.5).font('Helvetica')
     .text(numberToWords(data.totalAmount), M, y, { width: leftColW - 20 });

  const summaryRows = [
    { label: 'Sub Total', value: `₹ ${data.totalAmount.toFixed(2)}`, highlight: false },
    { label: 'Total',     value: `₹ ${data.totalAmount.toFixed(2)}`, highlight: true  },
  ];

  let ssy = wordsY - 14;
  summaryRows.forEach(({ label, value, highlight }) => {
    if (highlight) {
      doc.rect(rightStartX, ssy, rightColW, 18).fill(C.totalBg);
      doc.fillColor(C.white).fontSize(9).font('Helvetica-Bold')
         .text(label, rightStartX + 8, ssy + 5, { width: rightColW * 0.45 });
      doc.fillColor(C.white).fontSize(9).font('Helvetica-Bold')
         .text(value, rightStartX + 8, ssy + 5, { width: rightColW - 16, align: 'right' });
    } else {
      doc.rect(rightStartX, ssy, rightColW, 18).strokeColor(C.border).lineWidth(0.5).stroke();
      doc.fillColor(C.dark).fontSize(9).font('Helvetica')
         .text(label, rightStartX + 8, ssy + 5, { width: rightColW * 0.45 });
      doc.fillColor(C.dark).fontSize(9).font('Helvetica-Bold')
         .text(value, rightStartX + 8, ssy + 5, { width: rightColW - 16, align: 'right' });
    }
    ssy += 18;
  });

  y = Math.max(y + 20, ssy + 8);

  // Terms
  doc.fillColor(C.dark).fontSize(9).font('Helvetica-Bold').text('Terms And Conditions', M, y);
  y += 14;
  doc.fillColor(C.mid).fontSize(8.5).font('Helvetica')
     .text('Thank you for doing business with us.', M, y, { width: leftColW - 20 });

  y += 30;
  doc.moveTo(M, y).lineTo(W - M, y).strokeColor(C.border).lineWidth(0.5).stroke();
  y += 14;

  // ═══ BANK DETAILS + SIGNATURE ══════════════════════════════════════════════

  doc.fillColor(C.dark).fontSize(9.5).font('Helvetica-Bold').text('Pay To:', M, y);
  y += 16;
  const bankY = y;
  doc.fillColor(C.mid).fontSize(8.5).font('Helvetica')
     .text(`Bank Name: ${COMPANY.bank.name}`, M, y);       y += 13;
  doc.text(`Bank Account No.: ${COMPANY.bank.account}`, M, y); y += 13;
  doc.text(`Bank IFSC code: ${COMPANY.bank.ifsc}`, M, y);  y += 13;
  doc.text(`Account Holder's Name: ${COMPANY.bank.holder}`, M, y);

  const sigBlockX = rightStartX + 20;
  doc.fillColor(C.dark).fontSize(9).font('Helvetica')
     .text(`For: ${COMPANY.firm}`, sigBlockX, bankY - 16, { width: rightColW - 20 });
  if (sigPath) {
    try { doc.image(sigPath, sigBlockX + 10, bankY, { width: 100, height: 45 }); } catch {}
  }
  doc.fillColor(C.dark).fontSize(9).font('Helvetica-Bold')
     .text('Authorized Signatory', sigBlockX, bankY + 50, { width: rightColW - 20 });

  y += 65;
  doc.moveTo(M, y).lineTo(W - M, y).strokeColor(C.border).lineWidth(0.5).stroke();
  y += 14;

  // ═══ DAILY BREAKDOWN TABLE — at the bottom ══════════════════════════════════

  doc.fillColor(C.dark).fontSize(9).font('Helvetica-Bold')
     .text(`Daily Delivery Breakdown — ${periodLabel}`, M, y);
  y += 16;

  const calStart = new Date(data.startDate + 'T00:00:00');
  const calEnd   = new Date(data.endDate   + 'T00:00:00');
  const allDates: string[] = [];
  for (let d = new Date(calStart); d <= calEnd; d.setDate(d.getDate() + 1)) {
    allDates.push(formatLocalDate(d));
  }

  const COLS  = 16;
  const cellW = Math.floor(IW / COLS);
  const cellH = 28;

  for (let rowStart = 0; rowStart < allDates.length; rowStart += 15) {
    const rowDates = allDates.slice(rowStart, rowStart + 15);

    doc.rect(M, y, cellW, cellH).fill(C.headerBg).strokeColor(C.border).lineWidth(0.5).stroke();
    doc.fillColor(C.dark).fontSize(7).font('Helvetica-Bold')
       .text('Day', M + 3, y + 10, { width: cellW - 6 });

    for (let i = 0; i < 15; i++) {
      const cx = M + (i + 1) * cellW;
      if (i < rowDates.length) {
        const dateStr = rowDates[i];
        const jars    = dailyMap.get(dateStr) || 0;
        const dayNum  = new Date(dateStr + 'T00:00:00').getDate();
        doc.rect(cx, y, cellW, cellH)
           .fill(jars > 0 ? C.calFill : C.white)
           .strokeColor(C.border).lineWidth(0.5).stroke();
        doc.fillColor(C.mid).fontSize(6.5).font('Helvetica')
           .text(String(dayNum), cx + 2, y + 3, { width: cellW - 4, align: 'center' });
        doc.fillColor(jars > 0 ? C.dark : C.light)
           .fontSize(9).font(jars > 0 ? 'Helvetica-Bold' : 'Helvetica')
           .text(String(jars), cx + 2, y + 13, { width: cellW - 4, align: 'center' });
      } else {
        doc.rect(cx, y, cellW, cellH).fill(C.calBg).strokeColor(C.border).lineWidth(0.5).stroke();
      }
    }
    y += cellH;
  }
  y += 10;

  // ═══════════════════════════════════════════════════════════════════════════

  doc.end();
};
