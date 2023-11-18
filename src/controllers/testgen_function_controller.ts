import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import {
    DiagnosticCollection,
    ExtensionContext,
    NotebookCell,
    NotebookDocument,
    NotebookCellExecution,
    Uri,
    workspace,
} from 'vscode';
import { BoostConfiguration } from '../extension/boostConfiguration';
import { FunctionKernelControllerBase } from './function_base_controller';
import { ControllerOutputType } from './controllerOutputTypes';
import { DisplayGroupFriendlyName } from '../data/userAnalysisType';
import { BoostNotebookCell, BoostNotebook } from '../data/jupyter_notebook';
import { getBoostFile, BoostFileType } from '../extension/extension';
import { errorToString } from '../utilities/error';
import { fullPathFromSourceFile } from '../utilities/files';
import { boostLogging } from '../utilities/boostLogging';
import { testgenKernelName, testgenOutputHeader } from './testgen_controller';
import { plaintext } from '../utilities/languageMappings';

export const testGenFunctionKernelName = testgenKernelName + '_function';

export class BoostTestGenerateFunctionKernel extends FunctionKernelControllerBase {

	constructor(context: ExtensionContext, onServiceResponseHandler: any, otherThis: any, collection: DiagnosticCollection) {
        super(
            collection,
            testGenFunctionKernelName,
            'Generate New Test Cases from Existing Code',
            'Generate new test cases source code files with existing new or language and test framework',
            ControllerOutputType.testgenFunction,
            DisplayGroupFriendlyName.generate,
            testgenOutputHeader,
            context,
            otherThis,
            onServiceResponseHandler,
            );
	}

    public get serviceEndpoint(): string {
        switch (BoostConfiguration.cloudServiceStage)
        {
            case "local":
                return 'http://127.0.0.1:8000/generate_tests';
            case 'dev':
                return 'https://aj4pckbs5x4afro2wjzxrcvn7q0spbck.lambda-url.us-west-2.on.aws/';
            case "test":
                return '';
            case 'staging':
            case 'prod':
            default:
                return 'https://2lhjcbyazsgqdzl4kysa37z5oi0vufdk.lambda-url.us-west-2.on.aws/';
        }
    }

	dispose(): void {
		super.dispose();
	}

    shouldRefreshCell(
        notebook: vscode.NotebookDocument | BoostNotebook,
        cell: vscode.NotebookCell | BoostNotebookCell | undefined,
        forceAnalysisRefresh: boolean): boolean {

            // never refresh unless its empty
        return super.shouldRefreshCell(notebook, cell, forceAnalysisRefresh);
    }

    async doKernelExecution(
        notebook: vscode.NotebookDocument | BoostNotebook | undefined,
        cell: vscode.NotebookCell | BoostNotebookCell | undefined,
        execution: vscode.NotebookCellExecution | undefined,
        extraPayload: any,
        serviceEndpoint: string = this.serviceEndpoint
    ): Promise<any> {
        if (!cell) {
            return super.doKernelExecution(notebook, cell, execution, extraPayload, serviceEndpoint);
        }

        const usingBoostNotebook = "value" in cell; // if the cell has a value property, then it's a BoostNotebookCell

        // get the outputLanguage from the language set on the cell, NOT the language set on the notebook
		let outputLanguage = usingBoostNotebook?cell.languageId:cell.document.languageId ??
            BoostConfiguration.defaultOutputLanguage;

        if (outputLanguage === plaintext) {
            outputLanguage = BoostConfiguration.defaultOutputLanguage;
        }

        // only set the framework if it's already set
		let framework = usingBoostNotebook?(notebook as BoostNotebook).metadata.testFramework:
            vscode.window.activeNotebookEditor?.notebook.metadata.testFramework;

        //  dynamically add payload properties to send to Boost service
        extraPayload.language = outputLanguage;

        // otherwise don't send it so we can use the best one for the language
        if (framework) {
            extraPayload.framework = framework;
        }

        return super.doKernelExecution(notebook, cell, execution, extraPayload, serviceEndpoint);
    }

    onKernelProcessResponseDetails(details: any, cell: NotebookCell | BoostNotebookCell, notebook: NotebookDocument | BoostNotebook) {
        const usingBoostNotebook = notebook instanceof BoostNotebook;

        if (details === undefined) {
            throw new Error("Unable to generate test cases. Please retry operation and if problem persists, contact Polyverse Support.");
        }

        const generatedTestCases = ('generatedTestCases' in details)?details['generatedTestCases']:undefined;

        // we're going to write the cell's test case files out to a sub-folder based on the cell
        if (generatedTestCases && generatedTestCases.length > 0) {
            let generatedTestPath;
            if (path.isAbsolute(details['generatedTestsWorkingPath'])) {
                generatedTestPath = details['generatedTestsWorkingPath'];
            } else {
                generatedTestPath = Uri.joinPath(workspace.workspaceFolders![0].uri, details['generatedTestsWorkingPath']).fsPath;
            }
            try {
                // create the source working folder first
                fs.mkdirSync(generatedTestPath, { recursive: true });
            } catch (error : any) {
                throw new Error(`Unable to create test working folder ${generatedTestPath}: ${errorToString(error)}`);
            }

            for (let i : number = 0; i < generatedTestCases.length; i++) {
                const nonNormalizedCellTestCasePath = path.join(generatedTestPath, i.toString());
                const cellTestCasePath = path.normalize(`${nonNormalizedCellTestCasePath}.${details['testFileExtension']}`);
                const relativeTestCasePath = workspace.asRelativePath(cellTestCasePath);
                try {
                    // then write the cell conversion into it
                    fs.writeFileSync(cellTestCasePath, generatedTestCases[i]['sourceCode']);
                } catch (error : any) {
                    throw new Error(`Unable to write generated test case to ${relativeTestCasePath}: ${errorToString(error)}`);
                }
            }
        }

        if (!generatedTestCases) {
            boostLogging.warn(`Unable to generate test cases for ${usingBoostNotebook?(cell as BoostNotebookCell).id:(cell as NotebookCell).document.uri.toString()} . Please see issues section or retry.`, false);
        }

        return super.onKernelProcessResponseDetails(details, cell, notebook);
    }

        /*
            "name": "generate_tests",
            "description": "The API that will generate tests for a block of code",
            "parameters": {
                "type": "object",
                "properties": {
                    "testFramework": {
                        "type": "string",
                        "description": "The test framework to use for generating tests"
                    },
                    "testProgrammingLanguage": {
                        "type": "string",
                        "description": "The programming language to use for generating tests"
                    },
                    "recommendedTestLanguageFileExtension": {
                        "type": "string",
                        "description": "The recommended file extension for the test file"
                    },
                    "generatedTestCases": {
                        "type": "array",
                        "description": "the list of tests generated",
                        "items": {
                            "type": "object",
                            "description": "generated test case",
                            "properties": {
                                "sourceCode": {
                                    "type": "string",
                                    "description": ""
                                },
                                "testType": {
                                    "type": "string",
                                    "description": ""
                                },
                                "testFileName": {
                                    "type": "string",
                                    "description": "",
                                }
                            }
                        }
                    },
                }
            }
        }
        */
    generateMarkdownOutput(
        notebook : NotebookDocument | BoostNotebook,
        cell : NotebookCell | BoostNotebookCell,
        details: any) : string {

        const usingBoostNotebook = notebook instanceof BoostNotebook;

        let rawSourceExtension = ('recommendedTestLanguageFileExtension' in details)?details['recommendedTestLanguageFileExtension']:details['testProgrammingLanguage'];
        if (rawSourceExtension.startsWith('.')) {
            // remove leading dot
            rawSourceExtension = rawSourceExtension.substr(1);
        }
        details['testFileExtension'] = rawSourceExtension;

        const generatedTestCases = ('generatedTestCases' in details)?details['generatedTestCases']:undefined;
        const testLanguage = ('testProgrammingLanguage' in details)?details['testProgrammingLanguage']:undefined;
        const testFramework = ('testFramework' in details)?details['testFramework']:undefined;
        if (generatedTestCases && generatedTestCases.length > 0) {

            const originalSource = (notebook.metadata && 'sourceFile' in notebook.metadata)?
                fullPathFromSourceFile(notebook.metadata['sourceFile'] as string):
                (usingBoostNotebook?Uri.parse((notebook as BoostNotebook).fsPath):notebook.uri);

            const generatedTestFile = getBoostFile(originalSource, {
                format: BoostFileType.test,
                subFolder: testLanguage,
            });
            const cellIndex = usingBoostNotebook?(notebook as BoostNotebook).cells.indexOf(cell as BoostNotebookCell):(notebook as NotebookDocument).getCells().indexOf(cell as NotebookCell);
            if (cellIndex < 0) {
                throw new Error(`Unable to find cell in notebook ${notebook.uri.toString()}`);
            }

            const nonNormalizedCellPath = path.join(generatedTestFile.fsPath, cellIndex.toString());
            const cellPath = path.normalize(nonNormalizedCellPath);

            details['generatedTestsWorkingPath'] = workspace.asRelativePath(cellPath);
        }

        let markdownOutput =
            `#### ${generatedTestCases?"Successful":"Incomplete"} Test Case Generation with ${testLanguage}\n`;
        if (testFramework) {
            markdownOutput += `##### Test Framework: ${testFramework}\n`;
        }
        if (generatedTestCases && generatedTestCases.length > 0) {
            for (let i : number = 0; i < generatedTestCases.length; i++) {
                const testType = generatedTestCases[i]['testType'];
                markdownOutput += `##### Test Case ${i}: Type=${testType?testType:"General"} ${generatedTestCases[i]['testFileName']}\n`;
            }
            // markdown relative links don't work in Notebook in VSC - only filename is used
            //     and we don't want to use absolute path because it won't work on other machines
//            markdownOutput += `\n[Link to Generated Test Cases](${relativeLinkTestPath})\n`;
        }

        return markdownOutput;
    }
}
