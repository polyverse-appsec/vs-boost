import * as vscode from 'vscode';
import { TextDecoder, TextEncoder } from 'util';
import { boostLogging } from './boostLogging';
import { BoostConfiguration } from './boostConfiguration';
import * as boostnb from './jupyter_notebook';
import { errorMimeType } from './base_controller';
/**
 * An ultra-minimal sample provider that lets the user type in JSON, and then
 * outputs JSON cells. The outputs are transient and not saved to notebook file on disk.
 */

interface RawNotebookData {
	cells: RawNotebookCell[],
    metadata?: any;
}

interface RawNotebookCell {
	languageId: string;
	value: string;
	kind: boostnb.NotebookCellKind;
	editable?: boolean;
	outputs?: boostnb.SerializedNotebookCellOutput[];
	metadata?: any;
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
            boostLogging.error(`Boost error parsing JSON file contents: ${(err as Error).toString()}`, false);
            raw = { cells: [] };
        }

        // Create array of Notebook cells for the VS Code API from file contents
        const cells = raw.cells.map(item => {
            const cellData = new vscode.NotebookCellData(
                item.kind,
                item.value,
                item.languageId
            );
            cellData.outputs = (item.outputs ?? []).map((output: boostnb.SerializedNotebookCellOutput) => {
                const outputItems = output.items.map((outputItem: any) => {
                    return new vscode.NotebookCellOutputItem(
                        new TextEncoder().encode(outputItem.data), outputItem.mime);
                });
                return new vscode.NotebookCellOutput(outputItems, output.metadata);
            });
            cellData.metadata = item.metadata;
            return cellData;
        });

        let newNotebookData = new vscode.NotebookData(cells);
        newNotebookData.metadata = raw.metadata;
        return newNotebookData;
    }

    public async serializeNotebookFromDoc(doc: vscode.NotebookDocument): Promise<Uint8Array> {
        // Map the Notebook data into the format we want to save the Notebook data as
        const contents: boostnb.SerializedNotebook = { cells: [], metadata: doc.metadata};

        for (const cell of doc.getCells()) {
            if (!BoostConfiguration.serializationOfCellsContainingErrors)
            {
                // Check if any output item has an error mimeType
                const hasErrorOutput = cell.outputs?.some(output =>
                    output.items.some(outputItem =>
                        outputItem.mime === 'application/vnd.code.notebook.error')
                );

                // Skip serialization if the cell has error outputs
                if (hasErrorOutput) {
                    continue;
                }
            }

            contents.cells.push({
                kind: cell.kind,
                languageId: cell.document.languageId,
                value: cell.document.getText(),
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

    public async serializeNotebook(data: vscode.NotebookData, token: vscode.CancellationToken): Promise<Uint8Array> {
        // Map the Notebook data into the format we want to save the Notebook data as
        const contents: boostnb.SerializedNotebook = { cells: [], metadata: data.metadata};

        for (const cell of data.cells) {
            if (!BoostConfiguration.serializationOfCellsContainingErrors)
            {
                // Check if any output item has an error mimeType
                const hasErrorOutput = cell.outputs?.some(output =>
                    output.items.some(outputItem =>
                        outputItem.mime === 'application/vnd.code.notebook.error')
                );

                // Skip serialization if the cell has error outputs
                if (hasErrorOutput) {
                    continue;
                }
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

        // serialize the notebook metadata
        contents.metadata = data.metadata;

        const ret = new TextEncoder().encode(JSON.stringify(contents, null, 4));
        //convert from Uit8Array to string

        return ret;
    }
}

