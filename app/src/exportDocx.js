import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import { downloadFile } from './exportImport'

const HEADERS = ['Entity', 'Field', 'Type', 'Key', 'Nullable', 'Default', 'Description']
const WIDTHS = [14, 16, 10, 7, 11, 12, 30] // เปอร์เซ็นต์ความกว้างแต่ละคอลัมน์
const FONT = 'Tahoma' // รองรับภาษาไทยใน Word

const makeCell = (text, index, { bold = false, fill } = {}) =>
  new TableCell({
    width: { size: WIDTHS[index], type: WidthType.PERCENTAGE },
    shading: fill ? { type: ShadingType.CLEAR, fill, color: 'auto' } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [
      new Paragraph({
        children: [new TextRun({ text: String(text ?? ''), bold, size: 18, font: FONT })],
      }),
    ],
  })

export async function exportDictionaryDocx(fields, projectName, fileName) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: HEADERS.map((h, i) => makeCell(h, i, { bold: true, fill: 'EEF0FA' })),
  })

  const bodyRows = fields.map(
    (f) =>
      new TableRow({
        cantSplit: true,
        children: [
          f.entity,
          f.name,
          f.type,
          f.key || '-',
          f.nullable === false ? 'NOT NULL' : 'NULL',
          f.defaultValue || '-',
          f.description || '-',
        ].map((value, i) => makeCell(value, i)),
      }),
  )

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { size: { orientation: PageOrientation.LANDSCAPE } },
        },
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: 'Data Dictionary', font: FONT, bold: true })],
          }),
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: `${projectName || 'Project'} · ${fields.length} fields · ${new Date().toLocaleDateString('th-TH')}`,
                font: FONT,
                size: 18,
                color: '6B7280',
              }),
            ],
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [headerRow, ...bodyRows],
          }),
        ],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  downloadFile(fileName, blob)
}