import * as vscode from "vscode";
import { BoostConfiguration } from "./boostConfiguration";
import { BoostServiceHelper } from "./boostServiceHelper";
import { boostLogging } from "./boostLogging";
import { fetchGithubSession, getCurrentOrganization } from "./authorization";
import {
    BoostNotebookCell,
    BoostNotebook,
    SerializedNotebookCellOutput,
    NOTEBOOK_TYPE,
} from "./jupyter_notebook";
import {
    fullPathFromSourceFile,
    getKernelName,
} from "./extension";

export const errorMimeType = "application/vnd.code.notebook.error";

export class KernelControllerBase extends BoostServiceHelper {
    _problemsCollection: vscode.DiagnosticCollection;
    id: string;
    kernelLabel: string;
    description: string;
    outputHeader: string;
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
        outputType: string,
        outputHeader: string,
        useGeneratedCodeCellOptimization: boolean,
        useOriginalCodeCheck: boolean,
        context: vscode.ExtensionContext,
        otherThis: any,
        onServiceErrorHandler: any,
        dynamicInputKey: string = "code"
    ) {
        super(kernelId, outputType, otherThis, dynamicInputKey,
            (err : any) =>{
                    if (onServiceErrorHandler !== undefined) {
                        onServiceErrorHandler(
                            this.context,
                            err as Error,
                            this.hostExtension
                        );
                    }
                });

        this._problemsCollection = problemsCollection;
        this.id = getKernelName(kernelId);
        this.kernelLabel = kernelLabel;
        this.description = description;
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
    ): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            try {
                // make sure we're authorized
                // if not, run the authorization cell
                const session = await this.doAuthorizationExecution();

                //if not authorized, give up
                if (!session) {
                    return;
                }

                await this.executeAll(
                    cells,
                    notebook as vscode.NotebookDocument,
                    session,
                    forceAnalysisRefresh
                );
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    async executeAll(
        cells: vscode.NotebookCell[] | BoostNotebookCell[],
        notebook: vscode.NotebookDocument | BoostNotebook,
        session: vscode.AuthenticationSession,
        forceAnalysisRefresh: boolean = false
    ): Promise<void> {
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
            return;
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

        for (const cell of cells) {
            //if the cell is generated code, don't run it by default, the original code cell will
            // run it, unless it is the only cell in array of cells being run, in which case, run it
            if (
                this._useGeneratedCodeCellOptimization &&
                cell.metadata?.type === "generatedCode" &&
                cells.length > 1
            ) {
                return;
            }

            // if this cell has output, then skip it unless we're forcing analysis
            if (
                !forceAnalysisRefresh &&
                !this.isCellOutputMissingOrError(cell)
            ) {
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
        await Promise.all(promises)
            .then((results) => {
                results.forEach((result) => {
                    successfullyCompleted &&= result ?? true;
                });
                if (!successfullyCompleted) {
                    boostLogging.error(
                        `Error ${this.command} of Notebook ${
                            usingBoostNotebook
                                ? notebook.fsPath
                                : notebook.uri.toString()
                        }`,
                        !usingBoostNotebook
                    );
                } else {
                    boostLogging.info(
                        `Success ${this.command} of Notebook ${
                            usingBoostNotebook
                                ? notebook.fsPath
                                : notebook.uri.toString()
                        }`,
                        false
                    );
                }
                return successfullyCompleted;
            })
            .catch((error) => {
                successfullyCompleted = false;
                boostLogging.error(
                    `Error ${this.command} of Notebook ${
                        usingBoostNotebook
                            ? notebook.fsPath
                            : notebook.uri.toString()
                    }: ${error.toString()}}`,
                    !usingBoostNotebook
                );
            });
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
        if (
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
                    }`, false
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
            this.updateCellOutput(
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
                err
            );
            boostLogging.error(
                `Error executing cell ${cellId}: ${(err as Error).message}`,
                false
            );
            if (!usingBoostNotebook) {
                this.addDiagnosticProblem(
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

        // if we're using native boost notebook, update metadata and skip more complex VSC Notebook update process
        if (usingBoostNotebook) {
            (cell as BoostNotebookCell).initializeMetadata({
                ...cell.metadata,
                id: cell.metadata?.id ?? i,
                type: cell.metadata?.type ?? "originalCode",
            });
            return true;
        }

        const doc = (cell as vscode.NotebookCell).document;
        const newCellData = new vscode.NotebookCellData(
            vscode.NotebookCellKind.Code,
            doc.getText(),
            doc.languageId
        );
        newCellData.metadata = {
            ...newCellData.metadata,
            id: newCellData.metadata?.id ?? i,
            type: newCellData.metadata?.type ?? "originalCode",
        };

        const edit = new vscode.WorkspaceEdit();

        // Use .set to add one or more edits to the notebook
        edit.set(notebook.uri, [
            // Create an edit that replaces this cell with the same cell + set metadata
            vscode.NotebookEdit.updateCellMetadata(i, newCellData.metadata),
        ]);
        // Additional notebook edits...

        await vscode.workspace.applyEdit(edit);

        // Update the cell reference to the new cell from the replacement so the caller can use it
        cell = notebook.cellAt(i);
        return true;
    }

    public deserializeErrorAsProblems(cell: vscode.NotebookCell, error: Error) {
        // if no target Cell, skip
        if (!cell.document) {
            return;
        }
        // if no error, skip
        else if (!error) {
            boostLogging.debug(
                `No error to deserialize for cell ${cell.document.uri.toString()}`
            );
            return;
        }

        // otherwise, add/update problems for this Cell
        this.addDiagnosticProblem(cell, error);
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
                    mime: "application/vnd.code.notebook.error", // for compatibility with VS Code
                    data: error.toString(),
                },
            ],
            metadata: {
                outputType: this.outputType,
            },
        };
    }

    async onProcessServiceRequest(
        execution: vscode.NotebookCellExecution | undefined,
        notebook: vscode.NotebookDocument | BoostNotebook,
        cell: vscode.NotebookCell | BoostNotebookCell,
        payload: any,
        serviceEndpoint: string = this.serviceEndpoint
    ): Promise<any> {
        let successfullyCompleted = true;
        const usingBoostNotebook = "value" in cell; // look for the value property to see if its a BoostNotebookCell

        // using axios, make a web POST call to Boost Service with the code as in a json object code=code
        let response;
        let serviceError: Error = new Error();
        try {
            response = await this.makeBoostServiceRequest(
                cell,
                serviceEndpoint,
                payload
            );
        } catch (err: any) {
            successfullyCompleted = false;
            serviceError = err;
        }
        if (successfullyCompleted) {
            if (response instanceof Error) {
                successfullyCompleted = false;
                serviceError = response as Error;
            } else if (response === undefined) {
                throw new Error("Unexpected empty result from Boost Service");
            } else if (response.data instanceof Error) {
                successfullyCompleted = false;
                serviceError = response.data as Error;
            }
        }

        // we wrap mimeTypes in an object so that we can pass it by reference and change it
        let mimetype = { str: "text/markdown" };

        let outputItem;
        if (usingBoostNotebook) {
            outputItem = successfullyCompleted
                ? this._getBoostNotebookCellOutput(
                      this.onKernelOutputItem(response, cell, mimetype),
                      mimetype.str
                  )
                : this._getBoostNotebookCellOutputError(
                      this.localizeError(serviceError as Error)
                  );
        } else {
            outputItem = successfullyCompleted
                ? vscode.NotebookCellOutputItem.text(
                      this.onKernelOutputItem(response, cell, mimetype),
                      mimetype.str
                  )
                : vscode.NotebookCellOutputItem.error(
                      this.localizeError(serviceError as Error)
                  );
        }

        let details = this.onKernelProcessResponseDetails(
            response,
            cell,
            notebook,
            mimetype
        );

        // extend the outputItem.metadata field with the results of a call to onKernelOutputItemDetails
        this.updateCellOutput(
            execution,
            cell,
            details,
            outputItem,
            serviceError
        );
        if (!successfullyCompleted) {
            const cellId = usingBoostNotebook
                ? cell.id
                : cell.document.uri.toString();
            boostLogging.error(
                `Error in cell ${cellId}: ${serviceError.message}`,
                false
            );
            if (!usingBoostNotebook) {
                this.addDiagnosticProblem(cell, serviceError as Error);
            }
        }

        return response;
    }

    updateCellOutput(
        execution: vscode.NotebookCellExecution | undefined,
        cell: vscode.NotebookCell | BoostNotebookCell,
        details: [],
        outputItem:
            | vscode.NotebookCellOutputItem
            | SerializedNotebookCellOutput,
        err: unknown
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
            boostCell.updateOutputItem(this.outputType, boostOutput);
            return;
        }

        const outputItems: vscode.NotebookCellOutputItem[] = [
            outputItem as vscode.NotebookCellOutputItem,
        ];

        // we will have one NotebookCellOutput per type of output.
        // first scan the existing outputs of the cell and see if we already have an output of this type
        // if so, replace it
        let existingOutputs = cell.outputs;
        let existingOutput = existingOutputs.find(
            (output) => output.metadata?.outputType === this.outputType
        );
        if (existingOutput) {
            execution.replaceOutputItems(outputItems, existingOutput);
            //udpate existingOutput.metadata with details, replacing any existing details
            if (existingOutput.metadata?.details) {
                delete existingOutput.metadata.details;
            }
            existingOutput.metadata = {
                ...existingOutput.metadata,
                details: details,
            };
        } else {
            // create a new NotebookCellOutput with the outputItems array
            let metadata = {
                outputType: this.outputType,
                details: details,
            };
            const output = new vscode.NotebookCellOutput(outputItems, metadata);

            execution.appendOutput(output);
        }
    }

    onKernelOutputItem(
        response: any,
        cell: vscode.NotebookCell | BoostNotebookCell,
        mimetype: any
    ): string {
        throw new Error("Not implemented");
    }

    onKernelProcessResponseDetails(
        response: any,
        cell: vscode.NotebookCell | BoostNotebookCell,
        notebook: vscode.NotebookDocument | BoostNotebook,
        mimetype: any
    ): any {
        return [];
    }

    // relatedUri should be the Uri of the original source file
    addDiagnosticProblem(
        // document should be the Cell's document that has the problem(s)
        cell: vscode.NotebookCell,
        // error should be the Error object that was thrown
        error: Error,
        // severity of the problem
        severity: vscode.DiagnosticSeverity = vscode.DiagnosticSeverity.Error,
        // cellPosition should be the problematic range of the Cell in the Notebook
        cellRange: vscode.Range = new vscode.Range(0, 0, 0, 0),
        // (optional) relatedUri should be the Uri of the original source file
        relatedUri?: vscode.Uri,
        // (optional) relatedRange should be the problematic area in the source file
        relatedRange?: vscode.Range,
        relatedMessage?: string
    ): void {
        // if no target Cell, clear all problems
        if (!cell.document) {
            this._problemsCollection.clear();
            return;
        }
        // if no error, clear problems for this Cell
        else if (!error) {
            this._problemsCollection.delete(cell.document.uri);
            return;
        }

        if (!relatedUri && BoostConfiguration.useSourceFileForProblems) {
            if (!cell.notebook.metadata.sourceFile) {
                relatedUri = vscode.Uri.parse("file:///unknown", true);
            } else {
                relatedUri = fullPathFromSourceFile(
                    cell.notebook.metadata.sourceFile
                );
            }
        }
        if (!severity) {
            severity = vscode.DiagnosticSeverity.Error;
        }
        if (!cellRange) {
            cellRange = new vscode.Range(0, 0, 0, 0);
        }
        this._problemsCollection.set(cell.document.uri, [
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
