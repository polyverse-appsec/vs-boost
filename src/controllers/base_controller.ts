import * as vscode from "vscode";
import { BoostConfiguration } from "../extension/boostConfiguration";
import { BoostServiceHelper } from "./boostServiceHelper";
import { boostLogging } from "../utilities/boostLogging";
import { fetchGithubSession, getCurrentOrganization } from "../utilities/authorization";
import {
    BoostNotebookCell,
    BoostNotebook,
    SerializedNotebookCellOutput,
    NOTEBOOK_TYPE,
} from "../data/jupyter_notebook";

import { DisplayGroupFriendlyName } from "../data/userAnalysisType";

import { getKernelName } from "../extension/extensionUtilities";
import { fullPathFromSourceFile } from "../utilities/files";
import { errorToString } from "../utilities/error";
import { ControllerOutputType } from "./controllerOutputTypes";

export const errorMimeType = "application/vnd.code.notebook.error";
export const markdownMimeType = "text/markdown";
export const textMimeType = 'text/plain';

export const markdownCodeMarker = '```';

export function codeMimeType(language: string): string {
    return `text/x-${language}`;
}

export const boostUriSchema = "boost-notebook"; // vscode.env.uriScheme;

export class KernelControllerBase extends BoostServiceHelper {
    _problemsCollection: vscode.DiagnosticCollection;
    id: string;
    kernelLabel: string;
    description: string;
    outputHeader: string;
    displayCategory : DisplayGroupFriendlyName;
    private _supportedLanguages = [];
    private _useGeneratedCodeCellOptimization: boolean;
    private useOriginalCodeCheck = false;

    private _executionOrder = 0;
    private readonly _controller: vscode.NotebookController;
    public context: vscode.ExtensionContext;

    constructor(
        problemsCollection: vscode.DiagnosticCollection,
        kernelId: string,
        kernelLabel: string,
        description: string,
        outputType: ControllerOutputType,
        displayCategory: DisplayGroupFriendlyName,
        outputHeader: string,
        useGeneratedCodeCellOptimization: boolean,
        useOriginalCodeCheck: boolean,
        context: vscode.ExtensionContext,
        otherThis: any,
        onServiceResponseHandler: any,
        dynamicInputKey: string = "code"
    ) {
        super(kernelId, outputType, otherThis, dynamicInputKey,
            (err: any) => {
                if (onServiceResponseHandler !== undefined) {
                    onServiceResponseHandler(
                        this.context,
                        err as Error,
                        this.hostExtension
                    );
                }
            },
            (result: any) => {
                if (onServiceResponseHandler !== undefined) {
                    onServiceResponseHandler(
                        this.context,
                        // create a wrapper object with the response (since we aren't passing
                        //  the raw response data to the handler)
                        {
                            response: {
                                data: result,
                            }
                        },
                        this.hostExtension
                    );
                }
            }
        );

        this._problemsCollection = problemsCollection;
        this.id = getKernelName(kernelId);
        this.kernelLabel = kernelLabel;
        this.description = description;
        this.displayCategory = displayCategory;
        this.outputHeader = outputHeader;
        this._useGeneratedCodeCellOptimization =
            useGeneratedCodeCellOptimization;
        this.useOriginalCodeCheck = useOriginalCodeCheck;
        this.context = context;

        this._controller = vscode.notebooks.createNotebookController(
            this.id,
            NOTEBOOK_TYPE,
            this.kernelLabel
        );

        this._controller.supportedLanguages = this._supportedLanguages;
        this._controller.supportsExecutionOrder = true;
        this._controller.executeHandler = this._executeAll.bind(this);
    }

    dispose(): void {
        this._controller.dispose();
    }

    private async _executeAll(
        cells: vscode.NotebookCell[],
        notebook: vscode.NotebookDocument,
        _: vscode.NotebookController
    ): Promise<void> {
        // if user is explicitly analyzing a single cell via the traditional UI, then just refresh it always
        const forceAnalysisRefresh = cells.length === 1;

        return new Promise<void>(async (resolve, reject) => {
            try {
                await this.executeAllWithAuthorization(
                    cells,
                    notebook,
                    forceAnalysisRefresh
                );
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    async doAuthorizationExecution(): Promise<vscode.AuthenticationSession> {
        return fetchGithubSession();
    }

    async executeAllWithAuthorization(
        cells: vscode.NotebookCell[] | BoostNotebookCell[],
        notebook: vscode.NotebookDocument | BoostNotebook,
        forceAnalysisRefresh: boolean = false
    ): Promise<boolean> {
        return new Promise<boolean>(async (resolve, reject) => {
            try {
                // make sure we're authorized
                // if not, run the authorization cell
                const session = await this.doAuthorizationExecution();

                //if not authorized, give up
                if (!session) {
                    return false;
                }

                const refreshed = await this.executeAll(
                    cells,
                    notebook as vscode.NotebookDocument,
                    session,
                    forceAnalysisRefresh
                );
                resolve(refreshed);
            } catch (error) {
                reject(error);
            }
        });
    }

    shouldRefreshCell(
        notebook : vscode.NotebookDocument | BoostNotebook,
        cell: vscode.NotebookCell | BoostNotebookCell | undefined,
        forceAnalysisRefresh: boolean): boolean {
        if (forceAnalysisRefresh) {
            return true;
        }

        if (!cell) {
            return forceAnalysisRefresh;
        }
        
        return !this.isCellOutputMissingOrError(notebook, cell);
    }

    async executeAll(
        cells: vscode.NotebookCell[] | BoostNotebookCell[],
        notebook: vscode.NotebookDocument | BoostNotebook,
        session: vscode.AuthenticationSession,
        forceAnalysisRefresh: boolean = false
    ): Promise<boolean> {
        // if caller asks to force refresh, or its set globally, or set for all calls to this command
        forceAnalysisRefresh =
            forceAnalysisRefresh ||
            BoostConfiguration.refreshAnalysisAlways ||
            BoostConfiguration.refreshAnalysisAlwaysByKernel(this.command);

        let successfullyCompleted = true;
        const promises: Promise<boolean>[] = [];
        const usingBoostNotebook = notebook instanceof BoostNotebook;

        if (cells.length === 0) {
            boostLogging.warn(
                `No cells to ${this.command} of Notebook ${
                    usingBoostNotebook
                        ? notebook.fsPath
                        : notebook.uri.toString()
                }`,
                false
            );
            return false;
        }

        boostLogging.info(
            `Starting ${this.command} of Notebook ${
                usingBoostNotebook ? notebook.fsPath : notebook.uri.toString()
            }`,
            false
        );
        if (forceAnalysisRefresh) {
            boostLogging.debug(
                `Force-Refresh: Refreshing ${
                    this.command
                } of all cells in Notebook ${
                    usingBoostNotebook
                        ? notebook.fsPath
                        : notebook.uri.toString()
                }`
            );
        } else {
            boostLogging.debug(
                `NO-Force-Refresh: Analyzing ONLY empty and error cells for ${
                    this.command
                } of cells in Notebook ${
                    usingBoostNotebook
                        ? notebook.fsPath
                        : notebook.uri.toString()
                }`
            );
        }

        let refreshed : boolean = false;
        for (const cell of cells) {
            // if the cell is generated code, don't run it by default, the original code cell will
            //   run it, unless it is the only cell in array of cells being run, in which case, run it
            if (
                this._useGeneratedCodeCellOptimization &&
                cell.metadata?.type === "generatedCode" &&
                cells.length > 1
            ) {
                return false;
            }

            // if this cell has output, then skip it unless we're forcing analysis
            if (!this.shouldRefreshCell(notebook, cell, forceAnalysisRefresh)) {
                boostLogging.info(
                    `NO-Force-Refresh: Skipping re-analysis ${this.command} of Notebook ${notebook.metadata["sourceFile"]}` +
                        ` on cell ${
                            usingBoostNotebook
                                ? (cell as BoostNotebookCell).id
                                : (
                                      cell as vscode.NotebookCell
                                  ).document.uri.toString()
                        }}`,
                    false
                );
                continue;
            }

            if (usingBoostNotebook) {
                boostLogging.info(
                    `Started ${this.command} of Notebook ${
                        notebook.metadata["sourceFile"]
                    } on cell ${
                        (cell as BoostNotebookCell).id
                    } at ${new Date().toLocaleTimeString()}`,
                    !usingBoostNotebook
                );
            }
            promises.push(
                this.doExecution(notebook, cell, session).then((result) => {
                    if (!result) {
                        successfullyCompleted = false;
                    } else {
                        refreshed = true;
                    }
                    if (usingBoostNotebook) {
                        boostLogging.info(
                            `Finished ${this.command} of Notebook ${
                                notebook.metadata["sourceFile"]
                            } on cell ${
                                (cell as BoostNotebookCell).id
                            } at ${new Date().toLocaleTimeString()}`,
                            !usingBoostNotebook
                        );
                    }
                }) as Promise<boolean>
            );
        }

        function reflect(promise: Promise<boolean>){
            return promise.then(
                v => ({v, status: 'fulfilled'}),
                e => ({e, status: 'rejected'})
            );
        }

        let reflectedPromises = promises.map(reflect);

        await Promise.all(reflectedPromises)
            .then((results) => {
                let successfullyCompleted = true;

                results.forEach((result) => {
                    if (result.status === 'rejected') {
                        successfullyCompleted = false;
                        boostLogging.error(
                            `Error ${this.command} of Notebook ${
                                usingBoostNotebook
                                    ? notebook.fsPath
                                    : notebook.uri.toString()
                            }: ${errorToString((result as { e: any; status: string }).e)}}`,
                            !usingBoostNotebook
                        );
                    }
                });

                if (successfullyCompleted) {
                    boostLogging.info(
                        `Success ${this.command} of Notebook ${
                            usingBoostNotebook
                                ? notebook.fsPath
                                : notebook.uri.toString()
                        }`,
                        false
                    );
                }
            });
        return refreshed;
    }

    get requiresInputData(): boolean {
        return true;
    }

    async doExecution(
        notebook: vscode.NotebookDocument | BoostNotebook,
        cell: vscode.NotebookCell | BoostNotebookCell,
        session: vscode.AuthenticationSession,
        serviceEndpoint: string = this.serviceEndpoint
    ): Promise<boolean> {
        const usingBoostNotebook = notebook instanceof BoostNotebook;

        // if not authorized, retry
        if (!session) {
            session = await this.doAuthorizationExecution();
        }
        //if still not authorized, give up
        if (!session) {
            return false;
        }

        //if cell is undefined or metadata is undefined, seems like this should never happen
        //  since all cells have metadata
        if (!cell || !cell.metadata) {
            return false;
        }

        // now get the current organization
        let organization = await getCurrentOrganization(this.context);
        if (!organization) {
            return false;
        }

        // if no useful text to process, skip it
        const inputData = usingBoostNotebook
            ? (cell as BoostNotebookCell).value
            : (cell as vscode.NotebookCell).document.getText();

        // skip whitespace trim on MultilineString - not worth code complexity trouble for now
        if (this.requiresInputData &&
            typeof inputData === "string" &&
            (inputData as string).trim().length === 0
        ) {
            return true;
        } else if (!cell.metadata.type) {
            const reinitialized = await this.initializeMetaData(notebook, cell);
            if (!reinitialized) {
                boostLogging.warn(
                    `Unable to parse contents of Cell ${
                        cell instanceof BoostNotebookCell
                            ? cell.id
                            : cell.document.uri.toString()
                    }`,
                    false
                );
                return false;
            }
        }

        // we basically run two executions, one for the original code to generate a summary
        // and one for the generated code
        // if the cell is original code, run the summary generation
        if (
            !this.useOriginalCodeCheck ||
            cell.metadata.type === "originalCode"
        ) {
            return await this._doKernelExecutionWithExecutionTracking(
                notebook,
                cell,
                session,
                organization,
                serviceEndpoint
            );
        }
        return true;
    }

    private async _doKernelExecutionWithExecutionTracking(
        notebook: vscode.NotebookDocument | BoostNotebook,
        cell: vscode.NotebookCell | BoostNotebookCell,
        session: vscode.AuthenticationSession,
        organization: string,
        serviceEndpoint: string
    ): Promise<boolean> {
        const usingBoostNotebook = "value" in cell; // look for the value property to see if its a BoostNotebookCell
        const execution = usingBoostNotebook
            ? undefined
            : this._controller.createNotebookCellExecution(
                  cell as vscode.NotebookCell
              );
        let successfullyCompleted = true;

        const cellId = usingBoostNotebook
            ? (cell as BoostNotebookCell).id
            : (cell as vscode.NotebookCell).document.uri.toString();

        const startTime = Date.now();
        if (execution) {
            execution.executionOrder = ++this._executionOrder;
            execution.start(startTime);
        }
        const authPayload = {
            session: session.accessToken,
            organization: organization,
        };
        try {
            const response = await this.doKernelExecution(
                notebook,
                cell,
                execution,
                authPayload,
                serviceEndpoint
            );
            return !(response instanceof Error);
        } catch (err) {
            successfullyCompleted = false;
            await this.updateCellOutput(
                execution,
                cell,
                [],
                usingBoostNotebook
                    ? this._getBoostNotebookCellOutputError(
                          this.localizeError(err as Error)
                      )
                    : vscode.NotebookCellOutputItem.error(
                          this.localizeError(err as Error)
                      ),
                this.outputType
            );
            boostLogging.error(
                `Error executing cell ${cellId}: ${errorToString(err)}`,
                false
            );
            if (!usingBoostNotebook) {
                this.addDiagnosticProblem(
                    notebook,
                    cell as vscode.NotebookCell,
                    err as Error
                );
            }
            return false;
        } finally {
            const duration = Date.now() - startTime;
            const minutes = Math.floor(duration / 60000);
            const seconds = ((duration % 60000) / 1000).toFixed(0);
            if (execution) {
                execution.end(successfullyCompleted, Date.now());
            }

            if (successfullyCompleted) {
                boostLogging.info(
                    `SUCCESS running ${this.command} update of Notebook ${
                        usingBoostNotebook
                            ? (notebook as BoostNotebook).fsPath
                            : notebook.uri.toString()
                    } on cell:${cellId} in ${minutes}m:${seconds.padStart(
                        2,
                        "0"
                    )}s`,
                    false
                );
            } else {
                boostLogging.error(
                    `Error while running ${this.command} update of Notebook ${
                        usingBoostNotebook
                            ? (notebook as BoostNotebook).fsPath
                            : notebook.uri.toString()
                    } on cell:${cellId} in ${minutes}m:${seconds.padStart(
                        2,
                        "0"
                    )}s`,
                    false
                );
            }
        }
    }

    isCellOutputMissingOrError(
        notebook: vscode.NotebookDocument | BoostNotebook,
        cell: vscode.NotebookCell | BoostNotebookCell
    ): boolean {
        if (cell.outputs.length === 0) {
            // if we have no outputs, then we need to run it
            return true;
        }

        // Check if the cell has any error output
        const hasErrorOutput = cell.outputs.some((output: any) => {
            // ignore outputs that aren't our output type
            if (output.metadata?.outputType !== this.outputType) {
                return false;
            }
            for (const item of output.items) {
                return item.mime === errorMimeType;
            }
        });

        // if an error, just run it
        if (hasErrorOutput) {
            return true;
        }
        // Check if the cell has existing analysis (e.g. not missing)
        return !cell.outputs.some((output: any) => {
            // ignore outputs that aren't our output type
            return output.metadata?.outputType === this.outputType;
        });
    }

    async initializeMetaData(
        notebook: vscode.NotebookDocument | BoostNotebook,
        cell: vscode.NotebookCell | BoostNotebookCell
    ): Promise<boolean> {
        if (notebook === undefined) {
            return false;
        }
        const usingBoostNotebook = notebook instanceof BoostNotebook;

        let foundCell = undefined;
        let i = 0;
        for (
            ;
            i <
            (usingBoostNotebook ? notebook.cells.length : notebook.cellCount);
            i++
        ) {
            if (
                usingBoostNotebook
                    ? notebook.cells[i]
                    : notebook.cellAt(i) === cell
            ) {
                foundCell = usingBoostNotebook
                    ? notebook.cells[i]
                    : notebook.cellAt(i);
                break;
            }
        }
        if (!foundCell) {
            boostLogging.debug(
                `Unable to find cell ${
                    cell instanceof BoostNotebookCell
                        ? cell.id
                        : cell.document.uri.toString()
                }` +
                    ` in notebook ${
                        usingBoostNotebook
                            ? notebook.fsPath
                            : notebook.uri.toString()
                    }`
            );
            return false;
        }

        await this.updateCellMetadata(notebook, cell, i, {
            id: cell.metadata?.id ?? i,
            type: cell.metadata?.type ?? "originalCode",
        });

        return true;
    }

    async updateCellMetadata(
        notebook: vscode.NotebookDocument | BoostNotebook,
        cell: vscode.NotebookCell | BoostNotebookCell,
        cellIndex: number,
        updatedMetadata: any
    ) {
        const usingBoostNotebook = "value" in cell; // look for the value property to see if its a BoostNotebookCell

        // if we're using native boost notebook, update metadata and skip more complex VSC Notebook update process
        if (usingBoostNotebook) {
            (cell as BoostNotebookCell).initializeMetadata({
                ...cell.metadata,
                ...updatedMetadata,
            });
            return;
        }

        const doc = (cell as vscode.NotebookCell).document;
        const newCellData = new vscode.NotebookCellData(
            vscode.NotebookCellKind.Code,
            doc.getText(),
            doc.languageId
        );
        newCellData.metadata = {
            ...newCellData.metadata,
            ...updatedMetadata,
        };

        const edit = new vscode.WorkspaceEdit();

        // Use .set to add one or more edits to the notebook
        edit.set(notebook.uri, [
            // Create an edit that replaces this cell with the same cell + set metadata
            vscode.NotebookEdit.updateCellMetadata(
                cellIndex,
                newCellData.metadata as { [key: string]: any }
            ),
        ]);
        // Additional notebook edits...

        await vscode.workspace.applyEdit(edit);

        // Update the cell reference to the new cell from the replacement so the caller can use it
        cell = notebook.cellAt(cellIndex);
        return;
    }

    public deserializeErrorAsProblems(
        notebook: vscode.NotebookDocument | BoostNotebook,
        cell: vscode.NotebookCell | BoostNotebookCell,
        error: Error
    ) {
        const usingBoostNotebook = "value" in cell; // look for the value property to see if its a BoostNotebookCell

        // if no target Cell content, skip
        if (usingBoostNotebook ? !cell.value : !cell.document) {
            return;
        }

        // if no error, skip
        else if (!error) {
            boostLogging.debug(
                `No error to deserialize for cell ${
                    usingBoostNotebook ? cell.id : cell.document.uri.toString()
                }`
            );
            return;
        }

        // otherwise, add/update problems for this Cell
        this.addDiagnosticProblem(notebook, cell, error);
    }

    openExecutionContext(
        usingBoostNotebook: boolean,
        cell: vscode.NotebookCell | BoostNotebookCell
    ): any {
        const execution = usingBoostNotebook
            ? undefined
            : this._controller.createNotebookCellExecution(
                  cell as vscode.NotebookCell
              );

        const startTime = Date.now();
        if (execution) {
            execution.executionOrder = ++this._executionOrder;
            execution.start(startTime);
        }

        return { execution, startTime };
    }

    closeExecutionContext(
        executionContext: any,
        successfullyCompleted: boolean
    ) {
        const duration = Date.now() - executionContext.startTime;
        const minutes = Math.floor(duration / 60000);
        const seconds = ((duration % 60000) / 1000).toFixed(0);
        if (executionContext.execution) {
            executionContext.execution.end(successfullyCompleted, Date.now());
        }
    }

    // allow derived classes to override the error - e.g. change the error message
    localizeError(error: Error): Error {
        error.message = `Boost ${this.outputHeader} failed: ${error.message}`;
        return error;
    }

    _getBoostNotebookCellOutput(
        output: string,
        mimeType: string
    ): SerializedNotebookCellOutput {
        return {
            items: [
                {
                    mime: mimeType,
                    data: output,
                },
            ],
            metadata: {
                outputType: this.outputType,
            },
        };
    }

    _getBoostNotebookCellOutputError(
        error: Error
    ): SerializedNotebookCellOutput {
        return {
            items: [
                {
                    mime: errorMimeType, // for compatibility with VS Code
                    data: JSON.stringify({
                        name: error.name,
                        message: error.message,
                        // stack: error.stack, // skip the stack since we don't need code level details
                    }),
                },
            ],
            metadata: {
                outputType: this.outputType,
            },
        };
    }

    // process a single service request and update the cell output with the results
    async onProcessServiceRequest(
        execution: vscode.NotebookCellExecution | undefined,
        notebook: vscode.NotebookDocument | BoostNotebook,
        cell: vscode.NotebookCell | BoostNotebookCell,
        payload: any,
        serviceEndpoint: string = this.serviceEndpoint
    ): Promise<any> {
        const usingBoostNotebook = "value" in cell;
    
        const response = await this.performServiceRequest(cell, serviceEndpoint, payload);
        let mimetype = { str: markdownMimeType };
        return await this.handleServiceResponse(response, cell, this.outputType, usingBoostNotebook, mimetype, notebook, execution);
    }
    
    protected async performServiceRequest(
        cell: vscode.NotebookCell | BoostNotebookCell,
        serviceEndpoint: string,
        payload: any
    ): Promise<any> {
        try {
            const response = await this.makeBoostServiceRequest(cell, serviceEndpoint, payload);

            if (response instanceof Error) {
                return response;
            } else if (response === undefined) {
                throw new Error("Unexpected empty result from Boost Service");
            } else if (response.data instanceof Error) {
                return response.data as Error;
            }
            return response;
        } catch (err: any) {
            return err;
        }
    }
    
    async handleServiceResponse(
        response: any,
        cell: any,
        outputType : ControllerOutputType,
        usingBoostNotebook: boolean,
        mimetype: any,
        notebook: BoostNotebook | vscode.NotebookDocument,
        execution: vscode.NotebookCellExecution | undefined): Promise<any> {

        let successfullyCompleted = !(response instanceof Error);
    
        let outputItem : any;
    
        if (usingBoostNotebook) {
            outputItem = successfullyCompleted
                ? this._getBoostNotebookCellOutput(
                      this.onKernelOutputItem(response, notebook, cell, mimetype),
                      mimetype.str
                  )
                : this._getBoostNotebookCellOutputError(
                      this.localizeError(response as Error)
                  );
        } else {
            outputItem = successfullyCompleted
                ? vscode.NotebookCellOutputItem.text(
                      this.onKernelOutputItem(response, notebook, cell, mimetype),
                      mimetype.str
                  )
                : vscode.NotebookCellOutputItem.error(
                      this.localizeError(response as Error)
                  );
        }
    
        let details = response?.details;
        if (details) {
            this.onKernelProcessResponseDetails(details, cell, notebook);
        }

        // extend the outputItem.metadata field with the results of a call to onKernelOutputItemDetails
        await this.updateCellOutput(execution, cell, details, outputItem, outputType);
        if (successfullyCompleted) {
            return response;
        }

        const cellId = usingBoostNotebook
            ? cell.id
            : cell.document.uri.toString();
        boostLogging.error(
            `Error in cell ${cellId}: ${response.message}`,
            false
        );
        this.addDiagnosticProblem(notebook, cell, response as Error);

        return response;
    }

    // returns undefined if missing or error content, otherwise returns the output
    getCellOutput(
        cell: vscode.NotebookCell | BoostNotebookCell,
        outputType: string
    ): string | undefined {
        const usingBoostNotebook = cell ? "value" in cell : true; // look for the value property to see if its a BoostNotebookCell


        if (usingBoostNotebook) {
            const boostCell = cell as BoostNotebookCell;
            const cellOutput = boostCell.outputs.find(
                (output) => output.metadata.outputType === outputType
            );
            if (!cellOutput) {
                return undefined;
            }
            
            // if the cell output is error, then just return empty string
            if (cellOutput.items.some((item) => item.mime === errorMimeType)) {
                return undefined;
            }
    
            return cellOutput.items[0].data;
        }

        const vscCell = cell as vscode.NotebookCell;
        const vscOutput = vscCell.outputs.find(
            (output) => output.metadata?.outputType === outputType
        );
        if (vscOutput) {
            
            // if the cell output is error, then just return empty string
            if (vscOutput.items.some((item) => item.mime === errorMimeType)) {
                return undefined;
            }
            const decodedText = new TextDecoder().decode(vscOutput.items[0].data);
            return decodedText;
        }
        return undefined;

    }

    async updateCellOutput(
        execution: vscode.NotebookCellExecution | undefined,
        cell: vscode.NotebookCell | BoostNotebookCell,
        details: [],
        outputItem: vscode.NotebookCellOutputItem | SerializedNotebookCellOutput,
        outputType: ControllerOutputType
    ) {
        const usingBoostNotebook = "value" in cell; // look for the value property to see if its a BoostNotebookCell

        if (usingBoostNotebook || !execution) {
            const boostCell = cell as BoostNotebookCell;
            const boostOutput = outputItem as SerializedNotebookCellOutput;
            //extend boostOutput.medata with details
            boostOutput.metadata = {
                ...boostOutput.metadata,
                details: details,
            };
            boostCell.updateOutputItem(outputType, boostOutput);
            return;
        }

        const outputItems: vscode.NotebookCellOutputItem[] = [
            outputItem as vscode.NotebookCellOutputItem,
        ];
    
        // We will have one NotebookCellOutput per type of output.
        // First scan the existing outputs of the cell and see if we already have an output of this type
        // If so, replace it
        let existingOutputs = cell.outputs;
        let outputIndex = existingOutputs.findIndex(
            (output) => output.metadata?.outputType === outputType
        );
    
        if (outputIndex !== -1) {
            // Update the metadata with details, replacing any existing details
            const updatedMetadata = {
                ...existingOutputs[outputIndex].metadata,
                details: details,
            };
            // Create a new NotebookCellOutput with the updated metadata and existing items
            const updatedOutput = new vscode.NotebookCellOutput(existingOutputs[outputIndex].items, updatedMetadata);
            // Replace the entire output to update both items and metadata
            await execution.replaceOutput(updatedOutput, cell);
        } else {
            // If the output doesn't exist, create a new one with the metadata
            let metadata = {
                outputType: outputType,
                details: details,
            };
            const newOutput = new vscode.NotebookCellOutput(outputItems, metadata);
            // Append the new output
            await execution.appendOutput(newOutput);
        }
    }

    onKernelOutputItem(
        response: any,
        notebook: vscode.NotebookDocument | BoostNotebook,
        cell: vscode.NotebookCell | BoostNotebookCell,
        mimetype: any
    ): string {
        throw new Error("Not implemented");
    }

    onKernelProcessResponseDetails(
        details: any,
        _: vscode.NotebookCell | BoostNotebookCell,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        __: vscode.NotebookDocument | BoostNotebook
    ): any {
        return details === undefined ? [] : details;
    }

    // relatedUri should be the Uri of the original source file
    addDiagnosticProblem(
        notebook: vscode.NotebookDocument | BoostNotebook,
        // document should be the Cell's document that has the problem(s)
        cell: vscode.NotebookCell | BoostNotebookCell,
        // error should be the Error object that was thrown
        error: Error,
        // severity of the problem (default is Warning to avoid blocking builds)
        severity: vscode.DiagnosticSeverity = vscode.DiagnosticSeverity.Warning,
        // cellPosition should be the problematic range of the Cell in the Notebook
        cellRange: vscode.Range = new vscode.Range(0, 0, 0, 0),
        // (optional) relatedUri should be the Uri of the original source file
        relatedUri?: vscode.Uri,
        // (optional) relatedRange should be the problematic area in the source file
        relatedRange?: vscode.Range,
        relatedMessage?: string
    ): void {
        const usingBoostNotebook = "value" in cell; // look for the value property to see if its a BoostNotebookCell

        // if no target Cell content, clear all problems
        if (usingBoostNotebook ? !cell.value : !cell.document) {
            this._problemsCollection.clear();
            return;
        }
        // if no error, clear problems for this Cell
        else if (!error) {
            let cellUri = !usingBoostNotebook
                ? cell.document.uri
                : vscode.Uri.file(`${(notebook as BoostNotebook).fsPath}`);

            if (usingBoostNotebook) {
                cellUri = cellUri.with({
                    scheme: boostUriSchema,
                    path: `${(notebook as BoostNotebook).fsPath}`,
                    fragment: `cell:${(notebook as BoostNotebook).cells.indexOf(
                        cell
                    )}`,
                });
            }
            this._problemsCollection.delete(cellUri);
            return;
        }

        if (!relatedUri) {
            if (
                usingBoostNotebook
                    ? !cell?.metadata?.sourceFile
                    : !cell.notebook.metadata.sourceFile
            ) {
                relatedUri = vscode.Uri.file("file:///unknown");
            } else {
                relatedUri = fullPathFromSourceFile(
                    usingBoostNotebook
                        ? cell?.metadata?.sourceFile
                        : cell.notebook.metadata.sourceFile
                );
            }
        }
        if (!severity) {
            // we set the diagnostic to a warning (not an Error) to avoid blocking builds of customer code
            severity = vscode.DiagnosticSeverity.Warning;
        }
        if (!cellRange) {
            cellRange = new vscode.Range(0, 0, 0, 0);
        }
        // example VSCode cell uri:
        //      vscode-notebook-cell:/path/project-name/.boost/src/filename.boost-notebook#W1sZmlsZQ%3D%3D
        // But we use boost-notebook:/path/project-name/.boost/src/filename.boost-notebook#W1sZmlsZQ%3D%3D
        //      so our custom content provider will work
        let cellUri = !usingBoostNotebook
            ? cell.document.uri
            : vscode.Uri.file(`${(notebook as BoostNotebook).fsPath}`);
        if (usingBoostNotebook) {
            cellUri = cellUri.with({
                scheme: boostUriSchema,
                path: `${(notebook as BoostNotebook).fsPath}`,
                fragment: `cell:${(notebook as BoostNotebook).cells.indexOf(
                    cell
                )}`,
            });
        }
        this._problemsCollection.set(cellUri, [
            {
                code: error.name, // '<CodeBlockContextGoesHere>',
                message: error.message, // '<BoostServiceAnalsysis>',
                range: cellRange,
                severity: severity,
                source: NOTEBOOK_TYPE,

                // provide context for source file
                relatedInformation: relatedUri
                    ? [
                          new vscode.DiagnosticRelatedInformation(
                              new vscode.Location(
                                  relatedUri,
                                  relatedRange ?? new vscode.Position(0, 0)
                              ),
                              relatedMessage ?? "Source File"
                          ),
                      ]
                    : undefined,
            },
        ]);
    }
}
