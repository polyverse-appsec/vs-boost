import * as vscode from 'vscode';
import { retryCommand } from '../extension/vscodeUtilities';    

export async function getSymbols()
{
    const files = await vscode.workspace.findFiles("*.ts", "**/node_modules/**");

    for await (const file of files) {
    // retry several times if the LSP server is not ready
    let symbols = await retryCommand<vscode.DocumentSymbol[]>(5, 600, 'vscode.executeDocumentSymbolProvider', file);
    if (symbols === undefined) {
        vscode.window.showErrorMessage(`Document symbol information not available for '${file.fsPath}'`);
        continue;
    }

    console.log(symbols);

    while (symbols.length > 0) {
        for await (const symbol of symbols) {
        if (![vscode.SymbolKind.Function, vscode.SymbolKind.Method, vscode.SymbolKind.Constructor, vscode.SymbolKind.Interface].includes(symbol.kind)) {
            continue;
        }

        let items: vscode.CallHierarchyItem[];
        try {
            items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>('vscode.prepareCallHierarchy', file, symbol.selectionRange.start);
        } catch (e) {
            vscode.window.showErrorMessage(`${e}\n${file}\n${symbol.name}`);
            continue;
        }

        for await (const item of items) {
            await vscode.commands.executeCommand<vscode.CallHierarchyIncomingCall[]>('vscode.provideIncomingCalls', item)
            .then(calls => {
                //inner.add_incoming_calls(file.path, item.selectionRange.start, calls);
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
                //inner.add_interface_implementations(file.path, symbol.selectionRange.start, locations);
            })
            .then(undefined, err => {
                console.log(err);
            });
        }
        }

        symbols = symbols.flatMap(symbol => symbol.children);
    }
    }
}