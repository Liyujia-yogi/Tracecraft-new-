import fs from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg'])
const SHEET_TEXT_LIMIT = 40_000
const TOTAL_TEXT_LIMIT = 160_000

function mimeForExtension(extension) {
  return extension === '.png' ? 'image/png' : 'image/jpeg'
}

function asDataImage(buffer, extension) {
  return {
    extension,
    mime: mimeForExtension(extension),
    imageUrl: `data:${mimeForExtension(extension)};base64,${buffer.toString('base64')}`,
  }
}

function extractBinaryImages(buffer) {
  const images = []
  for (let offset = 0; offset < buffer.length && images.length < 100; offset += 1) {
    if (buffer[offset] === 0x89 && buffer.subarray(offset, offset + 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      const endMarker = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])
      const end = buffer.indexOf(endMarker, offset + 8)
      if (end > offset) {
        images.push(asDataImage(buffer.subarray(offset, end + endMarker.length), '.png'))
        offset = end + endMarker.length - 1
      }
    } else if (buffer[offset] === 0xff && buffer[offset + 1] === 0xd8 && buffer[offset + 2] === 0xff) {
      const end = buffer.indexOf(Buffer.from([0xff, 0xd9]), offset + 3)
      if (end > offset) {
        images.push(asDataImage(buffer.subarray(offset, end + 2), '.jpg'))
        offset = end + 1
      }
    }
  }
  return images
}

async function extractXlsxMedia(buffer) {
  const archive = await JSZip.loadAsync(buffer)
  const mediaEntries = Object.values(archive.files).filter((entry) => !entry.dir && entry.name.toLowerCase().startsWith('xl/media/'))
  const images = []
  for (const entry of mediaEntries.slice(0, 100)) {
    const extension = path.extname(entry.name).toLowerCase()
    if (!IMAGE_EXTENSIONS.has(extension)) continue
    images.push(asDataImage(await entry.async('nodebuffer'), extension === '.jpeg' ? '.jpg' : extension))
  }
  return images
}

function extractWorkbookText(buffer, fileName) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellText: true })
  return workbook.SheetNames.map((sheetName) => {
    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName], { blankrows: false })
    return {
      sheetName,
      text: csv.slice(0, SHEET_TEXT_LIMIT),
      truncated: csv.length > SHEET_TEXT_LIMIT,
      sourceFile: fileName,
    }
  })
}

export async function extractCompetitorEvidence(competitor, uploadDir) {
  const sheets = []
  const images = []
  for (const file of competitor.files || []) {
    const absolutePath = path.join(uploadDir, file.savedPath)
    const buffer = fs.readFileSync(absolutePath)
    if (IMAGE_EXTENSIONS.has(file.extension)) {
      images.push({ ...asDataImage(buffer, file.extension === '.jpeg' ? '.jpg' : file.extension), sourceFile: file.name, embedded: false })
      continue
    }
    sheets.push(...extractWorkbookText(buffer, file.name))
    const embedded = file.extension === '.xlsx' ? await extractXlsxMedia(buffer) : extractBinaryImages(buffer)
    images.push(...embedded.map((image, index) => ({ ...image, sourceFile: file.name, embedded: true, embeddedIndex: index + 1 })))
  }
  let textCharacters = 0
  const boundedSheets = []
  for (const sheet of sheets) {
    if (textCharacters >= TOTAL_TEXT_LIMIT) break
    const remaining = TOTAL_TEXT_LIMIT - textCharacters
    boundedSheets.push({ ...sheet, text: sheet.text.slice(0, remaining), truncated: sheet.truncated || sheet.text.length > remaining })
    textCharacters += Math.min(sheet.text.length, remaining)
  }
  return {
    featureName: competitor.featureName,
    sheets: boundedSheets,
    images,
    fileCount: competitor.files?.length || 0,
    sheetCount: sheets.length,
    embeddedImageCount: images.filter((item) => item.embedded).length,
    directImageCount: images.filter((item) => !item.embedded).length,
  }
}

export async function inspectCompetitorVersion(competitor, uploadDir) {
  const evidence = await extractCompetitorEvidence(competitor, uploadDir)
  return {
    fileCount: evidence.fileCount,
    sheetCount: evidence.sheetCount,
    embeddedImageCount: evidence.embeddedImageCount,
    directImageCount: evidence.directImageCount,
  }
}
