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
    let html = '<html><head><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/styles/default.min.css"> <script type="module">import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs"; mermaid.initialize({ startOnLoad: true });</script>  <style>@page {margin: 2cm;}</style></head><body>';
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