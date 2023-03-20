import * as vscode from 'vscode';
import { TextDecoder, TextEncoder } from 'util';

/**
 * An ultra-minimal sample provider that lets the user type in JSON, and then
 * outputs JSON cells. The outputs are transient and not saved to notebook file on disk.
 */

interface RawNotebookData {
	cells: RawNotebookCell[]
}

interface RawNotebookCell {
	language: string;
	value: string;
	kind: vscode.NotebookCellKind;
	editable?: boolean;
	outputs?: vscode.NotebookCellOutput[];
	metadata?: any;
}

interface SerializedNotebookCell {
    language: string;
    value: string;
    kind: vscode.NotebookCellKind;
    editable?: boolean;
    outputs?: {
            mimeType: string;
            value: string;
        }[];
    metadata?: any;
}

interface SerializedNotebook {
	cells: SerializedNotebookCell[]
}


export class BoostContentSerializer implements vscode.NotebookSerializer {
	public readonly label: string = 'My Sample Content Serializer';

	public async deserializeNotebook(data: Uint8Array, token: vscode.CancellationToken): Promise<vscode.NotebookData> {
		const contents = new TextDecoder().decode(data); // convert to String

		// Read file contents
		let raw: RawNotebookData;
		try {
			raw = <RawNotebookData>JSON.parse(contents);
		} catch {
			raw = { cells: [] };
		}

		// Create array of Notebook cells for the VS Code API from file contents
		const cells = raw.cells.map(item => {
			const cellData = new vscode.NotebookCellData(
				item.kind,
				item.value,
				item.language
			);
			cellData.outputs = item.outputs?.map((output: any) => {
				const outputItems = output.items?.map((outputItem: any) => {
					return new vscode.NotebookCellOutputItem(outputItem.value, outputItem.mimeType);
				}) ?? [];
				return new vscode.NotebookCellOutput(outputItems);
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
				output.items.some(outputItem => outputItem.mime === 'application/vnd.code.notebook.error')
			);
		
			// Skip serialization if the cell has error outputs
			if (!hasErrorOutput) {
				contents.cells.push({
					kind: cell.kind,
					language: cell.languageId,
					value: cell.value,
					outputs: cell.outputs?.flatMap(output => 
						output.items.map(outputItem => ({
							mimeType: outputItem.mime,
							value: new TextDecoder().decode(outputItem.data),
						}))
					),
					metadata: cell.metadata,
				});
			}
		}

		const ret = new TextEncoder().encode(JSON.stringify(contents, null, 4));
		//convert from Uit8Array to string

		console.log("serialized: ", JSON.stringify(contents, null, 4));
		return ret;
	}
}
