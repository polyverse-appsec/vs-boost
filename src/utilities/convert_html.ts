import { marked } from "marked";
import hljs from "highlight.js";
import * as fs from "fs";
import * as _ from "lodash";
import * as vscode from 'vscode';
import * as path from "path";
import { markedHighlight } from "marked-highlight";

import {
    BoostFileType,
    OutputType,
    getBoostFile,
    findCellByKernel
} from "../extension/extension";
import { formatDateTime } from "./datetime";
import {
    BoostNotebook,
    NotebookCellKind,
    BoostNotebookCell,
    NOTEBOOK_SUMMARY_EXTENSION
} from "../data/jupyter_notebook";
import { ControllerOutputType } from "../controllers/controllerOutputTypes";
import { plaintext } from "./languageMappings";

const cellStyleSheet =
    "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/styles/default.min.css";
const mermaidScript =
    "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs";

const renderer = {
    link(href: string, title: string, text: string) {
        if (title === "polyverse_boost_dashboard") {
            return `<a href="${href}" class="show_dashboard">${text}</a>`;
        }
        // Return false to fall back to the default link rendering behavior
        return false;
    },
};

marked.use({ renderer });
marked.use(
    markedHighlight({
        langPrefix: "hljs language-",
        highlight(code: string, lang: string) {
            if (lang === "mermaid") {
                return `<pre class="mermaid">${code}</pre>`;
            }
            const language = hljs.getLanguage(lang) ? lang : "plaintext";
            return hljs.highlight(code, { language }).value;
        },
    })
);

export async function generateHTMLforNotebook(
    boostNotebookPath: string,
    baseFolderPath: string,
    context: vscode.ExtensionContext
): Promise<string> {
    return new Promise<string>(async (resolve, reject) => {
        try {
            const htmlFileUri = getBoostFile(vscode.Uri.file(boostNotebookPath),
                { format: BoostFileType.output, outputType: OutputType.html }).fsPath;

            const boostNotebook = new BoostNotebook();
            boostNotebook.load(boostNotebookPath);
            await convertNotebookToHTML(
                boostNotebook,
                boostNotebookPath,
                baseFolderPath,
                htmlFileUri,
                context
            );
            resolve(htmlFileUri);
        } catch (error) {
            reject(error);
        }
    });
}

export async function convertNotebookToHTML(
    notebook: BoostNotebook,
    notebookPath: string,
    baseFolderPath: string,
    outputPath: string,
    context: vscode.ExtensionContext
): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
        convertNotebookToHTMLinMemory(notebook, notebookPath, baseFolderPath, context)
            .then((html: string) => {
                fs.writeFileSync(outputPath, html);
                resolve();
            })
            .catch((error: any) => {
                reject(error);
            });
    });
}

async function convertNotebookToHTMLinMemory(
    notebook: BoostNotebook,
    notebookPath: string,
    baseFolderPath: string,
    context: vscode.ExtensionContext
): Promise<string> {
    const cells = notebook.cells;
    const htmlPathOnDisk = vscode.Uri.joinPath(context.extensionUri, 'resources', 'export', 'notebook_html.html');
    const rawHtmlContent = fs.readFileSync(htmlPathOnDisk.fsPath, 'utf8');

    const template = _.template(rawHtmlContent);

    const stats = fs.statSync(notebookPath);
    const timestamp = stats.mtime;
    const fileStamp = formatDateTime(timestamp);

    // Retrieve metadata from the notebook
    // convert the file path to a URL
    const sourceFile = notebook.metadata["sourceFile"]?notebook.metadata["sourceFile"] as string:"UNKNOWN-SOURCE-FILE";

    const prettySourceFile = (sourceFile === "./")?
        `${path.basename(baseFolderPath)}`:
        `${sourceFile}`;

    const projectLevel = sourceFile === "./";
    const analysisType = projectLevel ? "Project" : "Source";
    const buildingSummary = notebookPath.endsWith(NOTEBOOK_SUMMARY_EXTENSION);
    const pageTitle = `Polyverse Boost ${analysisType} Analysis ${buildingSummary?"Summary":projectLevel?"":"Details"}: ${prettySourceFile}`;

    let summaryNotebook: BoostNotebook | undefined = undefined;
    if (projectLevel || buildingSummary) {
        summaryNotebook = notebook;
    } else {
        const summaryBoostFile = getBoostFile(vscode.Uri.file(path.join(baseFolderPath,sourceFile)), {
            format: BoostFileType.summary
        });
        // if summary exists, then print that 
        if (fs.existsSync(summaryBoostFile.fsPath)) {
            summaryNotebook = new BoostNotebook();
            summaryNotebook.load(summaryBoostFile.fsPath);
        }
    }

    const summaryContent : string[] = [];
    if (summaryNotebook) {
        // print the blueprint first in the summary
        const blueprintCell = findCellByKernel(summaryNotebook, ControllerOutputType.blueprint) as BoostNotebookCell;

        if (blueprintCell) {
            const convertedMarkdown : string = marked.parse(blueprintCell.value, {
                highlight: (code, lang) => hljs.highlightAuto(code, [lang]).value,
            });

            summaryContent.push(`<div class="blueprint-section">${convertedMarkdown}</div><p></p>`);
        }

        // then print the other summaries
        for (const boostCell of summaryNotebook.cells) {
            if (boostCell.id === blueprintCell?.id) {
                continue;
            }
            const convertedMarkdown : string = marked.parse(boostCell.value, {
                highlight: (code, lang) => hljs.highlightAuto(code, [lang]).value,
            });
            summaryContent.push(`<div class="${summaryContent.length > 0?"new-page-section":""}>${convertedMarkdown}</div><p></p>`);
        }
    }

    const cellHtmls: string[] = [];

    // if we are printing details for a file, keep displaying - otherwise summary only
    if (!projectLevel && !buildingSummary) {
        if (summaryNotebook) {
            cellHtmls.push(`<h1>Detailed Analysis</h1>`);
        }

        let count = 0;
        for (let cell of cells) {
            count++;
            let cellHtml = "";
            if (cell.kind === NotebookCellKind.Markup) {
                cellHtml += marked.parse(cell.value, {
                    highlight: (code, lang) => hljs.highlightAuto(code, [lang]).value,
                });
            } else if (cell.kind === NotebookCellKind.Code) {

                // if there is a lineNumberBase, then add 1 to it to get the original line number and 
                // add that info
                const line = cell.metadata?.lineNumberBase ? cell.metadata?.lineNumberBase as number + 1 : 1;
                const lineText = cell.metadata?.lineNumberBase ? `line ${line}:` : ":";

                if( count > 1 ){
                    cellHtml += `<div class="new-page-section">`;
                } else {
                    cellHtml += `<div>`;
                }

                // get the the source language if available
                let sourceLanguage = cell.languageId??plaintext;;

                if (sourceLanguage === plaintext) {
                    sourceLanguage = "General";
                }

                cellHtml += `
                    <h2>${sourceFile} ${lineText}</h2>`;

                if (sourceLanguage && sourceLanguage !== "General") {
                    cellHtml += `
                        <p>Programming Language: ${cell.languageId}</p>`;
                }

                cellHtml += `
                    <pre><code>${hljs.highlightAuto(cell.value).value}</code></pre>
                `;
                cellHtml += "</div>";
            }
            if (cell.outputs) {
                cellHtml += "<div class='analysis-section'>";
                for (let output of cell.outputs) {
                    output.items.forEach((item) => {
                        cellHtml += "<div class='output-item'>";
                        if (item.mime.startsWith("text/x-")) {
                            cellHtml += `<p>Converted Programming Language: ${item.mime.replace("text/x-", "")}</p>`;
                        } else if (!item.mime.startsWith("text/markdown")) {
                            cellHtml += `<p>Output Type: ${item.mime}</p>`;
                        }
                        cellHtml += marked.parse(item.data, {
                            highlight: (code, lang) => hljs.highlightAuto(code, [lang]).value,
                        });
                        cellHtml += "</div'>";
                    });
                }
                cellHtml += "</div>";
            }
            cellHtmls.push(cellHtml);
        }
    }

    return template({
        cellStyleSheet: cellStyleSheet,
        mermaidScript: mermaidScript,
        pageTitle: pageTitle,
        sourceFile: sourceFile,
        fileStamp: fileStamp,
        summaryContent: summaryContent,
        cellsHtml: cellHtmls
    });
}