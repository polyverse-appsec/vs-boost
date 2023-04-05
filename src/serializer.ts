import * as vscode from 'vscode';
import { TextDecoder, TextEncoder } from 'util';
import { error } from 'console';

/**
 * An ultra-minimal sample provider that lets the user type in JSON, and then
 * outputs JSON cells. The outputs are transient and not saved to notebook file on disk.
 */

interface RawNotebookData {
	cells: RawNotebookCell[]
}

interface RawNotebookCell {
	languageId: string;
	value: string;
	kind: vscode.NotebookCellKind;
	editable?: boolean;
	outputs?: vscode.NotebookCellOutput[];
	metadata?: any;
}

interface SerializedNotebookCellOutput {
	items: {
		mime: string;
		data: string;
	}[];
	metadata?: any;
}

interface SerializedNotebookCell {
    languageId: string;
    value: string;
    kind: vscode.NotebookCellKind;
    editable?: boolean;
    outputs?: SerializedNotebookCellOutput[];
    metadata?: any;
}

interface SerializedNotebook {
	cells: SerializedNotebookCell[]
}


export class BoostContentSerializer implements vscode.NotebookSerializer {

    public async deserializeNotebook(
        data: Uint8Array,
        token: vscode.CancellationToken): Promise<vscode.NotebookData> {
        // if the file is empty, return an empty array of cells
        if (data.byteLength === 0) {
            return new vscode.NotebookData([]);
        }
        const contents = new TextDecoder().decode(data); // convert to String

        // Read file contents
        let raw: RawNotebookData;
        try {
            raw = <RawNotebookData>JSON.parse(contents);
        } catch (err) {
            error("Boost error parsing JSON file contents: " + (err as Error).toString());
            raw = { cells: [] };
        }

        // Create array of Notebook cells for the VS Code API from file contents
        const cells = raw.cells.map(item => {
            const cellData = new vscode.NotebookCellData(
                item.kind,
                item.value,
                item.languageId
            );
            cellData.outputs = (item.outputs ?? []).map((output: vscode.NotebookCellOutput) => {
                const outputItems = output.items.map((outputItem: any) => {
                    return new vscode.NotebookCellOutputItem(
                        new TextEncoder().encode(outputItem.data), outputItem.mime);
                });
                return new vscode.NotebookCellOutput(outputItems, output.metadata);
            });
            cellData.metadata = item.metadata;
            return cellData;
        });

        return new vscode.NotebookData(cells);
    }

    public async serializeNotebook(data: vscode.NotebookData, token: vscode.CancellationToken): Promise<Uint8Array> {
        // Map the Notebook data into the format we want to save the Notebook data as
        const contents: SerializedNotebook = { cells: [] };

        for (const cell of data.cells) {
            // Check if any output item has an error mimeType
            const hasErrorOutput = cell.outputs?.some(output =>
                output.items.some(outputItem =>
                    outputItem.mime === 'application/vnd.code.notebook.error')
            );

            // Skip serialization if the cell has error outputs
            if (hasErrorOutput) {
                continue;
            }

            contents.cells.push({
                kind: cell.kind,
                languageId: cell.languageId,
                value: cell.value,
                outputs: cell.outputs?.map(output => {
                    const items = output.items.map(outputItem => ({
                        mime: outputItem.mime,
                        data: new TextDecoder().decode(outputItem.data),
                    }));
                    return { items, metadata: output.metadata };
                }),
                metadata: cell.metadata,
            });
        }

        const ret = new TextEncoder().encode(JSON.stringify(contents, null, 4));
        //convert from Uit8Array to string

        return ret;
    }
}
