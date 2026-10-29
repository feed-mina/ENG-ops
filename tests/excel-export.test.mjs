import assert from "node:assert/strict";
import test from "node:test";
import { buildLedgerSheets, createLedgerWorkbook } from "../public/excel-export.js";
import { mockData } from "../public/mock-data.js";

test("법정 장부를 워크시트별로 구성한다", () => {
  const sheets = buildLedgerSheets(mockData);
  assert.deepEqual(sheets.map((sheet) => sheet.name), ["안내", "구인접수대장", "구직소개대장", "일용근로자회원명부", "금전출납부", "근로자최소정보"]);
  assert.equal(sheets.find((sheet) => sheet.name === "금전출납부").rows.length, mockData.ledger.length);
});

test("Excel에서 열 수 있는 비압축 XLSX 패키지를 생성한다", () => {
  const workbook = createLedgerWorkbook(mockData);
  assert.deepEqual([...workbook.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  const contents = new TextDecoder().decode(workbook);
  assert.match(contents, /\[Content_Types\]\.xml/);
  assert.match(contents, /xl\/worksheets\/sheet6\.xml/);
  assert.match(contents, /목련식당 \(모의\)/);
  assert.doesNotMatch(contents, /<f>/);
});
