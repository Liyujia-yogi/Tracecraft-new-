import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { extractCompetitorEvidence } from './competitor-evidence.mjs'

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'dip-competitor-'))
try {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['能力', '竞品表现'],
    ['失败恢复', '保留输入并提供重试'],
  ]), '功能对比')
  const archive = await JSZip.loadAsync(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
  archive.file('xl/media/image1.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'))
  fs.writeFileSync(path.join(temporaryDirectory, 'competitor.xlsx'), await archive.generateAsync({ type: 'nodebuffer' }))

  const evidence = await extractCompetitorEvidence({
    featureName: '失败恢复',
    files: [{ name: 'competitor.xlsx', extension: '.xlsx', savedPath: 'competitor.xlsx' }],
  }, temporaryDirectory)

  assert.equal(evidence.sheetCount, 1)
  assert.match(evidence.sheets[0].text, /失败恢复/)
  assert.equal(evidence.embeddedImageCount, 1)
  console.log('Competitor evidence smoke test passed')
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true })
}
