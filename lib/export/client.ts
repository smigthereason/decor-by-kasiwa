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
  const landscape = columns.length >= 5;
  const pageWidth = landscape ? 842 : 595;
  const pageHeight = landscape ? 595 : 842;
  const margin = 34;
  const usableWidth = pageWidth - margin * 2;
  const fontSize = columns.length >= 10 ? 5.3 : columns.length >= 7 ? 6 : 7.2;
  const headerFontSize = Math.max(6, fontSize);
  const lineHeight = fontSize + 2.4;
  const generatedAt = new Date().toLocaleString("en-KE");
  const formatPdfCell = (value: ExportCell) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value.toLocaleString("en-KE", { maximumFractionDigits: 2 });
    }
    return ascii(value);
  };
  const sample = rows.slice(0, 80);
  const weights = columns.map((column) => {
    const maxLength = Math.max(
      ascii(column.label).length,
      ...sample.map((row) => formatPdfCell(row[column.key]).length),
    );
    return Math.min(28, Math.max(8, maxLength));
  });
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const widths = weights.map((weight) => usableWidth * (weight / weightTotal));
  const xPositions: number[] = [];
  let runningX = margin;
  for (const width of widths) {
    xPositions.push(runningX);
    runningX += width;
  }

  function wrapText(value: string, width: number) {
    const capacity = Math.max(4, Math.floor((width - 8) / (fontSize * 0.52)));
    if (value.length <= capacity) return [value];
    const words = value.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      if (!current) {
        current = word.length > capacity ? truncate(word, capacity) : word;
        continue;
      }
      if (`${current} ${word}`.length <= capacity) current = `${current} ${word}`;
      else {
        lines.push(current);
        current = word.length > capacity ? truncate(word, capacity) : word;
      }
    }
    if (current) lines.push(current);
    return lines.slice(0, 3);
  }

  const pages: string[][] = [];
  let commands: string[] = [];
  let y = pageHeight - margin;
  let pageNumber = 0;

  function textCommand(x: number, baseline: number, value: string, size = fontSize, bold = false, gray = 0) {
    const safe = pdfEscape(ascii(value));
    return `BT /${bold ? "F2" : "F1"} ${size.toFixed(1)} Tf ${gray.toFixed(2)} g 1 0 0 1 ${x.toFixed(1)} ${baseline.toFixed(1)} Tm (${safe}) Tj ET`;
  }

  function fillRect(x: number, bottom: number, width: number, height: number, r: number, g: number, b: number) {
    return `q ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg ${x.toFixed(1)} ${bottom.toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)} re f Q`;
  }

  function line(x1: number, y1: number, x2: number, y2: number, gray = 0.84) {
    return `q ${gray.toFixed(2)} G 0.5 w ${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S Q`;
  }

  function drawPageHeader() {
    pageNumber += 1;
    commands.push(textCommand(margin, y, title, 15, true, 0.08));
    y -= 16;
    commands.push(textCommand(margin, y, `Generated ${generatedAt}`, 7, false, 0.42));
    commands.push(textCommand(pageWidth - margin - 55, y, `Page ${pageNumber}`, 7, false, 0.42));
    y -= 20;
    const headerHeight = 24;
    commands.push(fillRect(margin, y - headerHeight + 6, usableWidth, headerHeight, 0.91, 0.88, 0.82));
    columns.forEach((column, index) => {
      const labelLines = wrapText(ascii(column.label), widths[index]);
      labelLines.slice(0, 2).forEach((label, lineIndex) => {
        commands.push(textCommand(xPositions[index] + 4, y - 7 - lineIndex * (headerFontSize + 1), label, headerFontSize, true, 0.18));
      });
    });
    y -= headerHeight;
    commands.push(line(margin, y + 5, pageWidth - margin, y + 5, 0.65));
  }

  function finishPage() {
    pages.push(commands);
    commands = [];
    y = pageHeight - margin;
  }

  drawPageHeader();
  let previousSection = "";
  const subtotalNames = new Set(["Net sales", "Gross profit", "Total operating expenses", "Operating profit"]);

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const cellLines = columns.map((column, index) => wrapText(formatPdfCell(row[column.key]), widths[index]));
    const maxLines = Math.max(1, ...cellLines.map((lines) => lines.length));
    const rowHeight = Math.max(19, maxLines * lineHeight + 7);
    if (y - rowHeight < margin + 20) {
      finishPage();
      drawPageHeader();
    }

    const section = typeof row.section === "string" ? ascii(row.section) : "";
    const name = typeof row.name === "string" ? ascii(row.name) : "";
    const sectionChanged = Boolean(section && section !== previousSection);
    const isSubtotal = subtotalNames.has(name);
    if (sectionChanged) {
      commands.push(fillRect(margin, y - 3, usableWidth, 2, 0.19, 0.55, 0.33));
      previousSection = section;
    }
    if (isSubtotal) commands.push(fillRect(margin, y - rowHeight + 5, usableWidth, rowHeight, 0.965, 0.956, 0.935));
    else if (rowIndex % 2 === 1) commands.push(fillRect(margin, y - rowHeight + 5, usableWidth, rowHeight, 0.987, 0.985, 0.978));

    cellLines.forEach((linesForCell, columnIndex) => {
      linesForCell.forEach((cellLine, lineIndex) => {
        commands.push(textCommand(xPositions[columnIndex] + 4, y - 9 - lineIndex * lineHeight, cellLine, fontSize, isSubtotal, isSubtotal ? 0.08 : 0.16));
      });
    });
    commands.push(line(margin, y - rowHeight + 5, pageWidth - margin, y - rowHeight + 5));
    y -= rowHeight;
  }

  if (rows.length === 0) {
    commands.push(textCommand(margin, y - 10, "No data available.", 9, false, 0.4));
  }
  finishPage();

  const objectCount = 4 + pages.length * 2;
  const objects = new Array<string>(objectCount + 1);
  const pageObjectIds = pages.map((_, index) => 5 + index * 2);
  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  objects[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`;

  pages.forEach((pageCommands, index) => {
    const pageId = 5 + index * 2;
    const contentId = pageId + 1;
    const stream = pageCommands.join("\n");
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
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
