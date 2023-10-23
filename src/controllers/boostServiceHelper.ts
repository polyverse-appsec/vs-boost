import * as vscode from "vscode";
import * as fs from "fs";
import axios from "axios";
import axiosRetry from "axios-retry";
import PQueue from "p-queue";
import { mapError } from "../utilities/error";

import {
    BoostNotebook,
    BoostNotebookCell,
    NOTEBOOK_GUIDELINES_PRE_EXTENSION,
} from "../data/jupyter_notebook";
import { getBoostFile, BoostFileType } from "../extension/extension";
import { BoostConfiguration } from "../extension/boostConfiguration";
import { boostLogging } from "../utilities/boostLogging";
import { fetchGithubSession, getCurrentOrganization } from "../utilities/authorization";
import { BoostAuthenticationException } from "../controllers/customerPortal";
import { IAnalysisContextData } from "../data/IAnalysisContextData";
import { ControllerOutputType } from "./controllerOutputTypes";

// we can get timeouts and other errors from both openai and lambda. This is a generic handler for those
// conditions to attempt a retry.
axiosRetry(axios, {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay,
});

const queue = new PQueue({ concurrency: 1 });

export class BoostServiceHelper {
    private dynamicInputKey: string; // name of the input parameter
    command: string;
    _outputType: ControllerOutputType;

    hostExtension: any;

    onServiceError: any;

    constructor(
        command: string,
        outputType: ControllerOutputType,
        hostExtension: any,
        dynamicInputKey: string = "",
        onServiceError: any = undefined
    ) {
        this.dynamicInputKey = dynamicInputKey;
        this.command = command;
        this._outputType = outputType;
        this.hostExtension = hostExtension;
        this.onServiceError = onServiceError;
    }

    get serviceEndpoint(): string {
        throw new Error("serviceEndpoint not implemented");
    }

    get outputType(): ControllerOutputType {
        return this._outputType;
    }

    async doKernelExecution(
        notebook: vscode.NotebookDocument | BoostNotebook | undefined,
        cell: vscode.NotebookCell | BoostNotebookCell | undefined,
        execution: vscode.NotebookCellExecution | undefined,
        extraPayload: any,
        serviceEndpoint: string = this.serviceEndpoint
    ): Promise<any> {
        const usingBoostNotebook = cell ? "value" in cell : true; // look for the value property to see if its a BoostNotebookCell

        // get the code from the cell
        const input = usingBoostNotebook
            ? cell
                ? (cell as BoostNotebookCell).value
                : undefined
            : (cell as vscode.NotebookCell).document.getText();

        let payload = {
            ...extraPayload,
        };
        if (input) {
            payload = {
                ...payload,
                [this.dynamicInputKey]: input,
            };
        }
        if (notebook) {
            payload = {
                ...payload,
                contextMetadata: JSON.stringify(notebook.metadata),
            };
        }
        if (cell) {
            payload = {
                ...payload,
                inputMetadata: JSON.stringify(cell.metadata),
            };
        }
        // insert auth token if needed
        if (!payload.session) {
            const session = await fetchGithubSession();
            payload = {
                ...payload,
                session: session.accessToken,
            };
        }
        // insert auth token if needed
        if (!payload.organization) {
            payload = {
                ...payload,
                organization: await getCurrentOrganization(),
            };
        }

        // inject guidelines into the payload to guide analysis with user input
        const guidelines = this.getGuidelines();
        // Add guidelines to the payload only if it's not undefined or an empty array
        if (guidelines && guidelines.length > 0) {
            // we mark it as the system role since it may be used as hints
            payload.guidelines = ["system", guidelines];
        }

        // collect background context and inject into the payload for analysis context
        const analysisContext : IAnalysisContextData[] = this.hostExtension.getBackgroundContext(this.command);
        if (analysisContext && analysisContext.length > 0) {
            payload.context = analysisContext;
        }

        // read any cell-specific temperature or top_p settings
        if (cell?.metadata?.analysisRankedProbability) {
            payload = {
                ...payload,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                top_p: cell.metadata.analysisRankedProbability,
            };
        } else if (cell?.metadata?.temperature) {
            payload = { ...payload, temperature: cell.metadata.temperature };
        } else if (
            BoostConfiguration.analysisRankedProbabilityByKernel(this.command)
        ) {
            payload = {
                ...payload,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                top_p: BoostConfiguration.analysisRankedProbabilityByKernel(
                    this.command
                ),
            };
        } else if (BoostConfiguration.analysisRankedProbability) {
            payload = {
                ...payload,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                top_p: BoostConfiguration.analysisRankedProbability,
            };
        } else if (
            BoostConfiguration.analysisTemperatureByKernel(this.command)
        ) {
            payload = {
                ...payload,
                temperature: BoostConfiguration.analysisTemperatureByKernel(
                    this.command
                ),
            };
        } else if (BoostConfiguration.analysisTemperature) {
            payload = {
                ...payload,
                temperature: BoostConfiguration.analysisTemperature,
            };
        } else {
            payload = payload;
        }

        // model pass through
        if (cell?.metadata?.model) {
            payload = { ...payload, model: cell.metadata.model };
        } else if (BoostConfiguration.analysisModelByKernel(this.command)) {
            payload = {
                ...payload,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                model: BoostConfiguration.analysisModelByKernel(this.command),
            };
        } else if (BoostConfiguration.analysisModel) {
            payload = {
                ...payload,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                model: BoostConfiguration.analysisModel,
            };
        }

        return await this.onProcessServiceRequest(
            execution,
            notebook,
            cell,
            payload,
            serviceEndpoint
        );
    }

    async onProcessServiceRequest(
        _: vscode.NotebookCellExecution | undefined,
        __: vscode.NotebookDocument | BoostNotebook | undefined,
        cell: vscode.NotebookCell | BoostNotebookCell | undefined,
        payload: any,
        serviceEndpoint: string = this.serviceEndpoint
    ): Promise<any> {
        let successfullyCompleted = true;

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
        if (successfullyCompleted) {
            return response;
        } else {
            throw serviceError;
        }
    }

    getGuidelines(): string[] {
        const guidelines: string[] = [];
        const projectGuidelinesFile = getBoostFile(
            undefined,
            { format: BoostFileType.guidelines,
              showUI: false }
        );
        if (
            projectGuidelinesFile &&
            fs.existsSync(projectGuidelinesFile.fsPath)
        ) {
            const projectGuidelines = new BoostNotebook();
            projectGuidelines.load(projectGuidelinesFile.fsPath);
            projectGuidelines.cells.forEach((cell) => {
                if (this.hostExtension.sampleGuidelineRegEx.test(cell.value)) {
                    // ignore sample text
                    return;
                }
                guidelines.push(cell.value);
            });
        }

        // this kernel guideline file
        const kernelGuidelinesFile = projectGuidelinesFile.fsPath.replace(
            NOTEBOOK_GUIDELINES_PRE_EXTENSION,
            `.${this.hostExtension.getUserAnalysisType(
                this.command
            )}${NOTEBOOK_GUIDELINES_PRE_EXTENSION}`
        );
        if (fs.existsSync(kernelGuidelinesFile)) {
            const projectGuidelines = new BoostNotebook();
            projectGuidelines.load(kernelGuidelinesFile);
            projectGuidelines.cells.forEach((cell) => {
                if (this.hostExtension.sampleGuidelineRegEx.test(cell.value)) {
                    // ignore sample text
                    return;
                }
                guidelines.push(cell.value);
            });
        }

        return guidelines;
    }

    async makeBoostServiceRequest(
        cell: vscode.NotebookCell | BoostNotebookCell | undefined,
        serviceEndpoint: string,
        payload: any
    ): Promise<any> {
        try {
            if (
                BoostConfiguration.serviceFaultInjection > 0 &&
                Math.floor(Math.random() * 100) <
                    BoostConfiguration.serviceFaultInjection
            ) {
                const cellId = cell
                    ? cell instanceof BoostNotebookCell
                        ? cell.id
                        : cell.document.uri.toString()
                    : "undefined";
                boostLogging.debug(
                    `Injecting fault into service request for cell ${cellId} to ${serviceEndpoint}`
                );
                await axios.get(
                    "https://serviceFaultInjection/synthetic/error/"
                );
            }
            let result: any = await this.onBoostServiceRequest(
                cell,
                serviceEndpoint,
                payload
            );
            let nonThrownError = undefined;
            if (result.account && !result.account['enabled']) {
                // the account is in error - we'll assume that's the cause
                nonThrownError = new BoostAuthenticationException(
                    `Unable to use the Boost Service. Your account is ${result.account['status']} and is not currently enabled.` +
                    ` Please use the Account portal to update your account.`);
            } else if (result.error) {
                // if we have an error, throw it - this is generally happens with the local service shim
                nonThrownError = new Error(
                    `Boost Service failed with a network error: ${result.error}`
                );
            }

            // if we captured an error packaged in the result, then inform clients and return it (without throwing)
            if (nonThrownError) {
                result = nonThrownError;
                if (this.onServiceError) {
                    const asyncResult = this.onServiceError(nonThrownError);

                    // if the handler is asynchronous, wait for it to complete before continuing
                    if (asyncResult instanceof Promise) {
                        await asyncResult;
                    }
                }
            }

            return result;
        } catch (err: any) {
            if (this.onServiceError) {
                const asyncResult = this.onServiceError(err);

                // if the handler is asynchronous, wait for it to complete before continuing
                if (asyncResult instanceof Promise) {
                    await asyncResult;
                }
            }
            return mapError(err);
        }
    }

    async onBoostServiceRequest(
        _: vscode.NotebookCell | BoostNotebookCell | undefined,
        serviceEndpoint: string,
        payload: any
    ): Promise<string> {
        const headers = {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            "User-Agent": `Boost-VSCE/${BoostConfiguration.version}`,
        };

        // Add the request to the queue
        return queue.add(() =>
            axios
                .post(serviceEndpoint, payload, { headers })
                .then((response) => {
                    return response.data;
                })
                .catch((error) => {
                    throw error;
                })
        );
    }
}
