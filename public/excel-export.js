const encoder = new TextEncoder();

function xmlEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
  })[character]);
}

function columnName(index) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function worksheetXml(columns, rows) {
  const allRows = [columns.map((column) => column.label), ...rows.map((row) => columns.map((column) => row[column.key] ?? ""))];
  const xmlRows = allRows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
      const column = columns[columnIndex];
      if (rowIndex > 0 && column.type === "number" && value !== "" && value !== null && value !== undefined && Number.isFinite(Number(value))) {
        return `<c r="${reference}" s="${column.format === "currency" ? 2 : 0}"><v>${Number(value)}</v></c>`;
      }
      const style = rowIndex === 0 ? ' s="1"' : "";
      return `<c r="${reference}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const widths = columns.map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${column.width ?? 16}" customWidth="1"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData>${xmlRows}</sheetData><autoFilter ref="A1:${columnName(columns.length - 1)}${Math.max(1, allRows.length)}"/></worksheet>`;
}

export function buildLedgerSheets(data) {
  const workerById = new Map(data.workers.map((worker) => [worker.id, worker]));
  const jobById = new Map(data.jobRequests.map((job) => [job.id, job]));
  return [
    {
      name: "안내",
      columns: [{ key: "item", label: "항목", width: 24 }, { key: "value", label: "내용", width: 70 }],
      rows: [
        { item: "자료 구분", value: "비식별 Mock 장부 — 실제 제출 불가" },
        { item: "Mock 기준일", value: data.meta.asOf },
        { item: "주의", value: data.meta.warning },
        { item: "내보내기 형식", value: "Excel 통합문서(.xlsx) · 장부별 워크시트" }
      ]
    },
    {
      name: "구인접수대장",
      columns: [
        { key: "id", label: "접수번호", width: 18 }, { key: "date", label: "근무일", width: 14 },
        { key: "restaurant", label: "사업체명", width: 24 }, { key: "role", label: "직종", width: 16 },
        { key: "headcount", label: "인원", width: 9, type: "number" }, { key: "time", label: "근로시간·휴게", width: 28 },
        { key: "area", label: "근무지역", width: 14 }, { key: "address", label: "근무지", width: 30 },
        { key: "wage", label: "임금", width: 15, type: "number", format: "currency" }, { key: "status", label: "검증상태", width: 14 }
      ],
      rows: data.jobRequests.map((job) => ({ id: job.id, date: job.workDate, restaurant: job.restaurantName, role: job.role, headcount: job.headcount, time: job.timeLabel, area: job.area, address: job.workplaceAddress, wage: job.monthlyWage ?? job.dailyWage, status: job.status }))
    },
    {
      name: "구직소개대장",
      columns: [
        { key: "placement", label: "소개번호", width: 18 }, { key: "worker", label: "구직자", width: 20 },
        { key: "restaurant", label: "소개 사업체", width: 24 }, { key: "role", label: "직종", width: 15 },
        { key: "date", label: "소개 근무일", width: 14 }, { key: "state", label: "소개·취업 상태", width: 18 },
        { key: "wage", label: "임금", width: 15, type: "number", format: "currency" },
        { key: "fee", label: "소개요금", width: 15, type: "number", format: "currency" }, { key: "updated", label: "최근 변경", width: 21 }
      ],
      rows: data.placements.map((placement) => {
        const job = jobById.get(placement.jobId) ?? {};
        return { placement: placement.id, worker: placement.workerName, restaurant: placement.restaurantName, role: job.role ?? "", date: job.workDate ?? "", state: placement.state, wage: placement.wage, fee: placement.requestedFee, updated: placement.updatedAt };
      })
    },
    {
      name: "일용근로자회원명부",
      columns: [
        { key: "id", label: "회원번호", width: 18 }, { key: "name", label: "성명(가명)", width: 20 },
        { key: "phone", label: "연락처(마스킹)", width: 20 }, { key: "roles", label: "가능 직종", width: 24 },
        { key: "areas", label: "선호 지역", width: 20 }, { key: "health", label: "보건증 확인상태", width: 18 },
        { key: "expires", label: "확인 만료일", width: 15 }
      ],
      rows: data.workers.filter((worker) => worker.memberType === "daily").map((worker) => ({ id: worker.id, name: worker.displayName, phone: worker.phoneMasked, roles: worker.roles.join(", "), areas: worker.preferredAreas.join(", "), health: worker.healthCertificateStatus, expires: worker.healthCertificateExpiresOn ?? "" }))
    },
    {
      name: "금전출납부",
      columns: [
        { key: "id", label: "기록번호", width: 18 }, { key: "date", label: "일자", width: 14 },
        { key: "type", label: "구분", width: 18 }, { key: "counterparty", label: "상대", width: 24 },
        { key: "amount", label: "금액", width: 15, type: "number", format: "currency" }, { key: "method", label: "결제수단", width: 20 },
        { key: "placement", label: "소개번호", width: 18 }, { key: "status", label: "상태", width: 14 }
      ],
      rows: data.ledger.map((entry) => ({ id: entry.id, date: entry.date, type: entry.type, counterparty: entry.counterparty, amount: entry.amount, method: entry.method, placement: entry.placementId, status: entry.status }))
    },
    {
      name: "근로자최소정보",
      columns: [
        { key: "id", label: "근로자번호", width: 18 }, { key: "name", label: "성명(가명)", width: 20 },
        { key: "phone", label: "연락처(마스킹)", width: 20 }, { key: "roles", label: "가능 직종", width: 24 },
        { key: "areas", label: "선호 지역", width: 20 }, { key: "minimum", label: "희망 최저 일당", width: 18, type: "number", format: "currency" },
        { key: "member", label: "접수 유형", width: 14 }
      ],
      rows: data.workers.map((worker) => ({ id: worker.id, name: worker.displayName, phone: worker.phoneMasked, roles: worker.roles.join(", "), areas: worker.preferredAreas.join(", "), minimum: worker.minimumDailyWage, member: worker.memberType }))
    }
  ];
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint16(value) {
  return Uint8Array.of(value & 255, (value >>> 8) & 255);
}

function uint32(value) {
  return Uint8Array.of(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255);
}

function concat(chunks) {
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

function createZip(files) {
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = typeof file.content === "string" ? encoder.encode(file.content) : file.content;
    const checksum = crc32(data);
    const localHeader = concat([uint32(0x04034b50), uint16(20), uint16(0x0800), uint16(0), uint16(0), uint16(0), uint32(checksum), uint32(data.length), uint32(data.length), uint16(name.length), uint16(0), name]);
    localChunks.push(localHeader, data);
    centralChunks.push(concat([uint32(0x02014b50), uint16(20), uint16(20), uint16(0x0800), uint16(0), uint16(0), uint16(0), uint32(checksum), uint32(data.length), uint32(data.length), uint16(name.length), uint16(0), uint16(0), uint16(0), uint16(0), uint32(0), uint32(offset), name]));
    offset += localHeader.length + data.length;
  }
  const central = concat(centralChunks);
  const end = concat([uint32(0x06054b50), uint16(0), uint16(0), uint16(files.length), uint16(files.length), uint32(central.length), uint32(offset), uint16(0)]);
  return concat([...localChunks, central, end]);
}

export function createLedgerWorkbook(data) {
  const sheets = buildLedgerSheets(data);
  const worksheetFiles = sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, content: worksheetXml(sheet.columns, sheet.rows) }));
  const sheetEntries = sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 2}"/>`).join("");
  const sheetRelationships = sheets.map((_, index) => `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("");
  const sheetOverrides = sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  const files = [
    { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${sheetOverrides}</Types>` },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
    { name: "docProps/core.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>하모니직업소개소 Mock 법정장부</dc:title><dc:creator>하모니직업소개소 Mock MVP</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${data.meta.asOf}T00:00:00Z</dcterms:created></cp:coreProperties>` },
    { name: "docProps/app.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Harmony Mock MVP</Application><DocSecurity>0</DocSecurity></Properties>` },
    { name: "xl/workbook.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetEntries}</sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${sheetRelationships}</Relationships>` },
    { name: "xl/styles.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0\&quot;원\&quot;"/></numFmts><fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="맑은 고딕"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFB84C78"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
    ...worksheetFiles
  ];
  return createZip(files);
}

export function downloadLedgerWorkbook(data) {
  const bytes = createLedgerWorkbook(data);
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `하모니_법정장부_MOCK_${data.meta.asOf}.xlsx`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
