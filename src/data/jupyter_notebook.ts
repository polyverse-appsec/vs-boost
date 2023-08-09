import * as fs from 'fs';
import * as path from 'path';
import * as nbformat from '@jupyterlab/nbformat';
import { randomUUID } from 'crypto';
import { boostLogging } from '../utilities/boostLogging';

export const NOTEBOOK_TYPE = 'polyverse-boost-notebook';
export const NOTEBOOK_EXTENSION = ".boost-notebook";

export const NOTEBOOK_SUMMARY_PRE_EXTENSION = '.summary';
export const NOTEBOOK_SUMMARY_EXTENSION = NOTEBOOK_SUMMARY_PRE_EXTENSION + NOTEBOOK_EXTENSION;

export const NOTEBOOK_GUIDELINES_PRE_EXTENSION = '.guidelines';
export const NOTEBOOK_GUIDELINES_EXTENSION = NOTEBOOK_GUIDELINES_PRE_EXTENSION + NOTEBOOK_EXTENSION;

export enum NotebookCellKind {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Markup = 1,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Code = 2
}

export interface SerializedNotebookCellOutput /* implements nbformat.IOutput  */ {
    items: {
        mime: string;
        data: string;
    }[];
    metadata?: any;
}

export interface SerializedNotebookCell {
    languageId: string;
    value: string;
    kind: NotebookCellKind;
    editable?: boolean;
    outputs?: SerializedNotebookCellOutput[];
    metadata?: any;
}

export interface SerializedNotebook {
    cells: SerializedNotebookCell[]
    metadata?: any;
}

export class BoostNotebookCell /*implements nbformat.ICell */ {
    languageId: string;
    id?: string;
    value: string;
    kind: NotebookCellKind;
    editable?: boolean;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    //    execution_count: nbformat.ExecutionCount;
    outputs: SerializedNotebookCellOutput[] = [];
    // eslint-disable-next-line @typescript-eslint/naming-convention
    //    cell_type: nbformat.CellType;
    metadata?: nbformat.ICellMetadata;
    //    source: nbformat.MultilineString;
    //    attachments?: nbformat.IAttachments;

    constructor(
        kind: NotebookCellKind,
        value: string,
        languageId: string,
        id?: string,
        metadata?: nbformat.ICellMetadata,
        outputs?: SerializedNotebookCellOutput[],
        //            editable?: boolean,
        //            source: nbformat.MultilineString = "",
        // eslint-disable-next-line @typescript-eslint/naming-convention
        //            execution_count: nbformat.ExecutionCount = null,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        //            cell_type: nbformat.CellType = 'code',
        //            attachments?: nbformat.IAttachments
    ) {
        this.languageId = languageId;
        this.id = id ? id : randomUUID().toString();
        this.value = value;
        this.kind = kind;
        //        this.execution_count = execution_count;
        //        this.editable = editable;
        this.outputs = [];
        this.metadata = metadata;
        //        this.cell_type = cell_type;
        //        this.source = source;
    }

    initializeMetadata(newData: any) {
        this.metadata = newData;
    }

    updateOutputItem(outputType: string, newOutput: SerializedNotebookCellOutput) {
        // Check if any existing output item has the same outputType
        const existingItemIndex = this.outputs.findIndex(item => item.metadata?.outputType === outputType);

        if (!newOutput.metadata || !newOutput.metadata.outputType) {
            throw new Error('Output metadata must contain an outputType');
        }

        if (existingItemIndex !== -1) {
            // Replace the existing output item with the new one
            this.outputs[existingItemIndex] = newOutput;
        } else {
            // Add the new output item to the cell's outputs
            this.outputs.push(newOutput);
        }
    }
}

/*
// Usage example
const boostNotebook = new BoostNotebook();
boostNotebook.load('path/to/json/file.json');
boostNotebook.addCell({
  cell_type: 'code',
  execution_count: null,
  metadata: {},
  outputs: [],
  source: 'print("Hello, World!")',
});
boostNotebook.updateMetadata('custom_metadata', 'custom_value');
boostNotebook.save('path/to/save/notebook.ipynb');
*/

export class BoostNotebook /* implements nbformat.INotebookContent */ {
    metadata: nbformat.INotebookMetadata;
    cells: BoostNotebookCell[];
    //  nbformat: number;

    // eslint-disable-next-line @typescript-eslint/naming-convention
    //  nbformat_minor: number;
    fsPath: string;

    [key: string]: any; // Index signature for type 'string'

    constructor() {
        this.cells = [];
        this.metadata = {};
        this.fsPath = '';

        // these are for compat with vscode
        //    this.nbformat = 4;
        //    this.nbformat_minor = 5;
    }

    create(jsonString: string): void {
        let notebook = JSON.parse(jsonString) as BoostNotebook;
        Object.assign(this, notebook);
        for (let i = 0; i < this.cells.length; i++) {
            this.cells[i] = Object.assign(new BoostNotebookCell(this.cells[i].kind, this.cells[i].value, this.cells[i].languageId), this.cells[i]);
            // since Outputs are plain old data, we don't need to reserialize them
        }
    }

    load(filePath: string): void {
        const jsonString = fs.readFileSync(filePath, 'utf8');
        try {
            this.create(jsonString);
        } catch (e) {
            if (e instanceof SyntaxError) {
                boostLogging.error(`Could not parse notebook ${filePath} due to invalid JSON: ${e}`, false);
                throw new SyntaxError(`Could not parse notebook ${filePath} due to invalid JSON: ${e}`);
            } else {
                throw e;
            }
        }
        this.fsPath = filePath;
    }

    flushToFS(): void {
        this.save(this.fsPath);
    }

    save(filename: string): void {
        this.cells.forEach(cell => {
            cell.outputs.forEach(output => {
                if (!output.metadata || !output.metadata.outputType) {
                    boostLogging.error('Output metadata must contain an outputType', false);
                }
            });
        });

        // Create any necessary folders
        const folderPath = path.dirname(filename);
        fs.mkdirSync(folderPath, { recursive: true });

        this.fsPath = filename;

        // no need to persist the path into the file
        const { fsPath, ...dataWithoutFsPath } = this;
        const notebookJson = JSON.stringify(dataWithoutFsPath, null, 2);

        fs.writeFileSync(filename, notebookJson, { encoding: 'utf8' });
    }

    // if there are 0 cells in the notebook, or it has outputs attached to any cells, it is not empty
    // We don't look at contents of any cell today
    isEmpty(): boolean {
        let empty = true;
        if (this.cells.length === 0) {
            return true;
        } else {
            for (let i = 0; i < this.cells.length; i++) {
                if (this.cells[i].outputs.length > 0) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }

    addCell(cell: BoostNotebookCell): void {
        this.cells.push(cell);
        cell.outputs.forEach(output => {
            if (!output.metadata || !output.metadata.outputType) {
                boostLogging.error('Output metadata must contain an outputType', false);
            }
        });
    }

    replaceCells(cells: BoostNotebookCell[]): void {
        this.cells.forEach(cell => {
            cell.outputs.forEach(output => {
                if (!output.metadata || !output.metadata.outputType) {
                    boostLogging.error('Output metadata must contain an outputType', false);
                }
            });
        });
        this.cells = cells;
    }

    appendCells(cells: BoostNotebookCell[]): void {
        this.cells.forEach(cell => {
            cell.outputs.forEach(output => {
                if (!output.metadata || !output.metadata.outputType) {
                    boostLogging.error('Output metadata must contain an outputType', false);
                }
            });
        });
        for (const cell of cells) {
            this.cells.push(cell);
        }
    }

    updateMetadata(key: string, value: any): void {
        this.metadata[key] = value;
    }
}