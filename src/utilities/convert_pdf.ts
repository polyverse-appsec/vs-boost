import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import puppeteer from 'puppeteer';
import * as vscode from 'vscode';

import { BoostNotebook } from '../data/jupyter_notebook';
import { BoostFileType, OutputType, getBoostFile } from "../extension/extension";
import { convertNotebookToHTML } from './convert_html';


export async function generatePDFforNotebook(boostNotebookPath : string, baseFolderPath : string, context: vscode.ExtensionContext) : Promise<string> {
    return new Promise<string> (async (resolve, reject) => {
        try {
            const pdfFilename = getBoostFile(vscode.Uri.parse(boostNotebookPath),
                { format: BoostFileType.output, outputType: OutputType.pdf }).fsPath;

            const boostNotebook = new BoostNotebook();
            boostNotebook.load(boostNotebookPath);
            await generatePdfFromJson(boostNotebook, boostNotebookPath, baseFolderPath, pdfFilename, context);
            resolve(pdfFilename);
        } catch (error) {
            reject(error);
        }
    });
}

async function generatePdfFromJson(boostNotebook: BoostNotebook, notebookPath : string, baseFolderPath : string, outputPath: string, context: vscode.ExtensionContext): Promise<void> {
    return new Promise<void> (async (resolve, reject) => {
        try {
                        // Generate a random filename
            const randomFilename = crypto.randomBytes(8).toString('hex');

            // Write the HTML to a temporary file with the random filename
            const tempHtmlPathUnderBaseFolder = path.join(baseFolderPath, randomFilename);
            const normalizedTempHtmlPath = path.normalize(tempHtmlPathUnderBaseFolder);
            const tempHtmlUri = getBoostFile(vscode.Uri.parse(normalizedTempHtmlPath), { format: BoostFileType.output, outputType: OutputType.html });

            try {
                await convertNotebookToHTML(boostNotebook, notebookPath, baseFolderPath, tempHtmlUri.fsPath, context);

                // convert the html file to pdf using puppeteer
                const browser = await puppeteer.launch();
                try {
                    const page = await browser.newPage();
                    // convert the file path to a URL
                    const sourceFile = boostNotebook.metadata["sourceFile"] as string;
                    const prettySourceFile = (sourceFile === "./")?
                        `Project: ${path.basename(baseFolderPath)}`:
                        `Source: ${sourceFile}`;
                    await page.goto(tempHtmlUri.toString(), { waitUntil: 'networkidle0' });
                    await page.pdf({
                        path: outputPath,
                        format: 'letter',
                        displayHeaderFooter: true,
                        headerTemplate: `
                            <div style="font-size:10px; width:100%; padding: 10px; text-align:right">
                                ${prettySourceFile}
                            </div>`,
                        footerTemplate: `
                            <table style="font-size:10px; width:100%; padding: 10px">
                                <tr>
                                    <td style="text-align:left; width:25%!important;">
                                        <span class="date"></span>
                                    </td>
                                    <td style="text-align:center; width: 50%">
                                        <span>Polyverse Boost: https://www.polyverse.com</span>
                                    </td>
                                    <td style="text-align:right; width:25%!important;">
                                        <span class="pageNumber"></span> of <span class="totalPages"></span>
                                    </td>
                                </tr>
                            </table>
                        `
                    });
                } finally {
                    await browser.close();
                }

            } finally {
                // delete the temporary html file so we don't leak the file in the user's workspace
                // this means debugging failures will be harder to diagnose, but it's better than alternative
                // we can use a debug flag in future to keep the file around for debugging
                if (fs.existsSync(tempHtmlUri.fsPath)) {
                    fs.unlinkSync(tempHtmlUri.fsPath);
                }
            }

            resolve();
        } catch (error) {
            reject(error);
        }
    });
}