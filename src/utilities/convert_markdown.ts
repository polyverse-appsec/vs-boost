import { BoostNotebook, SerializedNotebookCellOutput, NOTEBOOK_EXTENSION } from '../data/jupyter_notebook';
import * as fs from 'fs';

export async function generateMarkdownforNotebook(boostNotebookPath : string, baseFolderPath : string) : Promise<string> {
    return new Promise<string> (async (resolve, reject) => {
        try {
            const mdFilename = boostNotebookPath.replace(NOTEBOOK_EXTENSION, '.md');

            const boostNotebook = new BoostNotebook();
            boostNotebook.load(boostNotebookPath);
            await generateMarkdownFromJson(boostNotebook, boostNotebookPath, baseFolderPath, mdFilename);
            resolve(mdFilename);
        } catch (error) {
            reject(error);
        }
    });
}

async function generateMarkdownFromJson(boostNotebook: BoostNotebook, notebookPath : string, baseFolderPath : string, outputPath: string): Promise<void> {
    return new Promise<void> (async (resolve, reject) => {
        try {
            const markdown = await generateMarkdownFromObject(boostNotebook, notebookPath, baseFolderPath,
                { showOutputMetadata: false,
                  printSourceCodeBorder: false,
                  wrapText: false } );
          
            // Save the Markdown to a file
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
    const largeFontSize = 16;
    const mediumFontSize = 12;
    const smallFixedFontSize = 9;
  
    const stats = fs.statSync(notebookPath);
    const timestamp = stats.mtime;
    const fileStamp = timestamp.toISOString();
  
    const pageTitle = `Polyverse Boost-generated Source Documentation`;
  
    const sourceFile = boostNotebook.metadata['sourceFile'] as string;
  
    const sectionHeading = `Source File: ${sourceFile}\nDate Generated: ${fileStamp}`;
  
    let markdownContent =
        `# ${pageTitle}\n\n` +
        `## ${sectionHeading}\n\n`;
  
    for (const boostCell of boostNotebook.cells) {
      markdownContent += `\n### Cell ${boostCell.id}:\n`;
      markdownContent += `Programming Language: ${boostCell.languageId}\n`;
      markdownContent += `## Original Code:\n\n`;
  
      let cellContent = boostCell.value.replace(/\t/g, ' ');
  
      markdownContent += "```\n" + `${cellContent}` + '\n```\n';
  
      const cellOutputs = boostCell.outputs || [];
      const outputText = cellOutputs
        .map((output) => formatOutput(output, printOptions))
        .join('\n');
  
      markdownContent += `## Boost Analysis:\n${outputText}\n\n`;
    }
  
    return markdownContent;
  }
  
  function formatOutput(output: SerializedNotebookCellOutput, printOptions: PrintOptions): string {
    const items = output.items
      .map((item) => {
        let text = '';
        if (item.mime.startsWith('text/x-')) {
          text += `Converted Programming Language: ${item.mime.replace('text/x-', '')}\n`;
        } else if (!item.mime.startsWith('text/markdown')) {
          text += `MIME Type: ${item.mime}\n`;
        }
        return text + `\n${item.data}`;
      })
      .join('\n');
  
    const metadata = printOptions.showOutputMetadata && output.metadata ? `Metadata: ${JSON.stringify(output.metadata, null, 2)}` : '';
  
    return `${items}\n${metadata}`;
  }
  