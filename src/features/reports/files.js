function csvCell(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function xmlCell(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pdfSafe(value) {
  return String(value ?? "")
    .replace(/[^\x20-\x7E]/g, "?")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function fit(value, width, size) {
  const text = pdfSafe(value);
  const max = Math.max(1, Math.floor(width / (size * 0.52)));
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 3))}...`;
}

function csvFile(title, note, columns, rows) {
  const lines = [
    [title],
    [note],
    [],
    columns.map((column) => column.label),
    ...rows.map((row) => row.map((cell, index) => (columns[index].number && cell !== "" ? cell : cell))),
  ];
  return `\uFEFF${lines.map((line) => line.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function excelFile(title, note, sheet, columns, rows) {
  const head = [title, note, ""];
  const body = [
    ...head.map((line) => `<Row><Cell><Data ss:Type="String">${xmlCell(line)}</Data></Cell></Row>`),
    `<Row>${columns.map((column) => `<Cell><Data ss:Type="String">${xmlCell(column.label)}</Data></Cell>`).join("")}</Row>`,
    ...rows.map((row) => `<Row>${row.map((cell, index) => {
      const number = columns[index].number && cell !== "" && Number.isFinite(Number(cell));
      const type = number ? "Number" : "String";
      const value = number ? String(Number(cell)) : xmlCell(cell);
      return `<Cell><Data ss:Type="${type}">${value}</Data></Cell>`;
    }).join("")}</Row>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="${xmlCell(sheet)}"><Table>
${body.join("\n")}
</Table></Worksheet></Workbook>`;
}

function pdfPages({ title, note, columns, rows }) {
  const pageWidth = 842;
  const pageHeight = 595;
  const margin = 32;
  const tableWidth = pageWidth - margin * 2;
  const scale = tableWidth / columns.reduce((sum, column) => sum + column.width, 0);
  const widths = columns.map((column) => column.width * scale);
  const pages = [];
  let commands = [];
  let y = pageHeight - 46;

  function fresh() {
    commands = [];
    y = pageHeight - 46;
    commands.push(`BT /F2 16 Tf 1 0 0 1 ${margin} ${y} Tm (${pdfSafe(title)}) Tj ET`);
    y -= 18;
    commands.push(`BT /F1 9 Tf 0.25 0.25 0.25 rg 1 0 0 1 ${margin} ${y} Tm (${fit(note, tableWidth, 9)}) Tj ET`);
    commands.push("0 0 0 rg");
    y -= 22;
    header();
  }

  function header() {
    commands.push(`0.93 0.93 0.93 rg ${margin} ${y - 4} ${tableWidth.toFixed(2)} 16 re f 0 0 0 rg`);
    let x = margin + 4;
    columns.forEach((column, index) => {
      commands.push(`BT /F2 8 Tf 1 0 0 1 ${x.toFixed(2)} ${y} Tm (${fit(column.label, widths[index] - 6, 8)}) Tj ET`);
      x += widths[index];
    });
    y -= 18;
  }

  function rowLine(row, bold) {
    if (y < 40) {
      pages.push(commands.join("\n"));
      fresh();
    }
    let x = margin + 4;
    row.forEach((cell, index) => {
      commands.push(`BT /${bold ? "F2" : "F1"} 8 Tf 1 0 0 1 ${x.toFixed(2)} ${y} Tm (${fit(cell, widths[index] - 6, 8)}) Tj ET`);
      x += widths[index];
    });
    y -= 4;
    commands.push(`0.86 0.86 0.86 RG 0.4 w ${margin} ${y.toFixed(2)} m ${(margin + tableWidth).toFixed(2)} ${y.toFixed(2)} l S 0 0 0 RG`);
    y -= 12;
  }

  fresh();
  if (!rows.length) rowLine(columns.map(() => ""), false);
  rows.forEach((row, index) => rowLine(row, index === rows.length - 1 && String(row[0]) === ""));
  pages.push(commands.join("\n"));
  return { pageWidth, pageHeight, pages };
}

function pdfFile(title, note, columns, rows) {
  const { pageWidth, pageHeight, pages } = pdfPages({ title, note, columns, rows });
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  add("<< /Type /Catalog /Pages 2 0 R >>");
  const kids = [];
  for (let index = 0; index < pages.length; index += 1) kids.push(`${5 + index * 2} 0 R`);
  add(`<< /Type /Pages /Count ${pages.length} /Kids [${kids.join(" ")}] >>`);
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  pages.forEach((page, index) => {
    const stream = page.endsWith("\n") ? page : `${page}\n`;
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + index * 2} 0 R >>`);
    add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}endstream`);
  });
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n`;
  output += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    output += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output, "latin1");
}

export function renderReport({ title, note, sheet, columns, rows, format }) {
  if (format === "csv") {
    return {
      name: "csv",
      type: "text/csv; charset=utf-8",
      body: Buffer.from(csvFile(title, note, columns, rows), "utf8"),
    };
  }
  if (format === "xls") {
    return {
      name: "xls",
      type: "application/vnd.ms-excel",
      body: Buffer.from(excelFile(title, note, sheet, columns, rows), "utf8"),
    };
  }
  return {
    name: "pdf",
    type: "application/pdf",
    body: pdfFile(title, note, columns, rows),
  };
}
