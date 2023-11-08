import * as fs from "fs";
import * as vscode from "vscode";
import * as path from "path";

import {
    BoostNotebook,
    BoostNotebookCell,
    NOTEBOOK_SUMMARY_EXTENSION,
    SerializedNotebookCellOutput,
} from "../data/jupyter_notebook";
import {
    BoostFileType,
    OutputType,
    findCellByKernel,
    getBoostFile,
} from "../extension/extension";
import { ControllerOutputType } from "../controllers/controllerOutputTypes";
import { formatDateTime } from "./datetime";
import { plaintext } from "./languageMappings";

export async function generateMarkdownforNotebook(
    boostNotebookPath: string,
    baseFolderPath: string
): Promise<string> {
    return new Promise<string>(async (resolve, reject) => {
        try {
            const mdFilename = getBoostFile(
                vscode.Uri.parse(boostNotebookPath),
                {
                    format: BoostFileType.output,
                    outputType: OutputType.markdown,
                }
            ).fsPath;

            const boostNotebook = new BoostNotebook();
            boostNotebook.load(boostNotebookPath);
            await generateMarkdownFromJson(
                boostNotebook,
                boostNotebookPath,
                baseFolderPath,
                mdFilename
            );
            resolve(mdFilename);
        } catch (error) {
            reject(error);
        }
    });
}

async function generateMarkdownFromJson(
    boostNotebook: BoostNotebook,
    notebookPath: string,
    baseFolderPath: string,
    outputPath: string
): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
        try {
            const markdown = await generateMarkdownFromObject(
                boostNotebook,
                notebookPath,
                baseFolderPath,
                {
                    showOutputMetadata: false,
                    printSourceCodeBorder: false,
                    wrapText: false,
                }
            );

            fs.writeFileSync(outputPath, markdown);
            resolve();
        } catch (error) {
            reject(error);
        }
    });
}

interface PrintOptions {
    showOutputMetadata: boolean;
    printSourceCodeBorder: boolean;
    wrapText: boolean;
}

async function generateMarkdownFromObject(
    boostNotebook: BoostNotebook,
    notebookPath: string,
    baseFolderPath: string,
    printOptions: PrintOptions
): Promise<string> {
    const stats = fs.statSync(notebookPath);
    const timestamp = stats.mtime;
    const fileStamp = formatDateTime(timestamp);

    const sourceFile = boostNotebook.metadata["sourceFile"]?boostNotebook.metadata["sourceFile"] as string:"UNKNOWN-SOURCE-FILE";

    const projectLevel = sourceFile === "./";
    const analysisType = projectLevel ? "Project" : "Source";
    const buildingSummary = notebookPath.endsWith(NOTEBOOK_SUMMARY_EXTENSION);
    const pageTitle = `Polyverse Boost-generated ${analysisType} Analysis${buildingSummary?" Summary":projectLevel?"":" Details"}`;

    const prettySourceFile =
        sourceFile === "./" ? path.basename(baseFolderPath) : sourceFile;

    const sectionHeading = `${analysisType}: ${prettySourceFile}\nDate Generated: ${fileStamp}`;

    let markdownContent = `# ${pageTitle}\n\n` + `## ${sectionHeading}\n\n`;

    let summaryNotebook: BoostNotebook | undefined = undefined;
    if (projectLevel || buildingSummary) {
        summaryNotebook = boostNotebook;
    } else {
        const summaryBoostFile = getBoostFile(vscode.Uri.parse(path.join(baseFolderPath,sourceFile)), {
            format: BoostFileType.summary
        });
        // if summary exists, then print that 
        if (fs.existsSync(summaryBoostFile.fsPath)) {
            summaryNotebook = new BoostNotebook();
            summaryNotebook.load(summaryBoostFile.fsPath);
        }
    }

    if (summaryNotebook) {
        // print the blueprint first in the summary
        const blueprintCell = findCellByKernel(summaryNotebook, ControllerOutputType.blueprint) as BoostNotebookCell;
        if (blueprintCell) {
            markdownContent += `${blueprintCell.value}\n`;
        }

        // then print the other summaries
        for (const boostCell of summaryNotebook.cells) {
            if (boostCell.id === blueprintCell?.id) {
                continue;
            }
            markdownContent += `${boostCell.value}\n`;
        }
    }

    // if we are printing details for a file, keep displaying - otherwise summary only
    if (!projectLevel && !buildingSummary) {
        if (summaryNotebook) {
            markdownContent += `---\n## Detailed Analysis:\n`;
        }

        for (const boostCell of boostNotebook.cells) {
            // if there is a lineNumberBase, then add 1 to it to get the original line number and 
            // add that info
            const line = boostCell.metadata?.lineNumberBase ? boostCell.metadata?.lineNumberBase as number + 1 : 1;
            const lineText = boostCell.metadata?.lineNumberBase ? `line ${line}` : "";

            markdownContent += `\n### Cell ${boostCell.id}:\n`;
            
            markdownContent += `## Original Code:\n\n`;

            // get the the source language if available
            let sourceLanguage = boostCell.languageId??plaintext;;

            if (sourceLanguage === plaintext) {
                sourceLanguage = "General";
            }
            if (sourceLanguage !== "General") {
                markdownContent += `### Programming Language: ${boostCell.languageId}\n`;
            }
            markdownContent += `### ${prettySourceFile} ${lineText}\n\n`;
    
            let cellContent = boostCell.value.replace(/\t/g, " ");
    
            markdownContent += `\`\`\`${boostCell.languageId}\n${cellContent}\n\`\`\`\n`;
    
            const cellOutputs = boostCell.outputs || [];
            const outputText = cellOutputs
                .map((output) => formatOutput(output, printOptions))
                .join("\n");
    
            markdownContent += `## Boost Analysis:\n${outputText}\n\n`;
        }
    }

    return markdownContent;
}

function formatOutput(
    output: SerializedNotebookCellOutput,
    printOptions: PrintOptions
): string {
    const items = output.items
        .map((item) => {
            let text = "";
            if (item.mime.startsWith("text/x-")) {
                const programmingLanguage = item.mime.replace("text/x-", "");
                text += `Converted Programming Language: ${programmingLanguage}\n`;
                return text + `\n\`\`\`${programmingLanguage}\n${item.data}\`\`\``;
            } else if (!item.mime.startsWith("text/markdown")) {
                text += `MIME Type: ${item.mime}\n`;
            } 
            return text + `\n${item.data}`;
        })
        .join("\n");

    const metadata =
        printOptions.showOutputMetadata && output.metadata
            ? `\n\nMetadata: ${JSON.stringify(output.metadata, null, 2)}`
            : "";

    return `${items}${metadata}`;
}
