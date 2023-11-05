import * as vscode from 'vscode';
import { retryCommand } from '../extension/vscodeUtilities';    

type SymbolInformation = {
    name: string;
    kind: string;
    detail: string;
    file: string;
    symbol: vscode.DocumentSymbol;
    items: vscode.CallHierarchyItem[];
    incomingCalls: vscode.CallHierarchyIncomingCall[];
    outgoingCalls: vscode.CallHierarchyOutgoingCall[];
    implementations: vscode.Location[]; // Replace 'any[]' with the actual type if known
};

import * as fs from 'fs';
import * as path from 'path';
import { all } from 'micromatch';

export async function getSymbols()
{
    const files = await vscode.workspace.findFiles('**/*.ts', '{**/node_modules/**,**/*test*/**}');

    let allSymbols: SymbolInformation[] = [];

    for await (const file of files) {
        // retry several times if the LSP server is not ready
        let symbols = await retryCommand<vscode.DocumentSymbol[]>(5, 600, 'vscode.executeDocumentSymbolProvider', file);
        if (symbols === undefined) {
            vscode.window.showErrorMessage(`Document symbol information not available for '${file.fsPath}'`);
            continue;
        }

        while (symbols.length > 0) {

            for await (const symbol of symbols) {
                if (![vscode.SymbolKind.Function, vscode.SymbolKind.Method, vscode.SymbolKind.Constructor, vscode.SymbolKind.Interface].includes(symbol.kind)) {
                    continue;
                }

                let s: SymbolInformation = {
                    name: symbol.name,
                    kind: getSymbolKindName(symbol.kind),
                    detail: symbol.detail,
                    file: file.fsPath,
                    symbol: symbol,
                    items: [],
                    incomingCalls: [],
                    outgoingCalls: [],
                    implementations: []
                };

                let items: vscode.CallHierarchyItem[];
                try {
                    items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>('vscode.prepareCallHierarchy', file, symbol.selectionRange.start);
                    s.items = items;
                } catch (e) {
                    vscode.window.showErrorMessage(`${e}\n${file}\n${symbol.name}`);
                    continue;
                }

                for await (const item of items) {
                    await vscode.commands.executeCommand<vscode.CallHierarchyIncomingCall[]>('vscode.provideIncomingCalls', item)
                    .then(calls => {
                        s.incomingCalls = calls;
                    })
                    .then(undefined, err => {
                        console.error(err);
                    });
                }

                for await (const item of items) {
                    await vscode.commands.executeCommand<vscode.CallHierarchyOutgoingCall[]>('vscode.provideOutgoingCalls', item)
                    .then(calls => {
                        s.outgoingCalls = calls;
                    })
                    .then(undefined, err => {
                        console.error(err);
                    });
                }

                if (symbol.kind === vscode.SymbolKind.Interface) {
                    await vscode.commands.executeCommand<vscode.Location[] | vscode.LocationLink[]>('vscode.executeImplementationProvider', file, symbol.selectionRange.start)
                    .then(result => {
                        if (result.length <= 0) {
                        return;
                        }

                        let locations: vscode.Location[];
                        if (!(result[0] instanceof vscode.Location)) {
                        locations = result.map(l => {
                            let link = l as vscode.LocationLink;
                            return new vscode.Location(link.targetUri, link.targetSelectionRange ?? link.targetRange);
                        });
                        } else {
                        locations = result as vscode.Location[];
                        }
                        s.implementations = locations;
                    })
                    .then(undefined, err => {
                        console.log(err);
                    });
                }
                allSymbols.push(s);
            }
            symbols = symbols.flatMap(symbol => symbol.children);
        }
        console.log("finished processing file " + file.fsPath);
    }

    console.log("finished");

    // Define the path where you want to save the JSON file
    // For example, saving to the workspace's root
    const workspaceFolders = vscode.workspace.workspaceFolders;
    console.log("workspaceFolders");
    console.log(workspaceFolders);
    
    if (workspaceFolders) {
        const workspaceRootPath = workspaceFolders[0].uri.fsPath; // Take the first workspace folder
        const jsonFilePath = path.join(workspaceRootPath, 'symbols.json');

        console.log("jsonFilePath", jsonFilePath);
        // Call the function to write the file
        writeSymbolsToFile(allSymbols, jsonFilePath);
    } else {
        vscode.window.showErrorMessage('No workspace folder found.');
    }
}


function getSymbolKindName(kind: vscode.SymbolKind): string {
    switch (kind) {
        case vscode.SymbolKind.File: return 'File';
        case vscode.SymbolKind.Module: return 'Module';
        case vscode.SymbolKind.Namespace: return 'Namespace';
        case vscode.SymbolKind.Package: return 'Package';
        case vscode.SymbolKind.Class: return 'Class';
        case vscode.SymbolKind.Method: return 'Method';
        case vscode.SymbolKind.Property: return 'Property';
        case vscode.SymbolKind.Field: return 'Field';
        case vscode.SymbolKind.Constructor: return 'Constructor';
        case vscode.SymbolKind.Enum: return 'Enum';
        case vscode.SymbolKind.Interface: return 'Interface';
        case vscode.SymbolKind.Function: return 'Function';
        case vscode.SymbolKind.Variable: return 'Variable';
        case vscode.SymbolKind.Constant: return 'Constant';
        case vscode.SymbolKind.String: return 'String';
        case vscode.SymbolKind.Number: return 'Number';
        case vscode.SymbolKind.Boolean: return 'Boolean';
        case vscode.SymbolKind.Array: return 'Array';
        case vscode.SymbolKind.Object: return 'Object';
        case vscode.SymbolKind.Key: return 'Key';
        case vscode.SymbolKind.Null: return 'Null';
        case vscode.SymbolKind.EnumMember: return 'EnumMember';
        case vscode.SymbolKind.Struct: return 'Struct';
        case vscode.SymbolKind.Event: return 'Event';
        case vscode.SymbolKind.Operator: return 'Operator';
        case vscode.SymbolKind.TypeParameter: return 'TypeParameter';
        default: return 'Unknown';
    }
}
// Define a function to write the JSON file
function writeSymbolsToFile(symbols: SymbolInformation[], filePath: string) {
    // Convert the array of SymbolInformation objects to a JSON string
    const jsonContent = JSON.stringify(symbols, null, 4); // Pretty print with 4 spaces
    console.log('symbols', symbols);
    // Write the JSON string to a file
    fs.writeFile(filePath, jsonContent, 'utf8', (err) => {
        if (err) {
            // If there was an error, log it and potentially show a message to the user
            console.error('An error occurred while writing JSON to file:', err);
            vscode.window.showErrorMessage('An error occurred while writing JSON to file.');
        } else {
            // Optionally inform the user that the operation was successful
            vscode.window.showInformationMessage(`JSON saved successfully to ${filePath}`);
        }
    });
}