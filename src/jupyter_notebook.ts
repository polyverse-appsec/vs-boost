import * as fs from 'fs';
import * as nbformat from '@jupyterlab/nbformat';

export enum NotebookCellKind {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Markup = 1,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Code = 2
}

export interface SerializedNotebookCellOutput {
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

export class BoostNotebookCell {
    languageId: string;
    value: string;
    kind: NotebookCellKind;
    editable?: boolean;
    outputs?: SerializedNotebookCellOutput[];
    metadata?: any;

    constructor(kind: NotebookCellKind, value: string, languageId: string, editable?: boolean, outputs?: SerializedNotebookCellOutput[], metadata?: any) {
        this.languageId = languageId;
        this.value = value;
        this.kind = kind;
        this.editable = editable;
        this.outputs = [];
        this.metadata = metadata;
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

export class BoostNotebook implements nbformat.INotebookContent {
  metadata: nbformat.INotebookMetadata;
  cells : nbformat.ICell[];
  nbformat: number;
  
  // eslint-disable-next-line @typescript-eslint/naming-convention
  nbformat_minor: number;

  [key: string]: any; // Index signature for type 'string'

  constructor() {
    this.cells = [];
    this.metadata = {};

    // these are for compat with vscode
    this.nbformat = 4;
    this.nbformat_minor = 5;
  }

  create(jsonString: string): void {
    let content = JSON.parse(jsonString) as nbformat.INotebookContent;

    Object.assign(this, content);
  }

  load(filePath: string): void {
      const jsonString = fs.readFileSync(filePath, 'utf8');
      let notebook = JSON.parse(jsonString) as nbformat.INotebookContent;
      Object.assign(this, notebook);
    }

  save(filename: string): void {
      const notebookJson = JSON.stringify(this.notebook, null, 2);
      fs.writeFileSync(filename, notebookJson);
  }

  addCell(cell: nbformat.ICell): void {
    this.cells.push(cell);
  }

  updateMetadata(key: string, value: any): void {
    this.metadata[key] = value;
  }
}