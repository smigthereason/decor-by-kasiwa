"use client";

export type ExportCell = string | number | boolean | null | undefined;
export type ExportRow = Record<string, ExportCell>;
export type ExportColumn = { key: string; label: string };

function safeFileName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "report";
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function xmlEscape(value: ExportCell) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function excelCell(value: ExportCell) {
  const isNumber = typeof value === "number" && Number.isFinite(value);
  const type = isNumber ? "Number" : "String";
  return `<Cell><Data ss:Type="${type}">${xmlEscape(value)}</Data></Cell>`;
}

export function downloadExcelReport({
  title,
  columns,
  rows,
  fileName,
}: {
  title: string;
  columns: ExportColumn[];
  rows: ExportRow[];
  fileName?: string;
}) {
  const generatedAt = new Date().toLocaleString("en-KE");
  const header = columns.map((column) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${xmlEscape(column.label)}</Data></Cell>`).join("");
  const body = rows.map((row) => `<Row>${columns.map((column) => excelCell(row[column.key])).join("")}</Row>`).join("");
  const xml = `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n<Styles><Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#E8DFCF" ss:Pattern="Solid"/></Style></Styles>\n<Worksheet ss:Name="Report"><Table>\n<Row><Cell><Data ss:Type="String">${xmlEscape(title)}</Data></Cell></Row>\n<Row><Cell><Data ss:Type="String">Generated ${xmlEscape(generatedAt)}</Data></Cell></Row>\n<Row/>\n<Row>${header}</Row>\n${body}\n</Table></Worksheet></Workbook>`;
  triggerDownload(new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" }), `${safeFileName(fileName || title)}.xls`);
}

function pdfEscape(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function ascii(value: ExportCell) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, Math.max(0, max - 3))}...` : value;
}

function buildPdf(title: string, columns: ExportColumn[], rows: ExportRow[]) {
  const lines: string[] = [
    title,
    `Generated ${new Date().toLocaleString("en-KE")}`,
    "",
    columns.map((column) => truncate(ascii(column.label), 18)).join(" | "),
    "-".repeat(104),
  ];

  for (const row of rows) {
    lines.push(columns.map((column) => truncate(ascii(row[column.key]), 18)).join(" | "));
  }

  const maxLinesPerPage = 54;
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += maxLinesPerPage) {
    pages.push(lines.slice(index, index + maxLinesPerPage));
  }
  if (pages.length === 0) pages.push([title, "No data available."]);

  const objectCount = 3 + pages.length * 2;
  const objects = new Array<string>(objectCount + 1);
  const pageObjectIds = pages.map((_, index) => 4 + index * 2);
  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;

  pages.forEach((pageLines, index) => {
    const pageId = 4 + index * 2;
    const contentId = pageId + 1;
    const textCommands = pageLines.map((line, lineIndex) => `${lineIndex === 0 ? "" : "T* "}(${pdfEscape(line)}) Tj`).join("\n");
    const stream = `BT\n/F1 8 Tf\n42 805 Td\n12 TL\n${textCommands}\nET`;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  let pdf = "%PDF-1.4\n";
  const offsets = new Array<number>(objectCount + 1).fill(0);
  for (let id = 1; id <= objectCount; id += 1) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= objectCount; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}

export function downloadPdfReport({
  title,
  columns,
  rows,
  fileName,
}: {
  title: string;
  columns: ExportColumn[];
  rows: ExportRow[];
  fileName?: string;
}) {
  const pdf = buildPdf(title, columns, rows);
  triggerDownload(new Blob([pdf], { type: "application/pdf" }), `${safeFileName(fileName || title)}.pdf`);
}
