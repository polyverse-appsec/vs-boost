import * as vscode from "vscode";
import { NOTEBOOK_TYPE } from "../../jupyter_notebook";
import * as assert from "assert";
import { debug } from "console";
import * as fs from "fs";

export async function rightClickLoadFileCommandTest(
    context: Mocha.Context,
    fileUri: vscode.Uri,
    boostUri: vscode.Uri
) {
    // we need to avoid hanging on the save dialog when exiting visual studio
    //    so we disable save on exit/shutdown
    await vscode.workspace
        .getConfiguration()
        .update("files.hotExit", "off", vscode.ConfigurationTarget.Global);

    console.log(`Looking for existing Boost file ${boostUri.fsPath}`);
    // if the Boost notebook file already exists, delete it
    if (fs.existsSync(boostUri.fsPath)) {
        console.log(`Found existing Boost notebook file ${boostUri.fsPath}`);
        fs.rmSync(boostUri.fsPath);
        console.log(`Deleted existing Boost notebook file ${boostUri.fsPath}`);
    } else {
        console.log(`Boost notebook file ${boostUri.fsPath} not found`);
    }

    // Execute the "createJsonNotebook" command
    await vscode.commands.executeCommand(
        NOTEBOOK_TYPE + ".loadCurrentFile",
        fileUri
    );

    // Wait for the notebook to be created
    await new Promise((resolve) => {
        setTimeout(resolve, 2000); // 2 seconds to make sure notebook is created
    });

    // Get all the cells in the newly created notebook
    const notebookEditor = vscode.window.activeNotebookEditor;
    assert.ok(notebookEditor, "Notebook editor not found");

    // Save the active text editor window
    //    await vscode.commands.executeCommand('workbench.action.files.save');

    assert.ok(
        fs.existsSync(boostUri.fsPath),
        `Notebook file ${boostUri.fsPath} not created`
    );
    if (!fs.existsSync(boostUri.fsPath)) {
        assert.fail(
            `rightClickLoadFileCommandTest: Notebook file ${boostUri.fsPath} not created`
        );
    } else {
        console.log(
            `rightClickLoadFileCommandTest: Notebook file ${boostUri.fsPath} created`
        );
    }

    const cells = notebookEditor.notebook.getCells();

    assert.ok(
        cells.length >= 1,
        "Not enough cells " +
            cells.length.toString() +
            " found in the notebook " +
            boostUri.fsPath
    );

    cells.forEach((cell: vscode.NotebookCell) => {
        //            debug(cell.document.getText());
    });
}
