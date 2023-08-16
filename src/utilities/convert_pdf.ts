import { BoostNotebook, NOTEBOOK_EXTENSION } from '../data/jupyter_notebook';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { convertNotebookToHTML } from './convert_html';
import puppeteer from 'puppeteer';
import * as vscode from 'vscode';


export async function generatePDFforNotebook(boostNotebookPath : string, baseFolderPath : string, context: vscode.ExtensionContext) : Promise<string> {
    return new Promise<string> (async (resolve, reject) => {
        try {
            const pdfFilename = boostNotebookPath.replace(NOTEBOOK_EXTENSION, '.pdf');

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
            const randomFilename = crypto.randomBytes(8).toString('hex') + '.html';

            // Write the HTML to a temporary file with the random filename
            const tempHtmlPath = path.join(baseFolderPath, randomFilename);
            const normalizedTempHtmlPath = path.normalize(tempHtmlPath);
            await convertNotebookToHTML(boostNotebook, notebookPath, baseFolderPath, normalizedTempHtmlPath, context);

            try {
                // convert the html file to pdf using puppeteer
                const browser = await puppeteer.launch();
                const page = await browser.newPage();
                // convert the file path to a URL
                const url = `file://${tempHtmlPath}`;
                await page.goto(url, { waitUntil: 'networkidle0' });
                await page.pdf({ path: outputPath});

                await browser.close();

            } finally {
                // delete the temporary html file so we don't leak the file in the user's workspace
                // this means debugging failures will be harder to diagnose, but it's better than alternative
                // we can use a debug flag in future to keep the file around for debugging
                fs.unlinkSync(normalizedTempHtmlPath);
            }

            resolve();
        } catch (error) {
            reject(error);
        }
    });
}