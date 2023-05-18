import { BoostNotebook } from './jupyter_notebook';
import * as fs from 'fs';
import * as path from 'path';
import { NOTEBOOK_EXTENSION } from './extension';
const crypto = require('crypto');
import { convertNotebookToHTML } from './convert_html';

import {marked} from 'marked';
import {markedHighlight} from 'marked-highlight';
import hljs from 'highlight.js';
import puppeteer from 'puppeteer';

marked.use(markedHighlight({
  langPrefix: 'hljs language-',
  highlight(code: string, lang: string) {
    if( lang === "mermaid") {
      return `<pre class="mermaid">${code}</pre>`;
    }
    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
    return hljs.highlight(code, { language }).value;
  }
}));

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

                        // Generate a random filename
            const randomFilename = crypto.randomBytes(8).toString('hex') + '.html';

            // Write the HTML to a temporary file with the random filename
            const tempHtmlPath = path.join(baseFolderPath, randomFilename);
            fs.writeFileSync(tempHtmlPath, html);

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
                fs.unlinkSync(tempHtmlPath);
            }

            resolve();
        } catch (error) {
            reject(error);
        }
    });
}