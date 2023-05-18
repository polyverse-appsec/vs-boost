import { BoostNotebook } from './jupyter_notebook';
import * as vscode from 'vscode';
import {marked} from 'marked';
import hljs from 'highlight.js';

export async function convertNotebookToHTML(notebook: BoostNotebook) {

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