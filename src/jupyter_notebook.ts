import * as fs from 'fs';
import * as path from 'path';
import * as nbformat from '@jupyterlab/nbformat';
import { randomUUID } from 'crypto';
import { NOTEBOOK_EXTENSION } from './extension';

export const NOTEBOOK_SUMMARY_EXTENSION = '.summary' + NOTEBOOK_EXTENSION;

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
        this.id = id? id : randomUUID().toString();
        this.value = value;
        this.kind = kind;
//        this.execution_count = execution_count;
//        this.editable = editable;
        this.outputs = [];
        this.metadata = metadata;
//        this.cell_type = cell_type;
//        this.source = source;
    }
    initializeMetadata(newData : any) {
        this.metadata = newData;
    }
    updateOutputItem(outputType: string, newOutput: SerializedNotebookCellOutput) {
        // Check if any existing output item has the same outputType
        const existingItemIndex = this.outputs.findIndex(item => item.metadata?.outputType === outputType);
    
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
  cells : BoostNotebookCell[];
//  nbformat: number;
  
  // eslint-disable-next-line @typescript-eslint/naming-convention
//  nbformat_minor: number;

  [key: string]: any; // Index signature for type 'string'

  constructor() {
    this.cells = [];
    this.metadata = {};

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
      this.create(jsonString);
    }

  save(filename: string): void {
    const notebookJson = JSON.stringify(this, null, 2);

    // Create any necessary folders
    const folderPath = path.dirname(filename);
    fs.mkdirSync(folderPath, { recursive: true });

    fs.writeFileSync(filename, notebookJson, { encoding: 'utf8'});
  }

  addCell(cell: BoostNotebookCell): void {
    this.cells.push(cell);
  }

  replaceCells(cells: BoostNotebookCell[]): void {
    this.cells = cells;
  }

  appendCells(cells: BoostNotebookCell[]): void {
    for (const cell of cells) {
      this.cells.push(cell);
    }
  }

  updateMetadata(key: string, value: any): void {
    this.metadata[key] = value;
  }
}