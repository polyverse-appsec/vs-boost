import { PDFDocument, PDFPageLeaf, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { BoostNotebook, BoostNotebookCell, SerializedNotebookCellOutput } from './jupyter_notebook';
import * as fs from 'fs';
import * as path from 'path';
import { NOTEBOOK_EXTENSION } from './extension';
import { Uri } from 'vscode';

import * as vscode from 'vscode';
import {marked, Renderer} from 'marked';
import {markedHighlight} from 'marked-highlight';
import hljs from 'highlight.js';
import puppeteer from 'puppeteer';

marked.use(markedHighlight({
  langPrefix: 'hljs language-',
  highlight(code: string, lang: string) {
    console.log("language is ", lang);
    if( lang === "mermaid") {
      console.log("code is ", code);
      return `<pre class="mermaid">${code}</pre>`;
    }
    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
    return hljs.highlight(code, { language }).value;
  }
}));


async function convertNotebookToHTML(notebook: BoostNotebook) {

    const cells = notebook.cells;

    // convert cells to html
    let html = '<html><head><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/styles/default.min.css"> <script type="module">import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs"; mermaid.initialize({ startOnLoad: true });</script></head><body>';
    for (let cell of cells) {
        if (cell.kind === vscode.NotebookCellKind.Markup) {
            html += marked.parse(cell.value, {
                highlight: function (code, lang) {
                    return hljs.highlightAuto(code, [lang]).value;
                }
            });
        } else if (cell.kind === vscode.NotebookCellKind.Code) {
          const value = hljs.highlightAuto(cell.value);
            html += '<pre><code>' + value.value + '</code></pre>';
        }
        if (cell.outputs) {
          for (let output of cell.outputs) {
            output.items.forEach(item => {
              html += marked.parse(item.data, {
                  highlight: function (code, lang) {
                      return hljs.highlightAuto(code, [lang]).value;
                  }
              });
            });    
          }
        }
    }
    html += '</body></html>';

    return html;
}

export async function generatePDFforNotebook(boostNotebookPath : string, baseFolderPath : string) : Promise<string> {
    return new Promise<string> (async (resolve, reject) => {
        try {
            const pdfFilename = boostNotebookPath.replace(NOTEBOOK_EXTENSION, '.pdf');

            const boostNotebook = new BoostNotebook();
            boostNotebook.load(boostNotebookPath);
            await generatePdfFromJson(boostNotebook, boostNotebookPath, baseFolderPath, pdfFilename);
            resolve(pdfFilename);
        } catch (error) {
            reject(error);
        }
    });
}

async function generatePdfFromJson(boostNotebook: BoostNotebook, notebookPath : string, baseFolderPath : string, outputPath: string): Promise<void> {
    return new Promise<void> (async (resolve, reject) => {
        try {
            const html = await convertNotebookToHTML(boostNotebook);

                // write the html to a temporary file
            const tempHtmlPath = path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, 'temp.html');
            fs.writeFileSync(tempHtmlPath, html);

            // convert the html file to pdf using puppeteer
            const browser = await puppeteer.launch();
            const page = await browser.newPage();
            // convert the file path to a URL
            const url = `file://${tempHtmlPath}`;
            await page.goto(url, { waitUntil: 'networkidle0' });
            await page.pdf({ path: outputPath});

            await browser.close();

            // delete the temporary html file
            fs.unlinkSync(tempHtmlPath);

            vscode.window.showInformationMessage('PDF conversion completed!');
        
            resolve();
        } catch (error) {
            reject(error);
        }
    });
}

interface PrintOptions {
  showOutputMetadata: boolean;
  printSourceCodeBorder: boolean;
}

async function getPDFFromObject(
    boostNotebook: BoostNotebook,
    notebookPath: string,
    baseFolderPath: string,
    printOptions: PrintOptions
  ): Promise<PDFDocument> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const largeFontSize = 16;
    const mediumFontSize = 12;
    const smallFixedFontSize = 9;
    const margin = 30;
    const lineHeight = font.heightAtSize(mediumFontSize) + 2;
  
    const stats = fs.statSync(notebookPath);
    const timestamp = stats.mtime;
    const fileStamp = timestamp.toISOString();
  
    const pageTitle = `Polyverse Boost-generated Source Documentation`;

    const sourceUri = Uri.parse(boostNotebook.metadata['sourceFile'] as string);
    const sourceFile = baseFolderPath?
        path.relative(baseFolderPath, sourceUri.fsPath):
        sourceUri.fsPath;

    const sectionHeading = `Source File: ${sourceFile}\nDate Generated: ${fileStamp}`;
  
    pdfDoc.setProducer('Polyverse Boost');
    pdfDoc.setTitle(pageTitle + ":" + sourceFile);
    pdfDoc.setModificationDate(new Date(fileStamp));
    pdfDoc.setCreationDate(new Date(fileStamp));

    let currentPage: PDFPage | null = null;
    let currentY = 0;
    let firstPageHeight = 130;
  
    for (const boostCell of boostNotebook.cells) {
      const cellText = `Cell ${boostCell.id}:`;
      let cellValue =
        `Programming Language: ${boostCell.languageId}\n` +
        `Original Code:\n\n`;
        cellValue += boostCell.value.replace(/\t/g, ' ');
  
      const cellOutputs = boostCell.outputs || [];
      const outputText = cellOutputs.map((output) => formatOutput(output, printOptions)).join('\n');
  
      const text = `\n${cellText}\n${cellValue}\n\n${outputText}\n\n`;
      const lines = text.split('\n');
  
      let requiredPages = Math.ceil(lines.length / ((currentPage?.getHeight() || firstPageHeight) - margin));
  
      for (let i = 0; i < requiredPages; i++) {
        if (currentPage === null || currentY - lines.length * lineHeight < margin) {
          currentPage = pdfDoc.addPage();
          currentY = currentPage.getHeight() - margin;
  
          if (i === 0 && boostCell === boostNotebook.cells[0]) {
            currentPage.setFont(font);
            currentPage.setFontSize(largeFontSize);
            currentPage.drawText(pageTitle, {
              x: margin,
              y: currentY - lineHeight,
            });
  
            currentY -= 2 * lineHeight;
  
            currentPage.setFontSize(mediumFontSize);
            currentPage.drawText(sectionHeading, {
              x: margin,
              y: currentY - lineHeight,
            });
  
            currentY -= 2 * lineHeight;
          }
        }
  
        currentPage.setFont(font);
        currentPage.setFontSize(smallFixedFontSize);

        const start = Math.floor(i * (lines.length / requiredPages));
        const end = Math.floor((i + 1) * (lines.length / requiredPages));
      
        for (let j = start; j < end && j < lines.length; j++) {
          if (currentY - lineHeight < margin) {
            currentPage = pdfDoc.addPage();
            currentPage.setFont(font);
            currentPage.setFontSize(smallFixedFontSize);
            currentY = currentPage.getHeight() - margin;
          }
  
          currentPage.drawText(lines[j], {
            x: margin,
            y: currentY - lineHeight,
          });
  
          currentY -= lineHeight;
        }
  
        currentY -= 2 * lineHeight;
      }
    }
  
    return pdfDoc;
  }
  
  
  
  function formatOutput(output: SerializedNotebookCellOutput, printOptions: PrintOptions): string {
    const items = output.items.map((item) => {
      let text = '';
      if (item.mime.startsWith('text/x-')) {
        text += `Converted Programming Language: ${item.mime.replace('text/x-', '')}\n`;
      } else if (!item.mime.startsWith('text/markdown')) {
        text += `MIME Type: ${item.mime}\n`;
      }
      return text + `\n${item.data}`;
    }).join('\n');
  
    const metadata = printOptions.showOutputMetadata && output.metadata ? `Metadata: ${JSON.stringify(output.metadata, null, 2)}` : '';
  
    return wrapText(`Boost Analysis:\n${items}\n${metadata}`);
  }
  
  function wrapText(text: string, maxLength: number = 80): string {
    const words = text.split(' ');
    let line = '';
    const lines: string[] = [];
  
    const quotePattern = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;
  
    for (const word of words) {
      if (line.length + word.length <= maxLength) {
        line += word + ' ';
      } else {
        lines.push(line.trim());
        line = word + ' ';
      }
  
      const match = word.match(quotePattern);
      if (match) {
        const hasNewline = match[0].includes('\n');
        if (!hasNewline) {
          lines[lines.length - 1] += ' ' + word;
          line = '';
        }
      }
    }
  
    if (line.length > 0) {
      lines.push(line.trim());
    }
  
    return lines.join('\n');
}