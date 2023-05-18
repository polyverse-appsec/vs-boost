import { BoostNotebook, NotebookCellKind } from './jupyter_notebook';
import {marked} from 'marked';
import hljs from 'highlight.js';
import * as fs from 'fs';
import * as path from 'path';
import { Uri } from 'vscode';

const cellStyleSheet = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/styles/default.min.css';
const mermaidScript = 'https://cdnjs.cloudflare.com/ajax/libs/mermaid/8.14.1/mermaid.min.js';

export async function convertNotebookToHTML(notebook: BoostNotebook, notebookPath: string, baseFolderPath?: string) {

    const cells = notebook.cells;

    // convert cells to html
    let html = `<html><head><link rel="stylesheet" href="${cellStyleSheet}"> ` +
               `<script type="module">import mermaid from "${mermaidScript}";` +
               ` mermaid.initialize({ startOnLoad: true });</script>  <style>@page {margin: 2cm;}</style></head><body>`;
  
    const stats = fs.statSync(notebookPath);
    const timestamp = stats.mtime;
    const fileStamp = timestamp.toISOString();
    
               // Retrieve metadata from the notebook
    const pageTitle = `Polyverse Boost-generated Source Documentation`;
    const producer = 'Polyverse Boost';
    const sourceUri = Uri.parse(notebook.metadata['sourceFile'] as string);
    const sourceFile = baseFolderPath?
        path.relative(baseFolderPath, sourceUri.fsPath):
        sourceUri.fsPath;


    // Add the title and source file information
    html += `<h1>${pageTitle}</h1>`;
    html += `<p>Producer: ${producer}</p>`;
    html += `<p>Source File: ${sourceFile}</p>`;
    html += `<p>Date Generated: ${fileStamp}</p>`;

    for (let cell of cells) {
        // we use Jupyter type to avoid direct dependencies on VS Code
        // however tbis should be identical value in JSON
        if (cell.kind === NotebookCellKind.Markup) {
            html += marked.parse(cell.value, {
                highlight: function (code, lang) {
                    return hljs.highlightAuto(code, [lang]).value;
                }
            });
        } else if (cell.kind === NotebookCellKind.Code) {
            html += `<p>Programming Language: ${cell.languageId}</p>`;
            html += `<p>Original Code:</p>`;
  
            const value = hljs.highlightAuto(cell.value);
            html += '<pre><code>' + value.value + '</code></pre>';
        }
        if (cell.outputs) {
          for (let output of cell.outputs) {
            output.items.forEach(item => {

                if (item.mime.startsWith('text/x-')) {
                    html += `<p>Converted Programming Language: ${item.mime.replace('text/x-', '')}</p>`;
                } else if (!item.mime.startsWith('text/markdown')) {
                    html += `<p>Output Type: ${item.mime}</p>`;
                }
                            
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